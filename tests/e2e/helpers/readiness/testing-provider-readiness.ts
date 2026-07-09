import { readFileSync } from "node:fs";
import path from "node:path";
import {
  profileCapabilitySpec,
  type ProfileCapabilitySlug,
} from "@ai-assistants/capability-catalog";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { comparableScope } from "@ai-assistants/nango-provisioning";
import { repoRoot } from "@ai-assistants/repo-layout";
import {
  parseProfileNangoBindingsFile,
  type ProfileNangoBindingEntry,
} from "../../../../scripts/integrations/bind-profile-nango-schema";

const TESTING_E2E_NANGO_BINDINGS_PATH =
  "scripts/integrations/testing-nango-bindings-e2e.local.json";

export type TestingConnectedProviderAccountBinding = {
  capabilityAccountLink: TableRow<"capability_account_links">;
  connectedAccount: TableRow<"connected_provider_accounts">;
};

export type TestingLiveNangoConnection = TestingConnectedProviderAccountBinding;

export type TestingProviderRequirement = {
  capabilitySlug: string;
  provider: string;
  label: string;
  requiredOAuthScopes?: readonly string[];
};

type TestingLiveNangoConnectionIds = {
  providerConfigKey: string;
  connectionId: string;
};

function hasNonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function formatTestingProviderRequirement(input: TestingProviderRequirement): string {
  return `testing ${input.capabilitySlug}/${input.provider} (${input.label})`;
}

function requireConnectedProviderAccountNangoIds(
  connectedAccount: TableRow<"connected_provider_accounts">,
  input: TestingProviderRequirement,
): void {
  if (
    !hasNonEmpty(connectedAccount.nango_provider_config_key) ||
    !hasNonEmpty(connectedAccount.nango_connection_id)
  ) {
    throw new Error(
      `Connected row ${connectedAccount.id} for ${formatTestingProviderRequirement(input)} is missing Nango ids. Run integrations -- nango bind apply --profile=e2e to repair.`,
    );
  }
}

function requireConnectedProviderAccountOAuthScopes(
  connectedAccount: TableRow<"connected_provider_accounts">,
  input: TestingProviderRequirement,
): void {
  const requiredScopes = input.requiredOAuthScopes ?? [];
  if (requiredScopes.length === 0) return;

  const configuredScopes = Array.isArray(connectedAccount.scopes)
    ? connectedAccount.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  const configuredComparableScopes = new Set(configuredScopes.map(comparableScope));
  const missingScopes = requiredScopes.filter(
    (scope) => !configuredComparableScopes.has(comparableScope(scope)),
  );
  if (missingScopes.length === 0) return;

  throw new Error(
    [
      `Connected row ${connectedAccount.id} for ${formatTestingProviderRequirement(input)} is missing required OAuth scope(s): ${missingScopes.join(", ")}.`,
      `Reconnect the testing ${input.capabilitySlug}/${input.provider} capability with the required scope(s), then run integrations -- nango bind apply --profile=e2e.`,
    ].join(" "),
  );
}

function loadTestingNangoBinding(
  input: TestingProviderRequirement,
): ProfileNangoBindingEntry | undefined {
  const bindingsPath = path.join(repoRoot(import.meta.url), TESTING_E2E_NANGO_BINDINGS_PATH);
  const parsed = parseProfileNangoBindingsFile(JSON.parse(readFileSync(bindingsPath, "utf8")));
  return parsed.bindings.find(
    (binding) =>
      binding.profileId === "testing" &&
      binding.capabilitySlug === input.capabilitySlug &&
      binding.provider === input.provider,
  );
}

async function loadConnectedAccountForLink(
  db: SupabaseServiceClient,
  link: TableRow<"capability_account_links">,
  input: TestingProviderRequirement,
): Promise<TableRow<"connected_provider_accounts">> {
  const connectedProviderAccountId = link.connected_provider_account_id?.trim();
  if (!connectedProviderAccountId) {
    throw new Error(
      `No connected_provider_account_id on capability account link ${link.id} for ${formatTestingProviderRequirement(input)}. Run integrations -- nango bind apply --profile=e2e after creating the Nango connection.`,
    );
  }
  const connectionResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", connectedProviderAccountId)
    .eq("connection_status", "connected")
    .eq("credential_status", "healthy")
    .maybeSingle();
  const connectedAccount = requireSupabaseData(
    `Load connected healthy connected_provider_account ${connectedProviderAccountId}`,
    connectionResult.data,
    connectionResult.error,
  );
  return connectedAccount;
}

