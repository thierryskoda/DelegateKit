import { z } from "zod";
import {
  profileLearningReviewCandidateTypeSchema,
  profileLearningReviewConfidenceSchema,
  profileLearningReviewTargetKindSchema,
} from "@ai-assistants/control-plane-contracts";
import { assistantScheduleSchema } from "@ai-assistants/scheduled-tasks-contracts/schemas";
import { providerAssistantWorkEventTypeSchema } from "@ai-assistants/tool-contracts";

export const PROFILE_LEARNING_REVIEW_JOB_KIND = "profile.learning_review.run";
export const PROFILE_LEARNING_REVIEW_MODEL = "deepseek-v4-pro";

const profileLearningReviewCandidatePatchSchema = z
  .object({
    instructions: z.string().trim().min(1).max(10_000).optional(),
    title: z.string().trim().min(1).max(300).optional(),
    key: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-z][a-z0-9_]*$/)
      .optional(),
    selectorDescription: z.string().trim().min(10).max(500).optional(),
    bodyMarkdown: z.string().trim().min(20).max(20_000).optional(),
    summary: z.string().trim().min(1).max(2_000).optional(),
    changeSummary: z.string().trim().min(1).max(500).optional(),
    expectedRevision: z.number().int().min(1).optional(),
    schedule: assistantScheduleSchema.optional(),
    eventType: providerAssistantWorkEventTypeSchema.optional(),
    priority: z.number().int().min(0).nullable().optional(),
  })
  .strict();

const instructionsPatchSchema = z
  .object({
    instructions: z.string().trim().min(1).max(10_000),
    changeSummary: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
const scheduledTaskInstructionsPatchSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    instructions: z.string().trim().min(1).max(10_000),
    changeSummary: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
const scheduledTaskCreatePatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    instructions: z.string().trim().min(1).max(10_000),
    schedule: assistantScheduleSchema,
    changeSummary: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
const scheduledTaskUpdatePatchSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    instructions: z.string().trim().min(1).max(10_000).optional(),
    schedule: assistantScheduleSchema.optional(),
    changeSummary: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((patch) => patch.title || patch.instructions || patch.schedule, {
    message: "Scheduled task update requires title, instructions, or schedule.",
  });
const workRouteCreatePatchSchema = z
  .object({
    eventType: providerAssistantWorkEventTypeSchema,
    instructions: z.string().trim().min(1).max(10_000),
    priority: z.number().int().min(0).nullable().optional(),
    changeSummary: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
const workRouteUpdatePatchSchema = z
  .object({
    instructions: z.string().trim().min(1).max(10_000).optional(),
    priority: z.number().int().min(0).nullable().optional(),
    changeSummary: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((patch) => patch.instructions !== undefined || patch.priority !== undefined, {
    message: "Work route update requires instructions or priority.",
  });
const emptyPatchSchema = z
  .object({ changeSummary: z.string().trim().min(1).max(500).optional() })
  .strict();
const revisionOnlyPatchSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    changeSummary: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
const guidanceKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-z0-9_]*$/);
const guidanceTitleSchema = z.string().trim().min(1).max(200);
const guidanceSelectorDescriptionSchema = z.string().trim().min(10).max(500);
const guidanceBodyMarkdownSchema = z.string().trim().min(20).max(20_000);
const guidanceCreatePatchSchema = z
  .object({
    key: guidanceKeySchema,
    title: guidanceTitleSchema,
    selectorDescription: guidanceSelectorDescriptionSchema,
    bodyMarkdown: guidanceBodyMarkdownSchema,
    changeSummary: z.string().trim().min(1).max(500),
  })
  .strict();
const guidanceUpdatePatchSchema = z
  .object({
    title: guidanceTitleSchema.optional(),
    selectorDescription: guidanceSelectorDescriptionSchema.optional(),
    bodyMarkdown: guidanceBodyMarkdownSchema.optional(),
    changeSummary: z.string().trim().min(1).max(500),
    expectedRevision: z.number().int().min(1),
  })
  .strict()
  .refine(
    (patch) =>
      patch.title !== undefined ||
      patch.selectorDescription !== undefined ||
      patch.bodyMarkdown !== undefined,
    { message: "Guidance update requires title, selectorDescription, or bodyMarkdown." },
  );
const guidanceArchivePatchSchema = z
  .object({
    changeSummary: z.string().trim().min(1).max(500),
    expectedRevision: z.number().int().min(1),
  })
  .strict();
const profileLearningReviewGeneratedCandidateSchema = z
  .object({
    candidateType: profileLearningReviewCandidateTypeSchema,
    targetKind: profileLearningReviewTargetKindSchema,
    targetId: z.string().trim().min(1).nullable(),
    confidence: profileLearningReviewConfidenceSchema,
    rationale: z.string().trim().min(1).max(1_000),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(20),
    counterEvidenceRefs: z.array(z.string().trim().min(1)).max(20).optional(),
    verifier: z
      .object({
        status: z.enum(["pass", "revise", "reject"]),
        reason: z.string().trim().min(1).max(1_000),
        confidence: profileLearningReviewConfidenceSchema.optional(),
        missingEvidence: z.array(z.string().trim().min(1)).max(10).optional(),
      })
      .strict()
      .optional(),
    proposedPatch: profileLearningReviewCandidatePatchSchema,
  })
  .strict()
  .superRefine((candidate, ctx) => {
    const allowedTargets = new Set([
      "scheduled_task_create:none",
      "scheduled_task_update:assistant_scheduled_task",
      "scheduled_task_pause:assistant_scheduled_task",
      "scheduled_task_delete:assistant_scheduled_task",
      "scheduled_task_instructions_update:assistant_scheduled_task",
      "work_route_create:none",
      "work_route_update:profile_assistant_work_route",
      "work_route_delete:profile_assistant_work_route",
      "work_route_instructions_update:profile_assistant_work_route",
      "guidance_create:profile_guidance",
      "guidance_update:profile_guidance",
      "guidance_archive:profile_guidance",
      "no_action:none",
    ]);
    if (!allowedTargets.has(`${candidate.candidateType}:${candidate.targetKind}`)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetKind"],
        message: `${candidate.candidateType} must use the matching target kind.`,
      });
    }
    if (candidate.candidateType === "guidance_create") {
      if (candidate.targetId !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetId"],
          message: "guidance_create targetId must be null because the row does not exist yet.",
        });
      }
    } else if (candidate.targetKind === "none") {
      if (candidate.targetId !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetId"],
          message: "none targetKind requires null targetId.",
        });
      }
    } else if (!candidate.targetId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetId"],
        message: `${candidate.candidateType} requires a targetId.`,
      });
    }
    try {
      if (!isSupportedProfileLearningReviewCandidateType(candidate.candidateType)) {
        throw new Error(`${candidate.candidateType} is no longer supported.`);
      }
      parseProfileLearningReviewCandidatePatch({
        candidateType: candidate.candidateType,
        proposedPatch: candidate.proposedPatch,
      });
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proposedPatch"],
        message:
          error instanceof Error
            ? error.message
            : `${candidate.candidateType} proposedPatch is invalid.`,
      });
    }
  });

