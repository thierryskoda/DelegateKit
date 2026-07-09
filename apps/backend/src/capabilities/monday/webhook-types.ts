import { providerWebhookSubscriptionRowSchema } from "@ai-assistants/control-plane-contracts";
import { z } from "zod";

export const MONDAY_BOARD_WEBHOOK_ADAPTER_KEY = "monday.board" as const;
export const MONDAY_WEBHOOK_PROVIDER_KEY = "monday";
export const MONDAY_WEBHOOK_EVENT_KINDS = [
  "create_item",
  "change_column_value",
  "change_name",
] as const;

export const MONDAY_WEBHOOK_RECONCILE_PRIORITY = 30;
export const MONDAY_WEBHOOK_PROCESS_PRIORITY = 10;
export const MONDAY_WEBHOOK_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type MondayWebhookEventKind = (typeof MONDAY_WEBHOOK_EVENT_KINDS)[number];
export type MondayItemEventType = "monday.item.created" | "monday.item.updated";

const mondayWebhookProviderStateSchema = z
  .object({
    nangoProviderConfigKey: z.string().trim().min(1),
    nangoConnectionId: z.string().trim().min(1),
    providerBoardName: z.string().nullable(),
    mondayEventKind: z.enum(MONDAY_WEBHOOK_EVENT_KINDS),
  })
  .passthrough();

export const mondayWebhookStateSchema = providerWebhookSubscriptionRowSchema.extend({
  provider_key: z.literal(MONDAY_WEBHOOK_PROVIDER_KEY),
  adapter_key: z.literal(MONDAY_BOARD_WEBHOOK_ADAPTER_KEY),
  resource_type: z.literal("monday.board"),
  event_scope: z.enum(MONDAY_WEBHOOK_EVENT_KINDS),
  provider_state: mondayWebhookProviderStateSchema,
});

export type MondayWebhookState = z.output<typeof mondayWebhookStateSchema>;

export function cleanMondayString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function mondayItemEventTypeForKind(
  eventKind: MondayWebhookEventKind,
): MondayItemEventType {
  switch (eventKind) {
    case "create_item":
      return "monday.item.created";
    case "change_column_value":
    case "change_name":
      return "monday.item.updated";
    default: {
      const _exhaustive: never = eventKind;
      throw new Error(`Unhandled Monday webhook event kind ${String(_exhaustive)}.`);
    }
  }
}

export function isKnownMondayWebhookPayloadType(value: string): boolean {
  return (
    value === "create_item" ||
    value === "create_pulse" ||
    value === "change_column_value" ||
    value === "update_column_value" ||
    value === "change_name" ||
    value === "update_name"
  );
}
