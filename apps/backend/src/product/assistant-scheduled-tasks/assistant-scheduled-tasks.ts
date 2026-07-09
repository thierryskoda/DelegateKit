import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type Database,
  type Json,
  type PostgrestError,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { enqueueBackendJob, type EnqueueBackendJobResult } from "@ai-assistants/backend-jobs";
import {
  agentRunExecuteBackendJobKind,
  agentRunExecuteJobPayloadSchema,
  assistantScheduledTaskRowSchema,
} from "@ai-assistants/control-plane-contracts";
import {
  assistantScheduleSchema,
  assistantScheduledTaskTargetSchema,
  type AssistantSchedule,
  type AssistantScheduledTaskTarget,
} from "@ai-assistants/scheduled-tasks-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { createHash } from "node:crypto";
import { Cron } from "croner";

const ASSISTANT_SCHEDULED_TASK_TICK_LIMIT = 100;
export const ASSISTANT_SCHEDULED_TASK_MATERIALIZATION_LEAD_MS = 5 * 60 * 1000;
const scheduledTaskAgentRunJobPriority = 100;

export type AssistantScheduledTask = Omit<TableRow<"assistant_scheduled_tasks">, "schedule" | "target"> & {
  schedule: AssistantSchedule;
  target: AssistantScheduledTaskTarget;
};

export type AssistantScheduledTaskOrigin = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  toolCallId?: string;
};

type AssistantScheduledTasksInsert =
  Database["public"]["Tables"]["assistant_scheduled_tasks"]["Insert"];
type AssistantScheduledTasksUpdate =
  Database["public"]["Tables"]["assistant_scheduled_tasks"]["Update"];

export type ScheduledTaskTickResult = {
  processed: number;
  enqueued: number;
  joinedExisting: number;
  advanced: number;
  taskIds: string[];
  jobIds: string[];
};

function parseAssistantScheduledTaskRow(row: unknown): AssistantScheduledTask {
  const parsed = assistantScheduledTaskRowSchema.parse(row);
  return {
    ...parsed,
    schedule: assistantScheduleSchema.parse(parsed.schedule),
    target: assistantScheduledTaskTargetSchema.parse(parsed.target),
  };
}

function toJsonObject(schedule: AssistantSchedule): Json {
  return requireJsonObject(schedule, "assistantScheduledTask.schedule");
}

function targetToJsonObject(target: AssistantScheduledTaskTarget): Json {
  return requireJsonObject(target, "assistantScheduledTask.target");
}

function assertValidDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new DomainError(domainCodes.BAD_REQUEST, `${label} must be a valid ISO datetime.`);
  }
  return date;
}

function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch (error) {
    throw new DomainError(domainCodes.BAD_REQUEST, `Invalid schedule timezone: ${timezone}.`, {
      cause: error,
    });
  }
}

export function computeNextScheduledTaskRunAt(
  schedule: AssistantSchedule,
  from: Date = new Date(),
): string | null {
  const parsed = assistantScheduleSchema.parse(schedule);
  switch (parsed.kind) {
    case "at": {
      const at = assertValidDate(parsed.at, "schedule.at");
      return at.getTime() > from.getTime() ? at.toISOString() : null;
    }
    case "every": {
      const intervalMs = parsed.everySeconds * 1000;
      const anchor = parsed.anchorAt ? assertValidDate(parsed.anchorAt, "schedule.anchorAt") : from;
      if (anchor.getTime() > from.getTime()) return anchor.toISOString();
      const elapsed = from.getTime() - anchor.getTime();
      const intervalsElapsed = Math.floor(elapsed / intervalMs);
      const next = new Date(anchor.getTime() + (intervalsElapsed + 1) * intervalMs);
      return next.toISOString();
    }
    case "cron": {
      assertValidTimezone(parsed.timezone);
      try {
        return (
          new Cron(parsed.expr, { timezone: parsed.timezone, paused: true })
            .nextRun(from)
            ?.toISOString() ?? null
        );
      } catch (error) {
        throw new DomainError(domainCodes.BAD_REQUEST, `Invalid cron schedule: ${parsed.expr}.`, {
          cause: error,
        });
      }
    }
    default: {
      const _exhaustive: never = parsed;
      throw new DomainError(
        domainCodes.INTERNAL,
        `Unhandled assistant schedule variant ${String(_exhaustive)}.`,
      );
    }
  }
}

