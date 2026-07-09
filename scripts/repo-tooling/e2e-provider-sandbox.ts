import type { ProfileCapabilitySlug } from "@ai-assistants/capability-catalog";
import {
  type Json,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableInsert,
  type TableRow,
  type TableUpdate,
} from "@ai-assistants/control-db";

type TestingProviderRuntimeCapability = ProfileCapabilitySlug;
type ProviderRuntimeMode = "live" | "sandbox";
type CapabilityAccountLinkConfig = {
  providerRuntime?: {
    mode?: ProviderRuntimeMode;
  };
  [key: string]: unknown;
};

export const TESTING_SANDBOX_PROVIDER_CAPABILITIES = [
  "gmail",
  "google-drive",
  "google-calendar",
  "outlook-mail",
  "outlook-calendar",
  "microsoft-todo",
  "microsoft-onedrive",
  "microsoft-sharepoint",
  "monday",
  "boldsign",
  "phone",
] as const satisfies readonly TestingProviderRuntimeCapability[];

type TestingCapabilityLinkRuntimeRow = Pick<
  TableRow<"capability_account_links">,
  "id" | "capability_slug" | "provider" | "config" | "connected_provider_account_id"
>;

export type TestingProviderSandboxBinding = {
  capabilityAccountLink: TableRow<"capability_account_links">;
  connectedAccount: TableRow<"connected_provider_accounts">;
};

export type TestingProviderSandboxSummary = {
  capabilities: readonly TestingProviderRuntimeCapability[];
  linksUpdated: number;
};

function requireCapabilities(
  capabilities: readonly TestingProviderRuntimeCapability[],
): readonly TestingProviderRuntimeCapability[] {
  if (capabilities.length === 0) {
    throw new Error("Provider runtime mode update requires at least one capability slug.");
  }
  return capabilities;
}

function withProviderRuntimeMode(
  link: TestingCapabilityLinkRuntimeRow,
  mode: ProviderRuntimeMode,
): Json {
  const config = parseCapabilityAccountLinkConfig(link);
  return {
    ...config,
    providerRuntime: {
      ...(config.providerRuntime ?? {}),
      mode,
    },
  } satisfies Json;
}

function parseCapabilityAccountLinkConfig(link: TestingCapabilityLinkRuntimeRow) {
  if (!link.config || typeof link.config !== "object" || Array.isArray(link.config)) {
    throw new Error(`Capability account link ${link.id} config must be a JSON object.`);
  }
  const config = link.config as CapabilityAccountLinkConfig;
  const providerRuntime = config.providerRuntime;
  const runtimeMode = providerRuntime?.mode;
  if (runtimeMode !== undefined && runtimeMode !== "live" && runtimeMode !== "sandbox") {
    throw new Error(
      `Capability account link ${link.id} providerRuntime.mode must be live or sandbox.`,
    );
  }
  return config;
}

async function loadTestingCapabilityLinks(input: {
  db: SupabaseServiceClient;
  capabilities?: readonly TestingProviderRuntimeCapability[];
}): Promise<TestingCapabilityLinkRuntimeRow[]> {
  let query = input.db
    .from("capability_account_links")
    .select("id, capability_slug, provider, config, connected_provider_account_id")
    .eq("profile_id", "testing")
    .eq("status", "enabled");
  if (input.capabilities) {
    query = query.in("capability_slug", [...requireCapabilities(input.capabilities)]);
  }
  const result = await query;
  const rows = requireSupabaseData(
    "Load testing capability account links for provider runtime mode",
    result.data,
    result.error,
  );
  if (input.capabilities) {
    const found = new Set(rows.map((row) => row.capability_slug));
    const missing = input.capabilities.filter((capability) => !found.has(capability));
    if (missing.length > 0) {
      throw new Error(
        `Missing enabled testing capability_account_links for provider runtime mode: ${missing.join(", ")}.`,
      );
    }
  }
  return rows;
}

function sandboxProviderAccountId(link: TestingCapabilityLinkRuntimeRow): string {
  return `sandbox:${link.provider}:testing`;
}

