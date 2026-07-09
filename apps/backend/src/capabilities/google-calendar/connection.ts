import { requireSupabaseData, type SupabaseServiceClient, type TableRow } from "@ai-assistants/control-db";
import { z } from "zod";
import {
  loadProviderWebhookSubscriptionById,
  maybeLoadProviderWebhookSubscriptionByExternalId,
  listProviderWebhookSubscriptionsForConnectedAccount,
  patchProviderWebhookSubscription,
  upsertProviderWebhookSubscription,
  type ProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";
import {
  requireNangoProviderCapabilityAccount,
  type NangoProviderCapabilityAccountBinding,
} from "../../integrations/provider-runtime";

export const GOOGLE_CALENDAR_ADAPTER_KEY = "google_calendar.events" as const;
export const GOOGLE_CALENDAR_PROVIDER_KEY = "google-calendar";

export type GoogleCalendarConnectionContext = {
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccount: TableRow<"connected_provider_accounts">;
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
  accountEmail: string | null;
};

export async function requireGoogleCalendarNango(
  db: SupabaseServiceClient,
  profileId: string,
  connectedAccountId?: string | null,
): Promise<NangoProviderCapabilityAccountBinding> {
  return requireNangoProviderCapabilityAccount(db, {
    profileId,
    providers: ["google-calendar"],
    capabilitySlugs: ["google-calendar"],
    connectedAccountId: connectedAccountId ?? null,
  });
}

export type GoogleCalendarWatchUpsertInput = GoogleCalendarConnectionContext & {
  providerCalendarId: string;
  providerCalendarSummary?: string | null;
  channelId?: string | null;
  channelToken?: string | null;
  resourceId?: string | null;
  resourceUri?: string | null;
  syncToken?: string | null;
  watchExpirationAt?: string | null;
};

async function requireGoogleCalendarConnection(
  db: SupabaseServiceClient,
  connectedProviderAccount: TableRow<"connected_provider_accounts">,
): Promise<GoogleCalendarConnectionContext> {
  const binding = await requireGoogleCalendarNango(
    db,
    connectedProviderAccount.profile_id,
    connectedProviderAccount.id,
  );
  return {
    profileId: binding.account.profile_id,
    capabilityAccountLinkId: binding.link.id,
    connectedProviderAccount: binding.account,
    nangoProviderConfigKey: binding.nangoProviderConfigKey,
    nangoConnectionId: binding.nangoConnectionId,
    accountEmail: binding.account.account_email,
  };
}

export async function requireGoogleCalendarConnectionByConnectedProviderAccountId(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<GoogleCalendarConnectionContext> {
  const connectionResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", connectedProviderAccountId)
    .maybeSingle();
  const connectedProviderAccount = requireSupabaseData(
    "Load Google Calendar provider connection",
    connectionResult.data,
    connectionResult.error,
  );
  return requireGoogleCalendarConnection(db, connectedProviderAccount);
}

export async function maybeGoogleCalendarConnectionByWatchChannel(
  db: SupabaseServiceClient,
  channelId: string,
): Promise<{
  connection: GoogleCalendarConnectionContext;
  state: ProviderWebhookSubscription;
} | null> {
  const state = await maybeLoadProviderWebhookSubscriptionByExternalId({
    db,
    providerKey: GOOGLE_CALENDAR_PROVIDER_KEY,
    adapterKey: GOOGLE_CALENDAR_ADAPTER_KEY,
    externalSubscriptionId: channelId,
  });
  if (!state) return null;
  const connection = await requireGoogleCalendarConnectionByConnectedProviderAccountId(
    db,
    state.connected_provider_account_id,
  );
  return { connection, state };
}

export async function upsertGoogleCalendarWatchState(
  db: SupabaseServiceClient,
  input: GoogleCalendarWatchUpsertInput,
): Promise<ProviderWebhookSubscription> {
  return upsertProviderWebhookSubscription(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    connectedProviderAccountId: input.connectedProviderAccount.id,
    providerKey: GOOGLE_CALENDAR_PROVIDER_KEY,
    adapterKey: GOOGLE_CALENDAR_ADAPTER_KEY,
    externalSubscriptionId: input.channelId ?? null,
    resourceType: "google.calendar",
    resourceId: input.providerCalendarId,
    eventScope: "events",
    status: "active",
    expiresAt: input.watchExpirationAt ?? null,
    cursor: {
      syncToken: input.syncToken ?? null,
    },
    providerState: {
      nangoProviderConfigKey: input.nangoProviderConfigKey,
      nangoConnectionId: input.nangoConnectionId,
      accountEmail: input.accountEmail,
      providerCalendarSummary: input.providerCalendarSummary ?? null,
      channelToken: input.channelToken ?? null,
      resourceId: input.resourceId ?? null,
      resourceUri: input.resourceUri ?? null,
    },
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

export function googleCalendarProviderState(subscription: ProviderWebhookSubscription): {
  providerCalendarSummary: string | null;
  channelToken: string | null;
  resourceId: string | null;
  resourceUri: string | null;
} {
  const parsed = z
    .object({
      providerCalendarSummary: z.string().nullable().optional(),
      channelToken: z.string().nullable().optional(),
      resourceId: z.string().nullable().optional(),
      resourceUri: z.string().nullable().optional(),
    })
    .passthrough()
    .parse(subscription.provider_state);
  return {
    providerCalendarSummary: parsed.providerCalendarSummary ?? null,
    channelToken: parsed.channelToken ?? null,
    resourceId: parsed.resourceId ?? null,
    resourceUri: parsed.resourceUri ?? null,
  };
}

export function googleCalendarCursor(subscription: ProviderWebhookSubscription): {
  syncToken: string | null;
  lastMessageNumber: number | null;
} {
  const parsed = z
    .object({
      syncToken: z.string().trim().min(1).nullable().optional(),
      lastMessageNumber: z.number().int().nonnegative().nullable().optional(),
    })
    .passthrough()
    .parse(subscription.cursor);
  return {
    syncToken: parsed.syncToken ?? null,
    lastMessageNumber: parsed.lastMessageNumber ?? null,
  };
}

export async function loadGoogleCalendarWatchById(
  db: SupabaseServiceClient,
  subscriptionId: string,
): Promise<ProviderWebhookSubscription> {
  return loadProviderWebhookSubscriptionById(db, subscriptionId);
}

export async function listGoogleCalendarWatchesForConnectedAccount(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<ProviderWebhookSubscription[]> {
  return listProviderWebhookSubscriptionsForConnectedAccount({
    db,
    connectedProviderAccountId,
    adapterKey: GOOGLE_CALENDAR_ADAPTER_KEY,
  });
}

export async function markGoogleCalendarWatchStateUnhealthy(
  db: SupabaseServiceClient,
  input: { stateId: string; error: string },
): Promise<void> {
  await patchProviderWebhookSubscription(db, input.stateId, {
    status: "unhealthy",
    last_error_code: input.error,
    last_error_message: input.error,
  });
}
