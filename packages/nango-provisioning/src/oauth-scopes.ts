import { nangoProvisioningEntryByUniqueKey } from "./manifest";

export function scopeTokens(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function comparableScope(scope: string): string {
  const normalized = scope.trim().toLowerCase();
  const graphPrefix = "https://graph.microsoft.com/";
  if (normalized.startsWith(graphPrefix)) return normalized.slice(graphPrefix.length);
  return normalized;
}

function requiredOAuthScopesForNangoProviderConfigKey(
  providerConfigKey: string,
): readonly string[] {
  const entry = nangoProvisioningEntryByUniqueKey(providerConfigKey);
  return entry?.readiness.requiredGrantedScopes ?? [];
}

export function oauthScopesFromStoredValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((scope) => (typeof scope === "string" ? scope.trim() : ""))
    .filter(Boolean);
}

export function missingRequiredOAuthScopes(input: {
  providerConfigKey: string;
  grantedScopes: unknown;
}): readonly string[] {
  const requiredScopes = requiredOAuthScopesForNangoProviderConfigKey(input.providerConfigKey);
  if (requiredScopes.length === 0) return [];

  const grantedScopes = new Set(
    oauthScopesFromStoredValue(input.grantedScopes).map(comparableScope),
  );
  return requiredScopes.filter((scope) => !grantedScopes.has(comparableScope(scope)));
}

export type NangoOAuthReadinessInput = {
  providerConfigKey: string;
  grantedScopes: unknown;
  refreshCapable: boolean;
  credentialStatus?: string | null;
  nangoErrorTypes?: readonly string[];
};

export type NangoOAuthReadinessResult = {
  missingGrantedScopes: readonly string[];
  missingRefreshToken: boolean;
  hasAuthError: boolean;
  ready: boolean;
};

export function evaluateNangoOAuthReadiness(
  input: NangoOAuthReadinessInput,
): NangoOAuthReadinessResult {
  const entry = nangoProvisioningEntryByUniqueKey(input.providerConfigKey);
  const missingGrantedScopes = missingRequiredOAuthScopes({
    providerConfigKey: input.providerConfigKey,
    grantedScopes: input.grantedScopes,
  });
  const missingRefreshToken = Boolean(
    entry?.readiness.requiresRefreshToken && !input.refreshCapable,
  );
  const hasAuthError =
    input.credentialStatus === "reconnect_required" ||
    (input.nangoErrorTypes ?? []).some((type) => type === "auth");
  return {
    missingGrantedScopes,
    missingRefreshToken,
    hasAuthError,
    ready: missingGrantedScopes.length === 0 && !missingRefreshToken && !hasAuthError,
  };
}
