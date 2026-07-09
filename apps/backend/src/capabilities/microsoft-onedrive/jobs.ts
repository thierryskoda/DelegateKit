import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  enqueueProviderWebhookSubscriptionReconcile,
  type ProviderWebhookSubscriptionReconcileEnqueueResult,
} from "../../integrations/provider-webhooks/substrate";
import { MICROSOFT_ONEDRIVE_ADAPTER_KEY } from "./connection";

const MICROSOFT_ONEDRIVE_RECONCILE_PRIORITY = 30;

function reconcileDedupeKey(input: {
  connectedProviderAccountId: string;
  runAfter?: Date;
}): string {
  if (!input.runAfter) {
    return `provider.webhook.subscription.reconcile:microsoft_onedrive.drive:${input.connectedProviderAccountId}:immediate`;
  }
  const bucket = input.runAfter.toISOString().slice(0, 16);
  return `provider.webhook.subscription.reconcile:microsoft_onedrive.drive:${input.connectedProviderAccountId}:${bucket}`;
}

export async function enqueueMicrosoftOnedriveSubscriptionReconcileJob(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string;
    connectedProviderAccountId: string;
    runAfter?: Date;
  },
): Promise<ProviderWebhookSubscriptionReconcileEnqueueResult> {
  return enqueueProviderWebhookSubscriptionReconcile(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    adapterKey: MICROSOFT_ONEDRIVE_ADAPTER_KEY,
    connectedProviderAccountId: input.connectedProviderAccountId,
    priority: MICROSOFT_ONEDRIVE_RECONCILE_PRIORITY,
    ...(input.runAfter ? { runAfter: input.runAfter } : {}),
    dedupeKey: reconcileDedupeKey({
      connectedProviderAccountId: input.connectedProviderAccountId,
      ...(input.runAfter ? { runAfter: input.runAfter } : {}),
    }),
  });
}
