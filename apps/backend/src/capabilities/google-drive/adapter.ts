import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  loadProviderWebhookDelivery,
  loadProviderWebhookSubscriptionById,
  type ProviderWebhookAdapter,
} from "../../integrations/provider-webhooks/substrate";
import { GOOGLE_DRIVE_ADAPTER_KEY, GOOGLE_DRIVE_PROVIDER_KEY } from "./connection";
import { processGoogleDriveDeltaJob } from "./delta";
import { applyGoogleDriveWebhook } from "./notification";
import { reconcileGoogleDriveSubscription } from "./subscriptions";

export const googleDriveWebhookAdapter: ProviderWebhookAdapter = {
  adapterKey: GOOGLE_DRIVE_ADAPTER_KEY,
  providerKey: GOOGLE_DRIVE_PROVIDER_KEY,
  receive: (input) =>
    applyGoogleDriveWebhook({
      db: input.db,
      headers: input.headers,
      ...(input.rawBody === undefined ? {} : { rawBody: input.rawBody }),
    }),
  async processDelivery(input) {
    const delivery = await loadProviderWebhookDelivery(input.db, input.deliveryId);
    if (!delivery.subscription_id) {
      throw new DomainError(domainCodes.CONFLICT, "Google Drive webhook delivery has no subscription.");
    }
    return processGoogleDriveDeltaJob(input.db, {
      job: input.job,
      subscriptionId: delivery.subscription_id,
    });
  },
  async reconcileSubscription(input) {
    const subscription = await loadProviderWebhookSubscriptionById(input.db, input.subscriptionId);
    return reconcileGoogleDriveSubscription(input.db, {
      connectedProviderAccountId: subscription.connected_provider_account_id,
    });
  },
  reconcileConnection: (input) =>
    reconcileGoogleDriveSubscription(input.db, {
      connectedProviderAccountId: input.connectedProviderAccountId,
    }),
  processSync: (input) =>
    processGoogleDriveDeltaJob(input.db, {
      job: input.job,
      subscriptionId: input.subscriptionId,
    }),
};
