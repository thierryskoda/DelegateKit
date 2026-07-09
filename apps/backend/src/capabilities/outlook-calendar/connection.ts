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

export const OUTLOOK_CALENDAR_ADAPTER_KEY = "outlook_calendar.events" as const;
export const OUTLOOK_CALENDAR_PROVIDER_KEY = "outlook-calendar";

export type OutlookCalendarConnectionContext = {
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccount: TableRow<"connected_provider_accounts">;
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
  accountEmail: string | null;
};

export async function requireOutlookCalendarNango(
  db: SupabaseServiceClient,
  profileId: string,
  connectedAccountId?: string | null,
): Promise<NangoProviderCapabilityAccountBinding> {
  return requireNangoProviderCapabilityAccount(db, {
    profileId,
    providers: ["outlook-calendar"],
    capabilitySlugs: ["outlook-calendar"],
    connectedAccountId: connectedAccountId ?? null,
  });
}

export async function requireOutlookCalendarConnectionByProviderConnectionId(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<OutlookCalendarConnectionContext> {
  const connectionResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", connectedProviderAccountId)
    .maybeSingle();
  const connectedProviderAccount = requireSupabaseData(
    "Load Outlook Calendar provider connection",
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
    "Resolve Outlook Calendar provider connection bindings",
    bindingsResult.data,
    bindingsResult.error,
  );
  const instanceIds = bindings.map((binding) => binding.id);
  if (instanceIds.length === 0) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connection ${connectedProviderAccount.id} has no active capability bindings.`,
    );
  }
  const instancesResult = await db.from("capability_account_links").select().in("id", instanceIds);
  const instances = requireSupabaseRows(
    "Resolve Outlook Calendar capability instances",
    instancesResult.data,
    instancesResult.error,
  ).filter(
    (instance) =>
      instance.profile_id === connectedProviderAccount.profile_id &&
      instance.capability_slug === "outlook-calendar" &&
      instance.provider === "outlook-calendar" &&
      instance.status === "enabled",
  );
  if (instances.length !== 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connection ${connectedProviderAccount.id} has ${instances.length} enabled Outlook Calendar capabilities; expected exactly one.`,
    );
  }
  const instance = instances[0]!;
  return {
    profileId: connectedProviderAccount.profile_id,
    capabilityAccountLinkId: instance.id,
    connectedProviderAccount,
    nangoProviderConfigKey,
    nangoConnectionId,
    accountEmail: connectedProviderAccount.account_email,
  };
}

export async function maybeOutlookCalendarConnectionBySubscription(
  db: SupabaseServiceClient,
  subscriptionId: string,
): Promise<{
  connection: OutlookCalendarConnectionContext;
  state: ProviderWebhookSubscription;
} | null> {
  const state = await maybeLoadProviderWebhookSubscriptionByExternalId({
    db,
    providerKey: OUTLOOK_CALENDAR_PROVIDER_KEY,
    adapterKey: OUTLOOK_CALENDAR_ADAPTER_KEY,
    externalSubscriptionId: subscriptionId,
  });
  if (!state) return null;
  const connection = await requireOutlookCalendarConnectionByProviderConnectionId(
    db,
    state.connected_provider_account_id,
  );
  return { connection, state };
}

export async function markOutlookCalendarSubscriptionStateUnhealthy(
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

export function outlookCalendarProviderState(subscription: ProviderWebhookSubscription): {
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

export async function listOutlookCalendarSubscriptionsForConnection(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<ProviderWebhookSubscription[]> {
  return listProviderWebhookSubscriptionsForConnectedAccount({
    db,
    connectedProviderAccountId,
    adapterKey: OUTLOOK_CALENDAR_ADAPTER_KEY,
  });
}