export function previewScheduledTaskRuns(
  schedule: AssistantSchedule,
  count: number,
  from: Date = new Date(),
): string[] {
  const parsed = assistantScheduleSchema.parse(schedule);
  if (count < 1) return [];
  switch (parsed.kind) {
    case "at": {
      const next = computeNextScheduledTaskRunAt(parsed, from);
      return next ? [next] : [];
    }
    case "every": {
      const runs: string[] = [];
      let cursor = from;
      for (let i = 0; i < count; i += 1) {
        const next = computeNextScheduledTaskRunAt(parsed, cursor);
        if (!next) break;
        runs.push(next);
        cursor = new Date(next);
      }
      return runs;
    }
    case "cron": {
      assertValidTimezone(parsed.timezone);
      try {
        return new Cron(parsed.expr, { timezone: parsed.timezone, paused: true })
          .nextRuns(count, from)
          .map((run) => run.toISOString());
      } catch (error) {
        throw new DomainError(domainCodes.BAD_REQUEST, `Invalid cron schedule: ${parsed.expr}.`, {
          cause: error,
        });
      }
    }
    default: {
      const _exhaustive: never = parsed;
      throw new DomainError(
        domainCodes.INTERNAL,
        `Unhandled assistant schedule variant ${String(_exhaustive)}.`,
      );
    }
  }
}

function scheduleTimezone(schedule: AssistantSchedule): string | null {
  return schedule.kind === "cron" ? schedule.timezone : null;
}

