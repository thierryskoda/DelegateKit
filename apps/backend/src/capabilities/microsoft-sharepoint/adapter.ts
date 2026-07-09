import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  loadProviderWebhookDelivery,
  loadProviderWebhookSubscriptionById,
  type ProviderWebhookAdapter,
} from "../../integrations/provider-webhooks/substrate";
import {
  MICROSOFT_SHAREPOINT_ADAPTER_KEY,
  MICROSOFT_SHAREPOINT_PROVIDER_KEY,
} from "./connection";
import { processMicrosoftSharepointDeltaJob } from "./delta";
import { applyMicrosoftSharepointWebhook } from "./notification";
import { reconcileMicrosoftSharepointSubscriptions } from "./subscriptions";

export const microsoftSharepointWebhookAdapter: ProviderWebhookAdapter = {
  adapterKey: MICROSOFT_SHAREPOINT_ADAPTER_KEY,
  providerKey: MICROSOFT_SHAREPOINT_PROVIDER_KEY,
  receive: (input) =>
    applyMicrosoftSharepointWebhook({ db: input.db, body: input.body, headers: input.headers }),
  async processDelivery(input) {
    const delivery = await loadProviderWebhookDelivery(input.db, input.deliveryId);
    if (!delivery.subscription_id) {
      throw new DomainError(
        domainCodes.CONFLICT,
        "Microsoft SharePoint webhook delivery has no subscription.",
      );
    }
    return processMicrosoftSharepointDeltaJob(input.db, {
      job: input.job,
      subscriptionId: delivery.subscription_id,
    });
  },
  async reconcileSubscription(input) {
    const subscription = await loadProviderWebhookSubscriptionById(input.db, input.subscriptionId);
    return reconcileMicrosoftSharepointSubscriptions(input.db, {
      connectedProviderAccountId: subscription.connected_provider_account_id,
    });
  },
  reconcileConnection: (input) =>
    reconcileMicrosoftSharepointSubscriptions(input.db, {
      connectedProviderAccountId: input.connectedProviderAccountId,
    }),
  processSync: (input) =>
    processMicrosoftSharepointDeltaJob(input.db, {
      job: input.job,
      subscriptionId: input.subscriptionId,
    }),
};
