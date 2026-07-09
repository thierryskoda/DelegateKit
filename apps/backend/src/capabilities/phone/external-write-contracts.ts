import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import {
  phoneCallStartInputSchema,
  phoneCallStartOutputSchema,
  phoneCallSandboxStartRequestSchema,
  phoneCallSandboxStartResponseSchema,
  phoneSmsSandboxSendRequestSchema,
  phoneSmsSandboxSendResponseSchema,
  phoneSmsSendInputSchema,
  phoneSmsSendOutputSchema,
  type PhoneCallBrief,
  type PhoneCallSandboxStartRequest,
  type PhoneCallSandboxStartResponse,
  type PhoneSmsSandboxSendRequest,
  type PhoneSmsSandboxSendResponse,
  type PhoneSmsSendInput,
} from "@ai-assistants/phone-contracts/schemas";
import { DomainError, domainCodes, formatUnknownError } from "@ai-assistants/errors";
import {
  providerRuntimeModeForCapabilityLink,
  requireBackendSecretProviderCapabilityAccount,
} from "../../integrations/provider-runtime";
import {
  runProviderSandboxOperation,
  type ProviderSandboxOperationDefinition,
} from "../../integrations/provider-sandbox";
import type { ActionResult } from "../../product/actions/execution/types";
import {
  buildExternalWriteAgentResult,
  lifecycleResultSentence,
} from "../../product/actions/external-write-contracts/agent-result";
import {
  body,
  detail,
  field,
  fields,
  preview,
  section,
} from "../../product/actions/external-write-contracts/connect-detail";
import {
  defineExternalWriteActionContract,
  type ExternalWriteActionContract,
} from "../../product/actions/external-write-contracts/types";
import { markProviderExecutionStarted } from "../../product/actions/execution/provider-runtime";
import {
  createStartingPhoneCallAttempt,
  callBriefHash,
  markPhoneCallAttemptFailed,
  markPhoneCallAttemptStarted,
  phoneCallInitialMessage,
  updatePhoneCallAttemptFromProvider,
} from "./calls/store";
import { assessPhoneCallBriefSafety } from "./calls/safety";
import {
  createQueuedPhoneSmsAttempt,
  markPhoneSmsAttemptFailed,
  markPhoneSmsAttemptSent,
  smsBodyHash,
  updatePhoneSmsAttemptFromProvider,
} from "./sms/store";
import { backendApiEnv } from "../../shared/env";
import { twilioWebhookUrl } from "./shared/twilio-auth";
import twilio from "twilio";

const phoneCallProviderKey = "twilio-voice";
const phoneSmsProviderKey = "twilio-messaging";
const phoneCallStartOperation = "phone.call.start";
const phoneSmsSendOperation = "phone.sms.send";

function reviewTitle(callBrief: PhoneCallBrief): string {
  return `Do you approve calling ${callBrief.toPhoneE164}?`;
}

function sandboxProviderCallId(attemptId: string): string {
  return `sandbox-voice-call-${attemptId}`;
}

function sandboxProviderMessageSid(attemptId: string): string {
  return `SMsandbox${attemptId.replaceAll("-", "").slice(0, 24)}`;
}

const phoneCallStartSandboxOperation = {
  providerKey: phoneCallProviderKey,
  operation: phoneCallStartOperation,
  requestSchema: phoneCallSandboxStartRequestSchema,
  responseSchema: phoneCallSandboxStartResponseSchema,
  resolveResource(request) {
    return { resourceType: "voice_call", resourceId: sandboxProviderCallId(request.attemptId) };
  },
  async handle(ctx): Promise<PhoneCallSandboxStartResponse> {
    const providerCallSid = sandboxProviderCallId(ctx.request.attemptId);
    return {
      callId: providerCallSid,
      sessionKey: null,
      providerStatus: "completed",
      attemptStatus: "completed",
      durationSeconds: 54,
      terminalReason: "sandbox_completed",
      summary:
        "Sandbox call completed. The restaurant confirmed the assistant asked for a table for two and collected availability details without placing a real phone call.",
      failureKind: null,
      failureMessage: null,
    };
  },
} satisfies ProviderSandboxOperationDefinition<
  PhoneCallSandboxStartRequest,
  PhoneCallSandboxStartResponse
>;

const phoneSmsSendSandboxOperation = {
  providerKey: phoneSmsProviderKey,
  operation: phoneSmsSendOperation,
  requestSchema: phoneSmsSandboxSendRequestSchema,
  responseSchema: phoneSmsSandboxSendResponseSchema,
  resolveResource(request) {
    return {
      resourceType: "sms_message",
      resourceId: sandboxProviderMessageSid(request.attemptId),
    };
  },
  async handle(ctx): Promise<PhoneSmsSandboxSendResponse> {
    return {
      messageSid: sandboxProviderMessageSid(ctx.request.attemptId),
      providerStatus: "sent",
      attemptStatus: "sent",
      failureKind: null,
      failureMessage: null,
    };
  },
} satisfies ProviderSandboxOperationDefinition<
  PhoneSmsSandboxSendRequest,
  PhoneSmsSandboxSendResponse
