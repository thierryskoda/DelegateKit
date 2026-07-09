import { z } from "zod";
import type { Database, Json } from "./database.types";
import {
  approvalPolicyGeneratedRowSchema,
  artifactGeneratedRowSchema,
  assistantScheduledTaskGeneratedRowSchema,
  assistantWorkItemGeneratedRowSchema,
  assistantGeneratedRowSchema,
  backendJobGeneratedRowSchema,
  boldSignDocumentGeneratedRowSchema,
  browserAuthContextGeneratedRowSchema,
  browserTaskEventGeneratedRowSchema,
  browserTaskGeneratedRowSchema,
  browserHandoffGeneratedRowSchema,
  capabilityAccountLinkGeneratedRowSchema,
  connectedProviderAccountGeneratedRowSchema,
  phoneCallAttemptGeneratedRowSchema,
  phoneCallEventGeneratedRowSchema,
  phoneCallTranscriptEntryGeneratedRowSchema,
  phoneInboundSmsMessageGeneratedRowSchema,
  phoneSmsAttemptGeneratedRowSchema,
  phoneSmsEventGeneratedRowSchema,
  profileCapabilityGeneratedRowSchema,
  profileGuidanceGeneratedRowSchema,
  profileLearningReviewCandidateGeneratedRowSchema,
  profileLearningReviewCursorGeneratedRowSchema,
  profileLearningReviewObservationGeneratedRowSchema,
  profileLearningReviewRunGeneratedRowSchema,
  profilePortalLaunchIntentGeneratedRowSchema,
  profileActionGeneratedRowSchema,
  profileProposalGeneratedRowSchema,
  profileAssistantWorkRouteGeneratedRowSchema,
  profileChannelGeneratedRowSchema,
  profileGeneratedRowSchema,
  providerConnectIntentGeneratedRowSchema,
  providerFileStateGeneratedRowSchema,
  providerSandboxRequestGeneratedRowSchema,
  providerSandboxResourceGeneratedRowSchema,
  providerWebhookDeliveryGeneratedRowSchema,
  providerWebhookSubscriptionGeneratedRowSchema,
  providerWriteReceiptGeneratedRowSchema,
  agentEventGeneratedRowSchema,
  agentRunGeneratedRowSchema,
} from "./database-row-schemas.generated";

export type ControlPlaneJson = Json;
export type ControlPlaneTableName = keyof Database["public"]["Tables"];
export type ControlPlaneTableRow<TTable extends ControlPlaneTableName> =
  Database["public"]["Tables"][TTable]["Row"];

export const jsonSchema: z.ZodType<ControlPlaneJson> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);
export const jsonObjectSchema = z.record(z.string(), jsonSchema);
const trimmedNonEmptyStringSchema = z.string().trim().min(1);

