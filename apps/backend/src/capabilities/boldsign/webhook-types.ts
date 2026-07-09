import { providerWebhookSubscriptionRowSchema } from "@ai-assistants/control-plane-contracts";
import { z } from "zod";

export const BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY = "boldsign.signature_request" as const;
export const BOLDSIGN_WEBHOOK_PROVIDER_KEY = "boldsign";
export const BOLDSIGN_WEBHOOK_RESOURCE_TYPE = "boldsign.account";
export const BOLDSIGN_WEBHOOK_EVENT_SCOPE = "document.status";
export const BOLDSIGN_WEBHOOK_RECONCILE_PRIORITY = 30;
export const BOLDSIGN_WEBHOOK_PROCESS_PRIORITY = 10;

const BOLDSIGN_TERMINAL_OR_FAILURE_EVENT_TYPES = [
  "Completed",
  "Declined",
  "Revoked",
  "Expired",
  "SendFailed",
  "DeliveryFailed",
] as const;

const boldSignProviderStateInputSchema = z
  .object({
    accountEmail: z.string().nullable().optional(),
    credentialKind: z.literal("backend_secret").optional(),
    managedCredential: z.string().nullable().optional(),
  })
  .passthrough();

export const boldSignWebhookStateSchema = providerWebhookSubscriptionRowSchema
  .extend({
    provider_key: z.literal(BOLDSIGN_WEBHOOK_PROVIDER_KEY),
    adapter_key: z.literal(BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY),
    resource_type: z.literal(BOLDSIGN_WEBHOOK_RESOURCE_TYPE),
    event_scope: z.literal(BOLDSIGN_WEBHOOK_EVENT_SCOPE),
    provider_state: boldSignProviderStateInputSchema,
  })
  .transform((row) => ({
    ...row,
    provider_state: {
      accountEmail: row.provider_state.accountEmail ?? null,
      credentialKind: "backend_secret" as const,
      managedCredential: row.provider_state.managedCredential ?? null,
    },
  }));

export type BoldSignWebhookState = z.output<typeof boldSignWebhookStateSchema>;

export function isMeaningfulBoldSignWebhookEvent(
  eventType: string,
  documentStatus: string | null,
): boolean {
  if (BOLDSIGN_TERMINAL_OR_FAILURE_EVENT_TYPES.some((candidate) => candidate === eventType)) {
    return true;
  }
  return eventType === "Signed" && documentStatus === "Completed";
}
