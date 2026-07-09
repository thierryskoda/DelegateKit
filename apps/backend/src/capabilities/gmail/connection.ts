import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import {
  deleteProviderWebhookSubscriptionAndDeliveries,
  loadProviderWebhookSubscriptionById,
  listProviderWebhookSubscriptionsForConnectedAccount,
  patchProviderWebhookSubscription,
  upsertProviderWebhookSubscription,
  type ProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";
import {
  providerRuntimeModeForCapabilityLink,
  requireNangoProviderCapabilityAccount,
  type NangoProviderCapabilityAccountBinding,
} from "../../integrations/provider-runtime";

export const GMAIL_MAILBOX_ADAPTER_KEY = "gmail.mailbox" as const;
export const GMAIL_MAILBOX_PROVIDER_KEY = "gmail";
const GMAIL_MAILBOX_RESOURCE_TYPE = "gmail.mailbox";
const GMAIL_MAILBOX_RESOURCE_ID = "me";
const GMAIL_MAILBOX_EVENT_SCOPE = "inbox";

export type GmailConnectionContext = {
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccount: TableRow<"connected_provider_accounts">;
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
  accountEmail: string | null;
};

export async function requireGmailMailboxNango(
  db: SupabaseServiceClient,
  profileId: string,
  connectedAccountId?: string | null,
): Promise<NangoProviderCapabilityAccountBinding> {
  return requireNangoProviderCapabilityAccount(db, {
    profileId,
    providers: ["gmail"],
    capabilitySlugs: ["gmail"],
    connectedAccountId: connectedAccountId ?? null,
  });
}

export function historyIdText(value: string | number): string {
  return String(value).trim();
}

function historyIdBigInt(value: string | null | undefined): bigint | null {
  if (!value?.trim()) return null;
  try {
    return BigInt(value.trim());
  } catch {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Invalid Gmail history id: ${JSON.stringify(value)}.`,
    );
  }
}

export function isGreaterHistoryId(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = historyIdBigInt(a);
  const right = historyIdBigInt(b);
  if (left === null) return false;
  if (right === null) return true;
  return left > right;
}

function isDesiredGmailMailboxSubscription(row: ProviderWebhookSubscription): boolean {
  return (
    row.resource_type === GMAIL_MAILBOX_RESOURCE_TYPE &&
    row.resource_id === GMAIL_MAILBOX_RESOURCE_ID &&
    row.event_scope === GMAIL_MAILBOX_EVENT_SCOPE
  );
}

export async function requireGmailConnectionByNango(input: {
  db: SupabaseServiceClient;
  providerConfigKey: string;
  connectionId: string;
}): Promise<GmailConnectionContext> {
  const connectionsResult = await input.db
    .from("connected_provider_accounts")
    .select()
    .eq("nango_provider_config_key", input.providerConfigKey)
    .eq("nango_connection_id", input.connectionId);
  const connections = requireSupabaseRows(
    "Resolve Nango Gmail provider connection",
    connectionsResult.data,
    connectionsResult.error,
  );
  if (connections.length > 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Nango Gmail webhook resolved ${connections.length} provider connections; expected exactly one.`,
    );
  }
  let connectedProviderAccount: TableRow<"connected_provider_accounts"> | null =
    connections[0] ?? null;
  if (!connectedProviderAccount && input.providerConfigKey === "ai-assistants-google") {
    const sandboxConnectionResult = await input.db
      .from("connected_provider_accounts")
      .select()
      .eq("id", input.connectionId)
      .eq("provider", GMAIL_MAILBOX_PROVIDER_KEY)
      .eq("credential_kind", "backend_secret")
      .maybeSingle();
    if (sandboxConnectionResult.error) throw sandboxConnectionResult.error;
    connectedProviderAccount = sandboxConnectionResult.data;
  }
  if (!connectedProviderAccount) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Nango Gmail webhook did not resolve a provider connection.",
    );
  }

  const bindingsResult = await input.db
    .from("capability_account_links")
    .select()
    .eq("connected_provider_account_id", connectedProviderAccount.id)
    .eq("status", "enabled");
  const bindings = requireSupabaseRows(
    "Resolve Nango Gmail provider connection bindings",
    bindingsResult.data,
    bindingsResult.error,
  );
  const instanceIds = bindings.map((b) => b.id);
  if (instanceIds.length === 0) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connection ${connectedProviderAccount.id} has no active capability bindings.`,
    );
  }
  const instancesResult = await input.db
    .from("capability_account_links")
    .select()
    .in("id", instanceIds);
  const instances = requireSupabaseRows(
    "Resolve Nango Gmail capability instances",
    instancesResult.data,
    instancesResult.error,
  ).filter(
    (instance) =>
      instance.profile_id === connectedProviderAccount.profile_id &&
      instance.capability_slug === "gmail" &&
      instance.provider === "gmail" &&
      instance.status === "enabled",
  );
  if (instances.length !== 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connection ${connectedProviderAccount.id} has ${instances.length} enabled Gmail email capabilities; expected exactly one.`,
    );
  }
  const instance = instances[0];
  if (!instance) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connection ${connectedProviderAccount.id} has no enabled Gmail email capability.`,
    );
  }
  const mode = providerRuntimeModeForCapabilityLink(instance);
  const nangoProviderConfigKey =
    mode === "sandbox"
      ? input.providerConfigKey
      : connectedProviderAccount.nango_provider_config_key?.trim();
  const nangoConnectionId =
    mode === "sandbox" ? input.connectionId : connectedProviderAccount.nango_connection_id?.trim();
  if (!nangoProviderConfigKey || !nangoConnectionId) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connection ${connectedProviderAccount.id} is missing Nango identifiers.`,
    );
  }
  return {
    profileId: connectedProviderAccount.profile_id,
    capabilityAccountLinkId: instance.id,
    connectedProviderAccount,
    nangoProviderConfigKey,
    nangoConnectionId,
    accountEmail: connectedProviderAccount.account_email,
  };
}

