import {
  externalWriteOutputSchemaForFacts,
  integerField,
  stringField,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";

const e164PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{1,14}$/, "Phone number must be E.164, such as +14165551234.")
  .describe("Destination phone number in E.164 format.");

export const phoneCallCountrySchema = z
  .enum(["US", "CA"])
  .describe("Destination country allowed for phone calls in v1.");
export type PhoneCallCountry = z.infer<typeof phoneCallCountrySchema>;

export const phoneCallAttemptStatusSchema = z
  .enum(["pending_start", "starting", "in_progress", "completed", "no_answer", "failed", "unknown"])
  .describe("Product status for a bounded phone call attempt.");
export type PhoneCallAttemptStatus = z.infer<typeof phoneCallAttemptStatusSchema>;

export const phoneCallRetryPolicySchema = z
  .object({
    maxAttempts: z
      .number()
      .int()
      .min(1)
      .max(1)
      .default(1)
      .describe("Maximum call attempts for v1. Must be 1; retries require a later explicit plan."),
  })
  .strict()
  .describe("Retry policy for this bounded call attempt.");
export type PhoneCallRetryPolicy = z.infer<typeof phoneCallRetryPolicySchema>;

const phoneCallBriefShape = {
  toPhoneE164: e164PhoneSchema,
  country: phoneCallCountrySchema,
  verifiedPhoneSourceUrl: z
    .string()
    .trim()
    .url()
    .describe("Public source URL or provider evidence URL that verified the destination phone."),
  verifiedPhoneSourceLabel: stringField("Short label for the source that verified the phone."),
  purpose: stringField("Plain-language reason for the call."),
  openingLine: stringField(
    "Exact first sentence to say after connection. Include the concrete requested outcome and essential constraints already present in purpose or authorizedFacts, such as date/time, party size, name, service, and fallback window when relevant.",
  ),
  disclosureName: stringField("Name the assistant may use to identify who it is calling for."),
  disclosureRelationship: stringField(
    "How to describe the assistant's relationship to the user, such as assistant for Thierry.",
  ),
  authorizedFacts: z
    .array(stringField("A fact the assistant is authorized to say on the call."))
    .min(1)
    .max(20)
    .describe("Only these facts may be shared during the call."),
  decisionBounds: z
    .array(stringField("A decision or commitment boundary for the assistant."))
    .min(1)
    .max(20)
    .describe("Things the assistant may or may not agree to without returning to the user."),
  stopConditions: z
    .array(stringField("Condition that requires ending the call or returning to the user."))
    .min(1)
    .max(20)
    .describe("Hard stop conditions for the live call."),
  resultExpectations: z
    .array(stringField("Structured result fact the assistant should try to collect."))
    .min(1)
    .max(20)
    .describe("Facts to report after the call, such as available times or confirmation number."),
  maxDurationSeconds: z
    .number()
    .int()
    .min(30)
    .max(600)
    .default(300)
    .describe("Maximum call duration in seconds."),
  holdTimeoutSeconds: z
    .number()
    .int()
    .min(15)
    .max(180)
    .default(60)
    .describe("Maximum time to remain on hold before ending or reporting back."),
  retryPolicy: phoneCallRetryPolicySchema
    .default({ maxAttempts: 1 })
    .describe("Retry policy for this bounded call attempt."),
} satisfies z.ZodRawShape;

export const phoneCallBriefSchema = z
  .object(phoneCallBriefShape)
  .strict()
  .describe("Bounded, approval-reviewed call brief for one phone call attempt.");
export type PhoneCallBrief = z.infer<typeof phoneCallBriefSchema>;

export const phoneCallStartInputSchema = z
  .object({
    callBrief: phoneCallBriefSchema,
  })
  .strict();
export type PhoneCallStartInput = z.infer<typeof phoneCallStartInputSchema>;

export const phoneCallAttemptFactsSchema = z
  .object({
    attemptId: z.string().uuid().describe("Backend phone call attempt id."),
    callId: z.string().trim().min(1).describe("Repo-owned durable call id."),
    provider: z.enum(["twilio-voice"]).describe("Voice provider used for the attempt."),
    providerCallSid: z.string().trim().min(1).nullable().describe("Twilio CallSid when known."),
    providerParentCallSid: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Twilio parent CallSid when known."),
    providerStatus: z.string().trim().min(1).nullable().describe("Raw provider status when known."),
    providerStatusUpdatedAt: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Timestamp for the last raw provider status sync."),
    status: phoneCallAttemptStatusSchema,
    toPhoneE164: e164PhoneSchema,
  })
  .strict();
