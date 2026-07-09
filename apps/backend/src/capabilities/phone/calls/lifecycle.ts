import type {
  SupabaseServiceClient,
  TableInsert,
  TableRow,
  TableUpdate,
} from "@ai-assistants/control-db";
import { requireSupabaseData, requireSupabaseRows } from "@ai-assistants/control-db";

type PhoneCallEventKind =
  | "call.started"
  | "call.answered"
  | "call.speech"
  | "call.dtmf"
  | "call.silence"
  | "call.ended"
  | "call.error";

type TranscriptSpeaker = "assistant" | "callee" | "system";

export async function appendPhoneCallEvent(
  db: SupabaseServiceClient,
  input: {
    attempt: Pick<TableRow<"phone_call_attempts">, "id" | "profile_id" | "call_id" | "provider_call_sid">;
    eventKind: PhoneCallEventKind;
    dedupeKey: string;
    providerPayload?: TableInsert<"phone_call_events">["provider_payload"];
    turnIndex?: number | null;
    turnTokenHash?: string | null;
    occurredAt?: string;
  },
): Promise<TableRow<"phone_call_events">> {
  const insert = {
    profile_id: input.attempt.profile_id,
    phone_call_attempt_id: input.attempt.id,
    call_id: input.attempt.call_id,
    provider: "twilio-voice",
    provider_call_sid: input.attempt.provider_call_sid,
    event_kind: input.eventKind,
    dedupe_key: input.dedupeKey,
    turn_index: input.turnIndex ?? null,
    turn_token_hash: input.turnTokenHash ?? null,
    provider_payload: input.providerPayload ?? {},
    occurred_at: input.occurredAt ?? new Date().toISOString(),
  } satisfies TableInsert<"phone_call_events">;
  const result = await db
    .from("phone_call_events")
    .upsert(insert, { onConflict: "dedupe_key" })
    .select()
    .single();
  return requireSupabaseData("Append phone call event", result.data, result.error);
}

export async function appendPhoneCallTranscriptEntry(
  db: SupabaseServiceClient,
  input: {
    attempt: Pick<TableRow<"phone_call_attempts">, "id" | "profile_id" | "call_id">;
    speaker: TranscriptSpeaker;
    text: string;
    turnIndex: number;
    providerEventId?: string | null;
    occurredAt?: string;
  },
): Promise<TableRow<"phone_call_transcript_entries">> {
  const insert = {
    profile_id: input.attempt.profile_id,
    phone_call_attempt_id: input.attempt.id,
    call_id: input.attempt.call_id,
    provider_event_id: input.providerEventId ?? null,
    turn_index: input.turnIndex,
    speaker: input.speaker,
    text: input.text,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
  } satisfies TableInsert<"phone_call_transcript_entries">;
  const result = await db.from("phone_call_transcript_entries").insert(insert).select().single();
  return requireSupabaseData("Append phone call transcript entry", result.data, result.error);
}

export async function preparePhoneCallGatherTurn(
  db: SupabaseServiceClient,
  input: {
    attemptId: string;
    turnIndex: number;
    turnTokenHash: string;
  },
): Promise<TableRow<"phone_call_attempts">> {
  const update = {
    status: "in_progress",
    turn_index: input.turnIndex,
    current_turn_token_hash: input.turnTokenHash,
    answered_at: new Date().toISOString(),
    last_provider_event_at: new Date().toISOString(),
  } satisfies TableUpdate<"phone_call_attempts">;
  const result = await db
    .from("phone_call_attempts")
    .update(update)
    .eq("id", input.attemptId)
    .select()
    .single();
  return requireSupabaseData("Prepare phone call gather turn", result.data, result.error);
}

export async function terminalizePhoneCallFromGather(
  db: SupabaseServiceClient,
  input: {
    attemptId: string;
    providerCallSid: string | null;
    providerStatus: string;
    terminalReason: string;
    summary: string;
    durationSeconds?: number | null;
  },
): Promise<TableRow<"phone_call_attempts">> {
  const now = new Date().toISOString();
  const update = {
    status: "completed",
    provider_call_sid: input.providerCallSid,
    provider_status: input.providerStatus,
    provider_status_updated_at: now,
    ended_at: now,
    duration_seconds: input.durationSeconds ?? null,
    terminal_reason: input.terminalReason,
    summary: input.summary,
    current_turn_token_hash: null,
    last_provider_event_at: now,
    last_transcript_at: now,
    updated_at: now,
  } satisfies TableUpdate<"phone_call_attempts">;
  const result = await db
    .from("phone_call_attempts")
    .update(update)
    .eq("id", input.attemptId)
    .select()
    .single();
  return requireSupabaseData("Terminalize phone call from gather", result.data, result.error);
}

export async function terminalizeTimedOutPhoneCalls(
  db: SupabaseServiceClient,
  now = new Date(),
): Promise<{ terminalized: number; attemptIds: string[] }> {
  const result = await db
    .from("phone_call_attempts")
    .select(
      "id, profile_id, call_id, provider_call_sid, started_at, max_duration_seconds, hold_timeout_seconds, last_provider_event_at",
    )
    .in("status", ["starting", "in_progress"]);
  const rows = requireSupabaseRows("Load non-terminal phone calls for timeout reaper", result.data, result.error);
  const expired = rows.filter((row) => {
    const startedAt = row.started_at ? Date.parse(row.started_at) : NaN;
    if (!Number.isFinite(startedAt)) return false;
    const maxDurationMs = row.max_duration_seconds * 1_000;
    if (now.getTime() - startedAt > maxDurationMs) return true;
    const lastProviderAt = row.last_provider_event_at ? Date.parse(row.last_provider_event_at) : startedAt;
    return Number.isFinite(lastProviderAt) && now.getTime() - lastProviderAt > row.hold_timeout_seconds * 1_000;
  });
  for (const row of expired) {
    await appendPhoneCallEvent(db, {
      attempt: row,
      eventKind: "call.error",
      dedupeKey: `phone.call.timeout:${row.id}:${now.toISOString()}`,
      providerPayload: { reason: "timeout_reaper" },
    });
    await db
      .from("phone_call_attempts")
      .update({
        status: "failed",
        ended_at: now.toISOString(),
        terminal_reason: "timeout_reaper",
        failure_kind: "phone_call_timeout",
        failure_message: "Phone call timed out before a terminal provider callback.",
        updated_at: now.toISOString(),
      } satisfies TableUpdate<"phone_call_attempts">)
      .eq("id", row.id);
  }
  return { terminalized: expired.length, attemptIds: expired.map((row) => row.id) };
}
