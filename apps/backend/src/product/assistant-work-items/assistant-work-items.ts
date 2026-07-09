import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type Database,
  type Json,
  type PostgrestError,
  type SupabaseServiceClient,
  type TableInsert,
  type TableRow,
} from "@ai-assistants/control-db";
import { enqueueBackendJob } from "@ai-assistants/backend-jobs";
import {
  agentRunExecuteBackendJobKind,
  agentRunExecuteJobPayloadSchema,
  assistantWorkItemKindSchema,
  assistantWorkItemRowSchema,
  assistantWorkItemStatusSchema,
} from "@ai-assistants/control-plane-contracts";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { recordWorkItemTerminalActivitySafe } from "../agent-activity/agent-activity";

const ASSISTANT_WORK_ITEM_DEFAULT_LEASE_SECONDS = 15 * 60;
const ASSISTANT_WORK_ITEM_DEFAULT_PRIORITY = 100;
const ASSISTANT_WORK_ITEM_DEFAULT_MAX_ATTEMPTS = 5;

export type AssistantWorkItemKind = z.infer<typeof assistantWorkItemKindSchema>;
export type AssistantWorkItemStatus = z.infer<typeof assistantWorkItemStatusSchema>;
export type AssistantWorkItem = TableRow<"assistant_work_items"> & {
  kind: AssistantWorkItemKind;
  status: AssistantWorkItemStatus;
  payload: Record<string, Json>;
  result: Record<string, Json> | null;
};

const assistantWorkItemPayloadSchema = z
  .object({
    title: z.string().trim().min(1),
    detail: z.string().trim().min(1).nullable().optional(),
    instructions: z.string().trim().min(1).nullable().optional(),
    guidanceIds: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .regex(/^[a-z][a-z0-9_]*$/),
      )
      .default([]),
    profileGuidanceDbIds: z.array(z.string().uuid()).default([]),
    relatedActionId: z.string().uuid().nullable().optional(),
    relatedScheduledTaskId: z.string().uuid().nullable().optional(),
    scheduledFireTime: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .passthrough();

export type AssistantWorkItemPayload = z.infer<typeof assistantWorkItemPayloadSchema>;

const assistantWorkItemPayloadSchemas = Object.fromEntries(
  assistantWorkItemKindSchema.options.map((kind) => [kind, assistantWorkItemPayloadSchema]),
) as Record<AssistantWorkItemKind, typeof assistantWorkItemPayloadSchema>;

export function parseAssistantWorkItemPayload(
  kind: AssistantWorkItemKind,
  payload: unknown,
): AssistantWorkItemPayload {
  return assistantWorkItemPayloadSchemas[kind].parse(payload);
}

export type AssistantWorkItemOrigin = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  toolCallId?: string;
  scheduledTaskId?: string;
};

const assistantWorkItemOriginSchema = z
  .object({
    agentId: z.string().trim().min(1).optional(),
    sessionKey: z.string().trim().min(1).optional(),
    sessionId: z.string().trim().min(1).optional(),
    toolCallId: z.string().trim().min(1).optional(),
    scheduledTaskId: z.string().uuid().optional(),
  })
  .strict();

const enqueueAssistantWorkItemInputSchema = z
  .object({
    profileId: z.string().trim().min(1),
    kind: assistantWorkItemKindSchema,
    payload: z.record(z.string(), z.unknown()).default({}),
    priority: z.number().int().min(0).optional(),
    maxAttempts: z.number().int().min(1).optional(),
    availableAt: z.string().datetime({ offset: true }).optional(),
    dedupeKey: z.string().trim().min(1).nullable().optional(),
    origin: assistantWorkItemOriginSchema.optional(),
  })
  .strict();

export type EnqueueAssistantWorkItemInput = z.input<typeof enqueueAssistantWorkItemInputSchema>;

export type EnqueueAssistantWorkItemResult = {
  workItem: AssistantWorkItem;
  joinedExistingWorkItem: boolean;
};

class LostAssistantWorkItemRunError extends Error {
  readonly workItemId: string;
  readonly operation: string;

  constructor(input: { workItemId: string; operation: string }) {
    super(`Assistant work item ${input.workItemId} run was lost before ${input.operation}.`);
    this.name = "LostAssistantWorkItemRunError";
    this.workItemId = input.workItemId;
    this.operation = input.operation;
  }
}

function parseAssistantWorkItemRow(row: unknown): AssistantWorkItem {
  const workItem = assistantWorkItemRowSchema.parse(row) as AssistantWorkItem;
  parseAssistantWorkItemPayload(workItem.kind, workItem.payload);
  return workItem;
}