export type PhoneCallAttemptFacts = z.infer<typeof phoneCallAttemptFactsSchema>;

export const phoneCallStartOutputSchema = externalWriteOutputSchemaForFacts(
  phoneCallAttemptFactsSchema,
);
export type PhoneCallStartOutput = z.infer<typeof phoneCallStartOutputSchema>;

export const phoneCallSandboxStartRequestSchema = z
  .object({
    actionId: z.string().uuid(),
    attemptId: z.string().uuid(),
    toPhoneE164: e164PhoneSchema,
    purpose: stringField("Call purpose sent to the sandbox voice provider."),
    openingLine: stringField("Opening line sent to the sandbox voice provider."),
  })
  .strict();
export type PhoneCallSandboxStartRequest = z.infer<typeof phoneCallSandboxStartRequestSchema>;

export const phoneCallSandboxStartResponseSchema = z
  .object({
    callId: z.string().trim().min(1),
    sessionKey: z.string().trim().min(1).nullable(),
    providerStatus: z.string().trim().min(1),
    attemptStatus: phoneCallAttemptStatusSchema,
    durationSeconds: z.number().int().nonnegative().nullable(),
    terminalReason: z.string().trim().min(1).nullable(),
    summary: z.string().trim().min(1).nullable(),
    failureKind: z.string().trim().min(1).nullable(),
    failureMessage: z.string().trim().min(1).nullable(),
  })
  .strict();
export type PhoneCallSandboxStartResponse = z.infer<typeof phoneCallSandboxStartResponseSchema>;

export const phoneCallReadinessInputSchema = z.object({}).strict();
export const phoneCallReadinessOutputSchema = z
  .object({
    ready: z.boolean().describe("Whether bounded phone calling can start calls now."),
    provider: z.literal("twilio-voice").describe("Twilio Voice provider label."),
    mode: z.enum(["mock", "dry_run", "live", "unavailable"]).describe("Current provider mode."),
    blockers: z.array(stringField("Current setup blocker.")).describe("Concrete setup blockers."),
  })
  .strict();
export type PhoneCallReadinessOutput = z.infer<typeof phoneCallReadinessOutputSchema>;

export const phoneCallStatusInputSchema = z
  .object({
    attemptId: z.string().uuid().optional().describe("Backend phone call attempt id."),
    actionId: z
      .string()
      .uuid()
      .optional()
      .describe("Profile action id returned by phone_call_start when attemptId is not known."),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (Boolean(input.attemptId) === Boolean(input.actionId)) {
      ctx.addIssue({
        code: "custom",
        message: "Pass exactly one of attemptId or actionId.",
      });
    }
  });

export const phoneCallAttemptSchema = phoneCallAttemptFactsSchema
  .extend({
    country: phoneCallCountrySchema,
    purpose: stringField("Call purpose."),
    verifiedPhoneSourceUrl: z
      .string()
      .trim()
      .url()
      .describe("Source URL used to verify the destination phone."),
    startedAt: z.string().trim().min(1).nullable().describe("Call attempt start timestamp."),
    endedAt: z.string().trim().min(1).nullable().describe("Call attempt end timestamp when known."),
    durationSeconds: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe("Call duration in seconds when known."),
    terminalReason: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Terminal reason when the call attempt has ended."),
    summary: z.string().trim().min(1).nullable().describe("Safe call summary when available."),
    failureKind: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Stable failure category when the call attempt failed."),
    failureMessage: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Safe failure detail when the call attempt failed."),
    createdAt: z.string().trim().min(1).describe("Attempt record creation timestamp."),
    updatedAt: z.string().trim().min(1).describe("Attempt record update timestamp."),
  })
  .strict();
export type PhoneCallAttempt = z.infer<typeof phoneCallAttemptSchema>;

export const phoneCallStatusOutputSchema = z
  .object({
    attempt: phoneCallAttemptSchema.describe("Requested phone call attempt."),
  })
  .strict();
