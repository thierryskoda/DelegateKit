import type { NewProfileLearningReviewObservation } from "./storage";

export type ProfileLearningReviewScoutFinding = {
  findingType:
    | "scheduled_task_candidate"
    | "work_route_candidate"
    | "guidance_candidate"
    | "possible_issue_needs_more_context";
  targetKind:
    | "assistant_scheduled_task"
    | "profile_assistant_work_route"
    | "profile_guidance"
    | "none";
  targetId: string | null;
  confidence: "low" | "medium" | "high";
  rationale: string;
  evidenceRefs: string[];
  missingContext: string | null;
};

export type BatchedProfileLearningReviewScoutFinding = ProfileLearningReviewScoutFinding & {
  batchIndex: number;
};

function observationTypeForFinding(
  finding: ProfileLearningReviewScoutFinding,
): NewProfileLearningReviewObservation["observationType"] {
  switch (finding.findingType) {
    case "scheduled_task_candidate":
      return "task_need";
    case "work_route_candidate":
      return "route_need";
    case "guidance_candidate":
      return "instruction_gap";
    case "possible_issue_needs_more_context":
      return "needs_more_context";
    default: {
      const exhaustive: never = finding.findingType;
      return exhaustive;
    }
  }
}

export function observationsFromScoutFindings(
  findings: readonly ProfileLearningReviewScoutFinding[],
): NewProfileLearningReviewObservation[] {
  return findings.map((finding) => ({
    observationType: observationTypeForFinding(finding),
    targetKind: finding.targetKind,
    targetId: finding.targetKind === "none" ? null : finding.targetId,
    statement: finding.rationale,
    confidence: finding.confidence,
    evidence: { supportingRefs: [...new Set(finding.evidenceRefs)] },
    missingContext: finding.missingContext,
  }));
}
