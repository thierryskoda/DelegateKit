import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  loadProviderWebhookSubscriptionById,
  type ProviderWebhookAdapter,
} from "../../integrations/provider-webhooks/substrate";
import { applyBoldSignWebhook, processBoldSignWebhookJob } from "./webhook-events";
import { reconcileBoldSignWebhookSubscription } from "./webhook-subscriptions";
import {
  BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY,
  BOLDSIGN_WEBHOOK_PROVIDER_KEY,
} from "./webhook-types";

export const boldSignSignatureRequestWebhookAdapter: ProviderWebhookAdapter = {
  adapterKey: BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY,
  providerKey: BOLDSIGN_WEBHOOK_PROVIDER_KEY,
  receive: (input) =>
    applyBoldSignWebhook({
      db: input.db,
      rawBody: input.rawBody ?? "",
      headers: input.headers,
    }),
  processDelivery: (input) =>
    processBoldSignWebhookJob(input.db, {
      job: input.job,
      deliveryId: input.deliveryId,
    }),
  async reconcileSubscription(input) {
    const subscription = await loadProviderWebhookSubscriptionById(input.db, input.subscriptionId);
    return reconcileBoldSignWebhookSubscription(input.db, subscription.connected_provider_account_id);
  },
  reconcileConnection: (input) =>
    reconcileBoldSignWebhookSubscription(input.db, input.connectedProviderAccountId),
  async processSync() {
    throw new DomainError(domainCodes.INTERNAL, "BoldSign webhooks do not use provider sync jobs.");
  },
};

