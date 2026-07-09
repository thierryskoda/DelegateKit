import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import {
  loadProviderWebhookDelivery,
  loadProviderWebhookSubscriptionById,
  patchProviderWebhookSubscription,
  type ProviderWebhookAdapter,
} from "../../integrations/provider-webhooks/substrate";
import {
  GMAIL_MAILBOX_ADAPTER_KEY,
  GMAIL_MAILBOX_PROVIDER_KEY,
  gmailCursor,
} from "./connection";
import { applyForwardedGmailWebhook } from "./notification";
import { processGmailDeltaJob } from "./delta";
import { startOrRenewGmailWatch } from "./watch";

export const gmailMailboxWebhookAdapter: ProviderWebhookAdapter = {
  adapterKey: GMAIL_MAILBOX_ADAPTER_KEY,
  providerKey: GMAIL_MAILBOX_PROVIDER_KEY,
  receive: (input) => applyForwardedGmailWebhook({ ...input, body: input.body }),
  async processDelivery(input) {
    const delivery = await loadProviderWebhookDelivery(input.db, input.deliveryId);
    if (!delivery.subscription_id) {
      throw new DomainError(domainCodes.CONFLICT, "Gmail webhook delivery has no subscription.");
    }
    const payload = z
      .object({ latestSeenHistoryId: z.string().trim().min(1).nullable().optional() })
      .passthrough()
      .parse(delivery.payload);
    const latestSeenHistoryId = payload.latestSeenHistoryId ?? null;
    if (latestSeenHistoryId) {
      const subscription = await loadProviderWebhookSubscriptionById(input.db, delivery.subscription_id);
      await patchProviderWebhookSubscription(input.db, subscription.id, {
        last_notification_at: delivery.received_at,
        cursor: {
          ...gmailCursor(subscription),
          latestSeenHistoryId,
        },
      });
    }
    return processGmailDeltaJob(input.db, {
      job: input.job,
      subscriptionId: delivery.subscription_id,
    });
  },
  async reconcileSubscription(input) {
    const subscription = await loadProviderWebhookSubscriptionById(input.db, input.subscriptionId);
    return startOrRenewGmailWatch(input.db, {
      connectedProviderAccountId: subscription.connected_provider_account_id,
    });
  },
  async reconcileConnection(input) {
    return startOrRenewGmailWatch(input.db, {
      connectedProviderAccountId: input.connectedProviderAccountId,
    });
  },
  async processSync(input) {
    return processGmailDeltaJob(input.db, {
      job: input.job,
      subscriptionId: input.subscriptionId,
    });
  },
};