function sandboxDisplayLabel(link: TestingCapabilityLinkRuntimeRow): string {
  return `Testing ${link.capability_slug} sandbox account`;
}

function sandboxAccountEmail(link: TestingCapabilityLinkRuntimeRow): string | null {
  switch (link.provider) {
    case "gmail":
    case "outlook-mail":
      return "john@advisory.example";
    case "google-calendar":
    case "google-drive":
    case "microsoft-onedrive":
    case "microsoft-sharepoint":
    case "microsoft-todo":
    case "monday":
    case "boldsign":
    case "twilio-voice":
    case "twilio-messaging":
      return null;
    default:
      return null;
  }
}

async function upsertTestingProviderSandboxAccount(input: {
  db: SupabaseServiceClient;
  link: TestingCapabilityLinkRuntimeRow;
}): Promise<TableRow<"connected_provider_accounts">> {
  const insert = {
    profile_id: "testing",
    provider: input.link.provider,
    provider_account_id: sandboxProviderAccountId(input.link),
    display_label: sandboxDisplayLabel(input.link),
    account_email: sandboxAccountEmail(input.link),
    connection_status: "connected",
    credential_kind: "backend_secret",
    credential_status: "healthy",
    connected_at: new Date().toISOString(),
    nango_connection_id: null,
    nango_provider_config_key: null,
    scopes: [],
    metadata: {
      providerRuntime: "sandbox",
      capabilitySlug: input.link.capability_slug,
    },
  } satisfies TableInsert<"connected_provider_accounts">;
  const result = await input.db
    .from("connected_provider_accounts")
    .upsert(insert, {
      onConflict: "profile_id,provider,provider_account_id",
    })
    .select()
    .single();
  return requireSupabaseData(
    `Upsert testing ${input.link.capability_slug}/${input.link.provider} sandbox connected account`,
    result.data,
    result.error,
  );
}

async function enableTestingProviderSandboxForLink(input: {
  db: SupabaseServiceClient;
  link: TestingCapabilityLinkRuntimeRow;
}): Promise<void> {
  const account = await upsertTestingProviderSandboxAccount(input);
  const update = {
    connected_provider_account_id: account.id,
    config: withProviderRuntimeMode(input.link, "sandbox"),
    readiness_status: "ready",
    readiness_blocker_code: null,
    readiness_last_error: null,
    readiness_last_success_at: new Date().toISOString(),
  } satisfies TableUpdate<"capability_account_links">;
  const result = await input.db
    .from("capability_account_links")
    .update(update)
    .eq("id", input.link.id);
  if (result.error) throw result.error;
}

export async function enableAllTestingProviderSandboxes(
  db: SupabaseServiceClient,
  input: { capabilities: readonly TestingProviderRuntimeCapability[] },
): Promise<TestingProviderSandboxSummary> {
  const links = await loadTestingCapabilityLinks({
    db,
    capabilities: input.capabilities,
  });
  for (const link of links) {
    await enableTestingProviderSandboxForLink({ db, link });
  }
  return {
    capabilities: input.capabilities,
    linksUpdated: links.length,
  };
}

export async function enableEveryTestingProviderSandbox(
  db: SupabaseServiceClient,
): Promise<TestingProviderSandboxSummary> {
  return enableAllTestingProviderSandboxes(db, {
    capabilities: TESTING_SANDBOX_PROVIDER_CAPABILITIES,
  });
}

export async function enableTestingProviderSandboxBinding(
  db: SupabaseServiceClient,
  input: { capabilitySlug: TestingProviderRuntimeCapability; provider: string },
): Promise<TestingProviderSandboxBinding> {
  const links = await loadTestingCapabilityLinks({
    db,
    capabilities: [input.capabilitySlug],
  });
  const link = links.find((row) => row.provider === input.provider);
  if (!link) {
    throw new Error(
      `Missing testing capability account link for ${input.capabilitySlug}/${input.provider}.`,
    );
  }
  await enableTestingProviderSandboxForLink({ db, link });
  return requireTestingProviderSandboxBinding(db, input);
}

