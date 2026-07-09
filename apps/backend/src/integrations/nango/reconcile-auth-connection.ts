import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  nangoProvisioningEntryByUniqueKey,
  type NangoProvisioningEntry,
} from "@ai-assistants/nango-provisioning";
import { z } from "zod";
import {
  completeOAuthConnectedAccountLifecycle,
  resolveOAuthLifecycleTarget,
  type ConnectedAccountLifecycleResult,
  type OAuthConnectionLifecycleEvidence,
  type OAuthLifecycleSiblingMapping,
  type OAuthLifecycleTarget,
} from "../../product/connected-accounts/connected-account-lifecycle";
import { createNangoAdminClient } from "./nango-client";
import { throwNangoDomainError } from "./nango-admin-client-error";
import {
  requireNangoProviderConfigKeyForCapabilityLink,
  requireNangoProviderConfigKeyForCapability,
} from "./nango-provider-config-key";
import {
  normalizeNangoOAuthConnectionEvidence,
  oauthEvidenceMetadata,
} from "./oauth-connection-evidence";
import { fetchProviderAccountIdentity } from "./provider-account-identity";

const nangoConnectionCredentialSchema = z
  .object({
    raw: z.union([z.array(z.string()), z.record(z.string(), z.unknown())]).optional(),
    scope: z.string().optional(),
  })
  .passthrough();

const nangoConnectionResponseSchema = z
  .object({
    account_id: z.string().optional(),
    connection_id: z.string().optional(),
    errors: z
      .array(
        z
          .object({
            type: z.string().optional(),
            log_id: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    provider_config_key: z.string().optional(),
    tags: z.record(z.string(), z.string()).optional(),
    end_user: z.object({ email: z.string().optional() }).passthrough().nullable().optional(),
    credentials: nangoConnectionCredentialSchema.optional(),
  })
  .passthrough();

const nangoConnectionsListResponseSchema = z
  .object({
    connections: z.array(nangoConnectionResponseSchema),
  })
  .passthrough();

export type ReconcileNangoAuthConnectionInput = {
  db: SupabaseServiceClient;
  profileId: string;
  providerConfigKey: string;
  connectionId: string;
  connectIntentId?: string;
  capabilityAccountLinkId?: string;
};

export type BindExistingNangoAuthConnectionInput = ReconcileNangoAuthConnectionInput;

type MissingExistingNangoConnectionDetails = {
  reason: "nango_connection_not_found";
  providerConfigKey: string;
  connectionId: string;
};

function missingExistingNangoConnectionDetails(input: {
  providerConfigKey: string;
  connectionId: string;
}): MissingExistingNangoConnectionDetails {
  return {
    reason: "nango_connection_not_found",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
  };
}

function trimmed(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function diagnosticContext(input: {
  profileId: string;
  connectIntentId?: string;
  capabilityAccountLinkId?: string;
}): Record<string, string | null> {
  return {
    profile_id: input.profileId,
    connect_intent_id: input.connectIntentId ?? null,
    capability_account_link_id: input.capabilityAccountLinkId ?? null,
  };
}

async function fetchNangoConnectionRecord(input: {
  profileId: string;
  connectIntentId?: string;
  capabilityAccountLinkId?: string;
  providerConfigKey: string;
  connectionId: string;
}): Promise<z.infer<typeof nangoConnectionResponseSchema>> {
  const nango = createNangoAdminClient();
  let connection: unknown;
  try {
    connection = await nango.getConnection(
      input.providerConfigKey,
      input.connectionId,
      false,
      true,
    );
  } catch (err: unknown) {
    throw throwNangoDomainError(err, {
      operation: "nango.connection.get",
      publicSummary: "Nango getConnection failed during auth reconciliation",
      providerConfigKey: input.providerConfigKey,
      evidence: diagnosticContext(input),
    });
  }
  return nangoConnectionResponseSchema.parse(connection);
}

async function fetchExistingNangoConnectionRecord(input: {
  profileId: string;
  connectIntentId?: string;
  capabilityAccountLinkId?: string;
  providerConfigKey: string;
  connectionId: string;
}): Promise<z.infer<typeof nangoConnectionResponseSchema>> {
  const nango = createNangoAdminClient();
  let result: unknown;
  try {
    result = await nango.listConnections({
      connectionId: input.connectionId,
      integrationId: input.providerConfigKey,
      limit: 2,
    });
  } catch (err: unknown) {
    throw throwNangoDomainError(err, {
      operation: "nango.connections.list",
      publicSummary: "Nango listConnections failed during existing auth binding",
      providerConfigKey: input.providerConfigKey,
      evidence: diagnosticContext(input),
    });
  }

  const parsed = nangoConnectionsListResponseSchema.parse(result);
  if (parsed.connections.length === 0) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Nango connection ${input.connectionId} was not found for provider config ${input.providerConfigKey}.`,
      { details: missingExistingNangoConnectionDetails(input) },
    );
  }
  if (parsed.connections.length > 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Nango returned ${parsed.connections.length} connections for ${input.connectionId} and ${input.providerConfigKey}; expected exactly one.`,
    );
  }
  return fetchNangoConnectionRecord(input);
}

function assertTaggedNangoConnectionMatches(input: {
  connectionRecord: z.infer<typeof nangoConnectionResponseSchema>;
  profileId: string;
  connectIntentId?: string;
  capabilityAccountLinkId?: string;
}): void {
  const tags = input.connectionRecord.tags ?? {};
  if (tags.profile_id !== input.profileId) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      "Nango connection tags do not match the requested profile.",
    );
  }
  if (input.connectIntentId) {
    if (tags.connect_intent_id !== input.connectIntentId) {
      throw new DomainError(
        domainCodes.FORBIDDEN,
        "Nango connection tags do not match the requested connect intent.",
      );
    }
    return;
  }
  if (input.capabilityAccountLinkId) {
    if (tags.capability_account_link_id !== input.capabilityAccountLinkId) {
      throw new DomainError(
        domainCodes.FORBIDDEN,
        "Nango connection tags do not match the requested capability account link.",
      );
    }
    return;
  }
  throw new DomainError(
    domainCodes.BAD_REQUEST,
    "Nango auth reconciliation requires connect_intent_id or capability_account_link_id.",
  );
}

