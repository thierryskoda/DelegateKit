import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import { backendApiEnv } from "../../shared/env";
import { nangoProxyRequestJson } from "../../integrations/nango/nango-proxy-client";
import { patchProviderWebhookSubscription } from "../../integrations/provider-webhooks/substrate";
import {
  gmailCursor,
  historyIdText,
  isGreaterHistoryId,
  requireGmailConnectionByConnectedProviderAccountId,
  upsertGmailMailboxSubscription,
} from "./connection";
import { enqueueGmailDeltaProcessJob, enqueueGmailWatchRenewJob } from "./jobs";
import { gmailWatchResponseSchema } from "./schemas";

const gmailWatchRequestBodySchema = z
  .object({
    labelIds: z.array(z.string().trim().min(1)),
    labelFilterBehavior: z.literal("INCLUDE"),
    topicName: z.string().trim().min(1),
  })
  .strict();

const GMAIL_WATCH_RENEW_INTERVAL_MS = 24 * 60 * 60 * 1000;

function expirationIso(value: string | number): string {
  const ms = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(ms)) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Gmail watch expiration is invalid: ${JSON.stringify(value)}.`,
    );
  }
  return new Date(ms).toISOString();
}

export async function startOrRenewGmailWatch(
  db: SupabaseServiceClient,
  input: { connectedProviderAccountId: string },
): Promise<Record<string, unknown>> {
  const connection = await requireGmailConnectionByConnectedProviderAccountId(
    db,
    input.connectedProviderAccountId,
  );
  const topicName = backendApiEnv().gmailPubsubTopicName;
  await upsertGmailMailboxSubscription(db, { ...connection });
  const response = await nangoProxyRequestJson({
    operation: "gmail.webhook.subscription.reconcile",
    publicSummary: "Gmail watch renewal failed",
    providerConfigKey: connection.nangoProviderConfigKey,
    connectionId: connection.nangoConnectionId,
    method: "post",
    endpoint: "/gmail/v1/users/me/watch",
    data: {
      labelIds: ["INBOX"],
      labelFilterBehavior: "INCLUDE",
      topicName,
    },
    bodySchema: gmailWatchRequestBodySchema,
    responseSchema: gmailWatchResponseSchema,
    authFailureProjection: { db, account: connection.connectedProviderAccount },
    evidence: {
      connected_provider_account_id: connection.connectedProviderAccount.id,
      capability_account_link_id: connection.capabilityAccountLinkId,
    },
  });
  const historyId = historyIdText(response.historyId);
  const expiresAt = expirationIso(response.expiration);
  const existing = await upsertGmailMailboxSubscription(db, {
    ...connection,
    latestSeenHistoryId: historyId,
  });
  const lastProcessedHistoryId = gmailCursor(existing).lastProcessedHistoryId ?? historyId;
  const subscription = await patchProviderWebhookSubscription(db, existing.id, {
    status: "active",
    expires_at: expiresAt,
    cursor: {
      ...gmailCursor(existing),
      latestSeenHistoryId: historyId,
      lastProcessedHistoryId,
    },
    last_error_code: null,
    last_error_message: null,
  });

  const catchUpJob = isGreaterHistoryId(historyId, lastProcessedHistoryId)
    ? await enqueueGmailDeltaProcessJob(db, {
        profileId: connection.profileId,
        capabilityAccountLinkId: connection.capabilityAccountLinkId,
        connectedProviderAccountId: connection.connectedProviderAccount.id,
        subscriptionId: subscription.id,
      })
    : null;

  const nextRunAfter = new Date(Date.now() + GMAIL_WATCH_RENEW_INTERVAL_MS);
  const next = await enqueueGmailWatchRenewJob(db, {
    profileId: connection.profileId,
    capabilityAccountLinkId: connection.capabilityAccountLinkId,
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    runAfter: nextRunAfter,
  });
  return {
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    historyId,
    watchExpirationAt: expiresAt,
    subscriptionId: subscription.id,
    ...(next.enqueued
      ? {
          nextRenewalJobId: next.jobId,
          joinedExistingRenewalJob: next.joinedExistingJob,
        }
      : { nextRenewalSkippedReason: next.reason }),
    ...(catchUpJob
      ? {
          catchUpJobId: catchUpJob.jobId,
          joinedExistingCatchUpJob: catchUpJob.joinedExistingJob,
        }
      : {}),
  };
}
