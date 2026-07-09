import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { requireCapabilityActivationPolicyForSlug } from "@ai-assistants/capability-catalog";
import { z } from "zod";
import { requireOwnedProfile } from "../../auth/profile-access";
import type { AuthenticatedUser } from "../../auth/user-auth";
import { requirePendingProviderConnectIntent } from "../../product/connected-accounts/connect-intents";
import {
  createNangoAdminClient,
  nangoPublicApiUrl,
  nangoPublicConnectUiBaseUrl,
} from "./nango-client";
import {
  requireNangoProviderConfigKeyForCapabilityLink,
  requireNangoProviderConfigKeyForCapability,
} from "./nango-provider-config-key";
import { throwNangoDomainError } from "./nango-admin-client-error";
import { backendApiEnv } from "../../shared/env";

const nonEmptyStringSchema = z.string().trim().min(1);
const nangoCreateConnectSessionFlatResponseSchema = z
  .object({
    token: nonEmptyStringSchema,
    connect_link: nonEmptyStringSchema,
  })
  .passthrough();
const nangoCreateConnectSessionNestedResponseSchema = z.object({ data: z.unknown() }).passthrough();

export type CreateNangoConnectSessionInput = {
  db: SupabaseServiceClient;
  user: AuthenticatedUser;
  profileId: string;
} & (
  | { connectIntentId: string }
  | { capabilityAccountLinkId: string }
);

export type NangoConnectSessionPayload = {
  status: "session_created";
  sessionToken: string;
  connectLink: string;
  allowedIntegration: string;
  nangoApiUrl: string;
  nangoConnectUiUrl: string;
};

type ReconnectTarget = {
  linkId: string;
  connectedAccountId: string;
  connectionId: string;
};

/**
 * Nango POST /connect/sessions returns either `{ token, ... }` or `{ data: { token, ... } }`
 * depending on API version; accept both and fail fast otherwise.
 */
function parseNangoCreateConnectSessionResponseBody(raw: unknown): {
  sessionToken: string;
  connectLink: string;
} {
  const flat = nangoCreateConnectSessionFlatResponseSchema.safeParse(raw);
  if (flat.success) {
    return {
      sessionToken: flat.data.token.trim(),
      connectLink: flat.data.connect_link.trim(),
    };
  }
  const nestedBody = nangoCreateConnectSessionNestedResponseSchema.safeParse(raw);
  if (!nestedBody.success) {
    throw new DomainError(
      domainCodes.INTERNAL,
      "Nango createConnectSession returned a non-object body.",
    );
  }
  const nested = nangoCreateConnectSessionFlatResponseSchema.safeParse(nestedBody.data.data);
  if (!nested.success) {
    throw new DomainError(
      domainCodes.INTERNAL,
      "Nango createConnectSession returned a non-object body.",
    );
  }
  return {
    sessionToken: nested.data.token.trim(),
    connectLink: nested.data.connect_link.trim(),
  };
}

function stringFromRecord(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function nangoErrorParts(err: unknown): string[] {
  const parts: string[] = [];
  if (err instanceof Error && err.message.trim()) parts.push(err.message.trim());
  if (!err || typeof err !== "object") return parts;

  const response = (err as { response?: unknown }).response;
  if (!response || typeof response !== "object") return parts;
  const data = (response as { data?: unknown }).data;
  const message = stringFromRecord(data, "message");
  if (message) parts.push(message);
  const error = data && typeof data === "object" ? (data as { error?: unknown }).error : null;
  const errorCode = stringFromRecord(error, "code");
  const errorMessage = stringFromRecord(error, "message");
  if (errorCode) parts.push(errorCode);
  if (errorMessage) parts.push(errorMessage);
  return parts;
}

function isMissingNangoReconnectTargetError(err: unknown): boolean {
  return nangoErrorParts(err).some(
    (part) =>
      /ConnectionID or IntegrationId does not exists?/i.test(part) ||
      /\bunknown_connection\b/i.test(part),
  );
}

async function markMissingReconnectTargetStale(input: {
  db: SupabaseServiceClient;
  reconnectTarget: ReconnectTarget;
}): Promise<void> {
  const now = new Date().toISOString();
  const connectionUpdate = await input.db
    .from("connected_provider_accounts")
    .update({
      connection_status: "disconnected",
      credential_status: null,
      last_error: "Nango reconnect target no longer exists; reconnect from a fresh session.",
      updated_at: now,
    })
    .eq("id", input.reconnectTarget.connectedAccountId);
  if (connectionUpdate.error) throw connectionUpdate.error;

  const linkUpdate = await input.db
    .from("capability_account_links")
    .update({
      readiness_status: "not_connected",
      readiness_blocker_code: "reconnect_required",
      readiness_last_error:
        "Nango reconnect target no longer exists; reconnect from a fresh session.",
      updated_at: now,
    })
    .eq("id", input.reconnectTarget.linkId)
    .eq("status", "enabled");
  if (linkUpdate.error) throw linkUpdate.error;
}

async function requireEnabledCapabilityLink(
  db: SupabaseServiceClient,
  profileId: string,
  capabilityAccountLinkId: string,
): Promise<TableRow<"capability_account_links">> {
  const result = await db
    .from("capability_account_links")
    .select()
    .eq("profile_id", profileId)
    .eq("id", capabilityAccountLinkId)
    .eq("status", "enabled")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new DomainError(domainCodes.NOT_FOUND, "Capability account link not found.");
  }
  return result.data;
}

function diagnosticEvidence(input: {
  profileId: string;
  connectIntentId?: string;
  capabilityAccountLinkId?: string;
}): Record<string, string> {
  return {
    profile_id: input.profileId,
    ...(input.connectIntentId ? { connect_intent_id: input.connectIntentId } : {}),
    ...(input.capabilityAccountLinkId
      ? { capability_account_link_id: input.capabilityAccountLinkId }
      : {}),
  };
}

