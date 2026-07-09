import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import {
  loadProviderWebhookDelivery,
  loadProviderWebhookSubscriptionById,
  type ProviderWebhookAdapter,
} from "../../integrations/provider-webhooks/substrate";
import {
  OUTLOOK_CALENDAR_ADAPTER_KEY,
  OUTLOOK_CALENDAR_PROVIDER_KEY,
} from "./connection";
import { processOutlookCalendarEventJob } from "./event";
import { applyOutlookCalendarWebhook } from "./notification";
import { startOrRenewOutlookCalendarSubscription } from "./subscription";

const outlookCalendarDeliveryPayloadSchema = z
  .object({
    graphSubscriptionId: z.string().trim().min(1),
    eventId: z.string().trim().min(1),
    changeType: z.string().trim().min(1),
  })
  .passthrough();

export const outlookCalendarWebhookAdapter: ProviderWebhookAdapter = {
  adapterKey: OUTLOOK_CALENDAR_ADAPTER_KEY,
  providerKey: OUTLOOK_CALENDAR_PROVIDER_KEY,
  receive: (input) => applyOutlookCalendarWebhook({ ...input, body: input.body }),
  async processDelivery(input) {
    const delivery = await loadProviderWebhookDelivery(input.db, input.deliveryId);
    if (!delivery.subscription_id) {
      throw new DomainError(domainCodes.CONFLICT, "Outlook Calendar delivery has no subscription.");
    }
    const subscription = await loadProviderWebhookSubscriptionById(input.db, delivery.subscription_id);
    const payload = outlookCalendarDeliveryPayloadSchema.parse(delivery.payload);
    return processOutlookCalendarEventJob(input.db, {
      job: input.job,
      connectedProviderAccountId: subscription.connected_provider_account_id,
      graphSubscriptionId: payload.graphSubscriptionId,
      eventId: payload.eventId,
      changeType: payload.changeType,
    });
  },
  async reconcileSubscription(input) {
    const subscription = await loadProviderWebhookSubscriptionById(input.db, input.subscriptionId);
    return startOrRenewOutlookCalendarSubscription(input.db, {
      connectedProviderAccountId: subscription.connected_provider_account_id,
    });
  },
  async reconcileConnection(input) {
    return startOrRenewOutlookCalendarSubscription(input.db, {
      connectedProviderAccountId: input.connectedProviderAccountId,
    });
  },
  async processSync() {
    return { skipped: true, reason: "outlook_calendar_sync_is_delivery_scoped" };
  },
};
