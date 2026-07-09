import { createHash } from "node:crypto";
import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableInsert,
  type TableRow,
  type TableUpdate,
} from "@ai-assistants/control-db";
import {
  phoneSmsAttemptSchema,
  phoneSmsSendInputSchema,
  type PhoneSmsAttempt,
  type PhoneSmsAttemptStatus,
  type PhoneSmsSendInput,
} from "@ai-assistants/phone-contracts/schemas";
import { backendApiEnv } from "../../../shared/env";

export type PhoneSmsProviderSync = {
  providerMessageSid: string;
  providerStatus: string;
  status: PhoneSmsAttemptStatus;
  deliveredAt?: string | null;
  failureKind?: string | null;
  failureMessage?: string | null;
};

function phoneSmsTable(db: SupabaseServiceClient) {
  return db.from("phone_sms_attempts");
}

export function smsBodyHash(body: string): string {
  return createHash("sha256").update(body.trim()).digest("hex");
}

function smsBodyPreview(body: string): string {
  return body.trim().replaceAll(/\s+/g, " ").slice(0, 160);
}

function requireRecord(row: unknown, label: string): Record<string, unknown> {
  if (row && typeof row === "object" && !Array.isArray(row)) return row as Record<string, unknown>;
  throw new Error(`${label} must be a database row object.`);
}

function rowToSmsAttempt(row: unknown): PhoneSmsAttempt {
  const record = requireRecord(row, "SMS attempt");
  return phoneSmsAttemptSchema.parse({
    attemptId: record.id,
    provider: record.provider,
    providerMessageSid: record.provider_message_sid,
    providerStatus: record.provider_status,
    providerStatusUpdatedAt: record.provider_status_updated_at,
    status: record.status,
    toPhoneE164: record.to_phone_e164,
    fromPhoneE164: record.from_phone_e164,
    country: record.country,
    purpose: record.purpose,
    bodyPreview: record.body_preview,
    destinationEvidenceKind: record.destination_evidence_kind,
    verifiedPhoneSourceUrl: record.verified_phone_source_url,
    verifiedPhoneSourceLabel: record.verified_phone_source_label,
    replyToMessageSid: record.reply_to_message_sid,
    relatedCallAttemptId: record.related_call_attempt_id,
    sentAt: record.sent_at,
    deliveredAt: record.delivered_at,
    failureKind: record.failure_kind,
    failureMessage: record.failure_message,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  });
}

export function phoneSmsAttemptDto(row: PhoneSmsAttempt): PhoneSmsAttempt {
  return phoneSmsAttemptSchema.parse(row);
}

export async function createQueuedPhoneSmsAttempt(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  input: PhoneSmsSendInput,
): Promise<PhoneSmsAttempt> {
  const parsed = phoneSmsSendInputSchema.parse(input);
  const now = new Date().toISOString();
  const evidence = parsed.destinationEvidence;
  const publicSource = evidence.kind === "public_phone_source" ? evidence : null;
  const priorInbound = evidence.kind === "prior_inbound_sms" ? evidence : null;
  const insert = {
    profile_id: action.profile_id,
    profile_action_id: action.id,
    status: "queued",
    provider: "twilio-messaging",
    provider_message_sid: null,
    provider_status: "queued",
    provider_status_updated_at: now,
    to_phone_e164: parsed.toPhoneE164,
    from_phone_e164: backendApiEnv().twilioFromNumber,
    country: parsed.country,
    purpose: parsed.purpose,
    body_hash: smsBodyHash(parsed.body),
    body_preview: smsBodyPreview(parsed.body),
    destination_evidence_kind: evidence.kind,
    destination_evidence: requireJsonObject(evidence, "phoneSms.destinationEvidence"),
    verified_phone_source_url: publicSource?.url ?? null,
    verified_phone_source_label: publicSource?.label ?? null,
    reply_to_message_sid: priorInbound?.inboundMessageSid ?? null,
    related_call_attempt_id: parsed.relatedCallAttemptId ?? null,
    sent_at: null,
    delivered_at: null,
    failure_kind: null,
    failure_message: null,
  } satisfies TableInsert<"phone_sms_attempts">;
  const result = await phoneSmsTable(db)
    .upsert(insert, { onConflict: "profile_action_id" })
    .select()
    .single();
  return rowToSmsAttempt(
    requireSupabaseData("Create SMS attempt", result.data, result.error),
  );
}