function scheduledTaskAgentRunDedupeKey(
  task: AssistantScheduledTask,
  scheduledFireTime: string,
): string {
  return `${agentRunExecuteBackendJobKind}:scheduled_task:${task.id}:${task.revision}:${scheduledFireTime}`;
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJsonStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJsonStringify(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashDedupeParts(parts: readonly unknown[]): string {
  return createHash("sha256").update(stableJsonStringify(parts)).digest("hex").slice(0, 32);
}

function scheduledTaskCreateDedupeKey(input: {
  profileId: string;
  title: string;
  instructions: string;
  target: AssistantScheduledTaskTarget;
  schedule: AssistantSchedule;
}): string {
  return `assistant.scheduled_tasks.create:${hashDedupeParts([
    input.profileId,
    input.title.trim(),
    input.instructions.trim(),
    input.target,
    input.schedule,
  ])}`;
}

function isUniqueViolation(error: PostgrestError | null): boolean {
  return error?.code === "23505";
}

async function loadExistingScheduledTaskForDedupe(
  db: SupabaseServiceClient,
  input: { profileId: string; dedupeKey: string },
): Promise<AssistantScheduledTask> {
  const result = await db
    .from("assistant_scheduled_tasks")
    .select()
    .eq("profile_id", input.profileId)
    .eq("dedupe_key", input.dedupeKey)
    .neq("status", "deleted")
    .single();
  return parseAssistantScheduledTaskRow(
    requireSupabaseData("Load existing assistant scheduled task for dedupe", result.data, result.error),
  );
}

async function enqueueAgentRunJobForScheduledTask(
  db: SupabaseServiceClient,
  task: AssistantScheduledTask,
  scheduledFireTime: string,
): Promise<EnqueueBackendJobResult> {
  const payload = agentRunExecuteJobPayloadSchema.parse({
    source: {
      kind: "scheduled_task",
      scheduledTaskId: task.id,
      scheduledTaskRevision: task.revision,
      scheduledFor: scheduledFireTime,
    },
  });
  return enqueueBackendJob(db, {
    profileId: task.profile_id,
    kind: agentRunExecuteBackendJobKind,
    payload,
    priority: scheduledTaskAgentRunJobPriority,
    runAfter: scheduledFireTime,
    dedupeKey: scheduledTaskAgentRunDedupeKey(task, scheduledFireTime),
  });
}

async function enqueueAgentRunJobForScheduledTaskNextRun(
  db: SupabaseServiceClient,
  task: AssistantScheduledTask,
): Promise<void> {
  if (task.status !== "active" || !task.next_run_at) return;
  await enqueueAgentRunJobForScheduledTask(db, task, task.next_run_at);
}

async function cancelPendingScheduledTaskExecutions(
  db: SupabaseServiceClient,
  input: { profileId: string; scheduledTaskId: string },
): Promise<void> {
  const nowIso = new Date().toISOString();
  const workItemsResult = await db
    .from("assistant_work_items")
    .update({
      status: "cancelled",
      finished_at: nowIso,
      updated_at: nowIso,
    })
    .eq("profile_id", input.profileId)
    .eq("origin_scheduled_task_id", input.scheduledTaskId)
    .eq("status", "pending");
  if (workItemsResult.error) throw workItemsResult.error;

  const payloadFilter = {
    source: {
      kind: "scheduled_task",
      scheduledTaskId: input.scheduledTaskId,
    },
  } satisfies Record<string, unknown>;
  const jobsResult = await db
    .from("backend_jobs")
    .update({
      status: "cancelled",
      finished_at: nowIso,
      updated_at: nowIso,
    })
    .eq("profile_id", input.profileId)
    .eq("kind", agentRunExecuteBackendJobKind)
    .eq("status", "queued")
    .contains("payload", payloadFilter);
  if (jobsResult.error) throw jobsResult.error;
}

export async function createAssistantScheduledTask(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    title: string;
    instructions: string;
    target?: AssistantScheduledTaskTarget;
    schedule: AssistantSchedule;
    origin?: AssistantScheduledTaskOrigin;
  },
): Promise<AssistantScheduledTask> {
  const schedule = assistantScheduleSchema.parse(input.schedule);
  const target = assistantScheduledTaskTargetSchema.parse(input.target ?? { kind: "assistant_instructions" });
  if (!input.instructions.trim()) {
    throw new DomainError(domainCodes.BAD_REQUEST, "Assistant instruction scheduled tasks require instructions.");
  }
  const instructions = input.instructions.trim();
  const title = input.title.trim();
  const dedupeKey = scheduledTaskCreateDedupeKey({
    profileId: input.profileId,
    title,
    instructions,
    target,
    schedule,
  });
  const now = new Date();
  const insert: AssistantScheduledTasksInsert = {
    profile_id: input.profileId,
    status: "active",
    title,
    instructions,
    target: targetToJsonObject(target),
    schedule: toJsonObject(schedule),
    timezone: scheduleTimezone(schedule),
    next_run_at: computeNextScheduledTaskRunAt(schedule, now),
    revision: 1,
    dedupe_key: dedupeKey,
    created_by_agent_id: input.origin?.agentId ?? null,
    created_by_session_key: input.origin?.sessionKey ?? null,
    created_by_session_id: input.origin?.sessionId ?? null,
    created_by_tool_call_id: input.origin?.toolCallId ?? null,
  };
  const result = await db.from("assistant_scheduled_tasks").insert(insert).select().single();
  if (isUniqueViolation(result.error)) {
    const existing = await loadExistingScheduledTaskForDedupe(db, {
      profileId: input.profileId,
      dedupeKey,
    });
    await enqueueAgentRunJobForScheduledTaskNextRun(db, existing);
    return existing;
  }
  const task = parseAssistantScheduledTaskRow(
    requireSupabaseData("Create assistant scheduled task", result.data, result.error),
  );
  await enqueueAgentRunJobForScheduledTaskNextRun(db, task);
  return task;
}

export async function listAssistantScheduledTasks(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    status: "active" | "paused" | "deleted" | "all";
    limit: number;
  },
): Promise<AssistantScheduledTask[]> {
  let query = db
    .from("assistant_scheduled_tasks")
    .select()
    .eq("profile_id", input.profileId)
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (input.status === "all") {
    query = query.neq("status", "deleted");
  } else {
    query = query.eq("status", input.status);
  }
  const result = await query;
  return requireSupabaseRows("List assistant scheduled tasks", result.data, result.error).map(
    parseAssistantScheduledTaskRow,
  );
}

