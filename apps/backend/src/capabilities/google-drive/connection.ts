import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { requireSupabaseData, type TableRow } from "@ai-assistants/control-db";
import { z } from "zod";
import {
  requireNangoProviderCapabilityAccount,
  type NangoProviderCapabilityAccountBinding,
} from "../../integrations/provider-runtime";
import {
  listProviderWebhookSubscriptionsForConnectedAccount,
  maybeLoadProviderWebhookSubscriptionByExternalId,
  patchProviderWebhookSubscription,
  type ProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";

export const GOOGLE_DRIVE_ADAPTER_KEY = "google_drive.changes" as const;
export const GOOGLE_DRIVE_PROVIDER_KEY = "google-drive";
export const GOOGLE_DRIVE_NANGO_PROVIDER_CONFIG_KEY = "ai-assistants-google";
export const GOOGLE_DRIVE_RESOURCE_TYPE = "google_drive.change_log" as const;
export const GOOGLE_DRIVE_EVENT_SCOPE = "file.changes" as const;

export type GoogleDriveConnectionContext = {
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccount: TableRow<"connected_provider_accounts">;
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
  accountEmail: string | null;
};

/** Resolves exactly one enabled, healthy, Nango-backed Google Drive connection for this profile. */
export async function requireGoogleDriveNango(
  db: SupabaseServiceClient,
  profileId: string,
  connectedAccountId?: string | null,
): Promise<NangoProviderCapabilityAccountBinding> {
  return requireNangoProviderCapabilityAccount(db, {
    profileId,
    providers: ["google-drive"],
    capabilitySlugs: ["google-drive"],
    connectedAccountId: connectedAccountId ?? null,
  });
}

export async function requireGoogleDriveConnectionByConnectedProviderAccountId(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<GoogleDriveConnectionContext> {
  const accountResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", connectedProviderAccountId)
    .maybeSingle();
  const account = requireSupabaseData(
    "Load Google Drive provider connection",
    accountResult.data,
    accountResult.error,
  );
  const binding = await requireGoogleDriveNango(db, account.profile_id, connectedProviderAccountId);
  return {
    profileId: binding.account.profile_id,
    capabilityAccountLinkId: binding.link.id,
    connectedProviderAccount: binding.account,
    nangoProviderConfigKey: binding.nangoProviderConfigKey,
    nangoConnectionId: binding.nangoConnectionId,
    accountEmail: binding.account.account_email,
  };
}

export async function maybeGoogleDriveConnectionBySubscription(
  db: SupabaseServiceClient,
  channelId: string,
): Promise<{
  connection: GoogleDriveConnectionContext;
  state: ProviderWebhookSubscription;
} | null> {
  const state = await maybeLoadProviderWebhookSubscriptionByExternalId({
    db,
    providerKey: GOOGLE_DRIVE_PROVIDER_KEY,
    adapterKey: GOOGLE_DRIVE_ADAPTER_KEY,
    externalSubscriptionId: channelId,
  });
  if (!state) return null;
  const connection = await requireGoogleDriveConnectionByConnectedProviderAccountId(
    db,
    state.connected_provider_account_id,
  );
  return { connection, state };
}

export function googleDriveProviderState(subscription: ProviderWebhookSubscription): {
  channelToken: string;
  resourceId: string | null;
  accountEmail: string | null;
  watchAddress: string;
} {
  const parsed = z
    .object({
      channelToken: z.string().trim().min(1),
      resourceId: z.string().trim().min(1).nullable().optional(),
      accountEmail: z.string().nullable().optional(),
      watchAddress: z.string().trim().url(),
    })
    .passthrough()
    .parse(subscription.provider_state);
  return {
    channelToken: parsed.channelToken,
    resourceId: parsed.resourceId ?? null,
    accountEmail: parsed.accountEmail ?? null,
    watchAddress: parsed.watchAddress,
  };
}

export function googleDriveCursor(subscription: ProviderWebhookSubscription): {
  pageToken: string | null;
  initialized: boolean;
} {
  const parsed = z
    .object({
      pageToken: z.string().trim().min(1).nullable().optional(),
      initialized: z.boolean().optional(),
    })
    .passthrough()
    .parse(subscription.cursor);
  return { pageToken: parsed.pageToken ?? null, initialized: parsed.initialized ?? false };
}

export async function listGoogleDriveSubscriptionsForConnectedAccount(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<ProviderWebhookSubscription[]> {
  return listProviderWebhookSubscriptionsForConnectedAccount({
    db,
    connectedProviderAccountId,
    adapterKey: GOOGLE_DRIVE_ADAPTER_KEY,
  });
}

export async function markGoogleDriveSubscriptionUnhealthy(
  db: SupabaseServiceClient,
  input: { subscriptionId: string; error: string; expiresAt?: string | null },
): Promise<void> {
  await patchProviderWebhookSubscription(db, input.subscriptionId, {
    status: "unhealthy",
    last_error_code: input.error,
    last_error_message: input.error,
    ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
  });
}
