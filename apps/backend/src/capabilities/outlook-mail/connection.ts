import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import {
  listProviderWebhookSubscriptionsForConnectedAccount,
  maybeLoadProviderWebhookSubscriptionByExternalId,
  patchProviderWebhookSubscription,
  type ProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";
import {
  requireNangoProviderCapabilityAccount,
  type NangoProviderCapabilityAccountBinding,
} from "../../integrations/provider-runtime";

export const OUTLOOK_MAIL_ADAPTER_KEY = "outlook_mail.mailbox" as const;
export const OUTLOOK_MAIL_PROVIDER_KEY = "outlook-mail";

export type OutlookConnectionContext = {
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccount: TableRow<"connected_provider_accounts">;
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
  accountEmail: string | null;
};

export async function requireOutlookMailMailboxNango(
  db: SupabaseServiceClient,
  profileId: string,
  connectedAccountId?: string | null,
): Promise<NangoProviderCapabilityAccountBinding> {
  return requireNangoProviderCapabilityAccount(db, {
    profileId,
    providers: ["outlook-mail"],
    capabilitySlugs: ["outlook-mail"],
    connectedAccountId: connectedAccountId ?? null,
  });
}

export async function requireOutlookConnectionByProviderConnectionId(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<OutlookConnectionContext> {
  const connectionResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", connectedProviderAccountId)
    .maybeSingle();
  const connectedProviderAccount = requireSupabaseData(
    "Load Outlook provider connection",
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
  if (nangoProviderConfigKey !== "ai-assistants-outlook") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connection ${connectedProviderAccount.id} is not an Outlook connection.`,
    );
  }

  const bindingsResult = await db
    .from("capability_account_links")
    .select()
    .eq("connected_provider_account_id", connectedProviderAccount.id)
    .eq("status", "enabled");
  const bindings = requireSupabaseRows(
    "Resolve Outlook provider connection bindings",
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
  const instancesResult = await db.from("capability_account_links").select().in("id", instanceIds);
  const instances = requireSupabaseRows(
    "Resolve Outlook capability instances",
    instancesResult.data,
    instancesResult.error,
  ).filter(
    (instance) =>
      instance.profile_id === connectedProviderAccount.profile_id &&
      instance.capability_slug === "outlook-mail" &&
      instance.provider === "outlook-mail" &&
      instance.status === "enabled",
  );
  if (instances.length !== 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connection ${connectedProviderAccount.id} has ${instances.length} enabled Outlook email capabilities; expected exactly one.`,
    );
  }
  const instance = instances[0];
  if (!instance) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connection ${connectedProviderAccount.id} has no enabled Outlook email capability.`,
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

export async function maybeOutlookConnectionBySubscription(
  db: SupabaseServiceClient,
  subscriptionId: string,
): Promise<{
  connection: OutlookConnectionContext;
  state: ProviderWebhookSubscription;
} | null> {
  const state = await maybeLoadProviderWebhookSubscriptionByExternalId({
    db,
    providerKey: OUTLOOK_MAIL_PROVIDER_KEY,
    adapterKey: OUTLOOK_MAIL_ADAPTER_KEY,
    externalSubscriptionId: subscriptionId,
  });
  if (!state) return null;
  const connection = await requireOutlookConnectionByProviderConnectionId(
    db,
    state.connected_provider_account_id,
  );
  return { connection, state };
}

export function outlookMailProviderState(subscription: ProviderWebhookSubscription): {
  clientState: string;
  resource: string;
  changeType: string;
} {
  return z
    .object({
      clientState: z.string().trim().min(1),
      resource: z.string().trim().min(1),
      changeType: z.string().trim().min(1),
    })
    .passthrough()
    .parse(subscription.provider_state);
}

export async function listOutlookMailSubscriptionsForConnection(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<ProviderWebhookSubscription[]> {
  return listProviderWebhookSubscriptionsForConnectedAccount({
    db,
    connectedProviderAccountId,
    adapterKey: OUTLOOK_MAIL_ADAPTER_KEY,
  });
}

export async function markOutlookSubscriptionStateUnhealthy(
  db: SupabaseServiceClient,
  input: {
    stateId: string;
    error: string;
    subscriptionExpirationAt?: string | null;
  },
): Promise<void> {
  await patchProviderWebhookSubscription(db, input.stateId, {
    status: "unhealthy",
    last_error_code: input.error,
    last_error_message: input.error,
    ...(input.subscriptionExpirationAt ? { expires_at: input.subscriptionExpirationAt } : {}),
  });
}
