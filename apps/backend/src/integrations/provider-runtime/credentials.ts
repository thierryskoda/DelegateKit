import type { TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { suspendConnectedProviderAccountForReconnect } from "@ai-assistants/capability-lifecycle";
import { createNangoAdminClient } from "../nango/nango-client";
import { throwNangoDomainError } from "../nango/nango-admin-client-error";
import { extractNangoOAuthAccessToken } from "../nango/extract-nango-oauth-access-token";

export interface OAuthCredentialAccessor {
  readonly kind: "oauth";
  readonly connectionId: string;
  readonly provider: string;
  getAuthHeaders(): Promise<Record<string, string>>;
  forceRefresh(): Promise<void>;
  markRevoked(): Promise<void>;
}

export type IntegrationCredential = OAuthCredentialAccessor;

function authorizationHeaderForProvider(
  provider: string,
  accessToken: string,
): Record<string, string> {
  if (provider === "monday") {
    return { authorization: accessToken };
  }
  return { authorization: `Bearer ${accessToken}` };
}

export function isNangoBackedConnectedAccount(
  account: TableRow<"connected_provider_accounts">,
): boolean {
  return Boolean(account.nango_connection_id?.trim() && account.nango_provider_config_key?.trim());
}

export function createNangoOAuthCredentialAccessor(
  db: Parameters<typeof suspendConnectedProviderAccountForReconnect>[0],
  account: TableRow<"connected_provider_accounts">,
  provider: string,
): OAuthCredentialAccessor {
  const nangoProviderConfigKey = account.nango_provider_config_key?.trim();
  const nangoConnectionId = account.nango_connection_id?.trim();
  if (!nangoProviderConfigKey || !nangoConnectionId) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Connected provider account ${account.id} is missing Nango connection identifiers.`,
    );
  }

  const connectionId = account.id;
  const providerConfigKey = nangoProviderConfigKey;
  const nangoBindingId = nangoConnectionId;

  async function resolveAccessToken(forceRefresh = false): Promise<string> {
    const nango = createNangoAdminClient();
    let payload: unknown;
    try {
      payload = await nango.getConnection(providerConfigKey, nangoBindingId, forceRefresh);
    } catch (err: unknown) {
      throw throwNangoDomainError(err, {
        operation: forceRefresh ? "nango.connection.get.forceRefresh" : "nango.connection.get",
        publicSummary: forceRefresh
          ? "Nango getConnection(forceRefresh) failed"
          : "Nango getConnection failed",
        providerConfigKey,
        evidence: {
          integration_connection_id: connectionId,
          purpose: forceRefresh ? "force_refresh" : "oauth_headers",
        },
      });
    }
    return extractNangoOAuthAccessToken(payload);
  }

  return {
    kind: "oauth",
    connectionId,
    provider,
    async getAuthHeaders(): Promise<Record<string, string>> {
      const token = await resolveAccessToken();
      return authorizationHeaderForProvider(provider, token);
    },
    async forceRefresh(): Promise<void> {
      await resolveAccessToken(true);
    },
    async markRevoked(): Promise<void> {
      await suspendConnectedProviderAccountForReconnect(db, {
        account,
        message:
          "Provider rejected Nango-backed credentials (HTTP 401). Reconnect the integration.",
      });
    },
  };
}
