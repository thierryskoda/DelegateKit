import { type Json, type TableRow } from "@ai-assistants/control-db";
import { comparableScope, scopeTokens } from "@ai-assistants/nango-provisioning";
import { z } from "zod";

const oauthCredentialStatusSchema = z.enum(["healthy", "reconnect_required", "revoked"]);

const oauthConnectionEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.literal("nango"),
    providerConfigKey: z.string().trim().min(1),
    connectionId: z.string().trim().min(1),
    fetchedAt: z.string().trim().min(1),
    nangoLastFetchedAt: z.string().trim().min(1),
    grantedScopes: z.array(z.string().trim().min(1)),
    refreshCapable: z.boolean(),
    credentialStatus: oauthCredentialStatusSchema,
    nangoErrorTypes: z.array(z.string().trim().min(1)),
  })
  .strict();

export type OAuthConnectionEvidence = z.infer<typeof oauthConnectionEvidenceSchema>;

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function addScopeTokens(scopes: string[], raw: string): void {
  scopes.push(...scopeTokens(raw));
}

function addScopeArray(scopes: string[], value: unknown): void {
  scopes.push(...stringArrayFromUnknown(value));
}

function collectScopeEvidence(scopes: string[], value: unknown, depth = 0): void {
  if (depth > 5) return;
  const record = recordFromUnknown(value);
  if (!record) return;
  for (const [key, item] of Object.entries(record)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "scope" && typeof item === "string") {
      addScopeTokens(scopes, item);
      continue;
    }
    if (lowerKey === "scopes") {
      if (typeof item === "string") addScopeTokens(scopes, item);
      else addScopeArray(scopes, item);
      continue;
    }
    if (recordFromUnknown(item)) collectScopeEvidence(scopes, item, depth + 1);
  }
}

function hasRefreshToken(value: unknown, depth = 0): boolean {
  if (depth > 5) return false;
  if (Array.isArray(value)) return value.some((item) => hasRefreshToken(item, depth + 1));
  const record = recordFromUnknown(value);
  if (!record) return false;
  for (const [key, item] of Object.entries(record)) {
    const lowerKey = key.toLowerCase();
    if (
      (lowerKey === "refresh_token" || lowerKey === "refreshtoken") &&
      typeof item === "string" &&
      item.trim()
    ) {
      return true;
    }
    if ((recordFromUnknown(item) || Array.isArray(item)) && hasRefreshToken(item, depth + 1)) {
      return true;
    }
  }
  return false;
}

function uniqueGrantedScopes(scopes: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawScope of scopes) {
    const scope = rawScope.trim();
    if (!scope) continue;
    const comparable = comparableScope(scope);
    if (comparable === "offline_access") continue;
    if (seen.has(comparable)) continue;
    seen.add(comparable);
    out.push(scope);
  }
  return out;
}

function nangoErrorTypes(value: unknown): string[] {
  const record = recordFromUnknown(value);
  const errors = Array.isArray(record?.errors) ? record.errors : [];
  return [
    ...new Set(
      errors
        .map((error) => recordFromUnknown(error)?.type)
        .map((type) => (typeof type === "string" ? type.trim() : ""))
        .filter(Boolean),
    ),
  ];
}

function credentialStatusFromNangoEvidence(errorTypes: readonly string[]): OAuthConnectionEvidence["credentialStatus"] {
  return errorTypes.includes("auth") ? "reconnect_required" : "healthy";
}

function stringField(record: Record<string, unknown> | null, keys: readonly string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function normalizeNangoOAuthConnectionEvidence(input: {
  connectionRecord: unknown;
  providerConfigKey: string;
  connectionId: string;
  fetchedAt: string;
}): OAuthConnectionEvidence {
  const scopes: string[] = [];
  collectScopeEvidence(scopes, input.connectionRecord);
  const record = recordFromUnknown(input.connectionRecord);
  const errorTypes = nangoErrorTypes(input.connectionRecord);
  const nangoLastFetchedAt =
    stringField(record, ["last_fetched_at", "lastFetchedAt", "updated_at", "updatedAt"]) ??
    input.fetchedAt;
  return oauthConnectionEvidenceSchema.parse({
    schemaVersion: 1,
    source: "nango",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    fetchedAt: input.fetchedAt,
    nangoLastFetchedAt,
    grantedScopes: uniqueGrantedScopes(scopes),
    refreshCapable: hasRefreshToken(input.connectionRecord),
    credentialStatus: credentialStatusFromNangoEvidence(errorTypes),
    nangoErrorTypes: errorTypes,
  } satisfies OAuthConnectionEvidence);
}

export function oauthEvidenceMetadata(evidence: OAuthConnectionEvidence): Json {
  return oauthConnectionEvidenceSchema.parse(evidence) as unknown as Json;
}

function oauthEvidenceFromMetadata(metadata: Json): OAuthConnectionEvidence | null {
  const record = recordFromUnknown(metadata);
  const parsed = oauthConnectionEvidenceSchema.safeParse(record?.oauth);
  return parsed.success ? parsed.data : null;
}

function fallbackCredentialStatus(
  account: TableRow<"connected_provider_accounts">,
): OAuthConnectionEvidence["credentialStatus"] {
  if (account.credential_status === "reconnect_required") return "reconnect_required";
  if (account.credential_status === "revoked") return "revoked";
  return "healthy";
}

export function oauthEvidenceFromConnectedAccount(
  account: TableRow<"connected_provider_accounts">,
): OAuthConnectionEvidence {
  const stored = oauthEvidenceFromMetadata(account.metadata);
  if (stored) return stored;
  const providerConfigKey = account.nango_provider_config_key?.trim() || "unknown";
  const connectionId = account.nango_connection_id?.trim() || account.id;
  return oauthConnectionEvidenceSchema.parse({
    schemaVersion: 1,
    source: "nango",
    providerConfigKey,
    connectionId,
    fetchedAt: account.updated_at,
    nangoLastFetchedAt: account.updated_at,
    grantedScopes: uniqueGrantedScopes(stringArrayFromUnknown(account.scopes)),
    refreshCapable: false,
    credentialStatus: fallbackCredentialStatus(account),
    nangoErrorTypes: [],
  } satisfies OAuthConnectionEvidence);
}