function assertNangoConnectionIdentifiersMatch(input: {
  connectionRecord: z.infer<typeof nangoConnectionResponseSchema>;
  providerConfigKey: string;
  connectionId: string;
}): void {
  if (
    trimmed(input.connectionRecord.provider_config_key) &&
    input.connectionRecord.provider_config_key !== input.providerConfigKey
  ) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      "Nango connection provider_config_key does not match the requested provider config.",
    );
  }
  if (
    trimmed(input.connectionRecord.connection_id) &&
    input.connectionRecord.connection_id !== input.connectionId
  ) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      "Nango connection_id does not match the requested connection.",
    );
  }
}

function providerForSharedConnection(input: {
  providerConfigKey: string;
  target: OAuthLifecycleTarget;
}): string {
  const sharedProvider = nangoProvisioningEntryByUniqueKey(input.providerConfigKey)?.sharedAccount
    ?.provider;
  if (sharedProvider) return sharedProvider;
  return input.target.mode === "reconnect" ? input.target.link.provider : input.target.intent.provider;
}

function lastErrorFromNangoErrors(
  errors: readonly { type?: string | undefined; log_id?: string | undefined }[] | undefined,
): string | null {
  const authError = errors?.find((error) => error.type === "auth");
  if (!authError) return null;
  return authError.log_id
    ? `Nango reported an auth error for this connection (log ${authError.log_id}).`
    : "Nango reported an auth error for this connection.";
}