export async function markPhoneSmsAttemptSent(
  db: SupabaseServiceClient,
  input: {
    attemptId: string;
    providerMessageSid: string;
    providerStatus?: string | null;
    status?: PhoneSmsAttemptStatus;
    fromPhoneE164?: string | null;
  },
): Promise<PhoneSmsAttempt> {
  const now = new Date().toISOString();
  const update = {
    status: input.status ?? "sent",
    provider_message_sid: input.providerMessageSid,
    provider_status: input.providerStatus ?? input.status ?? "sent",
    provider_status_updated_at: now,
    from_phone_e164: input.fromPhoneE164 ?? backendApiEnv().twilioFromNumber,
    sent_at: now,
    failure_kind: null,
    failure_message: null,
    updated_at: now,
  } satisfies TableUpdate<"phone_sms_attempts">;
  const result = await phoneSmsTable(db)
    .update(update)
    .eq("id", input.attemptId)
    .select()
    .single();
  return rowToSmsAttempt(requireSupabaseData("Mark SMS sent", result.data, result.error));
}

export async function markPhoneSmsAttemptFailed(
  db: SupabaseServiceClient,
  input: { attemptId: string; failureKind: string; failureMessage: string },
): Promise<PhoneSmsAttempt> {
  const now = new Date().toISOString();
  const update = {
    status: "failed",
    provider_status: "send_failed",
    provider_status_updated_at: now,
    failure_kind: input.failureKind,
    failure_message: input.failureMessage,
    updated_at: now,
  } satisfies TableUpdate<"phone_sms_attempts">;
  const result = await phoneSmsTable(db)
    .update(update)
    .eq("id", input.attemptId)
    .select()
    .single();
  return rowToSmsAttempt(
    requireSupabaseData("Mark SMS failed", result.data, result.error),
  );
}

export async function updatePhoneSmsAttemptFromProvider(
  db: SupabaseServiceClient,
  input: { attemptId: string; sync: PhoneSmsProviderSync },
): Promise<PhoneSmsAttempt> {
  const now = new Date().toISOString();
  const update = {
    status: input.sync.status,
    provider_message_sid: input.sync.providerMessageSid,
    provider_status: input.sync.providerStatus,
    provider_status_updated_at: now,
    delivered_at: input.sync.deliveredAt ?? null,
    failure_kind: input.sync.failureKind ?? null,
    failure_message: input.sync.failureMessage ?? null,
    updated_at: now,
  } satisfies TableUpdate<"phone_sms_attempts">;
  const result = await phoneSmsTable(db)
    .update(update)
    .eq("id", input.attemptId)
    .select()
    .single();
  return rowToSmsAttempt(
    requireSupabaseData("Update SMS from provider", result.data, result.error),
  );
}

export async function requirePhoneSmsAttempt(
  db: SupabaseServiceClient,
  profileId: string,
  attemptId: string,
): Promise<PhoneSmsAttempt> {
  const result = await phoneSmsTable(db)
    .select()
    .eq("profile_id", profileId)
    .eq("id", attemptId)
    .maybeSingle();
  return rowToSmsAttempt(
    requireSupabaseData(`Load SMS attempt ${attemptId}`, result.data, result.error),
  );
}

export async function requirePhoneSmsAttemptForAction(
  db: SupabaseServiceClient,
  profileId: string,
  actionId: string,
): Promise<PhoneSmsAttempt> {
  const result = await phoneSmsTable(db)
    .select()
    .eq("profile_id", profileId)
    .eq("profile_action_id", actionId)
    .maybeSingle();
  return rowToSmsAttempt(
    requireSupabaseData(
      `Load SMS attempt for action ${actionId}`,
      result.data,
      result.error,
    ),
  );
}

export async function listPhoneSmsAttempts(
  db: SupabaseServiceClient,
  profileId: string,
  input: { limit: number; status?: PhoneSmsAttemptStatus },
): Promise<PhoneSmsAttempt[]> {
  let query = phoneSmsTable(db)
    .select()
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (input.status) query = query.eq("status", input.status);
  const result = await query;
  return requireSupabaseRows("List SMS attempts", result.data, result.error).map((row) =>
    rowToSmsAttempt(row),
  );
}