export async function requireAssistantScheduledTask(
  db: SupabaseServiceClient,
  input: { profileId: string; scheduledTaskId: string },
): Promise<AssistantScheduledTask> {
  const result = await db
    .from("assistant_scheduled_tasks")
    .select()
    .eq("profile_id", input.profileId)
    .eq("id", input.scheduledTaskId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Assistant scheduled task ${input.scheduledTaskId} was not found.`,
    );
  }
  return parseAssistantScheduledTaskRow(result.data);
}

function assertExpectedScheduledTaskRevision(
  task: AssistantScheduledTask,
  expectedRevision: number,
): void {
  if (task.revision !== expectedRevision) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Assistant scheduled task ${task.id} revision is ${task.revision}, not ${expectedRevision}.`,
    );
  }
}

async function updateScheduledTaskById(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    scheduledTaskId: string;
    label: string;
    patch: AssistantScheduledTasksUpdate;
  },
): Promise<AssistantScheduledTask> {
  const result = await db
    .from("assistant_scheduled_tasks")
    .update({ ...input.patch, updated_at: new Date().toISOString() })
    .eq("profile_id", input.profileId)
    .eq("id", input.scheduledTaskId)
    .select()
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Assistant scheduled task ${input.scheduledTaskId} was not found.`,
    );
  }
  return parseAssistantScheduledTaskRow(result.data);
}

export async function updateAssistantScheduledTask(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    scheduledTaskId: string;
    expectedRevision: number;
    title?: string;
    instructions?: string;
    schedule?: AssistantSchedule;
  },
): Promise<AssistantScheduledTask> {
  const existing = await requireAssistantScheduledTask(db, input);
  assertExpectedScheduledTaskRevision(existing, input.expectedRevision);
  if (existing.status === "deleted") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Assistant scheduled task ${existing.id} has been deleted.`,
    );
  }
  const nextSchedule = input.schedule ? assistantScheduleSchema.parse(input.schedule) : null;
  const effectiveSchedule = nextSchedule ?? existing.schedule;
  const effectiveInstructions =
    input.instructions === undefined ? existing.instructions : input.instructions.trim();
  if (!effectiveInstructions) {
    throw new DomainError(domainCodes.BAD_REQUEST, "Assistant instruction scheduled tasks require instructions.");
  }
  const patch: AssistantScheduledTasksUpdate = {
    revision: existing.revision + 1,
    ...(input.title === undefined ? {} : { title: input.title.trim() }),
    ...(input.instructions === undefined ? {} : { instructions: effectiveInstructions }),
    ...(nextSchedule === null
      ? {}
      : {
          schedule: toJsonObject(nextSchedule),
          timezone: scheduleTimezone(nextSchedule),
          next_run_at:
            existing.status === "active"
              ? computeNextScheduledTaskRunAt(nextSchedule, new Date())
              : null,
        }),
  };
  if (nextSchedule === null && existing.status === "active" && existing.next_run_at === null) {
    patch.next_run_at = computeNextScheduledTaskRunAt(effectiveSchedule, new Date());
  }
  await cancelPendingScheduledTaskExecutions(db, {
    profileId: input.profileId,
    scheduledTaskId: input.scheduledTaskId,
  });
  const task = await updateScheduledTaskById(db, {
    profileId: input.profileId,
    scheduledTaskId: input.scheduledTaskId,
    label: "Update assistant scheduled task",
    patch,
  });
  await enqueueAgentRunJobForScheduledTaskNextRun(db, task);
  return task;
}

