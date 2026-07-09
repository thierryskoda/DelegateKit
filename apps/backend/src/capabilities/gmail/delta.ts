import type { BackendJob } from "@ai-assistants/backend-jobs";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError } from "@ai-assistants/errors";
import type { GmailMessageDetail } from "@ai-assistants/gmail-contracts/schemas";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import { nangoProxyRequestJson } from "../../integrations/nango/nango-proxy-client";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import {
  gmailCursor,
  isGreaterHistoryId,
  loadGmailMailboxSubscriptionById,
  markGmailMailboxSubscriptionUnhealthy,
  requireGmailConnectionByConnectedProviderAccountId,
  type GmailConnectionContext,
} from "./connection";
import { recordGmailEmailReceivedAndEnqueueWorkItem } from "./email-received-events";
import { fetchNormalizedGmailMessage } from "./fetch-gmail-message";
import { buildGmailEmailReceivedEventPayload } from "./gmail-email-received-payload";
import { gmailHistoryResponseSchema } from "./schemas";

function isInboundInboxMessage(labels: readonly string[]): boolean {
  const labelSet = new Set(labels);
  return labelSet.has("INBOX") && !labelSet.has("SENT") && !labelSet.has("DRAFT");
}

function providerHttpStatus(error: unknown): number | null {
  if (!(error instanceof DomainError)) return null;
  const details = z
    .object({ httpStatus: z.number().nullable().optional() })
    .passthrough()
    .safeParse(error.details);
  return details.success ? (details.data.httpStatus ?? null) : null;
}

async function listGmailHistoryPage(input: {
  db: SupabaseServiceClient;
  connection: GmailConnectionContext;
  startHistoryId: string;
  pageToken?: string;
}) {
  return nangoProxyRequestJson({
    operation: "gmail.history.list",
    publicSummary: "Gmail history listing failed",
    providerConfigKey: input.connection.nangoProviderConfigKey,
    connectionId: input.connection.nangoConnectionId,
    method: "get",
    endpoint: "/gmail/v1/users/me/history",
    params: {
      startHistoryId: input.startHistoryId,
      historyTypes: "messageAdded",
      ...(input.pageToken ? { pageToken: input.pageToken } : {}),
    },
    responseSchema: gmailHistoryResponseSchema,
    authFailureProjection: { db: input.db, account: input.connection.connectedProviderAccount },
    evidence: {
      connected_provider_account_id: input.connection.connectedProviderAccount.id,
      capability_account_link_id: input.connection.capabilityAccountLinkId,
    },
  });
}

