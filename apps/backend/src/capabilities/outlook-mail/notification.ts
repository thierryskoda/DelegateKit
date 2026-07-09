import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import {
  patchProviderWebhookSubscription,
  providerWebhookPublicHeaders,
  receiveProviderWebhookNotification,
  type ProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";
import {
  emitMicrosoftGraphStaleSubscriptionDiagnostic,
  microsoftGraphWebhookBodySchema,
  type MicrosoftGraphWebhookNotification,
} from "../../integrations/microsoft-graph/webhook-notifications";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import {
  OUTLOOK_MAIL_ADAPTER_KEY,
  OUTLOOK_MAIL_PROVIDER_KEY,
  markOutlookSubscriptionStateUnhealthy,
  maybeOutlookConnectionBySubscription,
  outlookMailProviderState,
  type OutlookConnectionContext,
} from "./connection";
import { enqueueOutlookMailSubscriptionRenewJob } from "./subscription";

const OUTLOOK_MESSAGE_PROCESS_PRIORITY = 10;

function extractOutlookMessageId(
  notification: MicrosoftGraphWebhookNotification,
): string | null {
  const resourceDataId = notification.resourceData?.id?.trim();
  if (resourceDataId) return resourceDataId;
  const odataId = notification.resourceData?.["@odata.id"]?.trim();
  const resource = odataId || notification.resource || "";
  const match = /\/messages\/([^/?#]+)/i.exec(resource);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function outlookDeliveryKey(input: {
  notification: MicrosoftGraphWebhookNotification;
  messageId: string | null;
}): string {
  return [
    "outlook-mail",
    input.notification.subscriptionId,
    input.notification.lifecycleEvent ?? "change",
    input.notification.changeType ?? "unknown",
    input.messageId ?? input.notification.resource ?? "no-resource",
    input.notification.subscriptionExpirationDateTime ?? "no-expiration",
  ].join(":");
}

async function updateNotificationState(
  db: SupabaseServiceClient,
  input: {
    state: ProviderWebhookSubscription;
    notification: MicrosoftGraphWebhookNotification;
  },
): Promise<void> {
  await patchProviderWebhookSubscription(db, input.state.id, {
    last_notification_at: new Date().toISOString(),
    ...(input.notification.subscriptionExpirationDateTime
      ? { expires_at: input.notification.subscriptionExpirationDateTime }
      : {}),
  });
}

async function handleLifecycleNotification(input: {
  db: SupabaseServiceClient;
  connection: OutlookConnectionContext;
  state: ProviderWebhookSubscription;
  notification: MicrosoftGraphWebhookNotification;
}): Promise<boolean> {
  switch (input.notification.lifecycleEvent) {
    case "reauthorizationRequired":
      await enqueueOutlookMailSubscriptionRenewJob(input.db, {
        profileId: input.connection.profileId,
        capabilityAccountLinkId: input.connection.capabilityAccountLinkId,
        connectedProviderAccountId: input.connection.connectedProviderAccount.id,
      });
      return true;
    case "subscriptionRemoved":
      await markOutlookSubscriptionStateUnhealthy(input.db, {
        stateId: input.state.id,
        error: "outlook_mail.webhook.subscription_removed",
        ...(input.notification.subscriptionExpirationDateTime
          ? { subscriptionExpirationAt: input.notification.subscriptionExpirationDateTime }
          : {}),
      });
      await enqueueOutlookMailSubscriptionRenewJob(input.db, {
        profileId: input.connection.profileId,
        capabilityAccountLinkId: input.connection.capabilityAccountLinkId,
        connectedProviderAccountId: input.connection.connectedProviderAccount.id,
      });
      return true;
    case "missed":
      await markOutlookSubscriptionStateUnhealthy(input.db, {
        stateId: input.state.id,
        error: "outlook_mail.webhook.notifications_missed",
        ...(input.notification.subscriptionExpirationDateTime
          ? { subscriptionExpirationAt: input.notification.subscriptionExpirationDateTime }
          : {}),
      });
      emitDiagnostic(backendDiagnosticLogger(), "outlook_mail.webhook.lifecycle.missed", {
        ok: false,
        profile_id: input.connection.profileId,
        capability_account_link_id: input.connection.capabilityAccountLinkId,
        attrs: {
          connected_provider_account_id: input.connection.connectedProviderAccount.id,
          graph_subscription_id: input.notification.subscriptionId,
        },
      });
      return false;
    case undefined:
      return false;
    default: {
      const exhaustive: never = input.notification.lifecycleEvent;
      return exhaustive;
    }
  }
}

export async function applyOutlookWebhook(input: {
  db: SupabaseServiceClient;
  body: unknown;
  headers?: Headers;
}): Promise<{
  ok: true;
  handled: boolean;
  notifications: number;
  ignoredNotifications: number;
  enqueuedJobs: number;
}> {
  const parsed = microsoftGraphWebhookBodySchema.safeParse(input.body);
  if (!parsed.success) {
    return {
      ok: true,
      handled: false,
      notifications: 0,
      ignoredNotifications: 0,
      enqueuedJobs: 0,
    };
  }

  let enqueuedJobs = 0;
  let ignoredNotifications = 0;
  let knownNotifications = 0;
  for (const notification of parsed.data.value) {
    const subscription = await maybeOutlookConnectionBySubscription(
      input.db,
      notification.subscriptionId,
    );
    if (!subscription) {
      ignoredNotifications += 1;
      emitMicrosoftGraphStaleSubscriptionDiagnostic({
        providerKey: OUTLOOK_MAIL_PROVIDER_KEY,
        adapterKey: OUTLOOK_MAIL_ADAPTER_KEY,
        subscriptionId: notification.subscriptionId,
        lifecycleEvent: notification.lifecycleEvent ?? null,
        changeType: notification.changeType ?? null,
        resource: notification.resource ?? null,
      });
      continue;
    }
    knownNotifications += 1;
    const { connection, state } = subscription;
    const providerState = outlookMailProviderState(state);
    if (notification.clientState !== providerState.clientState) {
      throw new DomainError(
        domainCodes.UNAUTHORIZED,
        "Outlook webhook notification clientState did not match subscription state.",
      );
    }

    await updateNotificationState(input.db, { state, notification });

    if (notification.lifecycleEvent) {
      const enqueued = await handleLifecycleNotification({
        db: input.db,
        connection,
        state,
        notification,
      });
      if (enqueued) enqueuedJobs += 1;
      continue;
    }

    if (notification.changeType !== "created") continue;
    const messageId = extractOutlookMessageId(notification);
    if (!messageId) {
      throw new DomainError(
        domainCodes.BAD_REQUEST,
        "Outlook webhook notification did not include a message id.",
      );
    }
    const delivery = await receiveProviderWebhookNotification(input.db, {
      profileId: connection.profileId,
      capabilityAccountLinkId: connection.capabilityAccountLinkId,
      providerKey: OUTLOOK_MAIL_PROVIDER_KEY,
      adapterKey: OUTLOOK_MAIL_ADAPTER_KEY,
      subscriptionId: state.id,
      deliveryKey: outlookDeliveryKey({ notification, messageId }),
      authenticated: true,
      requestHeaders: input.headers ? providerWebhookPublicHeaders(input.headers) : {},
      payload: {
        notification,
        graphSubscriptionId: notification.subscriptionId,
        messageId,
        changeType: notification.changeType,
        resource: notification.resource ?? providerState.resource,
      },
      priority: OUTLOOK_MESSAGE_PROCESS_PRIORITY,
    });
    void delivery;
    enqueuedJobs += 1;
  }

  emitDiagnostic(backendDiagnosticLogger(), "outlook_mail.webhook.received", {
    ok: true,
    attrs: {
      notifications: parsed.data.value.length,
      ignored_notifications: ignoredNotifications,
      enqueued_jobs: enqueuedJobs,
    },
  });
  return {
    ok: true,
    handled: knownNotifications > 0,
    notifications: parsed.data.value.length,
    ignoredNotifications,
    enqueuedJobs,
  };
}
