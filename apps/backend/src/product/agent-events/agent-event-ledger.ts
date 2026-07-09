import {
  requireJsonObject,
  requireSupabaseData,
  throwSupabaseError,
  type PostgrestError,
  type SupabaseServiceClient,
  type TableInsert,
  type TableRow,
  type TableUpdate,
} from "@ai-assistants/control-db";
import {
  agentEventPayloadSchema,
  agentEventSourceSchema,
  agentEventVisibilitySchema,
  agentRunStatusSchema,
  type AgentEventPayload,
  type Json,
} from "@ai-assistants/control-plane-contracts";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";

type AgentEvent = TableRow<"agent_events">;
type AgentEventInsert = TableInsert<"agent_events">;
type AgentEventUpdate = TableUpdate<"agent_events">;
type AgentRun = TableRow<"agent_runs">;
type AgentRunInsert = TableInsert<"agent_runs">;
type AgentRunUpdate = TableUpdate<"agent_runs">;

export type RecordAgentEventInput = {
  profileId: string;
  agentRunId?: string | null;
  eventType: AgentEventPayload["eventType"];
  source: string;
  sourceEventKey?: string | null;
  occurredAt?: string | undefined;
  visibility: string;
  payload: AgentEventPayload;
};

export type UpsertAgentRunInput = {
  id?: string | undefined;
  profileId: string;
  agentId?: string | null | undefined;
  sessionKey?: string | null | undefined;
  sessionId?: string | null | undefined;
  runtimeRunId?: string | null | undefined;
  status?: string | undefined;
  startedAt?: string | undefined;
  endedAt?: string | null | undefined;
  failure?: Record<string, unknown> | null | undefined;
};

function isUniqueViolation(error: PostgrestError | null): boolean {
  return error?.code === "23505";
}

function trimmedNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function loadExistingEventBySourceKey(
  db: SupabaseServiceClient,
  sourceEventKey: string,
): Promise<AgentEvent> {
  const result = await db
    .from("agent_events")
    .select()
    .eq("source_event_key", sourceEventKey)
    .single();
  return requireSupabaseData("Load existing agent event", result.data, result.error);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertExistingEventMatchesInsert(existing: AgentEvent, insert: AgentEventInsert): void {
  const mismatches = [
    existing.profile_id === insert.profile_id ? null : "profile_id",
    existing.event_type === insert.event_type ? null : "event_type",
    existing.source === insert.source ? null : "source",
    existing.visibility === insert.visibility ? null : "visibility",
    canonicalJson(existing.payload) === canonicalJson(insert.payload) ? null : "payload",
  ].filter((field): field is string => field !== null);
  if (mismatches.length === 0) return;

  throw new Error(
    `agent_events.source_event_key collision for ${insert.source_event_key}; mismatched ${mismatches.join(
      ", ",
    )}.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonRecord(value: unknown): Record<string, Json> | undefined {
  return isRecord(value) ? (value as Record<string, Json>) : undefined;
}

function mergeJsonObjects(
  existing: Record<string, Json> | undefined,
  incoming: Record<string, Json> | undefined,
): Record<string, Json> | undefined {
  if (!existing && !incoming) return undefined;
  if (!existing) return incoming;
  if (!incoming) return existing;
  return { ...existing, ...incoming };
}

function mergeToolEventPayloads(
  existingPayload: AgentEvent["payload"],
  incomingPayload: AgentEventPayload,
): AgentEventPayload | null {
  const existing = agentEventPayloadSchema.parse(existingPayload);
  if (
    existing.eventType !== incomingPayload.eventType ||
    (existing.eventType !== "assistant.tool.call" &&
      existing.eventType !== "assistant.tool.result") ||
    (incomingPayload.eventType !== "assistant.tool.call" &&
      incomingPayload.eventType !== "assistant.tool.result")
  ) {
    return null;
  }
  if (
    existing.toolName !== incomingPayload.toolName ||
    existing.toolCallId !== incomingPayload.toolCallId
  ) {
    return null;
  }

  if (existing.eventType === "assistant.tool.call" && incomingPayload.eventType === "assistant.tool.call") {
    const provenance = mergeJsonObjects(
      jsonRecord(existing.provenance),
      jsonRecord(incomingPayload.provenance),
    );
    return {
      eventType: "assistant.tool.call",
      toolName: existing.toolName,
      toolCallId: existing.toolCallId,
      requestId: existing.requestId ?? incomingPayload.requestId ?? null,
      input: Object.keys(existing.input).length > 0 ? existing.input : incomingPayload.input,
      sessionKey: existing.sessionKey ?? incomingPayload.sessionKey,
      ...(provenance ? { provenance } : {}),
    };
  }

  if (existing.eventType === "assistant.tool.result" && incomingPayload.eventType === "assistant.tool.result") {
    const incomingHasBackendProvenance =
      isRecord(incomingPayload.provenance) && incomingPayload.provenance.observer === "backend_proxy";
    const existingHasBackendProvenance =
      isRecord(existing.provenance) && existing.provenance.observer === "backend_proxy";
    const preferred = incomingHasBackendProvenance && !existingHasBackendProvenance ? incomingPayload : existing;
    const fallback = preferred === existing ? incomingPayload : existing;
    const provenance = mergeJsonObjects(
      jsonRecord(existing.provenance),
      jsonRecord(incomingPayload.provenance),
    );
    return {
      eventType: "assistant.tool.result",
      toolName: existing.toolName,
      toolCallId: existing.toolCallId,
      status: preferred.status === "unknown" ? fallback.status : preferred.status,
      requestId: preferred.requestId ?? fallback.requestId ?? null,
      output: preferred.output ?? fallback.output,
      error: preferred.error ?? fallback.error,
      sessionKey: existing.sessionKey ?? incomingPayload.sessionKey,
      ...(provenance ? { provenance } : {}),
    };
  }

  return null;
}

async function mergeExistingToolEvent(
  db: SupabaseServiceClient,
  existing: AgentEvent,
  insert: AgentEventInsert,
): Promise<AgentEvent | null> {
  const mismatches = [
    existing.profile_id === insert.profile_id ? null : "profile_id",
    existing.event_type === insert.event_type ? null : "event_type",
    existing.source === insert.source ? null : "source",
    existing.visibility === insert.visibility ? null : "visibility",
  ].filter((field): field is string => field !== null);
  if (mismatches.length > 0) return null;

  const mergedPayload = mergeToolEventPayloads(existing.payload, insert.payload as AgentEventPayload);
  if (!mergedPayload) return null;
  const update = {
    payload: requireJsonObject(mergedPayload, "agentEvent.payload"),
    ...(existing.agent_run_id === null && insert.agent_run_id ? { agent_run_id: insert.agent_run_id } : {}),
  } satisfies AgentEventUpdate;
  const result = await db.from("agent_events").update(update).eq("id", existing.id).select().single();
  return requireSupabaseData("Merge existing tool agent event", result.data, result.error);
}

export async function recordAgentEvent(
  db: SupabaseServiceClient,
  input: RecordAgentEventInput,
): Promise<{ event: AgentEvent; created: boolean }> {
  const payload = agentEventPayloadSchema.parse(input.payload);
  if (payload.eventType !== input.eventType) {
    throw new Error(
      `Agent event payload type ${payload.eventType} does not match ${input.eventType}.`,
    );
  }
  if (payload.eventType === "assistant.reasoning" && input.visibility !== "internal_sensitive") {
    throw new Error("assistant.reasoning events must be recorded as internal_sensitive.");
  }

  const insert = {
    profile_id: input.profileId,
    agent_run_id: input.agentRunId ?? null,
    event_type: input.eventType,
    source: agentEventSourceSchema.parse(input.source),
    source_event_key: trimmedNullable(input.sourceEventKey),
    visibility: agentEventVisibilitySchema.parse(input.visibility),
    payload: requireJsonObject(payload, "agentEvent.payload"),
    ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
  } satisfies AgentEventInsert;

  const result = await db.from("agent_events").insert(insert).select().single();
  if (isUniqueViolation(result.error) && insert.source_event_key) {
    const existing = await loadExistingEventBySourceKey(db, insert.source_event_key);
    const merged = await mergeExistingToolEvent(db, existing, insert);
    if (merged) {
      return {
        event: merged,
        created: false,
      };
    }
    assertExistingEventMatchesInsert(existing, insert);
    return {
      event: existing,
      created: false,
    };
  }
  const event = requireSupabaseData("Insert agent event", result.data, result.error);
  emitDiagnostic(backendDiagnosticLogger(), "agent_event.recorded", {
    ok: true,
    profile_id: event.profile_id,
    attrs: {
      agent_event_id: event.id,
      event_type: event.event_type,
      source: event.source,
      source_event_key: event.source_event_key,
    },
  });
  return { event, created: true };
}

export async function recordAgentEventSafe(
  db: SupabaseServiceClient,
  input: RecordAgentEventInput,
): Promise<void> {
  try {
    await recordAgentEvent(db, input);
  } catch (error) {
    emitDiagnostic(backendDiagnosticLogger(), "agent_event.record_failed", {
      ok: false,
      level: "warn",
      profile_id: input.profileId,
      err: error,
      attrs: {
        event_type: input.eventType,
        source: input.source,
        source_event_key: input.sourceEventKey ?? null,
      },
    });
  }
}

export async function upsertAgentRun(
  db: SupabaseServiceClient,
  input: UpsertAgentRunInput,
): Promise<AgentRun> {
  const failure = input.failure === undefined ? undefined : input.failure;
  const insert = {
    ...(input.id ? { id: input.id } : {}),
    profile_id: input.profileId,
    agent_id: trimmedNullable(input.agentId),
    session_key: trimmedNullable(input.sessionKey),
    session_id: trimmedNullable(input.sessionId),
    runtime_run_id: trimmedNullable(input.runtimeRunId),
    status: agentRunStatusSchema.parse(input.status ?? "running"),
    ...(input.startedAt ? { started_at: input.startedAt } : {}),
    ...(input.endedAt !== undefined ? { ended_at: input.endedAt } : {}),
    ...(failure !== undefined
      ? { failure: failure === null ? null : requireJsonObject(failure, "agentRun.failure") }
      : {}),
  } satisfies AgentRunInsert;

  if (insert.runtime_run_id) {
    const existingResult = await db
      .from("agent_runs")
      .select("id")
      .eq("runtime_run_id", insert.runtime_run_id)
      .maybeSingle();
    if (existingResult.error) {
      throwSupabaseError("Load agent run by runtime_run_id", existingResult.error);
    }
    if (existingResult.data) {
      const update = {
        profile_id: insert.profile_id,
        agent_id: insert.agent_id,
        session_key: insert.session_key,
        session_id: insert.session_id,
        runtime_run_id: insert.runtime_run_id,
        status: insert.status,
        ...(insert.started_at ? { started_at: insert.started_at } : {}),
        ...(insert.ended_at !== undefined ? { ended_at: insert.ended_at } : {}),
        ...(insert.failure !== undefined ? { failure: insert.failure } : {}),
      } satisfies AgentRunUpdate;
      const updated = await db
        .from("agent_runs")
        .update(update)
        .eq("id", existingResult.data.id)
        .select()
        .single();
      return requireSupabaseData("Update agent run", updated.data, updated.error);
    }
  }

  const result = input.id
    ? await db.from("agent_runs").upsert(insert, { onConflict: "id" }).select().single()
    : await db.from("agent_runs").insert(insert).select().single();
  return requireSupabaseData("Insert agent run", result.data, result.error);
}