export async function deleteAssistantScheduledTask(
  db: SupabaseServiceClient,
  input: { profileId: string; scheduledTaskId: string; expectedRevision: number },
): Promise<AssistantScheduledTask> {
  const existing = await requireAssistantScheduledTask(db, input);
  assertExpectedScheduledTaskRevision(existing, input.expectedRevision);
  if (existing.status === "deleted") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Assistant scheduled task ${existing.id} is already deleted.`,
    );
  }
  await cancelPendingScheduledTaskExecutions(db, input);
  return updateScheduledTaskById(db, {
    ...input,
    label: "Delete assistant scheduled task",
    patch: {
      status: "deleted",
      next_run_at: null,
      revision: existing.revision + 1,
    },
  });
}

export async function pauseAssistantScheduledTask(
  db: SupabaseServiceClient,
  input: { profileId: string; scheduledTaskId: string; expectedRevision: number },
): Promise<AssistantScheduledTask> {
  const existing = await requireAssistantScheduledTask(db, input);
  assertExpectedScheduledTaskRevision(existing, input.expectedRevision);
  if (existing.status === "deleted") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Assistant scheduled task ${existing.id} is deleted.`,
    );
  }
  await cancelPendingScheduledTaskExecutions(db, input);
  return updateScheduledTaskById(db, {
    ...input,
    label: "Pause assistant scheduled task",
    patch: {
      status: "paused",
      next_run_at: null,
      revision: existing.revision + 1,
    },
  });
}

export async function resumeAssistantScheduledTask(
  db: SupabaseServiceClient,
  input: { profileId: string; scheduledTaskId: string; expectedRevision: number },
): Promise<AssistantScheduledTask> {
  const existing = await requireAssistantScheduledTask(db, input);
  assertExpectedScheduledTaskRevision(existing, input.expectedRevision);
  if (existing.status === "deleted") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Assistant scheduled task ${existing.id} is deleted.`,
    );
  }
  await cancelPendingScheduledTaskExecutions(db, input);
  const task = await updateScheduledTaskById(db, {
    ...input,
    label: "Resume assistant scheduled task",
    patch: {
      status: "active",
      next_run_at: computeNextScheduledTaskRunAt(existing.schedule, new Date()),
      revision: existing.revision + 1,
    },
  });
  await enqueueAgentRunJobForScheduledTaskNextRun(db, task);
  return task;
}

export async function runAssistantScheduledTasksTick(
  db: SupabaseServiceClient,
  input: { profileId?: string; now?: Date; limit?: number } = {},
): Promise<ScheduledTaskTickResult> {
  const now = input.now ?? new Date();
  const materializationCutoff = new Date(
    now.getTime() + ASSISTANT_SCHEDULED_TASK_MATERIALIZATION_LEAD_MS,
  );
  const limit = input.limit ?? ASSISTANT_SCHEDULED_TASK_TICK_LIMIT;
  let query = db
    .from("assistant_scheduled_tasks")
    .select()
    .eq("status", "active")
    .lte("next_run_at", materializationCutoff.toISOString())
    .order("next_run_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (input.profileId) query = query.eq("profile_id", input.profileId);
  const dueResult = await query;
  const dueTasks = requireSupabaseRows(
    "List due assistant scheduled tasks",
    dueResult.data,
    dueResult.error,
  ).map(parseAssistantScheduledTaskRow);

  const out: ScheduledTaskTickResult = {
    processed: 0,
    enqueued: 0,
    joinedExisting: 0,
    advanced: 0,
    taskIds: [],
    jobIds: [],
  };

  for (const task of dueTasks) {
    if (!task.next_run_at) continue;
    const scheduledFireTime = task.next_run_at;
    const scheduledFireDate = assertValidDate(scheduledFireTime, "scheduledFireTime");
    const enqueueResult = await enqueueAgentRunJobForScheduledTask(db, task, scheduledFireTime);
    if (scheduledFireDate.getTime() <= now.getTime()) {
      const nextRunAt =
        task.schedule.kind === "at"
          ? null
          : computeNextScheduledTaskRunAt(task.schedule, new Date(scheduledFireTime));
      const advancedTask = await updateScheduledTaskById(db, {
        profileId: task.profile_id,
        scheduledTaskId: task.id,
        label: "Advance assistant scheduled task",
        patch: {
          status: task.schedule.kind === "at" ? "deleted" : "active",
          last_run_at: scheduledFireTime,
          next_run_at: nextRunAt,
        },
      });
      await enqueueAgentRunJobForScheduledTaskNextRun(db, advancedTask);
      out.advanced += 1;
    }
    out.processed += 1;
    out.taskIds.push(task.id);
    out.jobIds.push(enqueueResult.job.id);
    if (enqueueResult.joinedExistingJob) out.joinedExisting += 1;
    else out.enqueued += 1;
  }

  return out;
}
