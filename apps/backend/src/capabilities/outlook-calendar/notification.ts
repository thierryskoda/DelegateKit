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
  OUTLOOK_CALENDAR_ADAPTER_KEY,
  OUTLOOK_CALENDAR_PROVIDER_KEY,
  markOutlookCalendarSubscriptionStateUnhealthy,
  maybeOutlookCalendarConnectionBySubscription,
  outlookCalendarProviderState,
  type OutlookCalendarConnectionContext,
} from "./connection";
import { enqueueOutlookCalendarSubscriptionRenewJob } from "./subscription";

const OUTLOOK_CALENDAR_EVENT_PROCESS_PRIORITY = 10;

function extractOutlookCalendarEventId(
  notification: MicrosoftGraphWebhookNotification,
): string | null {
  const resourceDataId = notification.resourceData?.id?.trim();
  if (resourceDataId) return resourceDataId;
  const odataId = notification.resourceData?.["@odata.id"]?.trim();
  const resource = odataId || notification.resource || "";
  const match = /\/events\/([^/?#]+)/i.exec(resource);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function outlookCalendarDeliveryKey(input: {
  notification: MicrosoftGraphWebhookNotification;
  eventId: string | null;
}): string {
  return [
    "outlook-calendar",
    input.notification.subscriptionId,
    input.notification.lifecycleEvent ?? "change",
    input.notification.changeType ?? "unknown",
    input.eventId ?? input.notification.resource ?? "no-resource",
    input.notification.subscriptionExpirationDateTime ?? "no-expiration",
  ].join(":");
}

async function updateNotificationState(input: {
  db: SupabaseServiceClient;
  state: ProviderWebhookSubscription;
  notification: MicrosoftGraphWebhookNotification;
}): Promise<void> {
  await patchProviderWebhookSubscription(input.db, input.state.id, {
    last_notification_at: new Date().toISOString(),
    ...(input.notification.subscriptionExpirationDateTime
      ? { expires_at: input.notification.subscriptionExpirationDateTime }
      : {}),
  });
}

async function handleLifecycleNotification(input: {
  db: SupabaseServiceClient;
  connection: OutlookCalendarConnectionContext;
  state: ProviderWebhookSubscription;
  notification: MicrosoftGraphWebhookNotification;
}): Promise<boolean> {
  switch (input.notification.lifecycleEvent) {
    case "reauthorizationRequired":
      await enqueueOutlookCalendarSubscriptionRenewJob(input.db, {
        profileId: input.connection.profileId,
        capabilityAccountLinkId: input.connection.capabilityAccountLinkId,
        connectedProviderAccountId: input.connection.connectedProviderAccount.id,
      });
      return true;
    case "subscriptionRemoved":
      await markOutlookCalendarSubscriptionStateUnhealthy(input.db, {
        stateId: input.state.id,
        error: "outlook_calendar_subscription_removed",
        ...(input.notification.subscriptionExpirationDateTime
          ? { subscriptionExpirationAt: input.notification.subscriptionExpirationDateTime }
          : {}),
      });
      await enqueueOutlookCalendarSubscriptionRenewJob(input.db, {
        profileId: input.connection.profileId,
        capabilityAccountLinkId: input.connection.capabilityAccountLinkId,
        connectedProviderAccountId: input.connection.connectedProviderAccount.id,
      });
      return true;
    case "missed":
      await markOutlookCalendarSubscriptionStateUnhealthy(input.db, {
        stateId: input.state.id,
        error: "outlook_calendar_notifications_missed",
        ...(input.notification.subscriptionExpirationDateTime
          ? { subscriptionExpirationAt: input.notification.subscriptionExpirationDateTime }
          : {}),
      });
      emitDiagnostic(backendDiagnosticLogger(), "outlook_calendar.webhook.lifecycle.missed", {
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

export async function applyOutlookCalendarWebhook(input: {
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
    const subscription = await maybeOutlookCalendarConnectionBySubscription(
      input.db,
      notification.subscriptionId,
    );
    if (!subscription) {
      ignoredNotifications += 1;
      emitMicrosoftGraphStaleSubscriptionDiagnostic({
        providerKey: OUTLOOK_CALENDAR_PROVIDER_KEY,
        adapterKey: OUTLOOK_CALENDAR_ADAPTER_KEY,
        subscriptionId: notification.subscriptionId,
        lifecycleEvent: notification.lifecycleEvent ?? null,
        changeType: notification.changeType ?? null,
        resource: notification.resource ?? null,
      });
      continue;
    }
    knownNotifications += 1;
    const { connection, state } = subscription;
    const providerState = outlookCalendarProviderState(state);
    if (notification.clientState !== providerState.clientState) {
      throw new DomainError(
        domainCodes.UNAUTHORIZED,
        "Outlook Calendar webhook notification clientState did not match subscription state.",
      );
    }

    await updateNotificationState({ db: input.db, state, notification });

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

    const eventId = extractOutlookCalendarEventId(notification);
    if (!eventId) {
      throw new DomainError(
        domainCodes.BAD_REQUEST,
        "Outlook Calendar webhook notification did not include an event id.",
      );
    }
    await receiveProviderWebhookNotification(input.db, {
      profileId: connection.profileId,
      capabilityAccountLinkId: connection.capabilityAccountLinkId,
      providerKey: OUTLOOK_CALENDAR_PROVIDER_KEY,
      adapterKey: OUTLOOK_CALENDAR_ADAPTER_KEY,
      subscriptionId: state.id,
      deliveryKey: outlookCalendarDeliveryKey({ notification, eventId }),
      authenticated: true,
      requestHeaders: input.headers ? providerWebhookPublicHeaders(input.headers) : {},
      payload: {
        notification,
        graphSubscriptionId: notification.subscriptionId,
        eventId,
        changeType: notification.changeType ?? "updated",
        resource: notification.resource ?? providerState.resource,
      },
      priority: OUTLOOK_CALENDAR_EVENT_PROCESS_PRIORITY,
    });
    enqueuedJobs += 1;
  }

  emitDiagnostic(backendDiagnosticLogger(), "outlook_calendar.webhook.received", {
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
