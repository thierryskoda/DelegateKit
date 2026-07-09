import { createHash } from "node:crypto";
import type {
  SupabaseServiceClient,
  TableInsert,
  TableRow,
  TableUpdate,
} from "@ai-assistants/control-db";
import { requireSupabaseData, requireSupabaseRows } from "@ai-assistants/control-db";
import {
  phoneCallAttemptSchema,
  phoneCallBriefSchema,
  type PhoneCallAttempt,
  type PhoneCallAttemptStatus,
  type PhoneCallBrief,
} from "@ai-assistants/phone-contracts/schemas";
import { requireCarrierReachablePublicUrl } from "../shared/twilio-auth";

export type PhoneCallProviderSync = {
  providerCallSid: string;
  providerParentCallSid?: string | null;
  providerStatus: string;
  status: PhoneCallAttemptStatus;
  endedAt?: string | null;
  durationSeconds?: number | null;
  terminalReason?: string | null;
  summary?: string | null;
  failureKind?: string | null;
  failureMessage?: string | null;
};

function phoneCallsTable(db: SupabaseServiceClient) {
  return db.from("phone_call_attempts");
}

export function phoneCallReadiness(
  env: NodeJS.ProcessEnv,
  input?: { mode?: "live" | "sandbox" },
) {
  if (input?.mode === "sandbox") {
    return {
      ready: true,
      provider: "twilio-voice" as const,
      mode: "mock" as const,
      blockers: [],
    };
  }
  const blockers: string[] = [];
  if (!env.TWILIO_ACCOUNT_SID) {
    blockers.push("TWILIO_ACCOUNT_SID is required for the configured Twilio Voice provider.");
  }
  if (!env.TWILIO_AUTH_TOKEN) {
    blockers.push("TWILIO_AUTH_TOKEN is required for the configured Twilio Voice provider.");
  }
  if (!env.TWILIO_FROM_NUMBER) {
    blockers.push("TWILIO_FROM_NUMBER is required for phone caller id.");
  }
  if (!env.BACKEND_PUBLIC_URL) {
    blockers.push("BACKEND_PUBLIC_URL is required for Twilio Voice webhooks.");
  } else {
    try {
      requireCarrierReachablePublicUrl(env.BACKEND_PUBLIC_URL);
    } catch (error) {
      blockers.push(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    ready: blockers.length === 0,
    provider: "twilio-voice" as const,
    mode: blockers.length === 0 ? ("live" as const) : ("unavailable" as const),
    blockers,
  };
}

export function callBriefHash(callBrief: PhoneCallBrief): string {
  const parsed = phoneCallBriefSchema.parse(callBrief);
  return createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
}

function requireRecord(row: unknown, label: string): Record<string, unknown> {
  if (row && typeof row === "object" && !Array.isArray(row)) return row as Record<string, unknown>;
  throw new Error(`${label} must be a database row object.`);
}

function rowToAttempt(row: unknown): PhoneCallAttempt {
  const record = requireRecord(row, "Phone call attempt");
  return phoneCallAttemptSchema.parse({
    attemptId: record.id,
    provider: record.provider,
    callId: record.call_id,
    providerCallSid: record.provider_call_sid,
    providerParentCallSid: record.provider_parent_call_sid,
    providerStatus: record.provider_status,
    providerStatusUpdatedAt: record.provider_status_updated_at,
    status: record.status,
    toPhoneE164: record.to_phone_e164,
    country: record.country,
    purpose: record.purpose,
    verifiedPhoneSourceUrl: record.verified_phone_source_url,
    startedAt: record.started_at,
    endedAt: record.ended_at,
    durationSeconds: record.duration_seconds,
    terminalReason: record.terminal_reason,
    summary: record.summary,
    failureKind: record.failure_kind,
    failureMessage: record.failure_message,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  });
}

export async function createStartingPhoneCallAttempt(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  callBrief: PhoneCallBrief,
): Promise<PhoneCallAttempt> {
  const parsed = phoneCallBriefSchema.parse(callBrief);
  const now = new Date().toISOString();
  const insert = {
    profile_id: action.profile_id,
    profile_action_id: action.id,
    status: "starting",
    provider: "twilio-voice",
    call_id: `call-${action.id}`,
    provider_call_sid: null,
    provider_parent_call_sid: null,
    provider_status: "starting",
    provider_status_updated_at: now,
    to_phone_e164: parsed.toPhoneE164,
    country: parsed.country,
    purpose: parsed.purpose,
    opening_line: parsed.openingLine,
    verified_phone_source_url: parsed.verifiedPhoneSourceUrl,
    call_brief_hash: callBriefHash(parsed),
    max_duration_seconds: parsed.maxDurationSeconds,
    hold_timeout_seconds: parsed.holdTimeoutSeconds,
    started_at: now,
    ended_at: null,
    duration_seconds: null,
    terminal_reason: null,
    summary: null,
    failure_kind: null,
    failure_message: null,
  } satisfies TableInsert<"phone_call_attempts">;
  const result = await phoneCallsTable(db)
    .upsert(insert, { onConflict: "profile_action_id" })
    .select()
    .single();
  return rowToAttempt(
    requireSupabaseData("Create phone call attempt", result.data, result.error),
  );
}

export async function markPhoneCallAttemptStarted(
  db: SupabaseServiceClient,
  input: {
    attemptId: string;
    providerCallSid: string;
    providerParentCallSid?: string | null;
    providerStatus?: string | null;
    status?: PhoneCallAttemptStatus;
  },
): Promise<PhoneCallAttempt> {
  const now = new Date().toISOString();
  const update = {
    status: input.status ?? "in_progress",
    provider_call_sid: input.providerCallSid,
    provider_parent_call_sid: input.providerParentCallSid ?? null,
    provider_status: input.providerStatus ?? input.status ?? "in_progress",
    provider_status_updated_at: now,
    failure_kind: null,
    failure_message: null,
    updated_at: now,
  } satisfies TableUpdate<"phone_call_attempts">;
  const result = await phoneCallsTable(db)
    .update(update)
    .eq("id", input.attemptId)
    .select()
    .single();
  return rowToAttempt(
    requireSupabaseData("Mark phone call attempt started", result.data, result.error),
  );
}

export async function markPhoneCallAttemptFailed(
  db: SupabaseServiceClient,
  input: { attemptId: string; failureKind: string; failureMessage: string },
): Promise<PhoneCallAttempt> {
  const now = new Date().toISOString();
  const update = {
    status: "failed",
    ended_at: now,
    terminal_reason: "provider_start_failed",
    provider_status: "start_failed",
    provider_status_updated_at: now,
    failure_kind: input.failureKind,
    failure_message: input.failureMessage,
    updated_at: now,
  } satisfies TableUpdate<"phone_call_attempts">;
  const result = await phoneCallsTable(db)
    .update(update)
    .eq("id", input.attemptId)
    .select()
    .single();
  return rowToAttempt(
    requireSupabaseData("Mark phone call attempt failed", result.data, result.error),
  );
}

export async function updatePhoneCallAttemptFromProvider(
  db: SupabaseServiceClient,
  input: { attemptId: string; sync: PhoneCallProviderSync },
): Promise<PhoneCallAttempt> {
  const now = new Date().toISOString();
  const update = {
    status: input.sync.status,
    provider_call_sid: input.sync.providerCallSid,
    provider_parent_call_sid: input.sync.providerParentCallSid ?? null,
    provider_status: input.sync.providerStatus,
    provider_status_updated_at: now,
    ended_at: input.sync.endedAt ?? null,
    duration_seconds: input.sync.durationSeconds ?? null,
    terminal_reason: input.sync.terminalReason ?? null,
    summary: input.sync.summary ?? null,
    failure_kind: input.sync.failureKind ?? null,
    failure_message: input.sync.failureMessage ?? null,
    updated_at: now,
  } satisfies TableUpdate<"phone_call_attempts">;
  const result = await phoneCallsTable(db)
    .update(update)
    .eq("id", input.attemptId)
    .select()
    .single();
  return rowToAttempt(
    requireSupabaseData("Update phone call attempt from provider", result.data, result.error),
  );
}

export async function requirePhoneCallAttempt(
  db: SupabaseServiceClient,
  profileId: string,
  attemptId: string,
): Promise<PhoneCallAttempt> {
  const result = await phoneCallsTable(db)
    .select()
    .eq("profile_id", profileId)
    .eq("id", attemptId)
    .maybeSingle();
  return rowToAttempt(
    requireSupabaseData(`Load phone call attempt ${attemptId}`, result.data, result.error),
  );
}

export async function requirePhoneCallAttemptForAction(
  db: SupabaseServiceClient,
  profileId: string,
  actionId: string,
): Promise<PhoneCallAttempt> {
  const result = await phoneCallsTable(db)
    .select()
    .eq("profile_id", profileId)
    .eq("profile_action_id", actionId)
    .maybeSingle();
  return rowToAttempt(
    requireSupabaseData(
      `Load phone call attempt for action ${actionId}`,
      result.data,
      result.error,
    ),
  );
}

export async function listPhoneCallAttempts(
  db: SupabaseServiceClient,
  profileId: string,
  input: { limit: number; status?: PhoneCallAttemptStatus },
): Promise<PhoneCallAttempt[]> {
  let query = phoneCallsTable(db)
    .select()
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (input.status) query = query.eq("status", input.status);
  const result = await query;
  return requireSupabaseRows("List phone call attempts", result.data, result.error).map((row) =>
    rowToAttempt(row),
  );
}

export function phoneCallInitialMessage(callBrief: PhoneCallBrief): string {
  const parsed = phoneCallBriefSchema.parse(callBrief);
  return parsed.openingLine;
}
