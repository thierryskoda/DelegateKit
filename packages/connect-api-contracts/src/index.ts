import {
  assistantRowSchema,
  profilePortalActionDecisionCommandSchema,
  profileActionRowSchema,
  profileActionStatusSchema,
  profileLearningReviewCandidateTypeSchema,
  profileLearningReviewTargetKindSchema,
  profileProposalRowSchema,
  profileProposalStatusSchema,
  profileRowSchema,
} from "@ai-assistants/control-plane-contracts";
import { z } from "zod";
import { pickFields } from "./pick-fields";

const okSchema = z.literal(true);
const nonEmptyStringSchema = z.string().trim().min(1);
export const connectIntegrationStateSchema = z.enum([
  "connected",
  "syncing",
  "needs_attention",
  "not_connected",
  "setup_blocked",
]);

export const emptyObjectSchema = z.object({}).strict();
export const profileIdParamSchema = nonEmptyStringSchema;
export const capabilityAccountLinkIdParamSchema = nonEmptyStringSchema;
export const profileParamsSchema = z.object({ profileId: profileIdParamSchema }).strict();
export const capabilityAccountLinkParamsSchema = z
  .object({
    profileId: profileIdParamSchema,
    capabilityAccountLinkId: capabilityAccountLinkIdParamSchema,
  })
  .strict();
export const capabilitySlugParamsSchema = z
  .object({
    profileId: profileIdParamSchema,
    capabilitySlug: nonEmptyStringSchema,
  })
  .strict();
export const createConnectIntentRequestSchema = z
  .object({
    capabilitySlug: nonEmptyStringSchema,
    provider: nonEmptyStringSchema,
    requestedLabel: nonEmptyStringSchema.optional(),
  })
  .strict();
export const connectIntentResponseSchema = z
  .object({
    ok: okSchema,
    connectIntentId: z.string().uuid(),
  })
  .strict();
export const connectCapabilityAccountLinkDtoSchema = z
  .object({
    id: z.string().uuid(),
    connectedAccountId: z.string().uuid().nullable(),
    capabilitySlug: nonEmptyStringSchema,
    provider: nonEmptyStringSchema,
    linkLabel: nonEmptyStringSchema,
    readinessStatus: nonEmptyStringSchema,
  })
  .strict();
export const capabilityAccountLinksResponseSchema = z
  .object({
    ok: okSchema,
    capabilitySlug: nonEmptyStringSchema,
    capabilityAccountLinks: z.array(connectCapabilityAccountLinkDtoSchema),
  })
  .strict();
export const actionParamsSchema = z
  .object({ profileId: profileIdParamSchema, actionId: z.string().trim().uuid() })
  .strict();
export const proposalParamsSchema = z
  .object({ profileId: profileIdParamSchema, proposalId: z.string().trim().uuid() })
  .strict();
export const learningRecommendationParamsSchema = z
  .object({ profileId: profileIdParamSchema, recommendationId: z.string().trim().uuid() })
  .strict();
export const browserHandoffParamsSchema = z
  .object({ profileId: profileIdParamSchema, handoffId: z.string().trim().uuid() })
  .strict();
export const agentParamsSchema = z.object({ agentId: nonEmptyStringSchema }).strict();
const profileActionStatusesParamSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  )
  .pipe(z.array(profileActionStatusSchema).min(1));

export const profileActionListQuerySchema = z
  .object({
    status: profileActionStatusSchema.optional(),
    statuses: profileActionStatusesParamSchema.optional(),
  })
  .strict()
  .refine((query) => !(query.status && query.statuses), {
    message: "Use either status or statuses query parameter, not both.",
  });
export const connectProfileActionStatusSchema = profileActionStatusSchema;
export const connectProfileProposalStatusSchema = profileProposalStatusSchema;
export const connectProfileActionDecisionCommandSchema = profilePortalActionDecisionCommandSchema;
export const telegramMiniAppLaunchSectionSchema = z.enum(["integrations", "approvals"]);

type ProfileRow = z.infer<typeof profileRowSchema>;
type AssistantRow = z.infer<typeof assistantRowSchema>;

const connectProfileDtoFields = {
  id: true,
  display_name: true,
  timezone: true,
  status: true,
} as const satisfies Partial<Record<keyof ProfileRow, true>>;