export const profileLearningReviewDecisionSchema = z
  .object({
    summary: z.string().trim().min(1).max(1_500),
    candidates: z.array(profileLearningReviewGeneratedCandidateSchema).max(12),
  })
  .strict();

export type ProfileLearningReviewGeneratedCandidate = z.infer<
  typeof profileLearningReviewGeneratedCandidateSchema
>;
export type ProfileLearningReviewDecision = z.infer<typeof profileLearningReviewDecisionSchema>;

const verifierDecisionSchema = z
  .object({
    status: z.enum(["pass", "revise", "reject"]),
    reason: z.string().trim().min(1).max(1_000),
    confidence: profileLearningReviewConfidenceSchema.optional(),
    missingEvidence: z.array(z.string().trim().min(1)).max(10).optional(),
  })
  .strict();

const profileLearningReviewCandidateEvidenceSchema = z
  .object({
    supportingRefs: z.array(z.string().trim().min(1)).max(50),
    counterRefs: z.array(z.string().trim().min(1)).max(50),
    observationIds: z.array(z.string().uuid()).max(50),
    verifier: verifierDecisionSchema.nullable(),
  });

export type ProfileLearningReviewCandidateEvidence = z.infer<
  typeof profileLearningReviewCandidateEvidenceSchema
>;

export function parseProfileLearningReviewCandidateEvidence(
  input: unknown,
): ProfileLearningReviewCandidateEvidence {
  return profileLearningReviewCandidateEvidenceSchema.parse(input);
}

