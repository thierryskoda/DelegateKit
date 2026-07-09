import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import {
  providerWebhookPublicHeaders,
  receiveProviderWebhookNotification,
  type ProviderWebhookReceiveResult,
} from "../../integrations/provider-webhooks/substrate";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import {
  GMAIL_MAILBOX_ADAPTER_KEY,
  GMAIL_MAILBOX_PROVIDER_KEY,
  historyIdText,
  requireGmailConnectionByNango,
  upsertGmailMailboxSubscription,
} from "./connection";
import { gmailNotificationDataSchema, nangoForwardedGmailWebhookSchema } from "./schemas";

function decodeGmailNotificationData(data: string): {
  emailAddress: string;
  historyId: string | number;
} {
  const decoded = Buffer.from(data, "base64url").toString("utf8");
  return gmailNotificationDataSchema.parse(JSON.parse(decoded) as unknown);
}

export async function applyForwardedGmailWebhook(input: {
  db: SupabaseServiceClient;
  body: unknown;
  headers?: Headers;
}): Promise<ProviderWebhookReceiveResult> {
  const parsed = nangoForwardedGmailWebhookSchema.safeParse(input.body);
  if (!parsed.success) return { ok: true, handled: false };
  const notification = decodeGmailNotificationData(parsed.data.payload.message.data);
  const connection = await requireGmailConnectionByNango({
    db: input.db,
    providerConfigKey: parsed.data.providerConfigKey,
    connectionId: parsed.data.connectionId,
  });
  const latestSeenHistoryId = historyIdText(notification.historyId);
  const subscription = await upsertGmailMailboxSubscription(input.db, {
    ...connection,
    latestSeenHistoryId,
  });
  const delivery = await receiveProviderWebhookNotification(input.db, {
    profileId: connection.profileId,
    capabilityAccountLinkId: connection.capabilityAccountLinkId,
    providerKey: GMAIL_MAILBOX_PROVIDER_KEY,
    adapterKey: GMAIL_MAILBOX_ADAPTER_KEY,
    subscriptionId: subscription.id,
    deliveryKey: `gmail-pubsub:${parsed.data.payload.message.messageId}`,
    authenticated: true,
    requestHeaders: input.headers ? providerWebhookPublicHeaders(input.headers) : {},
    payload: {
      providerConfigKey: parsed.data.providerConfigKey,
      connectionId: parsed.data.connectionId,
      pubsubMessageId: parsed.data.payload.message.messageId,
      publishTime: parsed.data.payload.message.publishTime ?? null,
      accountEmail: notification.emailAddress,
      latestSeenHistoryId,
    },
  });
  await upsertGmailMailboxSubscription(input.db, {
    ...connection,
    latestSeenHistoryId,
  });
  emitDiagnostic(backendDiagnosticLogger(), "gmail.webhook.forwarded.received", {
    ok: true,
    profile_id: connection.profileId,
    capability_account_link_id: connection.capabilityAccountLinkId,
    job_id: delivery.backendJobId,
    job_kind: "provider.webhook.process",
    attrs: {
      connected_provider_account_id: connection.connectedProviderAccount.id,
      nango_provider_config_key: parsed.data.providerConfigKey,
      nango_connection_id: parsed.data.connectionId,
      gmail_pubsub_message_id: parsed.data.payload.message.messageId,
      gmail_history_id: latestSeenHistoryId,
      subscription_id: subscription.id,
      delivery_id: delivery.delivery.id,
      joined_existing_job: delivery.joinedExistingJob,
    },
  });
  return {
    ok: true,
    handled: true,
    subscriptionId: subscription.id,
    deliveryId: delivery.delivery.id,
    backendJobId: delivery.backendJobId,
    joinedExistingJob: delivery.joinedExistingJob,
  };
}