export const profileActionStatusSchema = z.enum([
  "pending_approval",
  "processing",
  "executed",
  "rejected",
  "expired",
  "failed",
  "unknown",
  "blocked",
]);
export const profileActionDecisionSchema = z.enum(["approved", "rejected"]);
export const profileActionDecisionSourceSchema = z.enum(["portal", "trusted_channel"]);
export const profileProposalKindSchema = z.enum([
  "gmail.email.follow_up",
  "outlook_mail.email.follow_up",
]);
export const profileProposalStatusSchema = z.enum([
  "proposed",
  "blocked",
  "converting",
  "converted",
  "rejected",
  "expired",
  "superseded",
]);
export const providerExecutionStatusSchema = z.enum([
  "not_started",
  "started",
  "completed",
  "failed",
  "unknown",
]);
export const browserAuthContextStatusSchema = z.enum(["active", "deleted"]);
export const browserHandoffReasonSchema = z.enum([
  "login_required",
  "mfa_required",
  "captcha_required",
  "user_control_requested",
]);
export const browserHandoffStatusSchema = z.enum(["waiting", "completed", "cancelled", "expired"]);
export const browserTaskModeSchema = z.enum([
  "extract",
  "action_prepare",
  "auth_context_setup",
  "live_handoff",
]);
export const browserTaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "blocked",
  "succeeded",
  "failed",
  "cancelled",
]);
export const profileStatusSchema = z.enum(["active", "inactive"]);
export const capabilityAccountLinkStatusSchema = z.enum(["enabled", "disabled"]);
export const providerConnectIntentStatusSchema = z.enum([
  "pending",
  "completed",
  "expired",
  "cancelled",
]);
export const profileCapabilityStatusSchema = z.enum(["enabled", "disabled"]);
export const providerConnectionStatusSchema = z.enum([
  "pending",
  "connected",
  "disconnected",
  "failed",
]);
export const providerConnectionCredentialStatusSchema = z.enum([
  "healthy",
  "reconnect_required",
  "revoked",
]);
export const providerConnectionCredentialKindSchema = z.enum(["nango_oauth", "backend_secret"]);
export const backendJobKindSchema = z.enum([
  "agent.run.execute",
  "capability.setup.monday",
  "profile.learning_review.run",
  "provider.webhook.process",
  "provider.webhook.subscription.reconcile",
  "provider.sync.process",
]);
export const backendJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export const backendJobEffectiveStatusSchema = z.union([
  backendJobStatusSchema,
  z.literal("stale"),
]);
export const assistantWorkItemKindSchema = z.enum([
  "google_calendar.event.changed",
  "outlook_calendar.event.changed",
  "gmail.email.received",
  "outlook_mail.email.received",
  "twilio.sms.received",
  "monday.item.created",
  "monday.item.updated",
  "scheduled.task",
  "boldsign.signature_request.changed",
  "google_drive.file.created",
  "google_drive.file.updated",
  "google_drive.file.deleted",
  "microsoft_onedrive.file.created",
  "microsoft_onedrive.file.updated",
  "microsoft_onedrive.file.deleted",
  "microsoft_sharepoint.file.created",
  "microsoft_sharepoint.file.updated",
  "microsoft_sharepoint.file.deleted",
]);
export const assistantWorkItemStatusSchema = z.enum([
  "pending",
  "claimed",
  "succeeded",
  "ignored",
  "failed",
  "cancelled",
]);
export const capabilityReadinessStatusSchema = z.enum([
  "not_connected",
  "blocked",
  "queued",
  "running",
  "ready",
  "error",
]);
export const capabilityReadinessBlockerCodeSchema = z.enum([
  "credential_required",
  "reconnect_required",
  "provider_setup_required",
  "monday_activation_metadata_incomplete",
  "ambiguous_account",
]);
export const phoneCallAttemptStatusSchema = z.enum([
  "pending_start",
  "starting",
  "in_progress",
  "completed",
  "no_answer",
  "failed",
  "unknown",
]);
export const phoneCallAttemptCountrySchema = z.enum(["US", "CA"]);
export const phoneCallAttemptProviderSchema = z.enum(["twilio-voice"]);
export const phoneSmsAttemptStatusSchema = z.enum([
  "queued",
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "unknown",
]);
export const phoneSmsAttemptCountrySchema = z.enum(["US", "CA"]);
export const phoneSmsAttemptProviderSchema = z.enum(["twilio-messaging"]);
export const phoneCallEventKindSchema = z.enum([
  "call.started",
  "call.answered",
  "call.speech",
  "call.dtmf",
  "call.silence",
  "call.ended",
  "call.error",
]);
export const phoneSmsEventKindSchema = z.enum([
  "sms.queued",
  "sms.sent",
  "sms.delivered",
  "sms.undelivered",
  "sms.failed",
  "sms.received",
]);

