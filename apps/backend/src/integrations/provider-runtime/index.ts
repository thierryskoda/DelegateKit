import { type Json, type SupabaseServiceClient, type TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes, type DomainCode } from "@ai-assistants/errors";
import { z } from "zod";

const jsonRecordSchema = z.record(z.string(), z.unknown());
const providerRuntimeModeSchema = z.enum(["live", "sandbox"]);

export type ProviderRuntimeMode = z.infer<typeof providerRuntimeModeSchema>;

const capabilityAccountLinkConfigSchema = z
  .object({
    providerRuntime: z
      .object({
        mode: providerRuntimeModeSchema.optional(),
      })
      .strict()
      .optional(),
    providerWebhooks: z
      .object({
        manageSubscriptions: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .passthrough();

export type CapabilityAccountLinkConfig = z.infer<typeof capabilityAccountLinkConfigSchema>;

export type NangoProviderCapabilityAccountBinding = {
  link: TableRow<"capability_account_links">;
  account: TableRow<"connected_provider_accounts">;
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
};

export type BackendSecretProviderCapabilityAccountBinding = {
  link: TableRow<"capability_account_links">;
  account: TableRow<"connected_provider_accounts">;
};

export function requireRecordJson(value: Json, label: string): Record<string, unknown> {
  const parsed = jsonRecordSchema.safeParse(value);
  if (!parsed.success)
    throw new DomainError(domainCodes.INTERNAL, `${label} must be a JSON object.`);
  return parsed.data;
}

export function capabilityConfig(row: { config: Json }): Record<string, unknown> {
  return requireRecordJson(row.config, "capability.config");
}

export function parseCapabilityAccountLinkConfig(row: {
  config: Json;
}): CapabilityAccountLinkConfig {
  return capabilityAccountLinkConfigSchema.parse(capabilityConfig(row));
}

export function providerRuntimeModeForCapabilityLink(row: { config: Json }): ProviderRuntimeMode {
  return parseCapabilityAccountLinkConfig(row).providerRuntime?.mode ?? "live";
}

const sandboxProviderConfigKeyByProvider = {
  gmail: "ai-assistants-google",
  "google-drive": "ai-assistants-google",
  "google-calendar": "ai-assistants-google",
  "outlook-mail": "ai-assistants-outlook",
  "outlook-calendar": "ai-assistants-outlook",
  "microsoft-todo": "ai-assistants-outlook",
  "microsoft-onedrive": "ai-assistants-microsoft-onedrive",
  "microsoft-sharepoint": "ai-assistants-microsoft-sharepoint",
  monday: "ai-assistants-monday",
} as const satisfies Record<string, string>;

function sandboxProviderConfigKey(provider: string): string {
  if (!Object.prototype.hasOwnProperty.call(sandboxProviderConfigKeyByProvider, provider)) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Provider ${provider} does not have a sandbox provider config key.`,
    );
  }
  const key =
    sandboxProviderConfigKeyByProvider[
      provider as keyof typeof sandboxProviderConfigKeyByProvider
    ];
  return key;
}

export function configString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type CapabilityAccountLinkLookupInput = {
  profileId: string;
  providers: readonly string[];
  /** When set, only links whose `capability_slug` is in this list (disambiguates multiple links for the same provider). */
  capabilitySlugs?: readonly string[] | null;
  /** `connected_provider_accounts.id` from tools when disambiguating by connected account. */
  connectedAccountId?: string | null;
  /** Direct `capability_account_links.id` when the caller already selected a link. */
  capabilityAccountLinkId?: string | null;
};

function resolveCapabilityAccountLinkId(
  input: CapabilityAccountLinkLookupInput,
): string | null {
  return input.capabilityAccountLinkId ?? null;
}

export async function requireEnabledCapabilityAccountLink(
  db: SupabaseServiceClient,
  input: CapabilityAccountLinkLookupInput,
  missingCode: DomainCode = domainCodes.INTERNAL,
): Promise<TableRow<"capability_account_links">> {
  let linksQuery = db
    .from("capability_account_links")
    .select()
    .eq("profile_id", input.profileId)
    .in("provider", [...input.providers])
    .eq("status", "enabled");
  if (input.capabilitySlugs?.length) {
    linksQuery = linksQuery.in("capability_slug", [...input.capabilitySlugs]);
  }
  const capabilityAccountLinkId = resolveCapabilityAccountLinkId(input);
  if (capabilityAccountLinkId) {
    linksQuery = linksQuery.eq("id", capabilityAccountLinkId);
  }
  if (input.connectedAccountId) {
    linksQuery = linksQuery.eq("connected_provider_account_id", input.connectedAccountId);
  }
  const linksResult = await linksQuery;
  if (linksResult.error) throw linksResult.error;
  const links = linksResult.data ?? [];
  if (!capabilityAccountLinkId && !input.connectedAccountId && links.length > 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Multiple enabled capability account links found for providers: ${input.providers.join(", ")}. Pass connectedAccountId.`,
      { details: { blockerCode: "ambiguous_account" } },
    );
  }
  const link = links[0];
  if (!link) {
    const detail = capabilityAccountLinkId
      ? ` capability account link ${capabilityAccountLinkId}`
      : input.connectedAccountId
        ? ` connected account ${input.connectedAccountId}`
        : "";
    throw new DomainError(
      missingCode,
      `No enabled${detail} capability account link found for providers: ${input.providers.join(", ")}.`,
    );
  }
  return link;
}

async function requireHealthyConnectedAccount(
  db: SupabaseServiceClient,
  link: TableRow<"capability_account_links">,
  missingCode: DomainCode = domainCodes.INTERNAL,
): Promise<TableRow<"connected_provider_accounts">> {
  const connectedAccountId = link.connected_provider_account_id?.trim();
  if (!connectedAccountId) {
    throw new DomainError(
      missingCode,
      `Capability account link ${link.id} has no connected provider account.`,
    );
  }
  const accountResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", connectedAccountId)
    .maybeSingle();
  if (accountResult.error) throw accountResult.error;
  const account = accountResult.data;
  if (!account) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Connected provider account ${connectedAccountId} for capability account link ${link.id} was not found.`,
    );
  }
  if (account.profile_id !== link.profile_id) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Connected provider account ${account.id} profile ${account.profile_id} does not match capability account link ${link.id} profile ${link.profile_id}.`,
    );
  }
  if (account.connection_status !== "connected") {
    throw new DomainError(
      missingCode,
      `Connected provider account ${account.id} has connection_status=${JSON.stringify(account.connection_status)}.`,
    );
  }
  if (account.credential_status !== "healthy") {
    throw new DomainError(
      domainCodes.UNAUTHORIZED,
      account.credential_status === "reconnect_required"
        ? `Connected provider account ${account.id} requires reconnect (${account.last_error?.trim() ?? "OAuth credentials invalid"}).`
        : `Connected provider account ${account.id} has credential_status=${JSON.stringify(account.credential_status)}. Reconnect ${link.provider}.`,
    );
  }
  return account;
}

