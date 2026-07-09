import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  loadProviderWebhookSubscriptionById,
  type ProviderWebhookAdapter,
} from "../../integrations/provider-webhooks/substrate";
import { applyMondayWebhook, processMondayWebhookJob } from "./webhook-events";
import { reconcileMondayWebhooks } from "./webhook-subscriptions";
import {
  MONDAY_BOARD_WEBHOOK_ADAPTER_KEY,
  MONDAY_WEBHOOK_PROVIDER_KEY,
} from "./webhook-types";

export const mondayBoardWebhookAdapter: ProviderWebhookAdapter = {
  adapterKey: MONDAY_BOARD_WEBHOOK_ADAPTER_KEY,
  providerKey: MONDAY_WEBHOOK_PROVIDER_KEY,
  receive: (input) =>
    applyMondayWebhook({
      db: input.db,
      body: input.body,
      authorizationHeader: input.headers.get("authorization") ?? null,
      headers: input.headers,
    }),
  processDelivery: (input) =>
    processMondayWebhookJob(input.db, {
      job: input.job,
      deliveryId: input.deliveryId,
    }),
  async reconcileSubscription(input) {
    const subscription = await loadProviderWebhookSubscriptionById(input.db, input.subscriptionId);
    return reconcileMondayWebhooks(input.db, {
      job: input.job,
      connectedProviderAccountId: subscription.connected_provider_account_id,
    });
  },
  reconcileConnection: (input) =>
    reconcileMondayWebhooks(input.db, {
      job: input.job,
      connectedProviderAccountId: input.connectedProviderAccountId,
    }),
  async processSync() {
    throw new DomainError(domainCodes.INTERNAL, "Monday webhooks do not use provider sync jobs.");
  },
};