>;

function buildCallAgentResult(
  input: Parameters<ExternalWriteActionContract["buildAgentResult"]>[0],
) {
  const payload = phoneCallStartInputSchema.parse(input.payload);
  return buildExternalWriteAgentResult({
    action: input.action,
    payload,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    message: ({ action, status, providerError }) => {
      const failure =
        providerError && typeof providerError === "object" && "message" in providerError
          ? String(providerError.message)
          : null;
      return lifecycleResultSentence({
        status,
        actionId: action.id,
        completed:
          "The phone call attempt was started. Use phone_call_status_get for the current result.",
        needsReview: "This phone call is waiting for review.",
        processing: "The phone call attempt is being started.",
        failed: failure
          ? `The phone call could not be started. ${failure}`
          : "The phone call could not be started.",
        unknown: failure
          ? `The phone call start is uncertain. ${failure}`
          : "The phone call start is uncertain.",
      });
    },
  });
}

function buildSmsAgentResult(
  input: Parameters<ExternalWriteActionContract["buildAgentResult"]>[0],
) {
  const payload = phoneSmsSendInputSchema.parse(input.payload);
  return buildExternalWriteAgentResult({
    action: input.action,
    payload,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    message: ({ action, status, providerError }) => {
      const failure =
        providerError && typeof providerError === "object" && "message" in providerError
          ? String(providerError.message)
          : null;
      return lifecycleResultSentence({
        status,
        actionId: action.id,
        completed: "The SMS attempt was sent. Use phone_sms_status_get for delivery status.",
        needsReview: "This SMS is waiting for review.",
        processing: "The SMS attempt is being sent.",
        failed: failure ? `The SMS could not be sent. ${failure}` : "The SMS could not be sent.",
        unknown: failure ? `The SMS send is uncertain. ${failure}` : "The SMS send is uncertain.",
      });
    },
  });
}

function requireTwilioMessagingConfig(): {
  accountSid: string;
  authToken: string;
  fromNumber: string;
} {
  const env = backendApiEnv();
  return {
    accountSid: env.twilioAccountSid,
    authToken: env.twilioAuthToken,
    fromNumber: env.twilioFromNumber,
  };
}

function requireTwilioVoiceConfig(): {
  accountSid: string;
  authToken: string;
  fromNumber: string;
} {
  const env = backendApiEnv();
  return {
    accountSid: env.twilioAccountSid,
    authToken: env.twilioAuthToken,
    fromNumber: env.twilioFromNumber,
  };
}

function productStatusFromTwilioMessageStatus(
  status: string,
): "queued" | "sent" | "delivered" | "undelivered" | "failed" | "unknown" {
  const normalized = status.toLowerCase().replaceAll(/[\s_-]+/g, "-");
  if (["queued", "accepted", "scheduled"].includes(normalized)) return "queued";
  if (["sending", "sent"].includes(normalized)) return "sent";
  if (normalized === "delivered") return "delivered";
  if (["undelivered", "receiving", "received"].includes(normalized)) return "undelivered";
  if (["failed", "canceled", "cancelled"].includes(normalized)) return "failed";
  return "unknown";
}