export async function requireGmailConnectionByConnectedProviderAccountId(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<GmailConnectionContext> {
  const connectionResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", connectedProviderAccountId)
    .maybeSingle();
  const connectedProviderAccount = requireSupabaseData(
    "Load Gmail provider connection",
    connectionResult.data,
    connectionResult.error,
  );
  const nangoProviderConfigKey = connectedProviderAccount.nango_provider_config_key?.trim();
  const nangoConnectionId = connectedProviderAccount.nango_connection_id?.trim();
  if (!nangoProviderConfigKey || !nangoConnectionId) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connection ${connectedProviderAccount.id} is missing Nango identifiers.`,
    );
  }
  return requireGmailConnectionByNango({
    db,
    providerConfigKey: nangoProviderConfigKey,
    connectionId: nangoConnectionId,
  });
}

export function gmailCursor(subscription: ProviderWebhookSubscription): {
  latestSeenHistoryId: string | null;
  lastProcessedHistoryId: string | null;
} {
  const parsed = z
    .object({
      latestSeenHistoryId: z.string().trim().min(1).nullable().optional(),
      lastProcessedHistoryId: z.string().trim().min(1).nullable().optional(),
    })
    .passthrough()
    .parse(subscription.cursor);
  return {
    latestSeenHistoryId: parsed.latestSeenHistoryId ?? null,
    lastProcessedHistoryId: parsed.lastProcessedHistoryId ?? null,
  };
}

export async function upsertGmailMailboxSubscription(
  db: SupabaseServiceClient,
  input: GmailConnectionContext & {
    latestSeenHistoryId?: string | null;
    lastProcessedHistoryId?: string | null;
    expiresAt?: string | null;
    status?: "active" | "unhealthy" | "disabled";
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
  },
): Promise<ProviderWebhookSubscription> {
  const existing = await cleanupStaleGmailMailboxSubscriptions(db, input.connectedProviderAccount.id);
  const existingCursor = existing ? gmailCursor(existing) : null;
  return upsertProviderWebhookSubscription(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    connectedProviderAccountId: input.connectedProviderAccount.id,
    providerKey: GMAIL_MAILBOX_PROVIDER_KEY,
    adapterKey: GMAIL_MAILBOX_ADAPTER_KEY,
    resourceType: GMAIL_MAILBOX_RESOURCE_TYPE,
    resourceId: GMAIL_MAILBOX_RESOURCE_ID,
    eventScope: GMAIL_MAILBOX_EVENT_SCOPE,
    status: input.status ?? "active",
    expiresAt: input.expiresAt ?? existing?.expires_at ?? null,
    cursor: {
      latestSeenHistoryId: input.latestSeenHistoryId ?? existingCursor?.latestSeenHistoryId ?? null,
      lastProcessedHistoryId:
        input.lastProcessedHistoryId ?? existingCursor?.lastProcessedHistoryId ?? null,
    },
    providerState: {
      nangoProviderConfigKey: input.nangoProviderConfigKey,
      nangoConnectionId: input.nangoConnectionId,
      accountEmail: input.accountEmail,
    },
    lastErrorCode: input.lastErrorCode ?? null,
    lastErrorMessage: input.lastErrorMessage ?? null,
  });
}

async function listGmailMailboxSubscriptionsForConnectedAccount(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<ProviderWebhookSubscription[]> {
  return listProviderWebhookSubscriptionsForConnectedAccount({
    db,
    connectedProviderAccountId,
    adapterKey: GMAIL_MAILBOX_ADAPTER_KEY,
  });
}

async function cleanupStaleGmailMailboxSubscriptions(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<ProviderWebhookSubscription | null> {
  const rows = await listGmailMailboxSubscriptionsForConnectedAccount(db, connectedProviderAccountId);
  let desired: ProviderWebhookSubscription | null = null;
  for (const row of rows) {
    if (isDesiredGmailMailboxSubscription(row)) {
      desired = desired ?? row;
      continue;
    }
    await deleteProviderWebhookSubscriptionAndDeliveries(db, row.id);
  }
  return desired;
}

export async function loadGmailMailboxSubscriptionById(
  db: SupabaseServiceClient,
  subscriptionId: string,
): Promise<ProviderWebhookSubscription> {
  return loadProviderWebhookSubscriptionById(db, subscriptionId);
}

async function requireGmailMailboxSubscriptionByConnectedProviderAccountId(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<ProviderWebhookSubscription> {
  const rows = await listGmailMailboxSubscriptionsForConnectedAccount(db, connectedProviderAccountId);
  const desiredRows = rows.filter((row) => isDesiredGmailMailboxSubscription(row));
  if (desiredRows.length !== 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Gmail provider connection ${connectedProviderAccountId} has ${desiredRows.length} desired mailbox subscriptions; expected exactly one.`,
    );
  }
  return desiredRows[0]!;
}

export async function markGmailMailboxSubscriptionUnhealthy(
  db: SupabaseServiceClient,
  input: { subscriptionId?: string; connectedProviderAccountId?: string; error: string },
): Promise<void> {
  const subscription = input.subscriptionId
    ? await loadGmailMailboxSubscriptionById(db, input.subscriptionId)
    : await requireGmailMailboxSubscriptionByConnectedProviderAccountId(db, input.connectedProviderAccountId!);
  await patchProviderWebhookSubscription(db, subscription.id, {
    status: "unhealthy",
    last_error_code: input.error,
    last_error_message: input.error,
  });
}