function emitAssistantWorkItemDiagnostic(
  kind: string,
  workItem: AssistantWorkItem,
  attrs: Record<string, unknown> = {},
): void {
  const agentId = workItem.claimed_by_agent_id ?? workItem.origin_agent_id ?? null;
  emitDiagnostic(backendDiagnosticLogger(), kind, {
    ok: true,
    profile_id: workItem.profile_id,
    ...(agentId === null ? {} : { agent_id: agentId }),
    ...(workItem.origin_session_id === null ? {} : { session_id: workItem.origin_session_id }),
    ...(workItem.origin_tool_call_id === null
      ? {}
      : { tool_call_id: workItem.origin_tool_call_id }),
    attrs: {
      work_item_id: workItem.id,
      profile_id: workItem.profile_id,
      kind: workItem.kind,
      status: workItem.status,
      priority: workItem.priority,
      attempts: workItem.attempts,
      max_attempts: workItem.max_attempts,
      dedupe_key: workItem.dedupe_key,
      origin_agent_id: workItem.origin_agent_id,
      origin_session_id: workItem.origin_session_id,
      has_origin_session_key: Boolean(workItem.origin_session_key),
      origin_tool_call_id: workItem.origin_tool_call_id,
      origin_scheduled_task_id: workItem.origin_scheduled_task_id,
      claimed_by_agent_id: workItem.claimed_by_agent_id,
      ...attrs,
    },
  });
}

function workItemRunEvidence(workItem: TableRow<"assistant_work_items">): {
  runningByAgentId: string | null;
  runningBySessionKey: string | null;
  startedAt: string | null;
} {
  return {
    runningByAgentId: workItem.claimed_by_agent_id,
    runningBySessionKey: workItem.claimed_by_session_key,
    startedAt: workItem.claimed_at,
  };
}

type AssistantWorkItemInsert = TableInsert<"assistant_work_items">;

function isUniqueViolation(error: PostgrestError | null): boolean {
  return error?.code === "23505";
}

async function loadExistingAssistantWorkItemForDedupe(
  db: SupabaseServiceClient,
  input: { profileId: string; dedupeKey: string },
): Promise<AssistantWorkItem> {
  const result = await db
    .from("assistant_work_items")
    .select()
    .eq("profile_id", input.profileId)
    .eq("dedupe_key", input.dedupeKey)
    .single();
  return parseAssistantWorkItemRow(
    requireSupabaseData("Load existing assistant work item for dedupe", result.data, result.error),
  );
}

async function enqueueAgentRunJobForWorkItem(
  db: SupabaseServiceClient,
  workItem: AssistantWorkItem,
): Promise<void> {
  if (workItem.status !== "pending") return;
  const payload = agentRunExecuteJobPayloadSchema.parse({
    source: {
      kind: "work_item",
      workItemId: workItem.id,
    },
  });
  await enqueueBackendJob(db, {
    profileId: workItem.profile_id,
    kind: agentRunExecuteBackendJobKind,
    payload,
    priority: workItem.priority,
    runAfter: workItem.available_at,
    maxAttempts: workItem.max_attempts,
    dedupeKey: `${agentRunExecuteBackendJobKind}:work_item:${workItem.id}`,
    origin: {
      ...(workItem.origin_agent_id ? { agentId: workItem.origin_agent_id } : {}),
      ...(workItem.origin_session_key ? { sessionKey: workItem.origin_session_key } : {}),
      ...(workItem.origin_session_id ? { sessionId: workItem.origin_session_id } : {}),
      ...(workItem.origin_tool_call_id ? { toolCallId: workItem.origin_tool_call_id } : {}),
    },
  });
}

