import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { z } from "zod";
import {
  requireNangoProviderCapabilityAccount,
  type NangoProviderCapabilityAccountBinding,
} from "../../integrations/provider-runtime";
import {
  loadProviderWebhookSubscriptionByExternalId,
  listProviderWebhookSubscriptionsForConnectedAccount,
  maybeLoadProviderWebhookSubscriptionByExternalId,
  patchProviderWebhookSubscription,
  type ProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";

export const MICROSOFT_SHAREPOINT_ADAPTER_KEY = "microsoft_sharepoint.drive" as const;
export const MICROSOFT_SHAREPOINT_PROVIDER_KEY = "microsoft-sharepoint";
export const MICROSOFT_SHAREPOINT_NANGO_PROVIDER_CONFIG_KEY = "ai-assistants-microsoft-sharepoint";
export const MICROSOFT_SHAREPOINT_RESOURCE_TYPE = "microsoft_sharepoint.drive" as const;

export type MicrosoftSharepointConnectionContext = {
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccount: TableRow<"connected_provider_accounts">;
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
  accountEmail: string | null;
};

export async function requireMicrosoftSharepointNango(
  db: SupabaseServiceClient,
  profileId: string,
  connectedAccountId?: string | null,
): Promise<NangoProviderCapabilityAccountBinding> {
  return requireNangoProviderCapabilityAccount(db, {
    profileId,
    providers: ["microsoft-sharepoint"],
    capabilitySlugs: ["microsoft-sharepoint"],
    connectedAccountId: connectedAccountId ?? null,
  });
}

export async function requireMicrosoftSharepointConnectionByConnectedProviderAccountId(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<MicrosoftSharepointConnectionContext> {
  const accountResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", connectedProviderAccountId)
    .maybeSingle();
  const connectedProviderAccount = requireSupabaseData(
    "Load Microsoft SharePoint provider connection",
    accountResult.data,
    accountResult.error,
  );
  const binding = await requireMicrosoftSharepointNango(
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

export async function requireMicrosoftSharepointConnectionBySubscription(
  db: SupabaseServiceClient,
  externalSubscriptionId: string,
): Promise<{
  connection: MicrosoftSharepointConnectionContext;
  state: ProviderWebhookSubscription;
}> {
  const state = await loadProviderWebhookSubscriptionByExternalId({
    db,
    providerKey: MICROSOFT_SHAREPOINT_PROVIDER_KEY,
    adapterKey: MICROSOFT_SHAREPOINT_ADAPTER_KEY,
    externalSubscriptionId,
  });
  const connection = await requireMicrosoftSharepointConnectionByConnectedProviderAccountId(
    db,
    state.connected_provider_account_id,
  );
  return { connection, state };
}

export async function maybeMicrosoftSharepointConnectionBySubscription(
  db: SupabaseServiceClient,
  externalSubscriptionId: string,
): Promise<{
  connection: MicrosoftSharepointConnectionContext;
  state: ProviderWebhookSubscription;
} | null> {
  const state = await maybeLoadProviderWebhookSubscriptionByExternalId({
    db,
    providerKey: MICROSOFT_SHAREPOINT_PROVIDER_KEY,
    adapterKey: MICROSOFT_SHAREPOINT_ADAPTER_KEY,
    externalSubscriptionId,
  });
  if (!state) return null;
  const connection = await requireMicrosoftSharepointConnectionByConnectedProviderAccountId(
    db,
    state.connected_provider_account_id,
  );
  return { connection, state };
}

export function microsoftSharepointProviderState(subscription: ProviderWebhookSubscription): {
  clientState: string;
  resource: string;
  driveId: string;
  driveName: string | null;
  driveWebUrl: string | null;
  siteId: string;
  siteName: string | null;
  siteWebUrl: string | null;
} {
  const parsed = z
    .object({
      clientState: z.string().trim().min(1),
      resource: z.string().trim().min(1),
      driveId: z.string().trim().min(1),
      driveName: z.string().nullable().optional(),
      driveWebUrl: z.string().nullable().optional(),
      siteId: z.string().trim().min(1),
      siteName: z.string().nullable().optional(),
      siteWebUrl: z.string().nullable().optional(),
    })
    .passthrough()
    .parse(subscription.provider_state);
  return {
    clientState: parsed.clientState,
    resource: parsed.resource,
    driveId: parsed.driveId,
    driveName: parsed.driveName ?? null,
    driveWebUrl: parsed.driveWebUrl ?? null,
    siteId: parsed.siteId,
    siteName: parsed.siteName ?? null,
    siteWebUrl: parsed.siteWebUrl ?? null,
  };
}

export function microsoftSharepointCursor(subscription: ProviderWebhookSubscription): {
  deltaLink: string | null;
  initialized: boolean;
} {
  const parsed = z
    .object({
      deltaLink: z.string().trim().min(1).nullable().optional(),
      initialized: z.boolean().optional(),
    })
    .passthrough()
    .parse(subscription.cursor);
  return { deltaLink: parsed.deltaLink ?? null, initialized: parsed.initialized ?? false };
}

export async function listMicrosoftSharepointSubscriptionsForConnectedAccount(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<ProviderWebhookSubscription[]> {
  return listProviderWebhookSubscriptionsForConnectedAccount({
    db,
    connectedProviderAccountId,
    adapterKey: MICROSOFT_SHAREPOINT_ADAPTER_KEY,
  });
}

export async function markMicrosoftSharepointSubscriptionUnhealthy(
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
