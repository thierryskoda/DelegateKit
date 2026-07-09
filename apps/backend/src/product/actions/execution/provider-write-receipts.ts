import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableInsert,
  type TableRow,
} from "@ai-assistants/control-db";
import { providerWriteReceiptRowSchema } from "@ai-assistants/control-plane-contracts";
import { recordAgentEventSafe } from "../../agent-events/agent-event-ledger";

const DEFAULT_RECEIPT_MATCH_WINDOW_MS = 10 * 60 * 1000;

type RecordProviderWriteReceiptInput = {
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccountId: string;
  providerKey: string;
  capabilitySlug: string;
  toolName: string;
  profileActionId: string;
  externalResourceType: string;
  externalResourceId: string;
  operation: string;
  startedAt: string;
  finishedAt: string;
  metadata?: Record<string, unknown>;
};

type ProviderWriteReceiptBinding = {
  link: { id: string };
  account: { id: string };
};

export type RecordProviderActionWriteReceiptInput = {
  providerKey: string;
  capabilitySlug: string;
  toolName: string;
  externalResourceType: string;
  externalResourceId: string;
  operation: string;
  startedAt: string;
  result?: unknown;
  metadata?: Record<string, unknown>;
};

type FindProviderWriteReceiptInput = {
  profileId: string;
  connectedProviderAccountId: string;
  providerKey: string;
  capabilitySlug: string;
  externalResourceType: string;
  externalResourceId: string;
  operation: string;
  occurredAt?: string | null;
  windowMs?: number;
};

export function providerWriteRecordValue(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" && entry.trim() ? entry.trim() : null;
}

export async function recordProviderWriteReceipt(
  db: SupabaseServiceClient,
  input: RecordProviderWriteReceiptInput,
): Promise<TableRow<"provider_write_receipts">> {
  const insert = {
    profile_id: input.profileId,
    capability_account_link_id: input.capabilityAccountLinkId,
    connected_provider_account_id: input.connectedProviderAccountId,
    provider_key: input.providerKey,
    capability_slug: input.capabilitySlug,
    tool_name: input.toolName,
    profile_action_id: input.profileActionId,
    external_resource_type: input.externalResourceType,
    external_resource_id: input.externalResourceId,
    operation: input.operation,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    metadata: requireJsonObject(input.metadata ?? {}, "providerWriteReceipt.metadata"),
  } satisfies TableInsert<"provider_write_receipts">;
  const result = await db.from("provider_write_receipts").insert(insert).select().single();
  const receipt = providerWriteReceiptRowSchema.parse(
    requireSupabaseData("Insert provider write receipt", result.data, result.error),
  );
  await recordAgentEventSafe(db, {
    profileId: receipt.profile_id,
    eventType: "provider.write.result",
    source: "backend",
    sourceEventKey: [
      "provider_write",
      receipt.profile_id,
      receipt.profile_action_id,
      receipt.id,
    ].join(":"),
    occurredAt: receipt.finished_at,
    visibility: "internal",
    payload: {
      eventType: "provider.write.result",
      sourceKind: "provider_write_receipt",
      sourceId: receipt.id,
      title: `${receipt.tool_name} ${receipt.operation} wrote ${receipt.external_resource_type}`,
      summary: `${receipt.provider_key}/${receipt.capability_slug} wrote ${receipt.external_resource_type}:${receipt.external_resource_id}.`,
      referenceKeys: [
        `provider_write_receipt:${receipt.id}`,
        `profile_action:${receipt.profile_action_id}`,
        `provider:${receipt.provider_key}`,
        `capability:${receipt.capability_slug}`,
        `tool:${receipt.tool_name}`,
        `external_resource:${receipt.external_resource_type}:${receipt.external_resource_id}`,
      ],
      metadata: {
        providerKey: receipt.provider_key,
        capabilitySlug: receipt.capability_slug,
        toolName: receipt.tool_name,
        profileActionId: receipt.profile_action_id,
        externalResourceType: receipt.external_resource_type,
        externalResourceId: receipt.external_resource_id,
        operation: receipt.operation,
        startedAt: receipt.started_at,
        finishedAt: receipt.finished_at,
      },
    },
  });
  return receipt;
}

export async function recordProviderActionWriteReceipt(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  binding: ProviderWriteReceiptBinding,
  input: RecordProviderActionWriteReceiptInput,
): Promise<TableRow<"provider_write_receipts">> {
  return recordProviderWriteReceipt(db, {
    profileId: action.profile_id,
    capabilityAccountLinkId: binding.link.id,
    connectedProviderAccountId: binding.account.id,
    providerKey: input.providerKey,
    capabilitySlug: input.capabilitySlug,
    toolName: input.toolName,
    profileActionId: action.id,
    externalResourceType: input.externalResourceType,
    externalResourceId: input.externalResourceId,
    operation: input.operation,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    metadata: {
      actionType: action.action_type,
      providerResultId: providerWriteRecordValue(input.result, "id"),
      providerResultName: providerWriteRecordValue(input.result, "name"),
      ...(input.metadata ?? {}),
    },
  });
}

function validTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function receiptMatchesOccurrence(input: {
  receipt: TableRow<"provider_write_receipts">;
  occurredAt?: string | null;
  windowMs: number;
}): boolean {
  if (input.receipt.operation === "create") return true;

  const occurredAtMs = validTime(input.occurredAt);
  const finishedAtMs = validTime(input.receipt.finished_at);
  if (occurredAtMs === null || finishedAtMs === null) return false;

  return Math.abs(occurredAtMs - finishedAtMs) <= input.windowMs;
}

export async function findMatchingProviderWriteReceipt(
  db: SupabaseServiceClient,
  input: FindProviderWriteReceiptInput,
): Promise<TableRow<"provider_write_receipts"> | null> {
  const result = await db
    .from("provider_write_receipts")
    .select()
    .eq("profile_id", input.profileId)
    .eq("connected_provider_account_id", input.connectedProviderAccountId)
    .eq("provider_key", input.providerKey)
    .eq("capability_slug", input.capabilitySlug)
    .eq("external_resource_type", input.externalResourceType)
    .eq("external_resource_id", input.externalResourceId)
    .eq("operation", input.operation)
    .order("finished_at", { ascending: false })
    .limit(20);

  const parsed = requireSupabaseRows(
    "Find matching provider write receipt",
    result.data,
    result.error,
  ).map((row) => providerWriteReceiptRowSchema.parse(row));
  return (
    parsed.find((receipt) =>
      receiptMatchesOccurrence({
        receipt,
        ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
        windowMs: input.windowMs ?? DEFAULT_RECEIPT_MATCH_WINDOW_MS,
      }),
    ) ?? null
  );
}