async function nangoLifecycleEvidence(input: {
  normalized: ReturnType<typeof normalizeReconcileInput>;
  target: OAuthLifecycleTarget;
  connectionRecord: z.infer<typeof nangoConnectionResponseSchema>;
}): Promise<OAuthConnectionLifecycleEvidence> {
  const now = new Date().toISOString();
  const oauthEvidence = normalizeNangoOAuthConnectionEvidence({
    connectionRecord: input.connectionRecord,
    providerConfigKey: input.normalized.providerConfigKey,
    connectionId: input.normalized.connectionId,
    fetchedAt: now,
  });
  const nangoEndUserEmail = trimmed(input.connectionRecord.end_user?.email);
  const providerIdentity = nangoEndUserEmail
    ? null
    : await fetchProviderAccountIdentity({
        profileId: input.normalized.profileId,
        providerConfigKey: input.normalized.providerConfigKey,
        connectionId: input.normalized.connectionId,
      });
  const accountEmail = nangoEndUserEmail ?? providerIdentity?.accountEmail ?? null;
  const providerAccountId =
    trimmed(input.connectionRecord.account_id) ?? accountEmail ?? input.normalized.connectionId;
  return {
    source: "nango",
    providerConfigKey: input.normalized.providerConfigKey,
    connectionId: input.normalized.connectionId,
    providerAccountId,
    accountEmail,
    displayLabel: accountEmail ?? providerIdentity?.displayLabel ?? null,
    accountProvider: providerForSharedConnection({
      providerConfigKey: input.normalized.providerConfigKey,
      target: input.target,
    }),
    scopes: oauthEvidence.grantedScopes,
    credentialStatus: oauthEvidence.credentialStatus,
    lastError: lastErrorFromNangoErrors(input.connectionRecord.errors),
    metadata: oauthEvidenceMetadata(oauthEvidence),
  };
}

function manifestEntryForConfigKey(providerConfigKey: string): NangoProvisioningEntry | null {
  return nangoProvisioningEntryByUniqueKey(providerConfigKey) ?? null;
}

function siblingMappingsForConfigKey(providerConfigKey: string): OAuthLifecycleSiblingMapping[] {
  const entry = manifestEntryForConfigKey(providerConfigKey);
  return entry?.profileCapabilityMappings.map((mapping) => ({
    slug: mapping.slug,
    provider: mapping.provider,
  })) ?? [];
}

function normalizeReconcileInput(input: ReconcileNangoAuthConnectionInput): {
  profileId: string;
  providerConfigKey: string;
  connectionId: string;
  connectIntentId?: string;
  capabilityAccountLinkId?: string;
} {
  const profileId = input.profileId.trim();
  const providerConfigKey = input.providerConfigKey.trim();
  const connectionId = input.connectionId.trim();
  const connectIntentId = input.connectIntentId?.trim() || undefined;
  const capabilityAccountLinkId = input.capabilityAccountLinkId?.trim() || undefined;
  if (!profileId || !providerConfigKey || !connectionId) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "Nango auth reconciliation requires profile, provider config, and connection ids.",
    );
  }
  if (Boolean(connectIntentId) === Boolean(capabilityAccountLinkId)) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "Nango auth reconciliation requires exactly one of connect_intent_id or capability_account_link_id.",
    );
  }
  return {
    profileId,
    providerConfigKey,
    connectionId,
    ...(connectIntentId ? { connectIntentId } : {}),
    ...(capabilityAccountLinkId ? { capabilityAccountLinkId } : {}),
  };
}

async function resolveReconcileTarget(
  db: SupabaseServiceClient,
  normalized: ReturnType<typeof normalizeReconcileInput>,
): Promise<OAuthLifecycleTarget> {
  return resolveOAuthLifecycleTarget(db, {
    profileId: normalized.profileId,
    ...(normalized.connectIntentId
      ? { connectIntentId: normalized.connectIntentId }
      : { capabilityAccountLinkId: normalized.capabilityAccountLinkId! }),
  });
}