async function executePhoneCallStart(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: { callBrief: PhoneCallBrief },
): Promise<ActionResult> {
  const startedAction = await markProviderExecutionStarted(db, action);
  const attempt = await createStartingPhoneCallAttempt(db, startedAction, payload.callBrief);
  try {
    const binding = await requireBackendSecretProviderCapabilityAccount(db, {
      profileId: startedAction.profile_id,
      capabilitySlugs: ["phone"],
      providers: ["twilio-voice"],
    });
    if (providerRuntimeModeForCapabilityLink(binding.link) === "sandbox") {
      const sandboxResponse = await runProviderSandboxOperation({
        db,
        binding,
        definition: phoneCallStartSandboxOperation,
        request: {
          actionId: startedAction.id,
          attemptId: attempt.attemptId,
          toPhoneE164: payload.callBrief.toPhoneE164,
          purpose: payload.callBrief.purpose,
          openingLine: phoneCallInitialMessage(payload.callBrief),
        },
        metadata: {
          mode: "sandbox",
          callBriefHash: callBriefHash(payload.callBrief),
        },
      });
      const updated = await updatePhoneCallAttemptFromProvider(db, {
        attemptId: attempt.attemptId,
        sync: {
          providerCallSid: sandboxResponse.callId,
          providerParentCallSid: sandboxResponse.sessionKey,
          providerStatus: sandboxResponse.providerStatus,
          status: sandboxResponse.attemptStatus,
          endedAt: new Date().toISOString(),
          durationSeconds: sandboxResponse.durationSeconds,
          terminalReason: sandboxResponse.terminalReason,
          summary: sandboxResponse.summary,
          failureKind: sandboxResponse.failureKind,
          failureMessage: sandboxResponse.failureMessage,
        },
      });
      return {
        status: "executed",
        provider: phoneCallProviderKey,
        result: {
          attemptId: updated.attemptId,
          provider: updated.provider,
          providerCallSid: updated.providerCallSid,
          providerParentCallSid: updated.providerParentCallSid,
          providerStatus: updated.providerStatus,
          providerStatusUpdatedAt: updated.providerStatusUpdatedAt,
          status: updated.status,
          toPhoneE164: updated.toPhoneE164,
        },
      };
    }
    const config = requireTwilioVoiceConfig();
    const client = twilio(config.accountSid, config.authToken);
    const answerUrl = twilioWebhookUrl(
      `webhooks/twilio/voice/answer?attemptId=${attempt.attemptId}`,
    );
    const statusCallback = twilioWebhookUrl("webhooks/twilio/voice/status");
    const initiated = await client.calls.create({
      to: payload.callBrief.toPhoneE164,
      from: config.fromNumber,
      url: answerUrl,
      statusCallback,
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });
    const updated = await markPhoneCallAttemptStarted(db, {
      attemptId: attempt.attemptId,
      providerCallSid: initiated.sid,
      providerParentCallSid: initiated.parentCallSid ?? null,
      providerStatus: initiated.status ?? "queued",
      status: initiated.status === "completed" ? "completed" : "in_progress",
    });
    return {
      status: "executed",
      provider: phoneCallProviderKey,
      result: {
        attemptId: updated.attemptId,
        provider: updated.provider,
        providerCallSid: updated.providerCallSid,
        providerParentCallSid: updated.providerParentCallSid,
        providerStatus: updated.providerStatus,
        providerStatusUpdatedAt: updated.providerStatusUpdatedAt,
        status: updated.status,
        toPhoneE164: updated.toPhoneE164,
      },
    };
  } catch (error) {
    await markPhoneCallAttemptFailed(db, {
      attemptId: attempt.attemptId,
      failureKind: "provider_unavailable",
      failureMessage: formatUnknownError(error),
    });
    throw error;
  }
}

async function executePhoneSmsSend(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: PhoneSmsSendInput,
): Promise<ActionResult> {
  const startedAction = await markProviderExecutionStarted(db, action);
  const attempt = await createQueuedPhoneSmsAttempt(db, startedAction, payload);
  try {
    const binding = await requireBackendSecretProviderCapabilityAccount(db, {
      profileId: startedAction.profile_id,
      capabilitySlugs: ["phone"],
      providers: [phoneSmsProviderKey],
    });
    if (providerRuntimeModeForCapabilityLink(binding.link) === "sandbox") {
      const sandboxResponse = await runProviderSandboxOperation({
        db,
        binding,
        definition: phoneSmsSendSandboxOperation,
        request: {
          actionId: startedAction.id,
          attemptId: attempt.attemptId,
          toPhoneE164: payload.toPhoneE164,
          body: payload.body,
          purpose: payload.purpose,
        },
        metadata: {
          mode: "sandbox",
          bodyHash: smsBodyHash(payload.body),
        },
      });
      const updated = await updatePhoneSmsAttemptFromProvider(db, {
        attemptId: attempt.attemptId,
        sync: {
          providerMessageSid: sandboxResponse.messageSid,
          providerStatus: sandboxResponse.providerStatus,
          status: sandboxResponse.attemptStatus,
          deliveredAt: null,
          failureKind: sandboxResponse.failureKind,
          failureMessage: sandboxResponse.failureMessage,
        },
      });
      return {
        status: "executed",
        provider: phoneSmsProviderKey,
        result: {
          attemptId: updated.attemptId,
          provider: updated.provider,
          providerMessageSid: updated.providerMessageSid,
          providerStatus: updated.providerStatus,
          providerStatusUpdatedAt: updated.providerStatusUpdatedAt,
          status: updated.status,
          toPhoneE164: updated.toPhoneE164,
          fromPhoneE164: updated.fromPhoneE164,
        },
      };
    }

    const config = requireTwilioMessagingConfig();
    const client = twilio(config.accountSid, config.authToken);
    const message = await client.messages.create({
      to: payload.toPhoneE164,
      from: config.fromNumber,
      body: payload.body,
      statusCallback: twilioWebhookUrl("webhooks/twilio/sms/status"),
    });
    const status = productStatusFromTwilioMessageStatus(message.status ?? "sent");
    const updated = await markPhoneSmsAttemptSent(db, {
      attemptId: attempt.attemptId,
      providerMessageSid: message.sid,
      providerStatus: message.status ?? status,
      status,
      fromPhoneE164: config.fromNumber,
    });
    return {
      status: "executed",
      provider: phoneSmsProviderKey,
      result: {
        attemptId: updated.attemptId,
        provider: updated.provider,
        providerMessageSid: updated.providerMessageSid,
        providerStatus: updated.providerStatus,
        providerStatusUpdatedAt: updated.providerStatusUpdatedAt,
        status: updated.status,
        toPhoneE164: updated.toPhoneE164,
        fromPhoneE164: updated.fromPhoneE164,
      },
    };
  } catch (error) {
    await markPhoneSmsAttemptFailed(db, {
      attemptId: attempt.attemptId,
      failureKind: "provider_unavailable",
      failureMessage: formatUnknownError(error),
    });
    throw error;
  }
}