export async function requireNangoProviderCapabilityAccount(
  db: SupabaseServiceClient,
  input: CapabilityAccountLinkLookupInput,
): Promise<NangoProviderCapabilityAccountBinding> {
  const link = await requireEnabledCapabilityAccountLink(db, input, domainCodes.CONFLICT);
  const account = await requireHealthyConnectedAccount(db, link, domainCodes.CONFLICT);
  if (providerRuntimeModeForCapabilityLink(link) === "sandbox") {
    if (account.credential_kind !== "backend_secret") {
      throw new DomainError(
        domainCodes.CONFLICT,
        `Sandbox provider runtime for capability account link ${link.id} requires a backend_secret connected account.`,
      );
    }
    return {
      link,
      account,
      nangoProviderConfigKey: sandboxProviderConfigKey(link.provider),
      nangoConnectionId: account.id,
    };
  }
  const nangoProviderConfigKey = account.nango_provider_config_key?.trim();
  const nangoConnectionId = account.nango_connection_id?.trim();
  if ((account.credential_kind || "nango_oauth") !== "nango_oauth") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Connected provider account ${account.id} is not a Nango OAuth connection.`,
    );
  }
  if (!nangoProviderConfigKey || !nangoConnectionId) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Connected provider account ${account.id} is not backed by Nango connection identifiers.`,
    );
  }
  return { link, account, nangoProviderConfigKey, nangoConnectionId };
}

export async function requireBackendSecretProviderCapabilityAccount(
  db: SupabaseServiceClient,
  input: CapabilityAccountLinkLookupInput,
): Promise<BackendSecretProviderCapabilityAccountBinding> {
  const link = await requireEnabledCapabilityAccountLink(db, input, domainCodes.CONFLICT);
  const account = await requireHealthyConnectedAccount(db, link, domainCodes.CONFLICT);
  if (account.credential_kind !== "backend_secret") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Connected provider account ${account.id} is not backed by a backend secret.`,
    );
  }
  return { link, account };
}