type ProfileLearningReviewCandidatePatchByType = {
  scheduled_task_create: z.infer<typeof scheduledTaskCreatePatchSchema>;
  scheduled_task_update: z.infer<typeof scheduledTaskUpdatePatchSchema>;
  scheduled_task_pause: z.infer<typeof revisionOnlyPatchSchema>;
  scheduled_task_delete: z.infer<typeof revisionOnlyPatchSchema>;
  scheduled_task_instructions_update: z.infer<typeof scheduledTaskInstructionsPatchSchema>;
  work_route_create: z.infer<typeof workRouteCreatePatchSchema>;
  work_route_update: z.infer<typeof workRouteUpdatePatchSchema>;
  work_route_delete: z.infer<typeof emptyPatchSchema>;
  work_route_instructions_update: z.infer<typeof instructionsPatchSchema>;
  guidance_create: z.infer<typeof guidanceCreatePatchSchema>;
  guidance_update: z.infer<typeof guidanceUpdatePatchSchema>;
  guidance_archive: z.infer<typeof guidanceArchivePatchSchema>;
  no_action: z.infer<typeof emptyPatchSchema>;
};

export type SupportedProfileLearningReviewCandidateType =
  keyof ProfileLearningReviewCandidatePatchByType;

const supportedProfileLearningReviewCandidateTypes = new Set<string>([
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

export function isSupportedProfileLearningReviewCandidateType(
  candidateType: string,
): candidateType is SupportedProfileLearningReviewCandidateType {
  return supportedProfileLearningReviewCandidateTypes.has(candidateType);
}

export function parseProfileLearningReviewCandidatePatch<
  T extends SupportedProfileLearningReviewCandidateType,
>(input: {
  candidateType: T;
  proposedPatch: unknown;
}): ProfileLearningReviewCandidatePatchByType[T] {
  switch (input.candidateType) {
    case "scheduled_task_pause":
    case "scheduled_task_delete":
      return revisionOnlyPatchSchema.parse(
        input.proposedPatch,
      ) as ProfileLearningReviewCandidatePatchByType[T];
    case "work_route_delete":
    case "no_action":
      return emptyPatchSchema.parse(
        input.proposedPatch,
      ) as ProfileLearningReviewCandidatePatchByType[T];
    case "scheduled_task_create":
      return scheduledTaskCreatePatchSchema.parse(
        input.proposedPatch,
      ) as ProfileLearningReviewCandidatePatchByType[T];
    case "scheduled_task_update":
      return scheduledTaskUpdatePatchSchema.parse(
        input.proposedPatch,
      ) as ProfileLearningReviewCandidatePatchByType[T];
    case "scheduled_task_instructions_update":
      return scheduledTaskInstructionsPatchSchema.parse(
        input.proposedPatch,
      ) as ProfileLearningReviewCandidatePatchByType[T];
    case "work_route_create":
      return workRouteCreatePatchSchema.parse(
        input.proposedPatch,
      ) as ProfileLearningReviewCandidatePatchByType[T];
    case "work_route_update":
      return workRouteUpdatePatchSchema.parse(
        input.proposedPatch,
      ) as ProfileLearningReviewCandidatePatchByType[T];
    case "work_route_instructions_update":
      return instructionsPatchSchema.parse(
        input.proposedPatch,
      ) as ProfileLearningReviewCandidatePatchByType[T];
    case "guidance_create":
      return guidanceCreatePatchSchema.parse(
        input.proposedPatch,
      ) as ProfileLearningReviewCandidatePatchByType[T];
    case "guidance_update":
      return guidanceUpdatePatchSchema.parse(
        input.proposedPatch,
      ) as ProfileLearningReviewCandidatePatchByType[T];
    case "guidance_archive":
      return guidanceArchivePatchSchema.parse(
        input.proposedPatch,
      ) as ProfileLearningReviewCandidatePatchByType[T];
    default: {
      const exhaustive: never = input.candidateType;
      return exhaustive;
    }
  }
}

export type ProfileLearningReviewWindow = {
  profileId: string;
  reviewMode: "scheduled_cursor" | "date_replay";
  localDate: string | null;
  windowStartAt: string;
  windowEndAt: string;
  sourceWindowStartAt: string;
  sourceWindowEndAt: string;
  contextWindowStartAt: string;
  contextWindowEndAt: string;
  cursorProcessedThroughAt: string | null;
};