export async function enqueueAssistantWorkItem(
  db: SupabaseServiceClient,
  input: EnqueueAssistantWorkItemInput,
): Promise<EnqueueAssistantWorkItemResult> {
  const parsed = enqueueAssistantWorkItemInputSchema.parse(input);
  const canonicalPayload = parseAssistantWorkItemPayload(parsed.kind, parsed.payload);
  const payload = requireJsonObject(canonicalPayload, "assistantWorkItem.payload");
  const dedupeKey = parsed.dedupeKey?.trim() || null;
  const insert: AssistantWorkItemInsert = {
    profile_id: parsed.profileId,
    kind: parsed.kind,
    status: "pending",
    payload,
    priority: parsed.priority ?? ASSISTANT_WORK_ITEM_DEFAULT_PRIORITY,
    max_attempts: parsed.maxAttempts ?? ASSISTANT_WORK_ITEM_DEFAULT_MAX_ATTEMPTS,
    available_at: parsed.availableAt ?? new Date().toISOString(),
    ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
    ...(parsed.origin?.agentId ? { origin_agent_id: parsed.origin.agentId } : {}),
    ...(parsed.origin?.sessionKey ? { origin_session_key: parsed.origin.sessionKey } : {}),
    ...(parsed.origin?.sessionId ? { origin_session_id: parsed.origin.sessionId } : {}),
    ...(parsed.origin?.toolCallId ? { origin_tool_call_id: parsed.origin.toolCallId } : {}),
    ...(parsed.origin?.scheduledTaskId
      ? { origin_scheduled_task_id: parsed.origin.scheduledTaskId }
      : {}),
  };
  const result = await db.from("assistant_work_items").insert(insert).select().single();
  if (dedupeKey && isUniqueViolation(result.error)) {
    const workItem = await loadExistingAssistantWorkItemForDedupe(db, {
      profileId: parsed.profileId,
      dedupeKey,
    });
    await enqueueAgentRunJobForWorkItem(db, workItem);
    emitAssistantWorkItemDiagnostic("assistant_work_item.enqueued", workItem, {
      joined_existing: true,
    });
    return { workItem, joinedExistingWorkItem: true };
  }
  const workItem = parseAssistantWorkItemRow(
    requireSupabaseData("Enqueue assistant work item", result.data, result.error),
  );
  await enqueueAgentRunJobForWorkItem(db, workItem);
  emitAssistantWorkItemDiagnostic("assistant_work_item.enqueued", workItem, {
    joined_existing: false,
  });
  return { workItem, joinedExistingWorkItem: false };
}

export async function startAssistantWorkItemRun(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    workItemId: string;
    agentId: string;
    sessionKey: string;
    leaseSeconds?: number;
  },
): Promise<AssistantWorkItem | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const pendingResult = await db
    .from("assistant_work_items")
    .select()
    .eq("profile_id", input.profileId)
    .eq("id", input.workItemId)
    .eq("status", "pending")
    .lte("available_at", nowIso)
    .maybeSingle();
  if (pendingResult.error) throw pendingResult.error;
  if (!pendingResult.data) return null;
  const pending = parseAssistantWorkItemRow(pendingResult.data);
  if (pending.attempts >= pending.max_attempts) return null;

  const runLeaseExpiresAt = new Date(
    now.getTime() + (input.leaseSeconds ?? ASSISTANT_WORK_ITEM_DEFAULT_LEASE_SECONDS) * 1000,
  ).toISOString();
  const result = await db
    .from("assistant_work_items")
    .update({
      status: "claimed",
      attempts: pending.attempts + 1,
      claim_token: randomUUID(),
      claim_expires_at: runLeaseExpiresAt,
      claimed_by_agent_id: input.agentId,
      claimed_by_session_key: input.sessionKey,
      claimed_at: nowIso,
      last_error: null,
      updated_at: nowIso,
    })
    .eq("profile_id", input.profileId)
    .eq("id", input.workItemId)
    .eq("status", "pending")
    .lte("available_at", nowIso)
    .select()
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) return null;
  const workItem = parseAssistantWorkItemRow(result.data);
  emitAssistantWorkItemDiagnostic("assistant_work_item.started", workItem);
  return workItem;
}

export async function getAssistantWorkItem(
  db: SupabaseServiceClient,
  input: { profileId: string; workItemId: string },
): Promise<AssistantWorkItem> {
  const result = await db
    .from("assistant_work_items")
    .select()
    .eq("profile_id", input.profileId)
    .eq("id", input.workItemId)
    .maybeSingle();
  return parseAssistantWorkItemRow(
    requireSupabaseData("Load assistant work item", result.data, result.error),
  );
}