const connectAssistantDtoFields = {
  assistant_id: true,
  profile_id: true,
} as const satisfies Partial<Record<keyof AssistantRow, true>>;

export const connectProfileDtoSchema = profileRowSchema.pick(connectProfileDtoFields).strict();
export const connectAssistantDtoSchema = assistantRowSchema
  .pick(connectAssistantDtoFields)
  .strict();

const connectActionDetailFieldSchema = z
  .object({
    label: nonEmptyStringSchema,
    value: nonEmptyStringSchema,
  })
  .strict();

const connectActionDetailBodySchema = z
  .object({
    label: nonEmptyStringSchema,
    value: z.string(),
  })
  .strict();

const connectActionDetailChangeSchema = z
  .object({
    label: nonEmptyStringSchema,
    before: z.string().nullable().optional(),
    after: z.string().nullable().optional(),
  })
  .strict();

const connectActionDetailSectionSchema = z
  .object({
    title: nonEmptyStringSchema,
    fields: z.array(connectActionDetailFieldSchema).default([]),
    body: connectActionDetailBodySchema.nullable().optional(),
    changes: z.array(connectActionDetailChangeSchema).default([]),
  })
  .strict();

const connectActionDetailPreviewSchema = z
  .object({
    label: nonEmptyStringSchema,
    sections: z.array(connectActionDetailSectionSchema).min(1),
  })
  .strict();

const connectActionDetailBaseSchema = z
  .object({
    headline: nonEmptyStringSchema,
    preview: connectActionDetailPreviewSchema.nullable(),
  })
  .strict();

const connectActionDetailVariant = <TKind extends string>(kind: TKind) =>
  connectActionDetailBaseSchema.extend({ kind: z.literal(kind) }).strict();

export const connectActionDetailSchema = z.discriminatedUnion("kind", [
  connectActionDetailVariant("gmail_email_send"),
  connectActionDetailVariant("gmail_email_reply"),
  connectActionDetailVariant("gmail_email_forward"),
  connectActionDetailVariant("gmail_email_move"),
  connectActionDetailVariant("gmail_email_mark_read"),
  connectActionDetailVariant("gmail_email_delete"),
  connectActionDetailVariant("outlook_mail_email_send"),
  connectActionDetailVariant("outlook_mail_email_reply"),
  connectActionDetailVariant("outlook_mail_email_forward"),
  connectActionDetailVariant("outlook_mail_email_move"),
  connectActionDetailVariant("outlook_mail_email_mark_read"),
  connectActionDetailVariant("outlook_mail_email_delete"),
  connectActionDetailVariant("google_calendar_event_create"),
  connectActionDetailVariant("google_calendar_event_update"),
  connectActionDetailVariant("google_calendar_event_cancel"),
  connectActionDetailVariant("outlook_calendar_event_create"),
  connectActionDetailVariant("outlook_calendar_event_update"),
  connectActionDetailVariant("outlook_calendar_event_cancel"),
  connectActionDetailVariant("google_drive_folder_create"),
  connectActionDetailVariant("google_drive_file_rename"),
  connectActionDetailVariant("google_drive_file_update_description"),
  connectActionDetailVariant("google_drive_file_move"),
  connectActionDetailVariant("google_drive_file_copy"),
  connectActionDetailVariant("google_drive_file_upload"),
  connectActionDetailVariant("google_drive_file_trash"),
  connectActionDetailVariant("google_drive_file_restore"),
  connectActionDetailVariant("google_drive_file_delete"),
  connectActionDetailVariant("google_drive_file_share"),
  connectActionDetailVariant("google_drive_permission_update"),
  connectActionDetailVariant("google_drive_permission_delete"),
  connectActionDetailVariant("microsoft_onedrive_folder_create"),
  connectActionDetailVariant("microsoft_onedrive_item_update"),
  connectActionDetailVariant("microsoft_onedrive_item_move"),
  connectActionDetailVariant("microsoft_onedrive_item_copy"),
  connectActionDetailVariant("microsoft_onedrive_item_delete"),
  connectActionDetailVariant("microsoft_onedrive_small_file_upload"),
  connectActionDetailVariant("microsoft_onedrive_sharing_link_create"),
  connectActionDetailVariant("microsoft_onedrive_invite_recipients"),
  connectActionDetailVariant("microsoft_onedrive_permission_delete"),
  connectActionDetailVariant("microsoft_todo_task_create"),
  connectActionDetailVariant("microsoft_todo_task_update"),
  connectActionDetailVariant("microsoft_todo_task_complete"),
  connectActionDetailVariant("microsoft_todo_task_delete"),
  connectActionDetailVariant("monday_item_create"),
  connectActionDetailVariant("monday_item_update"),
  connectActionDetailVariant("monday_item_archive"),
  connectActionDetailVariant("monday_item_move_to_group"),
  connectActionDetailVariant("monday_update_create"),
  connectActionDetailVariant("monday_update_edit"),
  connectActionDetailVariant("monday_update_delete"),
  connectActionDetailVariant("monday_subitem_create"),
  connectActionDetailVariant("monday_subitem_update"),
  connectActionDetailVariant("monday_subitem_archive"),
  connectActionDetailVariant("monday_file_add_to_column"),
  connectActionDetailVariant("monday_file_add_to_update"),
  connectActionDetailVariant("monday_board_create"),
  connectActionDetailVariant("monday_board_rename"),
  connectActionDetailVariant("monday_board_delete"),
  connectActionDetailVariant("monday_column_create"),
  connectActionDetailVariant("monday_column_rename"),
  connectActionDetailVariant("monday_column_delete"),
  connectActionDetailVariant("monday_group_create"),
  connectActionDetailVariant("monday_group_rename"),
  connectActionDetailVariant("monday_group_delete"),
  connectActionDetailVariant("boldsign_signature_request_send"),
  connectActionDetailVariant("boldsign_signature_request_remind"),
  connectActionDetailVariant("boldsign_signature_request_cancel"),
  connectActionDetailVariant("phone_call_start"),
  connectActionDetailVariant("phone_sms_send"),
  connectActionDetailVariant("profile_learning_recommendation"),
]);

