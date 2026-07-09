import { type SupabaseServiceClient } from "@ai-assistants/control-db";
import { nangoProviderConfigKeyForCapabilityProvider } from "@ai-assistants/nango-provisioning";
import type { RuntimeProfile } from "@ai-assistants/repo-layout";
import { timedFetch } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import type { ProfileNangoBindingEntry } from "./bind-profile-nango-schema.js";
import { nangoApiBaseUrl, resolveNangoSecretKey } from "./nango-provisioning-runtime.js";

const NANGO_SYNC_HTTP_TIMEOUT_MS = 30_000;

const nangoListedConnectionSchema = z
  .object({
    connection_id: z.string().uuid(),
    provider_config_key: z.string().trim().min(1),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    tags: z.record(z.string(), z.string()).optional(),
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
  })
  .passthrough();

const nangoConnectionsPageSchema = z
  .object({
    connections: z.array(nangoListedConnectionSchema).default([]),
    next_cursor: z.string().trim().min(1).nullable().optional(),
  })
  .passthrough();

type NangoConnectionInventoryItem = {
  connectionId: string;
  providerConfigKey: string;
  profileId: string;
  createdAt: string | null;
  updatedAt: string | null;
  hasAuthError: boolean;
  authErrorLogId: string | null;
};

type SupabaseBoundNangoConnection = {
  connectedProviderAccountId: string;
  provider: string;
  connectionId: string;
  providerConfigKey: string;
  credentialStatus: string | null;
  accountEmail: string | null;
  displayLabel: string | null;
};

type NangoUnboundRemoteConnection = {
  profileId: string;
  providerConfigKey: string;
  connectionId: string;
  reason: "orphan" | "auth_error_unbound";
  detail: string;
};

type NangoMissingRemoteReference = {
  profileId: string;
  connectedProviderAccountId: string;
  provider: string;
  providerConfigKey: string;
  connectionId: string;
  credentialStatus: string | null;
  accountEmail: string | null;
  displayLabel: string | null;
};

export type NangoSyncAuditReport = {
  ok: boolean;
  scopedProfileIds: readonly string[];
  protectedConnectionIds: readonly string[];
  inventory: readonly NangoConnectionInventoryItem[];
  unboundRemoteConnections: readonly NangoUnboundRemoteConnection[];
  unboundBindingEntries: readonly ProfileNangoBindingEntry[];
  missingRemoteReferences: readonly NangoMissingRemoteReference[];
};

function providerConfigKeyForBinding(binding: ProfileNangoBindingEntry): string {
  const key = nangoProviderConfigKeyForCapabilityProvider(binding.capabilitySlug, binding.provider);
  if (!key?.trim()) {
    throw new Error(
      `No Nango integration id for binding ${binding.profileId} ${binding.capabilitySlug}/${binding.provider}.`,
    );
  }
  return key;
}

function parseListedConnection(
  raw: z.infer<typeof nangoListedConnectionSchema>,
): NangoConnectionInventoryItem | null {
  const profileId = raw.tags?.profile_id?.trim();
  if (!profileId) return null;
  const authError = raw.errors?.find((error) => error.type === "auth");
  return {
    connectionId: raw.connection_id,
    providerConfigKey: raw.provider_config_key,
    profileId,
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
    hasAuthError: Boolean(authError),
    authErrorLogId: authError?.log_id ?? null,
  };
}

