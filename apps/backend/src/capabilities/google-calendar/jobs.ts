import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { enqueueProviderWebhookSubscriptionReconcile } from "../../integrations/provider-webhooks/substrate";
import { GOOGLE_CALENDAR_ADAPTER_KEY } from "./connection";

const GOOGLE_CALENDAR_WATCH_RECONCILE_PRIORITY = 30;

function watchReconcileDedupeKey(connectedProviderAccountId: string, runAfter: Date): string {
  return `calendar-google-watch-reconcile:${connectedProviderAccountId}:${runAfter.toISOString().slice(0, 10)}`;
}

export async function enqueueGoogleCalendarWatchReconcileJob(
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
    adapterKey: GOOGLE_CALENDAR_ADAPTER_KEY,
    connectedProviderAccountId: input.connectedProviderAccountId,
    priority: GOOGLE_CALENDAR_WATCH_RECONCILE_PRIORITY,
    runAfter,
    dedupeKey: watchReconcileDedupeKey(input.connectedProviderAccountId, runAfter),
  });
}