export const phoneExternalWriteActionContracts = [
  defineExternalWriteActionContract({
    toolName: "phone_call_start",
    actionPayloadSchema: phoneCallStartInputSchema,
    outputSchema: phoneCallStartOutputSchema,
    buildWritePlan: async (ctx) => {
      const parsed = phoneCallStartInputSchema.parse(ctx.params);
      if (parsed.callBrief.retryPolicy.maxAttempts !== 1) {
        throw new DomainError(domainCodes.BAD_REQUEST, "Phone calls v1 support one call attempt.");
      }
      const safetyDecision = await assessPhoneCallBriefSafety({
        profileId: ctx.profileId,
        callBrief: parsed.callBrief,
      });
      if (!safetyDecision) {
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          "Phone call safety could not be verified. The call was not started.",
        );
      }
      if (!safetyDecision.allowed) {
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          `Phone call blocked by safety review: ${safetyDecision.riskCategory}.`,
        );
      }
      return {
        actionPayload: parsed,
        requestHash: callBriefHash(parsed.callBrief),
        reviewTitle: reviewTitle(parsed.callBrief),
        reviewSummary: `Start one bounded phone call to ${parsed.callBrief.toPhoneE164} for: ${parsed.callBrief.purpose}`,
        reviewPayload: {
          kind: "phone_call_start",
          toPhoneE164: parsed.callBrief.toPhoneE164,
          purpose: parsed.callBrief.purpose,
          verifiedPhoneSourceUrl: parsed.callBrief.verifiedPhoneSourceUrl,
        },
      };
    },
    buildReviewDetail: ({ payload }) =>
      detail(
        "phone_call_start",
        reviewTitle(payload.callBrief),
        preview("View call brief", [
          section({
            title: "Call",
            fields: fields([
              field("Phone", payload.callBrief.toPhoneE164),
              field("Country", payload.callBrief.country),
              field("Purpose", payload.callBrief.purpose),
              field("Verified source", payload.callBrief.verifiedPhoneSourceUrl),
              field("Max duration", `${payload.callBrief.maxDurationSeconds} seconds`),
            ]),
            body: body("Opening line", payload.callBrief.openingLine),
          }),
        ]),
      ),
    buildAgentResult: buildCallAgentResult,
    execute: executePhoneCallStart,
  }),
  defineExternalWriteActionContract({
    toolName: "phone_sms_send",
    actionPayloadSchema: phoneSmsSendInputSchema,
    outputSchema: phoneSmsSendOutputSchema,
    buildWritePlan: async (ctx) => {
      const parsed = phoneSmsSendInputSchema.parse(ctx.params);
      return {
        actionPayload: parsed,
        requestHash: smsBodyHash(parsed.body),
        reviewTitle: `Do you approve texting ${parsed.toPhoneE164}?`,
        reviewSummary: `Send one bounded SMS to ${parsed.toPhoneE164} for: ${parsed.purpose}`,
        reviewPayload: {
          kind: "phone_sms_send",
          toPhoneE164: parsed.toPhoneE164,
          purpose: parsed.purpose,
          bodyPreview: parsed.body.slice(0, 160),
          destinationEvidenceKind: parsed.destinationEvidence.kind,
        },
      };
    },
    buildReviewDetail: ({ payload }) =>
      detail(
        "phone_sms_send",
        `Do you approve texting ${payload.toPhoneE164}?`,
        preview("View SMS", [
          section({
            title: "SMS",
            fields: fields([
              field("Phone", payload.toPhoneE164),
              field("Country", payload.country),
              field("Purpose", payload.purpose),
              field("Evidence", payload.destinationEvidence.kind),
            ]),
            body: body("Message", payload.body),
          }),
        ]),
      ),
    buildAgentResult: buildSmsAgentResult,
    execute: executePhoneSmsSend,
  }),
] satisfies readonly ExternalWriteActionContract[];
