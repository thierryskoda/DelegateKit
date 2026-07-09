import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  enqueueProviderSyncProcess,
  enqueueProviderWebhookSubscriptionReconcile,
} from "../../integrations/provider-webhooks/substrate";
import { GMAIL_MAILBOX_ADAPTER_KEY } from "./connection";

const GMAIL_WATCH_RENEW_PRIORITY = 30;
const GMAIL_DELTA_PROCESS_PRIORITY = 10;

function watchRenewDedupeKey(connectedProviderAccountId: string, runAfter: Date): string {
  return `gmail-watch-renew:${connectedProviderAccountId}:${runAfter.toISOString().slice(0, 10)}`;
}

export async function enqueueGmailWatchRenewJob(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string;
    connectedProviderAccountId: string;
    runAfter?: Date;
  },
) {
  const runAfter = input.runAfter ?? new Date();
  return enqueueProviderWebhookSubscriptionReconcile(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    adapterKey: GMAIL_MAILBOX_ADAPTER_KEY,
    connectedProviderAccountId: input.connectedProviderAccountId,
    priority: GMAIL_WATCH_RENEW_PRIORITY,
    runAfter,
    dedupeKey: watchRenewDedupeKey(input.connectedProviderAccountId, runAfter),
  });
}

export async function enqueueGmailDeltaProcessJob(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string;
    connectedProviderAccountId: string;
    subscriptionId: string;
  },
) {
  return enqueueProviderSyncProcess(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    adapterKey: GMAIL_MAILBOX_ADAPTER_KEY,
    subscriptionId: input.subscriptionId,
    priority: GMAIL_DELTA_PROCESS_PRIORITY,
    dedupeKey: `gmail-delta:${input.connectedProviderAccountId}`,
  });
}