export const profileActionRowSchema = profileActionGeneratedRowSchema.extend({
  decision: profileActionDecisionSchema.nullable(),
  decision_source: profileActionDecisionSourceSchema.nullable(),
  provider_execution_attempts: z.number().int().nonnegative(),
  provider_execution_status: providerExecutionStatusSchema,
  status: profileActionStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"profile_actions">>;

export const profileProposalRowSchema = profileProposalGeneratedRowSchema.extend({
  decision: profileActionDecisionSchema.nullable(),
  decision_source: z.enum(["portal"]).nullable(),
  evidence: jsonObjectSchema,
  proposal_kind: profileProposalKindSchema,
  proposal_payload: jsonObjectSchema,
  review_payload: jsonObjectSchema,
  revision: z.number().int().min(1),
  status: profileProposalStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"profile_proposals">>;

export const browserAuthContextRowSchema = browserAuthContextGeneratedRowSchema.extend({
  allowed_domains: z.array(z.string().trim().min(1)).min(1),
  status: browserAuthContextStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"browser_auth_contexts">>;

export const browserHandoffRowSchema = browserHandoffGeneratedRowSchema.extend({
  reason: browserHandoffReasonSchema,
  status: browserHandoffStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"browser_handoffs">>;

export const approvalPolicyRowSchema = approvalPolicyGeneratedRowSchema satisfies z.ZodType<
  ControlPlaneTableRow<"approval_policies">
>;

export const profileAssistantWorkRouteRowSchema =
  profileAssistantWorkRouteGeneratedRowSchema satisfies z.ZodType<
    ControlPlaneTableRow<"profile_assistant_work_routes">
  >;

export const artifactRowSchema = artifactGeneratedRowSchema satisfies z.ZodType<
  ControlPlaneTableRow<"artifacts">
>;

export const agentRunStatusSchema = z.enum([
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
]);

export const agentRunRowSchema = agentRunGeneratedRowSchema.extend({
  failure: jsonObjectSchema.nullable(),
  status: agentRunStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"agent_runs">>;

export const agentEventSourceSchema = z.enum(["backend", "agent_runtime"]);

export const agentEventVisibilitySchema = z.enum([
  "internal",
  "internal_sensitive",
  "client_visible",
]);

const channelMessagePayloadBaseSchema = z
  .object({
    profileChannelId: trimmedNonEmptyStringSchema,
    provider: trimmedNonEmptyStringSchema,
    conversationId: trimmedNonEmptyStringSchema,
    externalMessageId: trimmedNonEmptyStringSchema.nullable(),
    contentText: trimmedNonEmptyStringSchema,
    sessionKey: trimmedNonEmptyStringSchema.nullable(),
    accountId: trimmedNonEmptyStringSchema.nullable(),
  })
  .strict();

export const agentEventPayloadSchema = z.discriminatedUnion("eventType", [
  channelMessagePayloadBaseSchema.extend({
    eventType: z.literal("channel.message.received"),
    direction: z.literal("inbound"),
    status: z.literal("received"),
  }),
  channelMessagePayloadBaseSchema.extend({
    eventType: z.literal("channel.message.delivered"),
    direction: z.literal("outbound"),
    status: z.literal("sent"),
  }),
  channelMessagePayloadBaseSchema.extend({
    eventType: z.literal("channel.message.delivery_failed"),
    direction: z.literal("outbound"),
    status: z.literal("failed"),
    failureReason: trimmedNonEmptyStringSchema,
  }),
  z
    .object({
      eventType: z.literal("assistant.message.text"),
      text: trimmedNonEmptyStringSchema,
      role: z.enum(["assistant", "user", "system"]),
      sessionKey: trimmedNonEmptyStringSchema.nullable(),
      messageId: trimmedNonEmptyStringSchema.nullable(),
    })
    .strict(),
  z
    .object({
      eventType: z.literal("assistant.reasoning"),
      text: trimmedNonEmptyStringSchema,
      format: z.enum(["thinking", "reasoning", "unknown"]),
      sessionKey: trimmedNonEmptyStringSchema.nullable(),
    })
    .strict(),
  z
    .object({
      eventType: z.literal("assistant.model.response"),
      model: trimmedNonEmptyStringSchema.nullable(),
      responseId: trimmedNonEmptyStringSchema.nullable(),
      usage: jsonObjectSchema.nullable(),
      finishReason: trimmedNonEmptyStringSchema.nullable(),
      sessionKey: trimmedNonEmptyStringSchema.nullable(),
    })
    .strict(),
  z
    .object({
      eventType: z.literal("assistant.guidance.selection"),
      sourceGuidanceIds: z.array(trimmedNonEmptyStringSchema),
      profileGuidanceDbIds: z.array(z.string().uuid()),
      selectableSourceGuidanceCount: z.number().int().min(0),
      selectableProfileGuidanceCount: z.number().int().min(0),
      model: trimmedNonEmptyStringSchema.nullable(),
      error: jsonObjectSchema.nullable(),
    })
    .strict(),
  z
    .object({
      eventType: z.literal("assistant.conversation_context.selection"),
      mode: z.enum(["skipped_no_candidates", "llm", "fallback_none"]),
      selectedContextMode: z.enum(["none", "messages", "summary"]),
      candidateMessageCount: z.number().int().min(0),
      selectedMessageCount: z.number().int().min(0),
      selectedMessageIds: z.array(trimmedNonEmptyStringSchema),
      ignoredMessageIds: z.array(trimmedNonEmptyStringSchema),
      summary: trimmedNonEmptyStringSchema.nullable(),
      contextCharCount: z.number().int().min(0),
      model: trimmedNonEmptyStringSchema.nullable(),
      error: jsonObjectSchema.nullable(),
    })
    .strict(),
  z
    .object({
      eventType: z.literal("assistant.tool.selection"),
      mode: z.enum(["explicit", "llm", "fallback_all"]),
      candidateToolCount: z.number().int().min(0),
      candidateToolSurfaceCount: z.number().int().min(0),
      selectedToolCount: z.number().int().min(0),
      selectedToolSurfaceIds: z.array(trimmedNonEmptyStringSchema),
      selectedToolNames: z.array(trimmedNonEmptyStringSchema),
      ignoredToolSurfaceIds: z.array(trimmedNonEmptyStringSchema),
      ignoredToolNames: z.array(trimmedNonEmptyStringSchema),
      model: trimmedNonEmptyStringSchema.nullable(),
      error: jsonObjectSchema.nullable(),
    })
    .strict(),
  z
    .object({
      eventType: z.literal("assistant.tool.call"),
      toolName: trimmedNonEmptyStringSchema,
      toolCallId: trimmedNonEmptyStringSchema.nullable(),
      requestId: trimmedNonEmptyStringSchema.nullable().optional(),
      input: jsonObjectSchema,
      sessionKey: trimmedNonEmptyStringSchema.nullable(),
      provenance: jsonObjectSchema.optional(),
    })
    .strict(),
  z
    .object({
      eventType: z.literal("assistant.tool.result"),
      toolName: trimmedNonEmptyStringSchema,
      toolCallId: trimmedNonEmptyStringSchema.nullable(),
      status: z.enum(["succeeded", "failed", "unknown"]),
      requestId: trimmedNonEmptyStringSchema.nullable().optional(),
      output: jsonObjectSchema.nullable(),
      error: jsonObjectSchema.nullable(),
      sessionKey: trimmedNonEmptyStringSchema.nullable(),
      provenance: jsonObjectSchema.optional(),
    })
    .strict(),
  z
    .object({
      eventType: z.enum([
        "provider.event.route_triaged",
        "work_item.terminal",
        "artifact.created",
        "profile_action.outcome",
        "provider.write.result",
      ]),
      sourceKind: trimmedNonEmptyStringSchema,
      sourceId: trimmedNonEmptyStringSchema,
      title: trimmedNonEmptyStringSchema,
      summary: trimmedNonEmptyStringSchema,
      referenceKeys: z.array(trimmedNonEmptyStringSchema),
      metadata: jsonObjectSchema,
    })
    .strict(),
]);

export type AgentEventPayload = z.infer<typeof agentEventPayloadSchema>;
export type AgentEventType = AgentEventPayload["eventType"];

export const recordAgentRuntimeEventRequestSchema = z
  .object({
    agentId: trimmedNonEmptyStringSchema,
    runId: trimmedNonEmptyStringSchema.nullable(),
    sessionId: trimmedNonEmptyStringSchema.nullable(),
    sessionKey: trimmedNonEmptyStringSchema.nullable(),
    sourceEventKey: trimmedNonEmptyStringSchema,
    occurredAt: z.string().datetime({ offset: true }).optional(),
    payload: agentEventPayloadSchema,
  })
  .strict();

export type RecordAgentRuntimeEventRequest = z.infer<typeof recordAgentRuntimeEventRequestSchema>;

export const recordAgentRuntimeEventResponseSchema = z
  .object({
    recorded: z.literal(true),
    eventId: trimmedNonEmptyStringSchema,
    agentRunId: trimmedNonEmptyStringSchema.nullable(),
    created: z.boolean(),
  })
  .strict();

export type RecordAgentRuntimeEventResponse = z.infer<typeof recordAgentRuntimeEventResponseSchema>;

export const agentEventRowSchema = agentEventGeneratedRowSchema
  .extend({
    payload: agentEventPayloadSchema,
    source: agentEventSourceSchema,
    visibility: agentEventVisibilitySchema,
  })
  .superRefine((row, ctx) => {
    if (row.event_type !== row.payload.eventType) {
      ctx.addIssue({
        code: "custom",
        message: "agent_events.event_type must match payload.eventType.",
        path: ["event_type"],
      });
    }
    if (
      row.payload.eventType === "assistant.reasoning" &&
      row.visibility !== "internal_sensitive"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "assistant.reasoning events must be internal_sensitive.",
        path: ["visibility"],
      });
    }
  }) satisfies z.ZodType<ControlPlaneTableRow<"agent_events">>;

export const assistantRowSchema = assistantGeneratedRowSchema satisfies z.ZodType<
  ControlPlaneTableRow<"assistants">
>;

export const backendJobRowSchema = backendJobGeneratedRowSchema.extend({
  attempts: z.number().int().nonnegative(),
  kind: backendJobKindSchema,
  max_attempts: z.number().int().min(1),
  status: backendJobStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"backend_jobs">>;

export const profileLearningReviewRunStatusSchema = z.enum(["running", "succeeded", "failed"]);
export const profileLearningReviewModeSchema = z.enum(["scheduled_cursor", "date_replay"]);
export const profileLearningReviewCandidateStatusSchema = z.enum([
  "proposed",
  "applying",
  "auto_applied",
  "client_applied",
  "rejected",
  "skipped",
  "failed",
]);
export const profileLearningReviewConfidenceSchema = z.enum(["low", "medium", "high"]);
export const profileLearningReviewObservationTypeSchema = z.enum([
  "preference",
  "correction",
  "frustration",
  "failure_pattern",
  "instruction_gap",
  "task_need",
  "route_need",
  "prior_outcome",
  "needs_more_context",
]);
export const profileLearningReviewCandidateTypeSchema = z.enum([
  "scheduled_task_create",
  "scheduled_task_update",
  "scheduled_task_pause",
  "scheduled_task_delete",
  "scheduled_task_instructions_update",
  "work_route_create",
  "work_route_update",
  "work_route_delete",
  "work_route_instructions_update",
  "guidance_create",
  "guidance_update",
  "guidance_archive",
  "no_action",
]);
export const profileLearningReviewTargetKindSchema = z.enum([
  "assistant_scheduled_task",
  "profile_assistant_work_route",
  "profile_guidance",
  "none",
]);
export const profileGuidanceStatusSchema = z.enum(["active", "archived"]);

export const profileLearningReviewRunRowSchema = profileLearningReviewRunGeneratedRowSchema.extend({
  metadata: jsonObjectSchema,
  review_mode: profileLearningReviewModeSchema,
  status: profileLearningReviewRunStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"profile_learning_review_runs">>;

export const profileLearningReviewCursorRowSchema =
  profileLearningReviewCursorGeneratedRowSchema.extend({
    metadata: jsonObjectSchema,
  }) satisfies z.ZodType<ControlPlaneTableRow<"profile_learning_review_cursors">>;

export const profileLearningReviewObservationRowSchema =
  profileLearningReviewObservationGeneratedRowSchema.extend({
    confidence: profileLearningReviewConfidenceSchema,
    evidence: jsonObjectSchema,
    observation_type: profileLearningReviewObservationTypeSchema,
    target_kind: profileLearningReviewTargetKindSchema,
  }) satisfies z.ZodType<ControlPlaneTableRow<"profile_learning_review_observations">>;

export const profileLearningReviewCandidateRowSchema =
  profileLearningReviewCandidateGeneratedRowSchema.extend({
    applied_reference: jsonObjectSchema,
    candidate_type: profileLearningReviewCandidateTypeSchema,
    confidence: profileLearningReviewConfidenceSchema,
    evidence: jsonObjectSchema,
    proposed_patch: jsonObjectSchema,
    status: profileLearningReviewCandidateStatusSchema,
    target_kind: profileLearningReviewTargetKindSchema,
  }) satisfies z.ZodType<ControlPlaneTableRow<"profile_learning_review_candidates">>;

export const profileGuidanceRowSchema = profileGuidanceGeneratedRowSchema.extend({
  revision: z.number().int().min(1),
  status: profileGuidanceStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"profile_guidance">>;

export const assistantScheduledTaskStatusSchema = z.enum(["active", "paused", "deleted"]);

export const assistantScheduledTaskRowSchema = assistantScheduledTaskGeneratedRowSchema.extend({
  revision: z.number().int().min(1),
  schedule: jsonObjectSchema,
  target: jsonObjectSchema,
  status: assistantScheduledTaskStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"assistant_scheduled_tasks">>;

export const assistantWorkItemRowSchema = assistantWorkItemGeneratedRowSchema.extend({
  attempts: z.number().int().nonnegative(),
  kind: assistantWorkItemKindSchema,
  max_attempts: z.number().int().min(1),
  payload: jsonObjectSchema,
  result: jsonObjectSchema.nullable(),
  status: assistantWorkItemStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"assistant_work_items">>;

export const browserTaskRowSchema = browserTaskGeneratedRowSchema.extend({
  mode: browserTaskModeSchema,
  revision: z.number().int().nonnegative(),
  state: jsonObjectSchema,
  status: browserTaskStatusSchema,
  wait: jsonObjectSchema.nullable(),
  result: jsonObjectSchema.nullable(),
}) satisfies z.ZodType<ControlPlaneTableRow<"browser_tasks">>;

export const browserTaskEventRowSchema = browserTaskEventGeneratedRowSchema.extend({
  actor_type: z.enum(["system", "assistant", "profile", "profile_user"]),
  payload: jsonObjectSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"browser_task_events">>;

export const profilePortalLaunchIntentRowSchema =
  profilePortalLaunchIntentGeneratedRowSchema satisfies z.ZodType<
    ControlPlaneTableRow<"profile_portal_launch_intents">
  >;

export const providerWriteReceiptRowSchema = providerWriteReceiptGeneratedRowSchema.extend({
  metadata: jsonObjectSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"provider_write_receipts">>;

export const boldSignDocumentRowSchema = boldSignDocumentGeneratedRowSchema.extend({
  provider_metadata: jsonObjectSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"boldsign_documents">>;

export const connectedProviderAccountRowSchema = connectedProviderAccountGeneratedRowSchema.extend({
  connection_status: providerConnectionStatusSchema,
  credential_kind: providerConnectionCredentialKindSchema,
  credential_status: providerConnectionCredentialStatusSchema.nullable(),
  metadata: jsonObjectSchema,
  scopes: jsonObjectSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"connected_provider_accounts">>;

export const phoneCallAttemptRowSchema = phoneCallAttemptGeneratedRowSchema.extend({
  country: phoneCallAttemptCountrySchema,
  provider: phoneCallAttemptProviderSchema,
  status: phoneCallAttemptStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"phone_call_attempts">>;

export const phoneCallEventRowSchema = phoneCallEventGeneratedRowSchema.extend({
  event_kind: phoneCallEventKindSchema,
  provider_payload: jsonObjectSchema,
  provider: phoneCallAttemptProviderSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"phone_call_events">>;

export const phoneCallTranscriptEntryRowSchema =
  phoneCallTranscriptEntryGeneratedRowSchema satisfies z.ZodType<
    ControlPlaneTableRow<"phone_call_transcript_entries">
  >;

export const phoneSmsAttemptRowSchema = phoneSmsAttemptGeneratedRowSchema.extend({
  country: phoneSmsAttemptCountrySchema,
  destination_evidence: jsonObjectSchema,
  provider: phoneSmsAttemptProviderSchema,
  status: phoneSmsAttemptStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"phone_sms_attempts">>;

export const phoneSmsEventRowSchema = phoneSmsEventGeneratedRowSchema.extend({
  event_kind: phoneSmsEventKindSchema,
  provider_payload: jsonObjectSchema,
  provider: phoneSmsAttemptProviderSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"phone_sms_events">>;

export const phoneInboundSmsMessageRowSchema = phoneInboundSmsMessageGeneratedRowSchema.extend({
  provider: phoneSmsAttemptProviderSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"phone_inbound_sms_messages">>;

export const providerWebhookSubscriptionStatusSchema = z.enum(["active", "unhealthy", "disabled"]);

export const providerWebhookSubscriptionRowSchema =
  providerWebhookSubscriptionGeneratedRowSchema.extend({
    cursor: jsonObjectSchema,
    provider_state: jsonObjectSchema,
    status: providerWebhookSubscriptionStatusSchema,
  }) satisfies z.ZodType<ControlPlaneTableRow<"provider_webhook_subscriptions">>;

export const providerFileStateRowSchema = providerFileStateGeneratedRowSchema.extend({
  metadata: jsonObjectSchema,
  parent_reference: jsonObjectSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"provider_file_states">>;

export const providerSandboxResourceRowSchema = providerSandboxResourceGeneratedRowSchema.extend({
  metadata: jsonObjectSchema,
  state: jsonObjectSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"provider_sandbox_resources">>;

export const providerSandboxRequestStatusSchema = z.enum(["succeeded", "failed"]);

export const providerSandboxRequestRowSchema = providerSandboxRequestGeneratedRowSchema.extend({
  error: jsonObjectSchema.nullable(),
  metadata: jsonObjectSchema,
  request: jsonObjectSchema,
  response: jsonObjectSchema,
  status: providerSandboxRequestStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"provider_sandbox_requests">>;

export const providerWebhookDeliveryStatusSchema = z.enum([
  "queued",
  "processing",
  "processed",
  "failed",
  "ignored",
]);

export const providerWebhookDeliveryRowSchema = providerWebhookDeliveryGeneratedRowSchema.extend({
  payload: jsonObjectSchema,
  request_headers: jsonObjectSchema,
  status: providerWebhookDeliveryStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"provider_webhook_deliveries">>;

export const profileCapabilityRowSchema = profileCapabilityGeneratedRowSchema.extend({
  config: jsonObjectSchema,
  status: profileCapabilityStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"profile_capabilities">>;

export const capabilityAccountLinkRowSchema = capabilityAccountLinkGeneratedRowSchema.extend({
  config: jsonObjectSchema,
  readiness_blocker_code: capabilityReadinessBlockerCodeSchema.nullable(),
  readiness_metadata: jsonObjectSchema,
  readiness_status: capabilityReadinessStatusSchema,
  status: capabilityAccountLinkStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"capability_account_links">>;

export const providerConnectIntentRowSchema = providerConnectIntentGeneratedRowSchema.extend({
  status: providerConnectIntentStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"provider_connect_intents">>;

export const profileChannelProviderSchema = z.enum(["telegram", "webchat", "e2e-test", "imessage"]);

export const profileChannelRowSchema = profileChannelGeneratedRowSchema.extend({
  delivery_config: jsonObjectSchema,
  provider: profileChannelProviderSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"profile_channels">>;

export const profileChannelMessageDirectionSchema = z.enum(["inbound", "outbound"]);
export const profileChannelMessageStatusSchema = z.enum(["received", "sent", "failed"]);

export const recordChannelMessageKindSchema = z.enum([
  "inbound_received",
  "outbound_sent",
  "outbound_failed",
]);

export const recordChannelMessageRequestSchema = z
  .object({
    kind: recordChannelMessageKindSchema,
    channelId: trimmedNonEmptyStringSchema,
    accountId: trimmedNonEmptyStringSchema.optional(),
    conversationId: trimmedNonEmptyStringSchema,
    externalMessageId: trimmedNonEmptyStringSchema.optional(),
    contentText: trimmedNonEmptyStringSchema,
    agentId: trimmedNonEmptyStringSchema.optional(),
    runId: trimmedNonEmptyStringSchema.optional(),
    sessionId: trimmedNonEmptyStringSchema.optional(),
    sessionKey: trimmedNonEmptyStringSchema.optional(),
    failureReason: trimmedNonEmptyStringSchema.optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const kind = value.kind;
    const failureReason = value.failureReason;
    if (kind === "outbound_failed" && !failureReason) {
      ctx.addIssue({
        code: "custom",
        message: "failureReason is required for outbound_failed channel message events.",
        path: ["failureReason"],
      });
    }
    if (kind !== "outbound_failed" && failureReason) {
      ctx.addIssue({
        code: "custom",
        message: "failureReason is only allowed for outbound_failed channel message events.",
        path: ["failureReason"],
      });
    }
  });

export type RecordChannelMessageRequest = z.infer<typeof recordChannelMessageRequestSchema>;

export const recordChannelMessageResponseSchema = z.discriminatedUnion("recorded", [
  z
    .object({
      recorded: z.literal(true),
      messageId: trimmedNonEmptyStringSchema,
    })
    .strict(),
  z
    .object({
      recorded: z.literal(false),
      reason: z.enum(["unresolved_channel", "duplicate_message"]),
    })
    .strict(),
]);

export type RecordChannelMessageResponse = z.infer<typeof recordChannelMessageResponseSchema>;

export const channelMessageTimelineItemSchema = z
  .object({
    id: trimmedNonEmptyStringSchema,
    occurredAt: z.string().datetime({ offset: true }),
    direction: profileChannelMessageDirectionSchema,
    status: profileChannelMessageStatusSchema,
    provider: trimmedNonEmptyStringSchema,
    profileChannelId: trimmedNonEmptyStringSchema,
    conversationId: trimmedNonEmptyStringSchema,
    externalMessageId: trimmedNonEmptyStringSchema.nullable(),
    contentText: trimmedNonEmptyStringSchema,
    sessionKey: trimmedNonEmptyStringSchema.nullable(),
    failureReason: trimmedNonEmptyStringSchema.nullable(),
  })
  .strict();

export type ChannelMessageTimelineItem = z.infer<typeof channelMessageTimelineItemSchema>;

export const listChannelMessagesResponseSchema = z
  .object({
    messages: z.array(channelMessageTimelineItemSchema),
  })
  .strict();

export type ListChannelMessagesResponse = z.infer<typeof listChannelMessagesResponseSchema>;

export const profileRowSchema = profileGeneratedRowSchema.extend({
  preferences: jsonObjectSchema,
  status: profileStatusSchema,
}) satisfies z.ZodType<ControlPlaneTableRow<"profiles">>;