export const connectProfileActionDtoSchema = z
  .object({
    id: profileActionRowSchema.shape.id,
    status: profileActionStatusSchema,
    detail: connectActionDetailSchema,
  })
  .strict();

export const connectProposalDecisionRequestSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const connectProfileProposalDtoSchema = z
  .object({
    id: profileProposalRowSchema.shape.id,
    status: profileProposalStatusSchema,
    revision: profileProposalRowSchema.shape.revision,
    title: profileProposalRowSchema.shape.title,
    summary: profileProposalRowSchema.shape.summary,
    expiresAt: profileProposalRowSchema.shape.expires_at,
    blockerSummary: profileProposalRowSchema.shape.blocker_summary,
    convertedActionId: profileProposalRowSchema.shape.converted_profile_action_id,
    detail: connectActionDetailSchema,
  })
  .strict();

export const connectLearningRecommendationDtoSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["proposed", "applying", "client_applied", "rejected", "skipped", "failed"]),
    candidateType: profileLearningReviewCandidateTypeSchema,
    targetKind: profileLearningReviewTargetKindSchema,
    targetSummary: nonEmptyStringSchema.nullable(),
    confidence: z.enum(["low", "medium", "high"]),
    title: nonEmptyStringSchema,
    summary: nonEmptyStringSchema,
    rationale: nonEmptyStringSchema,
    detail: connectActionDetailSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const connectIntegrationProviderOptionDtoSchema = z
  .object({
    capabilitySlug: nonEmptyStringSchema,
    provider: nonEmptyStringSchema,
    providerLabel: nonEmptyStringSchema,
    preConnectInstallUrl: nonEmptyStringSchema.nullable().optional(),
  })
  .strict();

export const connectIntegrationCapabilityDtoSchema = z
  .object({
    capabilityAccountLinkId: nonEmptyStringSchema,
    capabilitySlug: nonEmptyStringSchema,
    capabilityLabel: nonEmptyStringSchema,
    state: connectIntegrationStateSchema,
    statusLabel: nonEmptyStringSchema,
  })
  .strict();