async function collectAddedMessageIds(input: {
  db: SupabaseServiceClient;
  connection: GmailConnectionContext;
  startHistoryId: string;
}): Promise<string[]> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  do {
    const page = await listGmailHistoryPage({
      db: input.db,
      connection: input.connection,
      startHistoryId: input.startHistoryId,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const item of page.history ?? []) {
      for (const added of item.messagesAdded ?? []) ids.add(added.message.id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return [...ids];
}

async function fetchAvailableGmailMessage(
  connection: GmailConnectionContext,
  messageId: string,
): Promise<GmailMessageDetail | null> {
  try {
    return await fetchNormalizedGmailMessage(connection, messageId);
  } catch (error) {
    if (providerHttpStatus(error) === 404) return null;
    throw error;
  }
}

export async function processGmailDeltaJob(
  db: SupabaseServiceClient,
  input: { job: BackendJob; subscriptionId: string },
): Promise<Record<string, unknown>> {
  const subscription = await loadGmailMailboxSubscriptionById(db, input.subscriptionId);
  const connection = await requireGmailConnectionByConnectedProviderAccountId(
    db,
    subscription.connected_provider_account_id,
  );
  const cursor = gmailCursor(subscription);
  const latestSeen = cursor.latestSeenHistoryId;
  const lastProcessed = cursor.lastProcessedHistoryId;
  if (!latestSeen)
    return { connectedProviderAccountId: subscription.connected_provider_account_id, processedMessages: 0 };
  if (!lastProcessed) {
    await markGmailMailboxSubscriptionUnhealthy(db, {
      subscriptionId: subscription.id,
      error: "gmail_delta_missing_last_processed_history_id",
    });
    return {
      connectedProviderAccountId: subscription.connected_provider_account_id,
      processedMessages: 0,
      status: "unhealthy",
      reason: "missing_last_processed_history_id",
    };
  }
  if (!isGreaterHistoryId(latestSeen, lastProcessed)) {
    return { connectedProviderAccountId: subscription.connected_provider_account_id, processedMessages: 0 };
  }

  let messageIds: string[];
  try {
    messageIds = await collectAddedMessageIds({ db, connection, startHistoryId: lastProcessed });
  } catch (error) {
    if (providerHttpStatus(error) === 404) {
      await markGmailMailboxSubscriptionUnhealthy(db, {
        subscriptionId: subscription.id,
        error: "gmail_history_cursor_expired",
      });
      return {
        connectedProviderAccountId: subscription.connected_provider_account_id,
        processedMessages: 0,
        status: "unhealthy",
        reason: "history_cursor_expired",
      };
    }
    throw error;
  }

  let enqueuedWorkItems = 0;
  const skippedUnavailableMessageIds: string[] = [];
  for (const messageId of messageIds) {
    const message = await fetchAvailableGmailMessage(connection, messageId);
    if (!message) {
      skippedUnavailableMessageIds.push(messageId);
      continue;
    }
    if (!isInboundInboxMessage(message.labels)) continue;
    const eventPayload = buildGmailEmailReceivedEventPayload({
      connection,
      message,
      historyId: latestSeen,
    });
    const recorded = await recordGmailEmailReceivedAndEnqueueWorkItem(db, {
      profileId: connection.profileId,
      dedupeKey: `gmail.email.received:gmail:${connection.connectedProviderAccount.id}:${message.id}`,
      payload: eventPayload,
      sourceId: message.id,
      connectedProviderAccountId: connection.connectedProviderAccount.id,
      ...(eventPayload.receivedAt ? { occurredAt: eventPayload.receivedAt } : {}),
    });
    if (recorded.enqueuedWorkItem) enqueuedWorkItems += 1;
  }

  if (skippedUnavailableMessageIds.length > 0) {
    emitDiagnostic(backendDiagnosticLogger(), "gmail.mailbox_delta.message_unavailable_skipped", {
      ok: true,
      profile_id: connection.profileId,
      capability_account_link_id: connection.capabilityAccountLinkId,
      job_id: input.job.id,
      job_kind: input.job.kind,
      attrs: {
        connected_provider_account_id: subscription.connected_provider_account_id,
        latest_seen_history_id: latestSeen,
        skipped_message_ids: skippedUnavailableMessageIds,
      },
    });
  }

  const updateResult = await db
    .from("provider_webhook_subscriptions")
    .update({
      status: "active",
      cursor: {
        ...cursor,
        lastProcessedHistoryId: latestSeen,
        latestSeenHistoryId: latestSeen,
      },
      last_success_at: new Date().toISOString(),
      last_error_code: null,
      last_error_message: null,
    })
    .eq("id", subscription.id);
  if (updateResult.error) throw updateResult.error;

  emitDiagnostic(backendDiagnosticLogger(), "gmail.mailbox_delta.synced", {
    ok: true,
    profile_id: connection.profileId,
    capability_account_link_id: connection.capabilityAccountLinkId,
    job_id: input.job.id,
    job_kind: input.job.kind,
    attrs: {
      connected_provider_account_id: subscription.connected_provider_account_id,
      start_history_id: lastProcessed,
      latest_seen_history_id: latestSeen,
      message_ids: messageIds,
      skipped_unavailable_message_ids: skippedUnavailableMessageIds,
      enqueued_work_items: enqueuedWorkItems,
    },
  });

  return {
    connectedProviderAccountId: subscription.connected_provider_account_id,
    processedMessages: messageIds.length,
    skippedUnavailableMessages: skippedUnavailableMessageIds.length,
    enqueuedWorkItems,
  };
}
