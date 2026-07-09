import {
  profileLearningReviewCandidateTypeSchema,
  profileLearningReviewTargetKindSchema,
} from "@ai-assistants/control-plane-contracts";

type ProfileLearningReviewCandidateType =
  (typeof profileLearningReviewCandidateTypeSchema.options)[number];
type ProfileLearningReviewTargetKind =
  (typeof profileLearningReviewTargetKindSchema.options)[number];

export const REVIEW_CANDIDATE_TYPE = {
  scheduledTaskCreate: "scheduled_task_create",
  scheduledTaskUpdate: "scheduled_task_update",
  scheduledTaskPause: "scheduled_task_pause",
  scheduledTaskDelete: "scheduled_task_delete",
  scheduledTaskInstructionsUpdate: "scheduled_task_instructions_update",
  workRouteCreate: "work_route_create",
  workRouteUpdate: "work_route_update",
  workRouteDelete: "work_route_delete",
  workRouteInstructionsUpdate: "work_route_instructions_update",
  guidanceCreate: "guidance_create",
  guidanceUpdate: "guidance_update",
  guidanceArchive: "guidance_archive",
  noAction: "no_action",
} as const satisfies Record<string, ProfileLearningReviewCandidateType>;

export const REVIEW_TARGET_KIND = {
  assistantScheduledTask: "assistant_scheduled_task",
  profileAssistantWorkRoute: "profile_assistant_work_route",
  profileGuidance: "profile_guidance",
  none: "none",
} as const satisfies Record<string, ProfileLearningReviewTargetKind>;
