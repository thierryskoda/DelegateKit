import {
  processProviderSyncJob,
  processProviderWebhookJob,
  reconcileProviderWebhookSubscriptionJob,
} from "./substrate";
import type { BackendJobHandlerRegistry } from "../../runtime/worker/types";

export const providerWebhookJobHandlers = {
  "provider.webhook.process": async ({ db, job }) => processProviderWebhookJob(db, job),
  "provider.webhook.subscription.reconcile": async ({ db, job }) =>
    reconcileProviderWebhookSubscriptionJob(db, job),
  "provider.sync.process": async ({ db, job }) => processProviderSyncJob(db, job),
} satisfies Partial<BackendJobHandlerRegistry>;