export type PhoneCallStatusOutput = z.infer<typeof phoneCallStatusOutputSchema>;

export const phoneCallListInputSchema = z
  .object({
    limit: integerField("Maximum number of call attempts to list.", 1, 25, 10),
    status: phoneCallAttemptStatusSchema.optional(),
  })
  .strict();
export const phoneCallListOutputSchema = z
  .object({
    attempts: z.array(phoneCallAttemptSchema).describe("Recent phone call attempts."),
  })
  .strict();
export type PhoneCallListOutput = z.infer<typeof phoneCallListOutputSchema>;

export const phoneSmsProviderSchema = z.literal("twilio-messaging");
export type PhoneSmsProvider = z.infer<typeof phoneSmsProviderSchema>;

export const phoneSmsAttemptStatusSchema = z
  .enum(["queued", "sent", "delivered", "undelivered", "failed", "unknown"])
  .describe("Product status for one SMS attempt.");
export type PhoneSmsAttemptStatus = z.infer<typeof phoneSmsAttemptStatusSchema>;

const smsBodySchema = z
  .string()
  .trim()
  .min(1)
  .max(1_600)
  .describe("Exact SMS body to send. Keep it short, natural, and client-approved.");

const phoneSmsDestinationEvidenceSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("public_phone_source"),
        url: z.string().trim().url().describe("Public source URL that verified the destination."),
        label: stringField("Short label for the source that verified the phone."),
      })
      .strict(),
    z
      .object({
        kind: z.literal("prior_inbound_sms"),
        inboundMessageSid: stringField(
          "Twilio inbound MessageSid proving the recipient texted first.",
        ),
      })
      .strict(),
  ])
  .describe(
    "Evidence that this SMS destination is allowed: either a public phone source or a prior inbound SMS.",
  );
export type PhoneSmsDestinationEvidence = z.infer<typeof phoneSmsDestinationEvidenceSchema>;

export const phoneSmsSendInputSchema = z
  .object({
    toPhoneE164: e164PhoneSchema,
    country: phoneCallCountrySchema,
    purpose: stringField("Plain-language reason for sending this SMS."),
    body: smsBodySchema,
    destinationEvidence: phoneSmsDestinationEvidenceSchema,
    relatedCallAttemptId: z
      .string()
      .uuid()
      .optional()
      .describe("Optional failed or incomplete phone call attempt this SMS follows up on."),
  })
  .strict();
export type PhoneSmsSendInput = z.infer<typeof phoneSmsSendInputSchema>;

export const phoneSmsAttemptFactsSchema = z
  .object({
    attemptId: z.string().uuid().describe("Backend SMS attempt id."),
    provider: phoneSmsProviderSchema.describe("SMS provider used for the attempt."),
    providerMessageSid: z.string().trim().min(1).nullable().describe("Twilio MessageSid."),
    providerStatus: z.string().trim().min(1).nullable().describe("Raw provider status when known."),
    providerStatusUpdatedAt: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Timestamp for the last raw provider status sync."),
    status: phoneSmsAttemptStatusSchema,
    toPhoneE164: e164PhoneSchema,
    fromPhoneE164: e164PhoneSchema
      .nullable()
      .describe("Configured Twilio sender phone number when known."),
  })
  .strict();
export type PhoneSmsAttemptFacts = z.infer<typeof phoneSmsAttemptFactsSchema>;

export const phoneSmsSendOutputSchema = externalWriteOutputSchemaForFacts(
  phoneSmsAttemptFactsSchema,
);
export type PhoneSmsSendOutput = z.infer<typeof phoneSmsSendOutputSchema>;

export const phoneSmsSandboxSendRequestSchema = z
  .object({
    actionId: z.string().uuid(),
    attemptId: z.string().uuid(),
    toPhoneE164: e164PhoneSchema,
    body: smsBodySchema,
    purpose: stringField("SMS purpose sent to the sandbox provider."),
  })
  .strict();
export type PhoneSmsSandboxSendRequest = z.infer<typeof phoneSmsSandboxSendRequestSchema>;

export const phoneSmsSandboxSendResponseSchema = z
  .object({
    messageSid: z.string().trim().min(1),
    providerStatus: z.string().trim().min(1),
    attemptStatus: phoneSmsAttemptStatusSchema,
    failureKind: z.string().trim().min(1).nullable(),
    failureMessage: z.string().trim().min(1).nullable(),
  })
  .strict();