/**
 * Creates a short-lived Nango Connect session from a pending connect intent (new OAuth)
 * or an existing capability account link (reconnect).
 * Tags reconcile the auth webhook with `profile_id` plus `connect_intent_id` or
 * `capability_account_link_id`.
 */
export async function createNangoConnectSessionForConnectIntent(
  input: CreateNangoConnectSessionInput,
): Promise<NangoConnectSessionPayload> {
  const { db, user, profileId } = input;
  void backendApiEnv().nangoWebhookSigningSecret;
  await requireOwnedProfile(db, user, profileId);

  let link: TableRow<"capability_account_links"> | null = null;
  let capabilitySlug: string;
  let provider: string;
  let tags: Record<string, string>;
  let evidence: Record<string, string>;

  if ("connectIntentId" in input) {
    const intent = await requirePendingProviderConnectIntent(db, {
      profileId,
      connectIntentId: input.connectIntentId,
    });
    const policy = requireCapabilityActivationPolicyForSlug(intent.capability_slug);
    if (policy.credentialMode !== "oauth") {
      throw new DomainError(
        domainCodes.CONFLICT,
        `Capability ${intent.capability_slug} does not use OAuth/Nango Connect.`,
      );
    }
    link = intent.capability_account_link_id
      ? await requireEnabledCapabilityLink(db, profileId, intent.capability_account_link_id)
      : null;
    tags = {
      end_user_id: profileId,
      end_user_email: user.email?.trim() || `${profileId}@profiles.local`,
      end_user_display_name: await loadProfileDisplayName(db, profileId),
      profile_id: profileId,
      connect_intent_id: input.connectIntentId,
    };
    capabilitySlug = intent.capability_slug;
    provider = intent.provider;
    evidence = diagnosticEvidence({
      profileId,
      connectIntentId: input.connectIntentId,
    });
  } else {
    link = await requireEnabledCapabilityLink(db, profileId, input.capabilityAccountLinkId);
    capabilitySlug = link.capability_slug;
    provider = link.provider;
    const policy = requireCapabilityActivationPolicyForSlug(link.capability_slug);
    if (policy.credentialMode !== "oauth") {
      throw new DomainError(
        domainCodes.CONFLICT,
        `Capability ${link.capability_slug} does not use OAuth/Nango Connect.`,
      );
    }
    tags = {
      end_user_id: profileId,
      end_user_email: user.email?.trim() || `${profileId}@profiles.local`,
      end_user_display_name: await loadProfileDisplayName(db, profileId),
      profile_id: profileId,
      capability_account_link_id: input.capabilityAccountLinkId,
    };
    evidence = diagnosticEvidence({
      profileId,
      capabilityAccountLinkId: input.capabilityAccountLinkId,
    });
  }

  const allowedIntegration = link
    ? requireNangoProviderConfigKeyForCapabilityLink(link)
    : requireNangoProviderConfigKeyForCapability({ capabilitySlug, provider });
  const nango = createNangoAdminClient();

  let reconnectTarget: ReconnectTarget | null = null;
  const connectedAccountId = link?.connected_provider_account_id?.trim();
  if (link && connectedAccountId) {
    const accountResult = await db
      .from("connected_provider_accounts")
      .select()
      .eq("id", connectedAccountId)
      .maybeSingle();
    if (accountResult.error) throw accountResult.error;
    const account = accountResult.data;
    const connectionId =
      account?.connection_status === "connected" &&
      account.nango_provider_config_key === allowedIntegration
        ? account.nango_connection_id?.trim() || null
        : null;
    reconnectTarget =
      account && connectionId
        ? {
            linkId: link.id,
            connectedAccountId: account.id,
            connectionId,
          }
        : null;
  }

  let rawSession: unknown;
  try {
    rawSession = reconnectTarget
      ? await nango.createReconnectSession({
          connection_id: reconnectTarget.connectionId,
          integration_id: allowedIntegration,
          tags,
        })
      : await nango.createConnectSession({
          tags,
          allowed_integrations: [allowedIntegration],
        });
  } catch (err: unknown) {
    if (reconnectTarget && isMissingNangoReconnectTargetError(err)) {
      await markMissingReconnectTargetStale({ db, reconnectTarget });
      try {
        rawSession = await nango.createConnectSession({
          tags,
          allowed_integrations: [allowedIntegration],
        });
      } catch (freshErr: unknown) {
        throwNangoDomainError(freshErr, {
          operation: "nango.connect.createSession",
          publicSummary: "Nango createConnectSession failed",
          providerConfigKey: allowedIntegration,
          evidence,
        });
      }
    } else {
      throwNangoDomainError(err, {
        operation: reconnectTarget
          ? "nango.connect.createReconnectSession"
          : "nango.connect.createSession",
        publicSummary: reconnectTarget
          ? "Nango createReconnectSession failed"
          : "Nango createConnectSession failed",
        providerConfigKey: allowedIntegration,
        evidence,
      });
    }
  }

  const { sessionToken, connectLink } = parseNangoCreateConnectSessionResponseBody(rawSession);

  return {
    status: "session_created",
    sessionToken,
    connectLink,
    allowedIntegration,
    nangoApiUrl: nangoPublicApiUrl(),
    nangoConnectUiUrl: nangoPublicConnectUiBaseUrl(),
  };
}

async function loadProfileDisplayName(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<string> {
  const profileResult = await db
    .from("profiles")
    .select("display_name")
    .eq("id", profileId)
    .maybeSingle();
  if (profileResult.error) throw profileResult.error;
  return profileResult.data?.display_name?.trim() || profileId;
}