export const connectIntegrationAccountDtoSchema = z
  .object({
    id: nonEmptyStringSchema,
    capabilityAccountLinkId: nonEmptyStringSchema,
    connectedAccountId: z.string().uuid().nullable(),
    linkLabel: nonEmptyStringSchema,
    displayLabel: nonEmptyStringSchema,
    connectedAccountEmail: z.string().trim().min(1).nullable(),
    state: connectIntegrationStateSchema,
    statusLabel: nonEmptyStringSchema,
    connectable: z.boolean(),
    disconnectable: z.boolean(),
    preConnectInstallUrl: nonEmptyStringSchema.nullable().optional(),
    capabilities: z.array(connectIntegrationCapabilityDtoSchema).min(1),
  })
  .strict();

export const connectIntegrationGroupDtoSchema = z
  .object({
    groupKey: nonEmptyStringSchema,
    groupLabel: nonEmptyStringSchema,
    provider: nonEmptyStringSchema,
    providerLabel: nonEmptyStringSchema,
    providerConfigKey: nonEmptyStringSchema.nullable(),
    addAccountProvider: connectIntegrationProviderOptionDtoSchema.nullable(),
    accounts: z.array(connectIntegrationAccountDtoSchema),
  })
  .strict();

export const profilesResponseSchema = z
  .object({ ok: okSchema, profiles: z.array(connectProfileDtoSchema) })
  .strict();
export const profileResponseSchema = z
  .object({
    ok: okSchema,
    profile: connectProfileDtoSchema,
    assistants: z.array(connectAssistantDtoSchema),
  })
  .strict();
export const capabilitiesResponseSchema = z
  .object({
    ok: okSchema,
    profileId: profileIdParamSchema,
    groups: z.array(connectIntegrationGroupDtoSchema),
  })
  .strict();
export const disconnectCapabilityResponseSchema = z.object({ ok: okSchema }).strict();
export const nangoConnectSessionHttpResponseSchema = z
  .object({
    ok: okSchema,
    status: z.literal("session_created"),
    sessionToken: nonEmptyStringSchema,
    connectLink: nonEmptyStringSchema,
    allowedIntegration: nonEmptyStringSchema,
    nangoApiUrl: z.string().url(),
    nangoConnectUiUrl: z.string().url(),
  })
  .strict();
export const nangoConnectCompleteRequestSchema = z
  .object({
    connectionId: nonEmptyStringSchema,
    providerConfigKey: nonEmptyStringSchema,
  })
  .strict();
export const nangoConnectCompleteResponseSchema = z
  .object({ ok: okSchema, capability: connectIntegrationAccountDtoSchema })
  .strict();
export const actionsResponseSchema = z
  .object({ ok: okSchema, actions: z.array(connectProfileActionDtoSchema) })
  .strict();
export const actionResponseSchema = z
  .object({ ok: okSchema, action: connectProfileActionDtoSchema })
  .strict();
export const actionApprovalResponseSchema = z
  .object({
    ok: okSchema,
    status: nonEmptyStringSchema,
    action: connectProfileActionDtoSchema,
    assistantWorkItemId: z.string().uuid().nullable().optional(),
  })
  .strict();
export const proposalsResponseSchema = z
  .object({ ok: okSchema, proposals: z.array(connectProfileProposalDtoSchema) })
  .strict();
export const proposalResponseSchema = z
  .object({ ok: okSchema, proposal: connectProfileProposalDtoSchema })
  .strict();
export const proposalDecisionResponseSchema = z
  .object({
    ok: okSchema,
    status: profileProposalStatusSchema,
    proposal: connectProfileProposalDtoSchema,
    action: connectProfileActionDtoSchema.nullable(),
  })
  .strict();
export const learningRecommendationsResponseSchema = z
  .object({ ok: okSchema, recommendations: z.array(connectLearningRecommendationDtoSchema) })
  .strict();
export const learningRecommendationDecisionResponseSchema = z
  .object({
    ok: okSchema,
    recommendation: connectLearningRecommendationDtoSchema,
  })
  .strict();
export const telegramMiniAppSessionRequestSchema = z
  .object({
    initData: nonEmptyStringSchema,
  })
  .strict();
export const telegramMiniAppSessionResponseSchema = z
  .object({
    ok: okSchema,
    profileId: profileIdParamSchema,
    destinationPath: z.string().trim().min(1).startsWith("/"),
    portalAccessUrl: z.string().url(),
  })
  .strict();
export const portalBrowserHandoffRequestSchema = z
  .object({
    section: telegramMiniAppLaunchSectionSchema.default("integrations"),
  })
  .strict();