function assertProviderConfigMatchesLink(
  link: TableRow<"capability_account_links">,
  providerConfigKey: string,
): void {
  const expected = requireNangoProviderConfigKeyForCapabilityLink(link);
  if (providerConfigKey !== expected) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Nango connection provider_config_key ${JSON.stringify(providerConfigKey)} does not match capability account link ${link.id}.`,
    );
  }
}

function assertProviderConfigMatchesIntent(
  intent: TableRow<"provider_connect_intents">,
  providerConfigKey: string,
): void {
  const expected = requireNangoProviderConfigKeyForCapability({
    capabilitySlug: intent.capability_slug,
    provider: intent.provider,
  });
  if (providerConfigKey !== expected) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Nango connection provider_config_key ${JSON.stringify(providerConfigKey)} does not match connect intent ${intent.id}.`,
    );
  }
}

async function reconcileResolvedTarget(input: {
  db: SupabaseServiceClient;
  normalized: ReturnType<typeof normalizeReconcileInput>;
  target: OAuthLifecycleTarget;
  connectionRecord: z.infer<typeof nangoConnectionResponseSchema>;
}): Promise<ConnectedAccountLifecycleResult> {
  assertNangoConnectionIdentifiersMatch({
    connectionRecord: input.connectionRecord,
    providerConfigKey: input.normalized.providerConfigKey,
    connectionId: input.normalized.connectionId,
  });
  const evidence = await nangoLifecycleEvidence({
    normalized: input.normalized,
    target: input.target,
    connectionRecord: input.connectionRecord,
  });
  return completeOAuthConnectedAccountLifecycle({
    db: input.db,
    profileId: input.normalized.profileId,
    target: input.target,
    evidence,
    siblingMappings: siblingMappingsForConfigKey(input.normalized.providerConfigKey),
  });
}

export async function reconcileNangoAuthConnection(
  input: ReconcileNangoAuthConnectionInput,
): Promise<ConnectedAccountLifecycleResult> {
  const normalized = normalizeReconcileInput(input);
  const target = await resolveReconcileTarget(input.db, normalized);
  if (target.mode === "reconnect") {
    assertProviderConfigMatchesLink(target.link, normalized.providerConfigKey);
  } else {
    assertProviderConfigMatchesIntent(target.intent, normalized.providerConfigKey);
  }
  const connectionRecord = await fetchNangoConnectionRecord({
    profileId: normalized.profileId,
    providerConfigKey: normalized.providerConfigKey,
    connectionId: normalized.connectionId,
    ...(normalized.connectIntentId
      ? { connectIntentId: normalized.connectIntentId }
      : { capabilityAccountLinkId: normalized.capabilityAccountLinkId! }),
  });
  assertTaggedNangoConnectionMatches({
    connectionRecord,
    profileId: normalized.profileId,
    ...(normalized.connectIntentId
      ? { connectIntentId: normalized.connectIntentId }
      : { capabilityAccountLinkId: normalized.capabilityAccountLinkId! }),
  });
  return reconcileResolvedTarget({
    db: input.db,
    normalized,
    target,
    connectionRecord,
  });
}

export async function bindExistingNangoAuthConnection(
  input: BindExistingNangoAuthConnectionInput,
): Promise<ConnectedAccountLifecycleResult> {
  const normalized = normalizeReconcileInput(input);
  const target = await resolveReconcileTarget(input.db, normalized);
  if (target.mode === "reconnect") {
    assertProviderConfigMatchesLink(target.link, normalized.providerConfigKey);
  } else {
    assertProviderConfigMatchesIntent(target.intent, normalized.providerConfigKey);
  }
  const connectionRecord = await fetchExistingNangoConnectionRecord({
    profileId: normalized.profileId,
    providerConfigKey: normalized.providerConfigKey,
    connectionId: normalized.connectionId,
    ...(normalized.connectIntentId
      ? { connectIntentId: normalized.connectIntentId }
      : { capabilityAccountLinkId: normalized.capabilityAccountLinkId! }),
  });
  return reconcileResolvedTarget({
    db: input.db,
    normalized,
    target,
    connectionRecord,
  });
}