async function resolveSingleTestingCapabilityAccountLink(
  db: SupabaseServiceClient,
  input: TestingProviderRequirement,
  links: readonly TableRow<"capability_account_links">[],
): Promise<TableRow<"capability_account_links">> {
  if (links.length === 1) return links[0]!;

  const binding = loadTestingNangoBinding(input);
  const spec = profileCapabilitySpec(input.capabilitySlug as ProfileCapabilitySlug);
  if (!spec) {
    throw new Error(`Unknown capability slug ${JSON.stringify(input.capabilitySlug)}.`);
  }

  if (binding?.capabilityAccountLinkId) {
    const match = links.find((link) => link.id === binding.capabilityAccountLinkId);
    if (match) return match;
    throw new Error(
      `testing-nango-bindings-e2e.local.json capabilityAccountLinkId ${binding.capabilityAccountLinkId} is not an enabled ${input.capabilitySlug}/${input.provider} link.`,
    );
  }

  if (binding?.capabilityAccountLinkLabel) {
    const labelMatches = links.filter((link) => link.label === binding.capabilityAccountLinkLabel);
    if (labelMatches.length === 1) return labelMatches[0]!;
    if (labelMatches.length > 1) {
      throw new Error(
        `Multiple enabled capability account links match capabilityAccountLinkLabel ${JSON.stringify(binding.capabilityAccountLinkLabel)} for testing ${input.capabilitySlug}/${input.provider}.`,
      );
    }
  }

  if (binding) {
    const nangoMatches: TableRow<"capability_account_links">[] = [];
    for (const link of links) {
      const connectedProviderAccountId = link.connected_provider_account_id?.trim();
      if (!connectedProviderAccountId) continue;
      const accountResult = await db
        .from("connected_provider_accounts")
        .select("nango_connection_id")
        .eq("id", connectedProviderAccountId)
        .maybeSingle();
      if (accountResult.error) throw accountResult.error;
      if (accountResult.data?.nango_connection_id?.trim() === binding.nangoConnectionId) {
        nangoMatches.push(link);
      }
    }
    if (nangoMatches.length === 1) return nangoMatches[0]!;
  }

  const defaultLinks = links.filter((link) => link.is_default);
  if (defaultLinks.length === 1) return defaultLinks[0]!;

  const catalogLabelMatches = links.filter((link) => link.label === spec.label);
  if (catalogLabelMatches.length === 1) return catalogLabelMatches[0]!;

  const summary = links.map((link) => `${link.label} (${link.id})`).join(", ");
  throw new Error(
    [
      `Multiple enabled capability_account_links rows for testing ${input.capabilitySlug}/${input.provider}; found ${links.length}.`,
      `Set capabilityAccountLinkId or capabilityAccountLinkLabel in scripts/integrations/testing-nango-bindings-e2e.local.json, or disable stale links.`,
      `Found: ${summary}`,
    ].join(" "),
  );
}

export async function requireSingleTestingConnectedProviderAccount(
  db: SupabaseServiceClient,
  input: TestingProviderRequirement,
): Promise<TestingConnectedProviderAccountBinding> {
  const linksResult = await db
    .from("capability_account_links")
    .select()
    .eq("profile_id", "testing")
    .eq("capability_slug", input.capabilitySlug)
    .eq("provider", input.provider)
    .eq("status", "enabled");
  const links = requireSupabaseData(
    `Load testing capability_account_links for ${input.capabilitySlug}/${input.provider}`,
    linksResult.data,
    linksResult.error,
  );
  if (links.length === 0) {
    throw new Error(
      `Missing enabled capability_account_links row for profile 'testing' + ${input.capabilitySlug}/${input.provider} (${input.label}). Add/update scripts/integrations/testing-nango-bindings-e2e.local.json then run integrations -- nango bind apply --profile=e2e.`,
    );
  }

  const capabilityAccountLink = await resolveSingleTestingCapabilityAccountLink(db, input, links);
  const connectedAccount = await loadConnectedAccountForLink(db, capabilityAccountLink, input);
  return { capabilityAccountLink, connectedAccount };
}

export async function requireSingleTestingNangoConnection(
  db: SupabaseServiceClient,
  input: TestingProviderRequirement,
): Promise<TestingLiveNangoConnection> {
  const { capabilityAccountLink, connectedAccount } =
    await requireSingleTestingConnectedProviderAccount(db, input);
  requireConnectedProviderAccountNangoIds(connectedAccount, input);
  requireConnectedProviderAccountOAuthScopes(connectedAccount, input);
  return { capabilityAccountLink, connectedAccount };
}

export function requireTestingNangoConnectionIds(
  fixture: TestingLiveNangoConnection,
  label: string,
): TestingLiveNangoConnectionIds {
  const providerConfigKey = fixture.connectedAccount.nango_provider_config_key?.trim();
  const connectionId = fixture.connectedAccount.nango_connection_id?.trim();
  if (!providerConfigKey || !connectionId) {
    throw new Error(
      `${label} testing Nango fixture is missing provider config key or connection id`,
    );
  }
  return { providerConfigKey, connectionId };
}