export const portalBrowserHandoffResponseSchema = z
  .object({
    ok: okSchema,
    url: z.string().url(),
    section: telegramMiniAppLaunchSectionSchema,
  })
  .strict();
export const connectBrowserHandoffReasonSchema = z.enum([
  "login_required",
  "mfa_required",
  "captcha_required",
  "user_control_requested",
]);
export const connectBrowserHandoffStatusSchema = z.enum([
  "waiting",
  "completed",
  "cancelled",
  "expired",
]);
export const connectBrowserHandoffDtoSchema = z
  .object({
    handoffId: z.string().uuid(),
    browserTaskId: z.string().uuid(),
    reason: connectBrowserHandoffReasonSchema,
    status: connectBrowserHandoffStatusSchema,
    expiresAt: z.string().datetime({ offset: true }),
    liveViewUrl: z.string().url().nullable(),
  })
  .strict();
export const browserHandoffResponseSchema = z
  .object({
    ok: okSchema,
    handoff: connectBrowserHandoffDtoSchema,
  })
  .strict();
export type ConnectProfileDto = z.infer<typeof connectProfileDtoSchema>;
export type ConnectAssistantDto = z.infer<typeof connectAssistantDtoSchema>;
export type ConnectActionDetailDto = z.infer<typeof connectActionDetailSchema>;
export type ConnectActionDto = z.infer<typeof connectProfileActionDtoSchema>;
export type ConnectProposalDto = z.infer<typeof connectProfileProposalDtoSchema>;
export type ConnectLearningRecommendationDto = z.infer<
  typeof connectLearningRecommendationDtoSchema
>;
export type ConnectProposalDecisionRequest = z.infer<typeof connectProposalDecisionRequestSchema>;
export type ConnectProfileActionDecisionCommand = z.infer<
  typeof connectProfileActionDecisionCommandSchema
>;
export type TelegramMiniAppLaunchSection = z.infer<typeof telegramMiniAppLaunchSectionSchema>;
export type ConnectIntegrationAccountDto = z.infer<typeof connectIntegrationAccountDtoSchema>;
export type ConnectIntegrationCapabilityDto = z.infer<typeof connectIntegrationCapabilityDtoSchema>;
export type ConnectIntegrationGroupDto = z.infer<typeof connectIntegrationGroupDtoSchema>;
export type ConnectIntegrationProviderOptionDto = z.infer<
  typeof connectIntegrationProviderOptionDtoSchema
>;
export type ConnectIntegrationState = z.infer<typeof connectIntegrationStateSchema>;
export type ConnectBrowserHandoffDto = z.infer<typeof connectBrowserHandoffDtoSchema>;

export function toConnectProfileDto(row: unknown): ConnectProfileDto {
  const parsed = profileRowSchema.parse(row);
  const dto = pickFields(parsed, connectProfileDtoFields) satisfies ConnectProfileDto;
  return connectProfileDtoSchema.parse(dto);
}

export function toConnectAssistantDto(row: unknown): ConnectAssistantDto {
  const parsed = assistantRowSchema.parse(row);
  const dto = pickFields(parsed, connectAssistantDtoFields) satisfies ConnectAssistantDto;
  return connectAssistantDtoSchema.parse(dto);
}

export function toConnectProfileActionDto(
  row: unknown,
  detail: ConnectActionDetailDto,
): ConnectActionDto {
  const parsed = profileActionRowSchema.parse(row);
  const dto = {
    id: parsed.id,
    status: parsed.status,
    detail: connectActionDetailSchema.parse(detail),
  } satisfies ConnectActionDto;
  return connectProfileActionDtoSchema.parse(dto);
}

export function toConnectProfileProposalDto(
  row: unknown,
  detail: ConnectActionDetailDto,
): ConnectProposalDto {
  const parsed = profileProposalRowSchema.parse(row);
  const dto = {
    id: parsed.id,
    status: parsed.status,
    revision: parsed.revision,
    title: parsed.title,
    summary: parsed.summary,
    expiresAt: parsed.expires_at,
    blockerSummary: parsed.blocker_summary,
    convertedActionId: parsed.converted_profile_action_id,
    detail: connectActionDetailSchema.parse(detail),
  } satisfies ConnectProposalDto;
  return connectProfileProposalDtoSchema.parse(dto);
}