export type PhoneSmsSandboxSendResponse = z.infer<typeof phoneSmsSandboxSendResponseSchema>;

export const phoneSmsReadinessInputSchema = z.object({}).strict();
export const phoneSmsReadinessOutputSchema = z
  .object({
    ready: z.boolean().describe("Whether bounded SMS can send messages now."),
    provider: phoneSmsProviderSchema.describe("SMS provider label."),
    mode: z.enum(["mock", "dry_run", "live", "unavailable"]).describe("Current provider mode."),
    blockers: z.array(stringField("Current setup blocker.")).describe("Concrete setup blockers."),
  })
  .strict();
export type PhoneSmsReadinessOutput = z.infer<typeof phoneSmsReadinessOutputSchema>;

export const phoneSmsStatusInputSchema = z
  .object({
    attemptId: z.string().uuid().optional().describe("Backend SMS attempt id."),
    actionId: z
      .string()
      .uuid()
      .optional()
      .describe("Profile action id returned by phone_sms_send when attemptId is not known."),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (Boolean(input.attemptId) === Boolean(input.actionId)) {
      ctx.addIssue({
        code: "custom",
        message: "Pass exactly one of attemptId or actionId.",
      });
    }
  });

export const phoneSmsAttemptSchema = phoneSmsAttemptFactsSchema
  .extend({
    country: phoneCallCountrySchema,
    purpose: stringField("SMS purpose."),
    bodyPreview: z.string().trim().min(1).describe("Safe short preview of the SMS body."),
    destinationEvidenceKind: z
      .enum(["public_phone_source", "prior_inbound_sms"])
      .describe("Evidence type that authorized the SMS destination."),
    verifiedPhoneSourceUrl: z
      .string()
      .trim()
      .url()
      .nullable()
      .describe("Public URL used to verify the destination phone when applicable."),
    verifiedPhoneSourceLabel: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Short label for the public phone source when applicable."),
    replyToMessageSid: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Inbound Twilio MessageSid this SMS replies to, when applicable."),
    relatedCallAttemptId: z
      .string()
      .uuid()
      .nullable()
      .describe("Phone call attempt this SMS follows up on, when applicable."),
    sentAt: z.string().trim().min(1).nullable().describe("Timestamp when the SMS was sent."),
    deliveredAt: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Timestamp when Twilio reported delivery, when known."),
    failureKind: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Stable failure category when the SMS attempt failed."),
    failureMessage: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Safe failure detail when the SMS attempt failed."),
    createdAt: z.string().trim().min(1).describe("SMS attempt record creation timestamp."),
    updatedAt: z.string().trim().min(1).describe("SMS attempt record update timestamp."),
  })
  .strict();
export type PhoneSmsAttempt = z.infer<typeof phoneSmsAttemptSchema>;

export const phoneSmsStatusOutputSchema = z
  .object({
    attempt: phoneSmsAttemptSchema.describe("Requested SMS attempt."),
  })
  .strict();
export type PhoneSmsStatusOutput = z.infer<typeof phoneSmsStatusOutputSchema>;

export const phoneSmsListInputSchema = z
  .object({
    limit: integerField("Maximum number of SMS attempts to list.", 1, 25, 10),
    status: phoneSmsAttemptStatusSchema.optional(),
  })
  .strict();
export const phoneSmsListOutputSchema = z
  .object({
    attempts: z.array(phoneSmsAttemptSchema).describe("Recent SMS attempts."),
  })
  .strict();
export type PhoneSmsListOutput = z.infer<typeof phoneSmsListOutputSchema>;

export const twilioSmsReceivedEventSchema = z
  .object({
    provider: phoneSmsProviderSchema,
    messageSid: z.string().trim().min(1),
    fromPhoneE164: e164PhoneSchema,
    toPhoneE164: e164PhoneSchema,
    bodyText: z.string().trim().min(1).max(10_000),
    mediaCount: z.number().int().nonnegative(),
    accountSid: z.string().trim().min(1).nullable(),
  })
  .strict();
export type TwilioSmsReceivedEvent = z.infer<typeof twilioSmsReceivedEventSchema>;
