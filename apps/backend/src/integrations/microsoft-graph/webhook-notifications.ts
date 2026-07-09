import { formatUnknownError } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import type { ProviderWebhookAdapterKey } from "../provider-webhooks/substrate";

const STALE_SUBSCRIPTION_DIAGNOSTIC_INTERVAL_MS = 5 * 60 * 1000;
const STALE_SUBSCRIPTION_DIAGNOSTIC_CACHE_LIMIT = 500;
const staleSubscriptionDiagnosticLastEmittedAt = new Map<string, number>();

const microsoftGraphWebhookNotificationSchema = z
  .object({
    subscriptionId: z.string().trim().min(1),
    clientState: z.string().trim().min(1).optional(),
    changeType: z.string().trim().min(1).optional(),
    resource: z.string().trim().min(1).optional(),
    resourceData: z
      .object({
        id: z.string().trim().min(1).optional(),
        "@odata.id": z.string().trim().min(1).optional(),
      })
      .passthrough()
      .optional(),
    subscriptionExpirationDateTime: z.string().trim().min(1).optional(),
    tenantId: z.string().trim().min(1).optional(),
    lifecycleEvent: z.enum(["missed", "subscriptionRemoved", "reauthorizationRequired"]).optional(),
  })
  .passthrough();

export const microsoftGraphWebhookBodySchema = z
  .object({
    value: z.array(microsoftGraphWebhookNotificationSchema),
  })
  .passthrough();

export type MicrosoftGraphWebhookNotification = z.infer<
  typeof microsoftGraphWebhookNotificationSchema
>;

function shouldEmitStaleSubscriptionDiagnostic(key: string, now: number): boolean {
  const last = staleSubscriptionDiagnosticLastEmittedAt.get(key);
  if (last !== undefined && now - last < STALE_SUBSCRIPTION_DIAGNOSTIC_INTERVAL_MS) return false;
  staleSubscriptionDiagnosticLastEmittedAt.set(key, now);
  if (staleSubscriptionDiagnosticLastEmittedAt.size > STALE_SUBSCRIPTION_DIAGNOSTIC_CACHE_LIMIT) {
    const oldest = staleSubscriptionDiagnosticLastEmittedAt.keys().next().value;
    if (oldest) staleSubscriptionDiagnosticLastEmittedAt.delete(oldest);
  }
  return true;
}

export function emitMicrosoftGraphStaleSubscriptionDiagnostic(input: {
  providerKey: string;
  adapterKey: ProviderWebhookAdapterKey;
  subscriptionId: string;
  lifecycleEvent?: string | null;
  changeType?: string | null;
  resource?: string | null;
}): void {
  const diagnosticKey = `${input.adapterKey}:${input.subscriptionId}`;
  if (!shouldEmitStaleSubscriptionDiagnostic(diagnosticKey, Date.now())) return;
  try {
    emitDiagnostic(
      backendDiagnosticLogger(),
      "microsoft_graph.webhook.stale_subscription_ignored",
      {
        ok: true,
        provider: input.providerKey,
        attrs: {
          adapter_key: input.adapterKey,
          graph_subscription_id: input.subscriptionId,
          lifecycle_event: input.lifecycleEvent ?? null,
          change_type: input.changeType ?? null,
          resource: input.resource ?? null,
          reason: "unknown_subscription",
        },
      },
    );
  } catch (error) {
    const message = formatUnknownError(error);
    if (message.includes("Diagnostic runtime root is required")) return;
    console.warn(
      `[microsoft-graph-webhooks] stale subscription diagnostic failed for ${input.adapterKey}/${input.subscriptionId}: ${message}`,
    );
  }
}