export async function testingProviderMode(
  db: SupabaseServiceClient,
  capabilitySlug: TestingProviderRuntimeCapability,
): Promise<ProviderRuntimeMode> {
  const links = await loadTestingCapabilityLinks({ db, capabilities: [capabilitySlug] });
  const modes = new Set(
    links.map((link) => parseCapabilityAccountLinkConfig(link).providerRuntime?.mode ?? "live"),
  );
  if (modes.size !== 1) {
    throw new Error(
      `Testing ${capabilitySlug} provider runtime links do not share one mode: ${[...modes].join(", ")}.`,
    );
  }
  return [...modes][0]!;
}

export async function requireTestingProviderMode(
  db: SupabaseServiceClient,
  capabilitySlug: TestingProviderRuntimeCapability,
  mode: ProviderRuntimeMode,
): Promise<void> {
  const links = await loadTestingCapabilityLinks({ db, capabilities: [capabilitySlug] });
  const mismatches = links.filter((link) => {
    const actual = parseCapabilityAccountLinkConfig(link).providerRuntime?.mode ?? "live";
    return actual !== mode;
  });
  if (mismatches.length === 0) return;
  const details = mismatches
    .map((link) => {
      const actual = parseCapabilityAccountLinkConfig(link).providerRuntime?.mode ?? "live";
      return `${link.capability_slug}/${link.provider} ${link.id} is ${actual}`;
    })
    .join("; ");
  throw new Error(
    `Expected testing ${capabilitySlug} provider runtime mode ${mode}; mismatches: ${details}.`,
  );
}

export async function requireTestingProvidersLive(
  db: SupabaseServiceClient,
  capabilities: readonly TestingProviderRuntimeCapability[],
): Promise<void> {
  for (const capability of requireCapabilities(capabilities)) {
    await requireTestingProviderMode(db, capability, "live");
  }
}

export async function requireTestingProviderSandboxBinding(
  db: SupabaseServiceClient,
  input: { capabilitySlug: TestingProviderRuntimeCapability; provider: string },
): Promise<TestingProviderSandboxBinding> {
  const links = await loadTestingCapabilityLinks({
    db,
    capabilities: [input.capabilitySlug],
  });
  const link = links.find((row) => row.provider === input.provider);
  if (!link) {
    throw new Error(
      `Missing testing sandbox capability account link for ${input.capabilitySlug}/${input.provider}.`,
    );
  }
  const actual = parseCapabilityAccountLinkConfig(link).providerRuntime?.mode ?? "live";
  if (actual !== "sandbox") {
    throw new Error(
      `Expected testing ${input.capabilitySlug}/${input.provider} provider runtime mode sandbox; got ${actual}.`,
    );
  }
  const fullLinkResult = await db
    .from("capability_account_links")
    .select()
    .eq("id", link.id)
    .maybeSingle();
  const fullLink = requireSupabaseData(
    `Load testing sandbox capability account link ${link.id}`,
    fullLinkResult.data,
    fullLinkResult.error,
  );
  const accountId = link.connected_provider_account_id?.trim();
  if (!accountId) {
    throw new Error(
      `Testing sandbox capability account link ${link.id} has no connected provider account.`,
    );
  }
  const accountResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", accountId)
    .eq("profile_id", "testing")
    .eq("provider", input.provider)
    .maybeSingle();
  const account = requireSupabaseData(
    `Load testing sandbox connected account ${accountId}`,
    accountResult.data,
    accountResult.error,
  );
  if (account.credential_kind !== "backend_secret") {
    throw new Error(
      `Testing sandbox connected account ${account.id} for ${input.capabilitySlug}/${input.provider} must use credential_kind=backend_secret.`,
    );
  }
  if (account.nango_connection_id !== null || account.nango_provider_config_key !== null) {
    throw new Error(
      `Testing sandbox connected account ${account.id} for ${input.capabilitySlug}/${input.provider} must not store Nango identifiers.`,
    );
  }
  return { capabilityAccountLink: fullLink, connectedAccount: account };
}
