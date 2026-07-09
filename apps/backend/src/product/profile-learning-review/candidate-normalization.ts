import { profileLearningReviewCandidateTypeSchema } from "@ai-assistants/control-plane-contracts";
import {
  isSupportedProfileLearningReviewCandidateType,
  parseProfileLearningReviewCandidatePatch,
  type ProfileLearningReviewGeneratedCandidate,
} from "./types";

type ProfileLearningReviewCandidateType =
  (typeof profileLearningReviewCandidateTypeSchema.options)[number];

const SUPPORTED_CANDIDATE_TYPES: ReadonlySet<ProfileLearningReviewCandidateType> = new Set(
  profileLearningReviewCandidateTypeSchema.options.filter(
    (candidateType) => candidateType !== "no_action",
  ),
);

export function normalizeLearningReviewCandidate(
  candidate: ProfileLearningReviewGeneratedCandidate,
): ProfileLearningReviewGeneratedCandidate | null {
  if (candidate.candidateType === "no_action") return null;
  if (!SUPPORTED_CANDIDATE_TYPES.has(candidate.candidateType)) return null;
  if (!isSupportedProfileLearningReviewCandidateType(candidate.candidateType)) return null;
  try {
    parseProfileLearningReviewCandidatePatch({
      candidateType: candidate.candidateType,
      proposedPatch: candidate.proposedPatch,
    });
  } catch {
    return null;
  }
  if (
    candidate.candidateType === "scheduled_task_create" ||
    candidate.candidateType === "work_route_create"
  ) {
    return {
      ...candidate,
      targetKind: "none",
      targetId: null,
    };
  }
  if (candidate.candidateType === "guidance_create") {
    if (candidate.targetKind !== "profile_guidance") return null;
    return {
      ...candidate,
      targetId: null,
    };
  }
  if (
    candidate.candidateType === "scheduled_task_update" ||
    candidate.candidateType === "scheduled_task_pause" ||
    candidate.candidateType === "scheduled_task_delete" ||
    candidate.candidateType === "scheduled_task_instructions_update"
  ) {
    if (candidate.targetKind !== "assistant_scheduled_task" || !candidate.targetId) return null;
    return candidate;
  }
  if (
    candidate.candidateType === "work_route_update" ||
    candidate.candidateType === "work_route_delete" ||
    candidate.candidateType === "work_route_instructions_update"
  ) {
    if (candidate.targetKind !== "profile_assistant_work_route" || !candidate.targetId) {
      return null;
    }
    return candidate;
  }
  if (
    candidate.candidateType === "guidance_update" ||
    candidate.candidateType === "guidance_archive"
  ) {
    if (candidate.targetKind !== "profile_guidance" || !candidate.targetId) return null;
    return candidate;
  }
  if (candidate.targetKind === "none") return { ...candidate, targetId: null };
  if (!candidate.targetId) return null;
  return candidate;
}
