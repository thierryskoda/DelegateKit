import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { z } from "zod";
import { browserTaskModeSchema, browserTaskStatusSchema } from "@ai-assistants/control-plane-contracts";

export type BrowserTaskStatus = z.infer<typeof browserTaskStatusSchema>;
type BrowserTaskMode = z.infer<typeof browserTaskModeSchema>;
type BrowserTaskActorType = "system" | "assistant" | "profile" | "profile_user";

type CreateBrowserTaskInput = {
  profileId: string;
  dedupeKey: string;
  mode: BrowserTaskMode;
  goal: string;
  status?: BrowserTaskStatus;
  note?: string | null;
  state?: Record<string, unknown>;
  wait?: Record<string, unknown> | null;
  assignedAgentId?: string | null;
};

type UpdateBrowserTaskInput = {
  profileId: string;
  browserTaskId: string;
  expectedRevision: number;
  status?: BrowserTaskStatus;
  note?: string | null;
  state?: Record<string, unknown>;
  wait?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  cancelRequestedAt?: string | null;
};

const terminalStatuses = new Set<BrowserTaskStatus>(["succeeded", "failed", "cancelled"]);

function requireBrowserTaskStatus(status: string): BrowserTaskStatus {
  return browserTaskStatusSchema.parse(status);
}

function endedAtForStatus(status: BrowserTaskStatus, explicit?: string | null): string | null {
  if (explicit !== undefined) return explicit;
  return terminalStatuses.has(status) ? new Date().toISOString() : null;
}

export async function createOrGetBrowserTask(
  db: SupabaseServiceClient,
  input: CreateBrowserTaskInput,
): Promise<{ browserTask: TableRow<"browser_tasks">; created: boolean }> {
  const inserted = await db
    .from("browser_tasks")
    .upsert(
      {
        profile_id: input.profileId,
        mode: input.mode,
        status: input.status ?? "running",
        dedupe_key: input.dedupeKey,
        assigned_assistant_id: input.assignedAgentId ?? null,
        goal: input.goal,
        summary: input.note ?? null,
        state: requireJsonObject(input.state ?? {}, "browserTask.state"),
        wait: input.wait == null ? null : requireJsonObject(input.wait, "browserTask.wait"),
        ended_at: endedAtForStatus(input.status ?? "running"),
      },
      { onConflict: "profile_id,dedupe_key", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();
  if (inserted.error) throw inserted.error;
  if (inserted.data) {
    await appendBrowserTaskEvent(db, inserted.data.id, "browser_task.created");
    return { browserTask: inserted.data, created: true };
  }

  const existing = await db
    .from("browser_tasks")
    .select()
    .eq("profile_id", input.profileId)
    .eq("dedupe_key", input.dedupeKey)
    .maybeSingle();
  const row = requireSupabaseData("Load idempotent browser task row", existing.data, existing.error);
  return { browserTask: row, created: false };
}

export async function requireBrowserTaskForProfile(
  db: SupabaseServiceClient,
  profileId: string,
  browserTaskId: string,
): Promise<TableRow<"browser_tasks">> {
  const result = await db
    .from("browser_tasks")
    .select()
    .eq("id", browserTaskId)
    .eq("profile_id", profileId)
    .maybeSingle();
  return requireSupabaseData(`Load browser task ${browserTaskId}`, result.data, result.error);
}

async function appendBrowserTaskEvent(
  db: SupabaseServiceClient,
  browserTaskId: string,
  eventType: string,
  actorType: BrowserTaskActorType = "system",
  actorId: string | null = null,
  payload: Record<string, unknown> = {},
): Promise<TableRow<"browser_task_events">> {
  const inserted = await db
    .from("browser_task_events")
    .insert({
      browser_task_id: browserTaskId,
      event_type: eventType,
      actor_type: actorType,
      actor_id: actorId,
      payload: requireJsonObject(payload, "browserTaskEvent.payload"),
    })
    .select()
    .single();
  return requireSupabaseData("Insert browser_task_events row", inserted.data, inserted.error);
}

async function updateBrowserTask(
  db: SupabaseServiceClient,
  input: UpdateBrowserTaskInput,
): Promise<TableRow<"browser_tasks">> {
  const current = await requireBrowserTaskForProfile(db, input.profileId, input.browserTaskId);
  if (current.revision !== input.expectedRevision) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Browser task ${input.browserTaskId} revision is ${current.revision}, not ${input.expectedRevision}.`,
    );
  }
  const nextStatus = input.status ?? requireBrowserTaskStatus(current.status);
  const patch = {
    ...(input.status === undefined ? {} : { status: nextStatus }),
    ...(input.note === undefined ? {} : { summary: input.note }),
    ...(input.state === undefined
      ? {}
      : { state: requireJsonObject(input.state, "browserTask.state") }),
    ...(input.wait === undefined
      ? {}
      : { wait: input.wait == null ? null : requireJsonObject(input.wait, "browserTask.wait") }),
    ...(input.result === undefined
      ? {}
      : {
          result:
            input.result == null ? null : requireJsonObject(input.result, "browserTask.result"),
        }),
    ...(input.cancelRequestedAt === undefined
      ? {}
      : { cancel_requested_at: input.cancelRequestedAt }),
    ended_at: endedAtForStatus(
      nextStatus,
      input.status === undefined ? current.ended_at : undefined,
    ),
    revision: current.revision + 1,
    updated_at: new Date().toISOString(),
  };
  const updated = await db
    .from("browser_tasks")
    .update(patch)
    .eq("id", input.browserTaskId)
    .eq("profile_id", input.profileId)
    .eq("revision", input.expectedRevision)
    .select()
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (!updated.data) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Browser task ${input.browserTaskId} changed before it could be updated.`,
    );
  }
  await appendBrowserTaskEvent(db, updated.data.id, "browser_task.updated", "system", null, {
    previousRevision: current.revision,
    revision: updated.data.revision,
    status: updated.data.status,
    note: updated.data.summary,
  });
  return updated.data;
}

export async function transitionBrowserTask(
  db: SupabaseServiceClient,
  input: UpdateBrowserTaskInput & { status: BrowserTaskStatus },
): Promise<TableRow<"browser_tasks">> {
  return updateBrowserTask(db, input);
}
