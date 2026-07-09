import { phoneToolContracts } from "@ai-assistants/phone-contracts/contracts";
import {
  phoneCallAttemptSchema,
  phoneCallListInputSchema,
  phoneCallListOutputSchema,
  phoneCallReadinessOutputSchema,
  phoneCallStatusInputSchema,
  phoneCallStatusOutputSchema,
  phoneSmsListInputSchema,
  phoneSmsListOutputSchema,
  phoneSmsReadinessOutputSchema,
  phoneSmsStatusInputSchema,
  phoneSmsStatusOutputSchema,
  type PhoneCallAttempt,
  type PhoneSmsAttempt,
} from "@ai-assistants/phone-contracts/schemas";
import {
  toolContractByName,
  toolDataForContract,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import {
  backendImmediateHandlersFromDispatch,
  defineBackendCapabilityModule,
} from "../registry/backend-capability-module";
import { phoneExternalWriteActionContracts } from "./external-write-contracts";
import type { ExecutorContext } from "../../runtime/agent-tools/executor/context";
import {
  listPhoneCallAttempts,
  phoneCallReadiness,
  requirePhoneCallAttempt,
  requirePhoneCallAttemptForAction,
  updatePhoneCallAttemptFromProvider,
  type PhoneCallProviderSync,
} from "./calls/store";
import {
  listPhoneSmsAttempts,
  phoneSmsAttemptDto,
  requirePhoneSmsAttempt,
  requirePhoneSmsAttemptForAction,
  updatePhoneSmsAttemptFromProvider,
  type PhoneSmsProviderSync,
} from "./sms/store";
import {
  providerRuntimeModeForCapabilityLink,
  requireBackendSecretProviderCapabilityAccount,
  requireEnabledCapabilityAccountLink,
} from "../../integrations/provider-runtime";
import { backendApiEnv } from "../../shared/env";
import twilio from "twilio";

const terminalPhoneCallStatuses = new Set<PhoneCallAttempt["status"]>([
  "completed",
  "no_answer",
  "failed",
]);
const terminalPhoneSmsStatuses = new Set<PhoneSmsAttempt["status"]>([
  "delivered",
  "undelivered",
  "failed",
]);
const twilioVoiceProviderKey = "twilio-voice";
const twilioMessagingProviderKey = "twilio-messaging";

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function productStatusFromProvider(providerStatus: string): PhoneCallAttempt["status"] {
  const normalized = providerStatus.toLowerCase().replaceAll(/[\s_-]+/g, "-");
  if (["completed", "complete", "succeeded", "success", "ended", "done"].includes(normalized)) {
    return "completed";
  }
  if (["no-answer", "busy", "missed", "unanswered"].includes(normalized)) return "no_answer";
  if (["failed", "error", "errored", "canceled", "cancelled"].includes(normalized)) {
    return "failed";
  }
  if (
    [
      "queued",
      "starting",
      "ringing",
      "initiated",
      "in-progress",
      "active",
      "answered",
      "found",
    ].includes(normalized)
  ) {
    return "in_progress";
  }
  return "unknown";
}

function providerSyncFromVoiceCall(input: {
  attempt: PhoneCallAttempt;
  providerStatus: string;
  providerCallSid: string;
  durationSeconds?: number | null;
}): PhoneCallProviderSync {
  const status = productStatusFromProvider(input.providerStatus);
  const endedAt = terminalPhoneCallStatuses.has(status) ? new Date().toISOString() : null;
  return {
    providerCallSid: input.providerCallSid,
    providerParentCallSid: input.attempt.providerParentCallSid,
    providerStatus: input.providerStatus,
    status,
    endedAt,
    durationSeconds: input.durationSeconds ?? input.attempt.durationSeconds,
    terminalReason: endedAt ? input.providerStatus : input.attempt.terminalReason,
    summary: input.attempt.summary,
    failureKind: status === "failed" ? "provider_call_failed" : input.attempt.failureKind,
    failureMessage:
      status === "failed"
        ? `Voice provider reported status ${input.providerStatus}.`
        : input.attempt.failureMessage,
  };
}

function requireTwilioVoiceConfig(): { accountSid: string; authToken: string } {
  const env = backendApiEnv();
  return { accountSid: env.twilioAccountSid, authToken: env.twilioAuthToken };
}

function productStatusFromTwilioMessageStatus(providerStatus: string): PhoneSmsAttempt["status"] {
  const normalized = providerStatus.toLowerCase().replaceAll(/[\s_-]+/g, "-");
  if (["queued", "accepted", "scheduled"].includes(normalized)) return "queued";
  if (["sending", "sent"].includes(normalized)) return "sent";
  if (normalized === "delivered") return "delivered";
  if (normalized === "undelivered") return "undelivered";
  if (["failed", "canceled", "cancelled"].includes(normalized)) return "failed";
  return "unknown";
}

function requireTwilioMessagingConfig(): { accountSid: string; authToken: string } {
  const env = backendApiEnv();
  return { accountSid: env.twilioAccountSid, authToken: env.twilioAuthToken };
}

function phoneProviderEnv(): NodeJS.ProcessEnv {
  const env = backendApiEnv();
  return {
    TWILIO_ACCOUNT_SID: env.twilioAccountSid,
    TWILIO_AUTH_TOKEN: env.twilioAuthToken,
    TWILIO_FROM_NUMBER: env.twilioFromNumber,
    BACKEND_PUBLIC_URL: env.backendPublicUrl,
  };
}

function providerSyncFromTwilioMessage(input: {
  attempt: PhoneSmsAttempt;
  providerMessageSid: string;
  providerStatus: string;
}): PhoneSmsProviderSync {
  const status = productStatusFromTwilioMessageStatus(input.providerStatus);
  return {
    providerMessageSid: input.providerMessageSid,
    providerStatus: input.providerStatus,
    status,
    deliveredAt:
      status === "delivered"
        ? (input.attempt.deliveredAt ?? new Date().toISOString())
        : input.attempt.deliveredAt,
    failureKind:
      status === "failed" || status === "undelivered"
        ? `provider_sms_${status}`
        : input.attempt.failureKind,
    failureMessage:
      status === "failed" || status === "undelivered"
        ? `Twilio reported message status ${input.providerStatus}.`
        : input.attempt.failureMessage,
  };
}

async function maybeSyncPhoneCallAttempt(
  ctx: ExecutorContext,
  attempt: PhoneCallAttempt,
): Promise<PhoneCallAttempt> {
  if (terminalPhoneCallStatuses.has(attempt.status)) return attempt;
  if (!attempt.providerCallSid) return attempt;
  const providerCallSid = attempt.providerCallSid;
  const config = requireTwilioVoiceConfig();
  const client = twilio(config.accountSid, config.authToken);
  const call = await client.calls(providerCallSid).fetch();
  const providerStatus = firstString(call.status, attempt.providerStatus) ?? "unknown";
  return updatePhoneCallAttemptFromProvider(ctx.db, {
    attemptId: attempt.attemptId,
    sync: providerSyncFromVoiceCall({
      attempt,
      providerCallSid,
      providerStatus,
      durationSeconds:
        typeof call.duration === "string" && call.duration.trim()
          ? Number.parseInt(call.duration, 10)
          : null,
    }),
  });
}

async function maybeSyncPhoneSmsAttempt(
  ctx: ExecutorContext,
  attempt: PhoneSmsAttempt,
): Promise<PhoneSmsAttempt> {
  if (terminalPhoneSmsStatuses.has(attempt.status)) return attempt;
  if (!attempt.providerMessageSid) return attempt;
  const link = await requireEnabledCapabilityAccountLink(ctx.db, {
    profileId: ctx.profile.id,
    capabilitySlugs: ["phone"],
    providers: ["twilio-messaging"],
  });
  if (providerRuntimeModeForCapabilityLink(link) === "sandbox") return attempt;
  const config = requireTwilioMessagingConfig();
  const client = twilio(config.accountSid, config.authToken);
  const message = await client.messages(attempt.providerMessageSid).fetch();
  const providerStatus = firstString(message.status, attempt.providerStatus) ?? "unknown";
  return updatePhoneSmsAttemptFromProvider(ctx.db, {
    attemptId: attempt.attemptId,
    sync: providerSyncFromTwilioMessage({
      attempt,
      providerMessageSid: attempt.providerMessageSid,
      providerStatus,
    }),
  });
}

function readinessOutput(
  output: typeof phoneCallReadinessOutputSchema._output,
): BackendToolResult<typeof phoneCallReadinessOutputSchema._output> {
  const contract = toolContractByName(phoneToolContracts, "phone_call_readiness_get");
  return toolDataForContract(contract, phoneCallReadinessOutputSchema.parse(output));
}

function statusOutput(
  output: typeof phoneCallStatusOutputSchema._output,
): BackendToolResult<typeof phoneCallStatusOutputSchema._output> {
  const contract = toolContractByName(phoneToolContracts, "phone_call_status_get");
  return toolDataForContract(contract, phoneCallStatusOutputSchema.parse(output));
}

function listOutput(
  output: typeof phoneCallListOutputSchema._output,
): BackendToolResult<typeof phoneCallListOutputSchema._output> {
  const contract = toolContractByName(phoneToolContracts, "phone_call_list");
  return toolDataForContract(contract, phoneCallListOutputSchema.parse(output));
}

function smsReadinessOutput(
  output: typeof phoneSmsReadinessOutputSchema._output,
): BackendToolResult<typeof phoneSmsReadinessOutputSchema._output> {
  const contract = toolContractByName(phoneToolContracts, "phone_sms_readiness_get");
  return toolDataForContract(contract, phoneSmsReadinessOutputSchema.parse(output));
}

function smsStatusOutput(
  output: typeof phoneSmsStatusOutputSchema._output,
): BackendToolResult<typeof phoneSmsStatusOutputSchema._output> {
  const contract = toolContractByName(phoneToolContracts, "phone_sms_status_get");
  return toolDataForContract(contract, phoneSmsStatusOutputSchema.parse(output));
}

function smsListOutput(
  output: typeof phoneSmsListOutputSchema._output,
): BackendToolResult<typeof phoneSmsListOutputSchema._output> {
  const contract = toolContractByName(phoneToolContracts, "phone_sms_list");
  return toolDataForContract(contract, phoneSmsListOutputSchema.parse(output));
}

async function handleReadiness(ctx: ExecutorContext) {
  const blockers: string[] = [];
  let mode: "live" | "sandbox" = "live";
  try {
    const binding = await requireBackendSecretProviderCapabilityAccount(ctx.db, {
      profileId: ctx.profile.id,
      capabilitySlugs: ["phone"],
      providers: [twilioVoiceProviderKey],
    });
    mode = providerRuntimeModeForCapabilityLink(binding.link);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    blockers.push(`Managed Twilio Voice backend setup is incomplete: ${message}`);
  }
  const readiness = phoneCallReadiness(phoneProviderEnv(), { mode });
  if (readiness.ready && blockers.length === 0) return readinessOutput(readiness);
  return readinessOutput({
    ...readiness,
    ready: false,
    mode: "unavailable",
    blockers: [...blockers, ...readiness.blockers],
  });
}

function phoneSmsReadiness(
  env: NodeJS.ProcessEnv,
  input?: { mode?: "live" | "sandbox" },
): typeof phoneSmsReadinessOutputSchema._output {
  if (input?.mode === "sandbox") {
    return {
      ready: true,
      provider: "twilio-messaging",
      mode: "mock",
      blockers: [],
    };
  }
  const blockers: string[] = [];
  if (!env.TWILIO_ACCOUNT_SID) blockers.push("TWILIO_ACCOUNT_SID is required for SMS.");
  if (!env.TWILIO_AUTH_TOKEN) blockers.push("TWILIO_AUTH_TOKEN is required for SMS.");
  if (!env.TWILIO_FROM_NUMBER) blockers.push("TWILIO_FROM_NUMBER is required for SMS.");
  return {
    ready: blockers.length === 0,
    provider: "twilio-messaging",
    mode: blockers.length === 0 ? "live" : "unavailable",
    blockers,
  };
}

async function handleSmsReadiness(ctx: ExecutorContext) {
  const blockers: string[] = [];
  let mode: "live" | "sandbox" = "live";
  try {
    const binding = await requireBackendSecretProviderCapabilityAccount(ctx.db, {
      profileId: ctx.profile.id,
      capabilitySlugs: ["phone"],
      providers: [twilioMessagingProviderKey],
    });
    mode = providerRuntimeModeForCapabilityLink(binding.link);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    blockers.push(`Managed Twilio Messaging backend setup is incomplete: ${message}`);
  }
  const readiness = phoneSmsReadiness(phoneProviderEnv(), { mode });
  if (readiness.ready && blockers.length === 0) return smsReadinessOutput(readiness);
  return smsReadinessOutput({
    ...readiness,
    ready: false,
    mode: "unavailable",
    blockers: [...blockers, ...readiness.blockers],
  });
}

async function handleStatus(ctx: ExecutorContext & { params: Record<string, unknown> }) {
  const params = phoneCallStatusInputSchema.parse(ctx.params);
  const attempt = params.attemptId
    ? await requirePhoneCallAttempt(ctx.db, ctx.profile.id, params.attemptId)
    : params.actionId
      ? await requirePhoneCallAttemptForAction(ctx.db, ctx.profile.id, params.actionId)
      : null;
  if (!attempt) {
    throw new Error("phone_call_status_get requires attemptId or actionId.");
  }
  const synced = await maybeSyncPhoneCallAttempt(ctx, attempt);
  return statusOutput({ attempt: phoneCallAttemptDto(synced) });
}

async function handleList(ctx: ExecutorContext & { params: Record<string, unknown> }) {
  const params = phoneCallListInputSchema.parse(ctx.params);
  const listInput =
    params.status === undefined
      ? { limit: params.limit }
      : { limit: params.limit, status: params.status };
  const attempts = await listPhoneCallAttempts(ctx.db, ctx.profile.id, listInput);
  return listOutput({ attempts: attempts.map(phoneCallAttemptDto) });
}

async function handleSmsStatus(ctx: ExecutorContext & { params: Record<string, unknown> }) {
  const params = phoneSmsStatusInputSchema.parse(ctx.params);
  const attempt = params.attemptId
    ? await requirePhoneSmsAttempt(ctx.db, ctx.profile.id, params.attemptId)
    : params.actionId
      ? await requirePhoneSmsAttemptForAction(ctx.db, ctx.profile.id, params.actionId)
      : null;
  if (!attempt) {
    throw new Error("phone_sms_status_get requires attemptId or actionId.");
  }
  const synced = await maybeSyncPhoneSmsAttempt(ctx, attempt);
  return smsStatusOutput({ attempt: phoneSmsAttemptDto(synced) });
}

async function handleSmsList(ctx: ExecutorContext & { params: Record<string, unknown> }) {
  const params = phoneSmsListInputSchema.parse(ctx.params);
  const listInput =
    params.status === undefined
      ? { limit: params.limit }
      : { limit: params.limit, status: params.status };
  const attempts = await listPhoneSmsAttempts(ctx.db, ctx.profile.id, listInput);
  return smsListOutput({ attempts: attempts.map(phoneSmsAttemptDto) });
}

function phoneCallAttemptDto(row: PhoneCallAttempt): PhoneCallAttempt {
  return phoneCallAttemptSchema.parse(row);
}

export const phoneBackendCapabilityModule = defineBackendCapabilityModule({
  id: "phone",
  contracts: phoneToolContracts,
  immediateHandlers: backendImmediateHandlersFromDispatch(phoneToolContracts, (ctx) => {
    if (ctx.input.toolName === "phone_call_readiness_get") return handleReadiness(ctx);
    if (ctx.input.toolName === "phone_call_status_get") return handleStatus(ctx);
    if (ctx.input.toolName === "phone_call_list") return handleList(ctx);
    if (ctx.input.toolName === "phone_sms_readiness_get") return handleSmsReadiness(ctx);
    if (ctx.input.toolName === "phone_sms_status_get") return handleSmsStatus(ctx);
    if (ctx.input.toolName === "phone_sms_list") return handleSmsList(ctx);
    throw new Error(`Unhandled phone call tool ${ctx.input.toolName}.`);
  }),
  externalWriteContracts: phoneExternalWriteActionContracts,
});
