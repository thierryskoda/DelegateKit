import { createHash } from "node:crypto";
import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";

type ProfileActionIntent = {
  profileId: string;
  toolName: string;
  actionType: string;
  targetId?: string | null;
  toolCallId?: string | null;
  requestHash?: string | null;
  equivalentActionKey?: string | null;
  executionPayload?: object;
  status?:
    | "pending_approval"
    | "processing"
    | "executed"
    | "rejected"
    | "expired"
    | "failed"
    | "unknown"
    | "blocked";
  title: string;
  reviewPayload?: Record<string, unknown>;
  expiresAt?: string | null;
  requesterAssistantId?: string | null;
  originProfileChannelId?: string | null;
  originChannelProvider?: string | null;
  originSenderId?: string | null;
  originSessionKey?: string | null;
  originSessionId?: string | null;
};

const activeEquivalentActionStatuses = [
  "pending_approval",
  "processing",
] as const;
const equivalentActionStatuses = [...activeEquivalentActionStatuses, "executed"] as const;
const RECENT_EXECUTED_EQUIVALENT_ACTION_WINDOW_MS = 10 * 60_000;

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, canonicalizeJson(nestedValue)]),
  );
}

export function buildEquivalentActionKey(input: {
  toolName: string;
  actionType: string;
  executionPayload: object;
}): string {
  const canonical = canonicalizeJson({
    toolName: input.toolName,
    actionType: input.actionType,
    executionPayload: input.executionPayload,
  });
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export async function findExistingEquivalentProfileAction(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    equivalentActionKey: string | null;
    now?: Date;
  },
): Promise<TableRow<"profile_actions"> | null> {
  if (!input.equivalentActionKey) return null;
  const result = await db
    .from("profile_actions")
    .select()
    .eq("profile_id", input.profileId)
    .eq("equivalent_action_key", input.equivalentActionKey)
    .in("status", equivalentActionStatuses)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (result.error) throw result.error;
  const rows = result.data ?? [];
  const active = rows.find((row) =>
    activeEquivalentActionStatuses.some((status) => status === row.status),
  );
  if (active) return active;

  const recentExecutedCutoff =
    (input.now?.getTime() ?? Date.now()) - RECENT_EXECUTED_EQUIVALENT_ACTION_WINDOW_MS;
  return (
    rows.find(
      (row) => row.status === "executed" && Date.parse(row.updated_at) >= recentExecutedCutoff,
    ) ?? null
  );
}

function buildProfileActionIdempotencyKey(input: ProfileActionIntent): string {
  const toolCallId = input.toolCallId;
  if (!toolCallId) throw new Error("Provider writes require toolCallId for idempotency.");
  return [
    input.profileId,
    toolCallId,
    input.toolName,
    input.actionType,
    input.targetId || "none",
    input.requestHash || "no-request-hash",
  ].join(":");
}

export async function createProfileActionAttempt(
  db: SupabaseServiceClient,
  input: ProfileActionIntent,
): Promise<{ action: TableRow<"profile_actions">; created: boolean }> {
  const idempotencyKey = buildProfileActionIdempotencyKey(input);
  const inserted = await db
    .from("profile_actions")
    .upsert(
      {
        profile_id: input.profileId,
        tool_call_id: input.toolCallId ?? null,
        tool_name: input.toolName,
        action_type: input.actionType,
        target_id: input.targetId ?? null,
        idempotency_key: idempotencyKey,
        provider_idempotency_key: idempotencyKey,
        equivalent_action_key: input.equivalentActionKey ?? null,
        request_hash: input.requestHash ?? "no-request-hash",
        execution_payload: requireJsonObject(
          input.executionPayload ?? {},
          "action.executionPayload",
        ),
        status: input.status ?? "pending_approval",
        title: input.title,
        summary: input.title,
        review_payload: requireJsonObject(input.reviewPayload ?? {}, "action.reviewPayload"),
        expires_at: input.expiresAt ?? null,
        requester_assistant_id: input.requesterAssistantId ?? null,
        origin_profile_channel_id: input.originProfileChannelId ?? null,
        origin_channel_provider: input.originChannelProvider ?? null,
        origin_sender_id: input.originSenderId ?? null,
        origin_session_key: input.originSessionKey ?? null,
        origin_session_id: input.originSessionId ?? null,
        decision: null,
        decision_source: null,
        decided_by_user_id: null,
        decided_by_channel_id: null,
        decided_at: null,
      },
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();
  if (inserted.error) throw inserted.error;
  if (inserted.data) return { action: inserted.data, created: true };

  const existing = await db
    .from("profile_actions")
    .select()
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  const action = requireSupabaseData(
    "Load idempotent profile_actions row",
    existing.data,
    existing.error,
  );
  return { action, created: false };
}
