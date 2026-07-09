import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  patchProviderWebhookSubscription,
  providerWebhookPublicHeaders,
  receiveProviderWebhookNotification,
} from "../../integrations/provider-webhooks/substrate";
import {
  emitMicrosoftGraphStaleSubscriptionDiagnostic,
  microsoftGraphWebhookBodySchema,
} from "../../integrations/microsoft-graph/webhook-notifications";
import {
  MICROSOFT_SHAREPOINT_ADAPTER_KEY,
  MICROSOFT_SHAREPOINT_PROVIDER_KEY,
  markMicrosoftSharepointSubscriptionUnhealthy,
  maybeMicrosoftSharepointConnectionBySubscription,
  microsoftSharepointProviderState,
  requireMicrosoftSharepointConnectionBySubscription,
} from "./connection";
import { enqueueMicrosoftSharepointSubscriptionReconcileJob } from "./jobs";

function deliveryKey(input: {
  subscriptionId: string;
  lifecycleEvent?: string;
  changeType?: string;
  resource?: string;
  expiration?: string;
}): string {
  const minuteBucket = Math.floor(Date.now() / 60_000);
  return [
    "microsoft-sharepoint",
    input.subscriptionId,
    input.lifecycleEvent ?? "change",
    input.changeType ?? "unknown",
    input.resource ?? "root",
    input.expiration ?? "no-expiration",
    minuteBucket,
  ].join(":");
}

async function handleLifecycle(input: {
  db: SupabaseServiceClient;
  subscriptionId: string;
  lifecycleEvent: "missed" | "subscriptionRemoved" | "reauthorizationRequired";
  expiresAt?: string;
}): Promise<boolean> {
  const { connection, state } = await requireMicrosoftSharepointConnectionBySubscription(
    input.db,
    input.subscriptionId,
  );
  await markMicrosoftSharepointSubscriptionUnhealthy(input.db, {
    subscriptionId: state.id,
    error: `microsoft_sharepoint.webhook.${input.lifecycleEvent}`,
    expiresAt: input.expiresAt ?? null,
  });
  await enqueueMicrosoftSharepointSubscriptionReconcileJob(input.db, {
    profileId: connection.profileId,
    capabilityAccountLinkId: connection.capabilityAccountLinkId,
    connectedProviderAccountId: connection.connectedProviderAccount.id,
  });
  return true;
}

export async function applyMicrosoftSharepointWebhook(input: {
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
    const subscription = await maybeMicrosoftSharepointConnectionBySubscription(
      input.db,
      notification.subscriptionId,
    );
    if (!subscription) {
      ignoredNotifications += 1;
      emitMicrosoftGraphStaleSubscriptionDiagnostic({
        providerKey: MICROSOFT_SHAREPOINT_PROVIDER_KEY,
        adapterKey: MICROSOFT_SHAREPOINT_ADAPTER_KEY,
        subscriptionId: notification.subscriptionId,
        lifecycleEvent: notification.lifecycleEvent ?? null,
        changeType: notification.changeType ?? null,
        resource: notification.resource ?? null,
      });
      continue;
    }
    knownNotifications += 1;
    const { connection, state } = subscription;
    const providerState = microsoftSharepointProviderState(state);
    if (notification.clientState !== providerState.clientState) {
      throw new DomainError(
        domainCodes.UNAUTHORIZED,
        "Microsoft SharePoint webhook clientState did not match subscription state.",
      );
    }
    await patchProviderWebhookSubscription(input.db, state.id, {
      last_notification_at: new Date().toISOString(),
      ...(notification.subscriptionExpirationDateTime
        ? { expires_at: notification.subscriptionExpirationDateTime }
        : {}),
    });
    if (notification.lifecycleEvent) {
      const enqueued = await handleLifecycle({
        db: input.db,
        subscriptionId: notification.subscriptionId,
        lifecycleEvent: notification.lifecycleEvent,
        ...(notification.subscriptionExpirationDateTime
          ? { expiresAt: notification.subscriptionExpirationDateTime }
          : {}),
      });
      if (enqueued) enqueuedJobs += 1;
      continue;
    }
    const delivery = await receiveProviderWebhookNotification(input.db, {
      profileId: connection.profileId,
      capabilityAccountLinkId: connection.capabilityAccountLinkId,
      providerKey: MICROSOFT_SHAREPOINT_PROVIDER_KEY,
      adapterKey: MICROSOFT_SHAREPOINT_ADAPTER_KEY,
      subscriptionId: state.id,
      deliveryKey: deliveryKey({
        subscriptionId: notification.subscriptionId,
        ...(notification.changeType ? { changeType: notification.changeType } : {}),
        ...(notification.resource ? { resource: notification.resource } : {}),
        ...(notification.subscriptionExpirationDateTime
          ? { expiration: notification.subscriptionExpirationDateTime }
          : {}),
      }),
      authenticated: true,
      requestHeaders: input.headers ? providerWebhookPublicHeaders(input.headers) : {},
      payload: {
        notification,
        graphSubscriptionId: notification.subscriptionId,
        changeType: notification.changeType ?? "updated",
        resource: notification.resource ?? providerState.resource,
      },
    });
    void delivery;
    enqueuedJobs += 1;
  }
  return {
    ok: true,
    handled: knownNotifications > 0,
    notifications: parsed.data.value.length,
    ignoredNotifications,
    enqueuedJobs,
  };
}
