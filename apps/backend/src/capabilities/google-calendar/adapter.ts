import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  loadProviderWebhookDelivery,
  loadProviderWebhookSubscriptionById,
  type ProviderWebhookAdapter,
} from "../../integrations/provider-webhooks/substrate";
import {
  GOOGLE_CALENDAR_ADAPTER_KEY,
  GOOGLE_CALENDAR_PROVIDER_KEY,
} from "./connection";
import { processGoogleCalendarDeltaJob } from "./delta";
import { applyGoogleCalendarWebhook } from "./notification";
import { reconcileGoogleCalendarWatches } from "./watch";

export const googleCalendarWebhookAdapter: ProviderWebhookAdapter = {
  adapterKey: GOOGLE_CALENDAR_ADAPTER_KEY,
  providerKey: GOOGLE_CALENDAR_PROVIDER_KEY,
  receive: (input) => applyGoogleCalendarWebhook({ db: input.db, headers: input.headers }),
  async processDelivery(input) {
    const delivery = await loadProviderWebhookDelivery(input.db, input.deliveryId);
    if (!delivery.subscription_id) {
      throw new DomainError(domainCodes.CONFLICT, "Google Calendar delivery has no subscription.");
    }
    return processGoogleCalendarDeltaJob(input.db, {
      job: input.job,
      subscriptionId: delivery.subscription_id,
    });
  },
  async reconcileSubscription(input) {
    const subscription = await loadProviderWebhookSubscriptionById(input.db, input.subscriptionId);
    return reconcileGoogleCalendarWatches(input.db, {
      connectedProviderAccountId: subscription.connected_provider_account_id,
    });
  },
  async reconcileConnection(input) {
    return reconcileGoogleCalendarWatches(input.db, {
      connectedProviderAccountId: input.connectedProviderAccountId,
    });
  },
  async processSync(input) {
    return processGoogleCalendarDeltaJob(input.db, {
      job: input.job,
      subscriptionId: input.subscriptionId,
    });
  },
};