export async function listAssistantWorkItems(
  db: SupabaseServiceClient,
  input: { profileId: string; statuses: AssistantWorkItemStatus[]; limit: number },
): Promise<AssistantWorkItem[]> {
  const result = await db
    .from("assistant_work_items")
    .select()
    .eq("profile_id", input.profileId)
    .in("status", input.statuses)
    .order("priority", { ascending: true })
    .order("available_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(input.limit);
  return requireSupabaseRows("List assistant work items", result.data, result.error).map((row) =>
    parseAssistantWorkItemRow(row),
  );
}

type AssistantWorkItemsUpdate = Database["public"]["Tables"]["assistant_work_items"]["Update"];

async function patchRunningAssistantWorkItem(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    workItemId: string;
    agentId: string;
    sessionKey: string;
    operation: string;
    patch: AssistantWorkItemsUpdate;
  },
): Promise<AssistantWorkItem> {
  const nowIso = new Date().toISOString();
  let query = db
    .from("assistant_work_items")
    .update({
      ...input.patch,
      updated_at: input.patch.updated_at ?? nowIso,
    })
    .eq("profile_id", input.profileId)
    .eq("id", input.workItemId)
    .eq("status", "claimed")
    .eq("claimed_by_agent_id", input.agentId)
    .eq("claimed_by_session_key", input.sessionKey);

  const result = await query.select().maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    throw new LostAssistantWorkItemRunError({
      workItemId: input.workItemId,
      operation: input.operation,
    });
  }
  const workItem = parseAssistantWorkItemRow(result.data);
  emitAssistantWorkItemDiagnostic(`assistant_work_item.${input.operation}`, workItem);
  return workItem;
}

export async function completeAssistantWorkItem(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    workItemId: string;
    agentId: string;
    sessionKey: string;
    result: Record<string, unknown>;
  },
): Promise<AssistantWorkItem> {
  const nowIso = new Date().toISOString();
  const claimed = await getAssistantWorkItem(db, {
    profileId: input.profileId,
    workItemId: input.workItemId,
  });
  const terminalEvidence = workItemRunEvidence(claimed);
  const workItem = await patchRunningAssistantWorkItem(db, {
    profileId: input.profileId,
    workItemId: input.workItemId,
    operation: "succeeded",
    agentId: input.agentId,
    sessionKey: input.sessionKey,
    patch: {
      status: "succeeded",
      result: requireJsonObject(input.result, "assistantWorkItem.result") as Json,
      last_error: null,
      claim_token: null,
      claim_expires_at: null,
      claimed_by_agent_id: null,
      claimed_by_session_key: null,
      finished_at: nowIso,
      updated_at: nowIso,
    },
  });
  await recordWorkItemTerminalActivitySafe(db, workItem, terminalEvidence);
  return workItem;
}

export async function ignoreAssistantWorkItem(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    workItemId: string;
    agentId: string;
    sessionKey: string;
    result: Record<string, unknown>;
  },
): Promise<AssistantWorkItem> {
  const nowIso = new Date().toISOString();
  const claimed = await getAssistantWorkItem(db, {
    profileId: input.profileId,
    workItemId: input.workItemId,
  });
  const terminalEvidence = workItemRunEvidence(claimed);
  const workItem = await patchRunningAssistantWorkItem(db, {
    profileId: input.profileId,
    workItemId: input.workItemId,
    operation: "ignored",
    agentId: input.agentId,
    sessionKey: input.sessionKey,
    patch: {
      status: "ignored",
      result: requireJsonObject(input.result, "assistantWorkItem.ignoreResult") as Json,
      last_error: null,
      claim_token: null,
      claim_expires_at: null,
      claimed_by_agent_id: null,
      claimed_by_session_key: null,
      finished_at: nowIso,
      updated_at: nowIso,
    },
  });
  await recordWorkItemTerminalActivitySafe(db, workItem, terminalEvidence);
  return workItem;
}

export async function failAssistantWorkItem(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    workItemId: string;
    agentId: string;
    sessionKey: string;
    errorMessage: string;
    retryAfter?: string | null;
  },
): Promise<AssistantWorkItem> {
  const workItem = await getAssistantWorkItem(db, {
    profileId: input.profileId,
    workItemId: input.workItemId,
  });
  const terminalEvidence = workItemRunEvidence(workItem);
  const nowIso = new Date().toISOString();
  const terminal = workItem.attempts >= workItem.max_attempts;
  const updated = await patchRunningAssistantWorkItem(db, {
    profileId: input.profileId,
    workItemId: input.workItemId,
    operation: terminal ? "failed" : "retried",
    agentId: input.agentId,
    sessionKey: input.sessionKey,
    patch: terminal
      ? {
          status: "failed",
          last_error: input.errorMessage,
          claim_token: null,
          claim_expires_at: null,
          claimed_by_agent_id: null,
          claimed_by_session_key: null,
          finished_at: nowIso,
          updated_at: nowIso,
        }
      : {
          status: "pending",
          last_error: input.errorMessage,
          claim_token: null,
          claim_expires_at: null,
          claimed_by_agent_id: null,
          claimed_by_session_key: null,
          available_at: input.retryAfter ?? nowIso,
          finished_at: null,
          updated_at: nowIso,
        },
  });
  await recordWorkItemTerminalActivitySafe(db, updated, terminalEvidence);
  return updated;
}
