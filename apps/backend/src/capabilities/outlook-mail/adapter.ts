import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import {
  loadProviderWebhookDelivery,
  loadProviderWebhookSubscriptionById,
  type ProviderWebhookAdapter,
} from "../../integrations/provider-webhooks/substrate";
import {
  OUTLOOK_MAIL_ADAPTER_KEY,
  OUTLOOK_MAIL_PROVIDER_KEY,
} from "./connection";
import { processOutlookMessageJob } from "./message";
import { applyOutlookWebhook } from "./notification";
import { startOrRenewOutlookMailSubscription } from "./subscription";

const outlookMailDeliveryPayloadSchema = z
  .object({
    graphSubscriptionId: z.string().trim().min(1),
    messageId: z.string().trim().min(1),
  })
  .passthrough();

export const outlookMailWebhookAdapter: ProviderWebhookAdapter = {
  adapterKey: OUTLOOK_MAIL_ADAPTER_KEY,
  providerKey: OUTLOOK_MAIL_PROVIDER_KEY,
  receive: (input) => applyOutlookWebhook({ ...input, body: input.body }),
  async processDelivery(input) {
    const delivery = await loadProviderWebhookDelivery(input.db, input.deliveryId);
    if (!delivery.subscription_id) {
      throw new DomainError(domainCodes.CONFLICT, "Outlook mail webhook delivery has no subscription.");
    }
    const subscription = await loadProviderWebhookSubscriptionById(input.db, delivery.subscription_id);
    const payload = outlookMailDeliveryPayloadSchema.parse(delivery.payload);
    return processOutlookMessageJob(input.db, {
      job: input.job,
      connectedProviderAccountId: subscription.connected_provider_account_id,
      graphSubscriptionId: payload.graphSubscriptionId,
      messageId: payload.messageId,
    });
  },
  async reconcileSubscription(input) {
    const subscription = await loadProviderWebhookSubscriptionById(input.db, input.subscriptionId);
    return startOrRenewOutlookMailSubscription(input.db, {
      connectedProviderAccountId: subscription.connected_provider_account_id,
    });
  },
  async reconcileConnection(input) {
    return startOrRenewOutlookMailSubscription(input.db, {
      connectedProviderAccountId: input.connectedProviderAccountId,
    });
  },
  async processSync() {
    return { skipped: true, reason: "outlook_mail_sync_is_delivery_scoped" };
  },
};