async function listNangoConnectionsForProfile(input: {
  profile: RuntimeProfile;
  profileId: string;
}): Promise<NangoConnectionInventoryItem[]> {
  const secret = resolveNangoSecretKey(input.profile, process.env);
  const baseUrl = nangoApiBaseUrl(process.env).replace(/\/+$/, "");
  const inventory: NangoConnectionInventoryItem[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${baseUrl}/connections`);
    url.searchParams.set("tags[profile_id]", input.profileId);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await timedFetch.fetch(url, {
      timeoutMs: NANGO_SYNC_HTTP_TIMEOUT_MS,
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
    });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(
        `Nango list connections failed for profile ${input.profileId} (${response.status}): ${bodyText.slice(0, 600)}`,
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(bodyText) as unknown;
    } catch {
      throw new Error(
        `Nango list connections returned non-JSON for profile ${input.profileId}: ${bodyText.slice(0, 600)}`,
      );
    }

    const page = nangoConnectionsPageSchema.parse(parsedJson);
    for (const connection of page.connections) {
      const item = parseListedConnection(connection);
      if (item) inventory.push(item);
    }

    const nextCursor = page.next_cursor?.trim();
    cursor = nextCursor && nextCursor.length > 0 ? nextCursor : undefined;
  } while (cursor);

  return inventory;
}

async function loadSupabaseBoundNangoConnections(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<{
  connectionIds: Set<string>;
  connections: SupabaseBoundNangoConnection[];
}> {
  const accountsResult = await db
    .from("connected_provider_accounts")
    .select(
      "id, provider, account_email, display_label, nango_connection_id, nango_provider_config_key, connection_status, credential_status",
    )
    .eq("profile_id", profileId)
    .eq("connection_status", "connected");
  if (accountsResult.error) throw accountsResult.error;

  const connectionIds = new Set<string>();
  const connections: SupabaseBoundNangoConnection[] = [];
  for (const row of accountsResult.data ?? []) {
    const connectionId = row.nango_connection_id?.trim();
    const providerConfigKey = row.nango_provider_config_key?.trim();
    if (!connectionId || !providerConfigKey) continue;
    connectionIds.add(connectionId);
    connections.push({
      connectedProviderAccountId: row.id,
      provider: row.provider,
      connectionId,
      providerConfigKey,
      credentialStatus: row.credential_status ?? null,
      accountEmail: row.account_email ?? null,
      displayLabel: row.display_label ?? null,
    });
  }
  return { connectionIds, connections };
}

async function loadUnboundBindingEntries(
  db: SupabaseServiceClient,
  bindings: readonly ProfileNangoBindingEntry[],
): Promise<ProfileNangoBindingEntry[]> {
  const unbound: ProfileNangoBindingEntry[] = [];
  for (const binding of bindings) {
    const providerConfigKey = providerConfigKeyForBinding(binding);
    const accountResult = await db
      .from("connected_provider_accounts")
      .select(
        "id, nango_connection_id, nango_provider_config_key, connection_status, credential_status",
      )
      .eq("profile_id", binding.profileId)
      .eq("nango_connection_id", binding.nangoConnectionId)
      .eq("nango_provider_config_key", providerConfigKey)
      .eq("connection_status", "connected")
      .eq("credential_status", "healthy")
      .maybeSingle();
    if (accountResult.error) throw accountResult.error;
    if (!accountResult.data) {
      unbound.push(binding);
      continue;
    }

    const linkResult = await db
      .from("capability_account_links")
      .select("id")
      .eq("profile_id", binding.profileId)
      .eq("capability_slug", binding.capabilitySlug)
      .eq("provider", binding.provider)
      .eq("status", "enabled")
      .eq("connected_provider_account_id", accountResult.data.id)
      .maybeSingle();
    if (linkResult.error) throw linkResult.error;
    if (!linkResult.data) unbound.push(binding);
  }
  return unbound;
}

function classifyInventoryDrift(input: {
  inventory: readonly NangoConnectionInventoryItem[];
  bindings: readonly ProfileNangoBindingEntry[];
  supabaseByProfile: Map<
    string,
    {
      connectionIds: Set<string>;
      connections: readonly SupabaseBoundNangoConnection[];
    }
  >;
}): {
  protectedConnectionIds: string[];
  unboundRemoteConnections: NangoUnboundRemoteConnection[];
} {
  const protectedConnectionIds = new Set<string>();
  for (const binding of input.bindings) {
    protectedConnectionIds.add(binding.nangoConnectionId);
  }
  for (const state of input.supabaseByProfile.values()) {
    for (const connectionId of state.connectionIds) {
      protectedConnectionIds.add(connectionId);
    }
  }

  const unboundRemoteConnections: NangoUnboundRemoteConnection[] = [];
  for (const item of input.inventory) {
    if (protectedConnectionIds.has(item.connectionId)) continue;
    unboundRemoteConnections.push({
      profileId: item.profileId,
      providerConfigKey: item.providerConfigKey,
      connectionId: item.connectionId,
      reason: item.hasAuthError ? "auth_error_unbound" : "orphan",
      detail: item.hasAuthError
        ? `Unbound Nango connection has auth errors${item.authErrorLogId ? ` (log ${item.authErrorLogId})` : ""}.`
        : "Nango connection is not referenced by checked-in bindings or Supabase connected rows.",
    });
  }

  return {
    protectedConnectionIds: [...protectedConnectionIds].sort(),
    unboundRemoteConnections,
  };
}

export async function auditNangoSupabaseSync(input: {
  profile: RuntimeProfile;
  db: SupabaseServiceClient;
  bindings: readonly ProfileNangoBindingEntry[];
  scopedProfileIds: readonly string[];
}): Promise<NangoSyncAuditReport> {
  const inventory: NangoConnectionInventoryItem[] = [];
  const supabaseByProfile = new Map<
    string,
    {
      connectionIds: Set<string>;
      connections: readonly SupabaseBoundNangoConnection[];
    }
  >();

  for (const profileId of input.scopedProfileIds) {
    inventory.push(
      ...(await listNangoConnectionsForProfile({ profile: input.profile, profileId })),
    );
    supabaseByProfile.set(profileId, await loadSupabaseBoundNangoConnections(input.db, profileId));
  }

  const scopedBindings = input.bindings.filter((binding) =>
    input.scopedProfileIds.includes(binding.profileId),
  );
  const unboundBindingEntries = await loadUnboundBindingEntries(input.db, scopedBindings);
  const { protectedConnectionIds, unboundRemoteConnections } = classifyInventoryDrift({
    inventory,
    bindings: scopedBindings,
    supabaseByProfile,
  });
  const inventoryIds = new Set(inventory.map((item) => item.connectionId));
  const missingRemoteReferences: NangoMissingRemoteReference[] = [];
  for (const [profileId, state] of supabaseByProfile) {
    for (const connection of state.connections) {
      if (inventoryIds.has(connection.connectionId)) continue;
      missingRemoteReferences.push({
        profileId,
        connectedProviderAccountId: connection.connectedProviderAccountId,
        provider: connection.provider,
        providerConfigKey: connection.providerConfigKey,
        connectionId: connection.connectionId,
        credentialStatus: connection.credentialStatus,
        accountEmail: connection.accountEmail,
        displayLabel: connection.displayLabel,
      });
    }
  }

  return {
    ok:
      unboundRemoteConnections.length === 0 &&
      unboundBindingEntries.length === 0 &&
      missingRemoteReferences.length === 0,
    scopedProfileIds: input.scopedProfileIds,
    protectedConnectionIds,
    inventory,
    unboundRemoteConnections,
    unboundBindingEntries,
    missingRemoteReferences,
  };
}
