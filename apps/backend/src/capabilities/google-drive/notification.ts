import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import {
  patchProviderWebhookSubscription,
  providerWebhookPublicHeaders,
  receiveProviderWebhookNotification,
} from "../../integrations/provider-webhooks/substrate";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import {
  GOOGLE_DRIVE_ADAPTER_KEY,
  GOOGLE_DRIVE_PROVIDER_KEY,
  googleDriveProviderState,
  maybeGoogleDriveConnectionBySubscription,
} from "./connection";

const INVALIDATION_STATES = new Set(["sync", "change", "add", "remove", "trash", "untrash"]);
const UNKNOWN_CHANNEL_DIAGNOSTIC_INTERVAL_MS = 5 * 60 * 1000;
const UNKNOWN_CHANNEL_DIAGNOSTIC_CACHE_LIMIT = 500;
const unknownChannelDiagnosticLastEmittedAt = new Map<string, number>();

function requiredHeader(headers: Headers, name: string): string {
  const value = headers.get(name)?.trim();
  if (!value) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Google Drive webhook header ${name} is required.`,
    );
  }
  return value;
}

function optionalHeader(headers: Headers, name: string): string | null {
  return headers.get(name)?.trim() || null;
}

function deliveryKey(input: { channelId: string; messageNumber: string }): string {
  return ["google-drive", input.channelId, input.messageNumber].join(":");
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

function emitUnknownChannelDiagnostic(input: {
  channelId: string;
  resourceId: string | null;
  resourceState: string;
  messageNumber: string;
}): void {
  if (!shouldEmitUnknownChannelDiagnostic(input.channelId, Date.now())) return;
  try {
    emitDiagnostic(backendDiagnosticLogger(), "google_drive.webhook.unknown_channel_ignored", {
      ok: true,
      provider: "google-drive",
      attrs: {
        channel_id: input.channelId,
        resource_id: input.resourceId,
        resource_state: input.resourceState,
        message_number: input.messageNumber,
        reason: "unknown_channel",
      },
    });
  } catch (error) {
    console.warn(
      `Failed to emit Google Drive unknown-channel diagnostic: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function expirationHeaderIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function applyGoogleDriveWebhook(input: {
  db: SupabaseServiceClient;
  headers: Headers;
  rawBody?: string;
}): Promise<{
  ok: true;
  handled: boolean;
  ignored?: boolean;
  deliveryId?: string;
  subscriptionId?: string;
  backendJobId?: string;
  joinedExistingJob?: boolean;
  reason?: string;
}> {
  const channelId = requiredHeader(input.headers, "x-goog-channel-id");
  const channelToken = requiredHeader(input.headers, "x-goog-channel-token");
  const resourceState = requiredHeader(input.headers, "x-goog-resource-state");
  const messageNumber = requiredHeader(input.headers, "x-goog-message-number");
  const resourceId = optionalHeader(input.headers, "x-goog-resource-id");
  const expiresAt = expirationHeaderIso(optionalHeader(input.headers, "x-goog-channel-expiration"));

  const subscription = await maybeGoogleDriveConnectionBySubscription(input.db, channelId);
  if (!subscription) {
    emitUnknownChannelDiagnostic({ channelId, resourceId, resourceState, messageNumber });
    return {
      ok: true,
      handled: false,
      ignored: true,
      reason: "unknown_channel",
    };
  }
  const { connection, state } = subscription;
  const providerState = googleDriveProviderState(state);
  if (channelToken !== providerState.channelToken) {
    throw new DomainError(
      domainCodes.UNAUTHORIZED,
      "Google Drive webhook channel token did not match subscription state.",
    );
  }
  if (providerState.resourceId && resourceId && resourceId !== providerState.resourceId) {
    throw new DomainError(
      domainCodes.UNAUTHORIZED,
      "Google Drive webhook resource id did not match subscription state.",
    );
  }

  await patchProviderWebhookSubscription(input.db, state.id, {
    last_notification_at: new Date().toISOString(),
    ...(expiresAt ? { expires_at: expiresAt } : {}),
  });
  if (!INVALIDATION_STATES.has(resourceState)) {
    return {
      ok: true,
      handled: true,
      ignored: true,
      subscriptionId: state.id,
      reason: `unsupported_resource_state:${resourceState}`,
    };
  }

  const delivery = await receiveProviderWebhookNotification(input.db, {
    profileId: connection.profileId,
    capabilityAccountLinkId: connection.capabilityAccountLinkId,
    providerKey: GOOGLE_DRIVE_PROVIDER_KEY,
    adapterKey: GOOGLE_DRIVE_ADAPTER_KEY,
    subscriptionId: state.id,
    deliveryKey: deliveryKey({ channelId, messageNumber }),
    authenticated: true,
    requestHeaders: providerWebhookPublicHeaders(input.headers),
    payload: {
      channelId,
      resourceId,
      resourceState,
      messageNumber,
      rawBodyLength: input.rawBody?.length ?? 0,
    },
  });
  return {
    ok: true,
    handled: true,
    deliveryId: delivery.delivery.id,
    subscriptionId: state.id,
    backendJobId: delivery.backendJobId,
    joinedExistingJob: delivery.joinedExistingJob || !delivery.created,
  };
}
