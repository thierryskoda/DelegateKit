import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes, formatUnknownError } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import {
  patchProviderWebhookSubscription,
  providerWebhookPublicHeaders,
  receiveProviderWebhookNotification,
  type ProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import {
  GOOGLE_CALENDAR_ADAPTER_KEY,
  GOOGLE_CALENDAR_PROVIDER_KEY,
  googleCalendarCursor,
  googleCalendarProviderState,
  maybeGoogleCalendarConnectionByWatchChannel,
} from "./connection";

const UNKNOWN_CHANNEL_DIAGNOSTIC_INTERVAL_MS = 5 * 60 * 1000;
const UNKNOWN_CHANNEL_DIAGNOSTIC_CACHE_LIMIT = 500;
const unknownChannelDiagnosticLastEmittedAt = new Map<string, number>();

type GoogleCalendarNotificationHeaders = {
  channelId: string;
  channelToken: string | null;
  resourceId: string | null;
  resourceState: string;
  messageNumber: number | null;
};

function requiredHeader(headers: Headers, name: string): string {
  const value = headers.get(name)?.trim();
  if (!value) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Missing Google Calendar webhook header ${name}.`,
    );
  }
  return value;
}

function optionalHeader(headers: Headers, name: string): string | null {
  return headers.get(name)?.trim() || null;
}

function parseMessageNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Invalid Google Calendar webhook message number: ${JSON.stringify(value)}.`,
    );
  }
  return parsed;
}

function parseNotificationHeaders(headers: Headers): GoogleCalendarNotificationHeaders {
  return {
    channelId: requiredHeader(headers, "x-goog-channel-id"),
    channelToken: optionalHeader(headers, "x-goog-channel-token"),
    resourceId: optionalHeader(headers, "x-goog-resource-id"),
    resourceState: requiredHeader(headers, "x-goog-resource-state"),
    messageNumber: parseMessageNumber(optionalHeader(headers, "x-goog-message-number")),
  };
}

function shouldEmitUnknownChannelDiagnostic(channelId: string, now: number): boolean {
  const last = unknownChannelDiagnosticLastEmittedAt.get(channelId);
  if (last !== undefined && now - last < UNKNOWN_CHANNEL_DIAGNOSTIC_INTERVAL_MS) return false;
  unknownChannelDiagnosticLastEmittedAt.set(channelId, now);
  if (unknownChannelDiagnosticLastEmittedAt.size > UNKNOWN_CHANNEL_DIAGNOSTIC_CACHE_LIMIT) {
    const oldest = unknownChannelDiagnosticLastEmittedAt.keys().next().value;
    if (oldest) unknownChannelDiagnosticLastEmittedAt.delete(oldest);
  }
  return true;
}

function emitUnknownChannelDiagnostic(notification: GoogleCalendarNotificationHeaders): void {
  if (!shouldEmitUnknownChannelDiagnostic(notification.channelId, Date.now())) return;
  try {
    emitDiagnostic(backendDiagnosticLogger(), "google_calendar.webhook.unknown_channel_ignored", {
      ok: true,
      provider: GOOGLE_CALENDAR_PROVIDER_KEY,
      attrs: {
        channel_id: notification.channelId,
        resource_id: notification.resourceId,
        resource_state: notification.resourceState,
        message_number: notification.messageNumber,
        reason: "unknown_channel",
      },
    });
  } catch (error) {
    const message = formatUnknownError(error);
    if (message.includes("Diagnostic runtime root is required")) return;
    console.warn(
      `[google-calendar-webhooks] unknown-channel diagnostic failed for ${notification.channelId}: ${message}`,
    );
  }
}

function validateNotification(input: {
  notification: GoogleCalendarNotificationHeaders;
  state: ProviderWebhookSubscription;
}): void {
  const providerState = googleCalendarProviderState(input.state);
  if (
    providerState.channelToken &&
    input.notification.channelToken !== providerState.channelToken
  ) {
    throw new DomainError(
      domainCodes.UNAUTHORIZED,
      "Google Calendar webhook channel token did not match watch state.",
    );
  }
  if (providerState.resourceId && input.notification.resourceId !== providerState.resourceId) {
    throw new DomainError(
      domainCodes.UNAUTHORIZED,
      "Google Calendar webhook resource id did not match watch state.",
    );
  }
}

async function updateNotificationState(input: {
  db: SupabaseServiceClient;
  state: ProviderWebhookSubscription;
  notification: GoogleCalendarNotificationHeaders;
}): Promise<void> {
  await patchProviderWebhookSubscription(input.db, input.state.id, {
    last_notification_at: new Date().toISOString(),
    ...(input.notification.messageNumber !== null
      ? {
          cursor: {
            ...googleCalendarCursor(input.state),
            lastMessageNumber: input.notification.messageNumber,
          },
        }
      : {}),
  });
}

export async function applyGoogleCalendarWebhook(input: {
  db: SupabaseServiceClient;
  headers: Headers;
}): Promise<{
  ok: true;
  handled: boolean;
  connectedProviderAccountId?: string;
  providerCalendarId?: string;
  deliveryId?: string;
  backendJobId?: string;
  ignored?: boolean;
  reason?: string;
}> {
  const notification = parseNotificationHeaders(input.headers);
  const subscription = await maybeGoogleCalendarConnectionByWatchChannel(
    input.db,
    notification.channelId,
  );
  if (!subscription) {
    emitUnknownChannelDiagnostic(notification);
    return {
      ok: true,
      handled: false,
      ignored: true,
      reason: "unknown_channel",
    };
  }
  const { connection, state } = subscription;
  validateNotification({ notification, state });
  await updateNotificationState({ db: input.db, state, notification });

  if (notification.resourceState === "sync") {
    return {
      ok: true,
      handled: true,
      connectedProviderAccountId: connection.connectedProviderAccount.id,
      providerCalendarId: state.resource_id,
    };
  }

  const delivery = await receiveProviderWebhookNotification(input.db, {
    profileId: connection.profileId,
    capabilityAccountLinkId: connection.capabilityAccountLinkId,
    providerKey: GOOGLE_CALENDAR_PROVIDER_KEY,
    adapterKey: GOOGLE_CALENDAR_ADAPTER_KEY,
    subscriptionId: state.id,
    deliveryKey: `google-calendar:${notification.channelId}:${notification.messageNumber ?? notification.resourceState}`,
    authenticated: true,
    requestHeaders: providerWebhookPublicHeaders(input.headers),
    payload: {
      providerCalendarId: state.resource_id,
      channelId: notification.channelId,
      resourceState: notification.resourceState,
      messageNumber: notification.messageNumber,
      resourceId: notification.resourceId,
    },
  });

  emitDiagnostic(backendDiagnosticLogger(), "google_calendar.webhook.received", {
    ok: true,
    profile_id: connection.profileId,
    capability_account_link_id: connection.capabilityAccountLinkId,
    job_id: delivery.backendJobId,
    job_kind: "provider.webhook.process",
    attrs: {
      connected_provider_account_id: connection.connectedProviderAccount.id,
      provider_calendar_id: state.resource_id,
      channel_id: notification.channelId,
      resource_state: notification.resourceState,
      message_number: notification.messageNumber,
      joined_existing_job: delivery.joinedExistingJob,
    },
  });

  return {
    ok: true,
    handled: true,
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    providerCalendarId: state.resource_id,
    deliveryId: delivery.delivery.id,
    backendJobId: delivery.backendJobId,
  };
}
