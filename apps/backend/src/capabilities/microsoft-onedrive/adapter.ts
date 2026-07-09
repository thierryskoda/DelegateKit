import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  loadProviderWebhookDelivery,
  loadProviderWebhookSubscriptionById,
  type ProviderWebhookAdapter,
} from "../../integrations/provider-webhooks/substrate";
import {
  MICROSOFT_ONEDRIVE_ADAPTER_KEY,
  MICROSOFT_ONEDRIVE_PROVIDER_KEY,
} from "./connection";
import { processMicrosoftOnedriveDeltaJob } from "./delta";
import { applyMicrosoftOnedriveWebhook } from "./notification";
import { reconcileMicrosoftOnedriveSubscriptions } from "./subscriptions";

export const microsoftOnedriveWebhookAdapter: ProviderWebhookAdapter = {
  adapterKey: MICROSOFT_ONEDRIVE_ADAPTER_KEY,
  providerKey: MICROSOFT_ONEDRIVE_PROVIDER_KEY,
  receive: (input) =>
    applyMicrosoftOnedriveWebhook({ db: input.db, body: input.body, headers: input.headers }),
  async processDelivery(input) {
    const delivery = await loadProviderWebhookDelivery(input.db, input.deliveryId);
    if (!delivery.subscription_id) {
      throw new DomainError(
        domainCodes.CONFLICT,
        "Microsoft OneDrive webhook delivery has no subscription.",
      );
    }
    return processMicrosoftOnedriveDeltaJob(input.db, {
      job: input.job,
      subscriptionId: delivery.subscription_id,
    });
  },
  async reconcileSubscription(input) {
    const subscription = await loadProviderWebhookSubscriptionById(input.db, input.subscriptionId);
    return reconcileMicrosoftOnedriveSubscriptions(input.db, {
      connectedProviderAccountId: subscription.connected_provider_account_id,
    });
  },
  reconcileConnection: (input) =>
    reconcileMicrosoftOnedriveSubscriptions(input.db, {
      connectedProviderAccountId: input.connectedProviderAccountId,
    }),
  processSync: (input) =>
    processMicrosoftOnedriveDeltaJob(input.db, {
      job: input.job,
      subscriptionId: input.subscriptionId,
    }),
};
