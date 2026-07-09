import type { ProfileLearningReviewEvidence } from "./evidence";
import type { NewProfileLearningReviewObservation } from "./storage";
import type { ProfileLearningReviewDecision } from "./types";
import { runProfileLearningReviewReviewers } from "./reviewers";

export async function generateProfileLearningReviewDecisionAndObservations(
  evidence: ProfileLearningReviewEvidence,
): Promise<{
  decision: ProfileLearningReviewDecision;
  observations: NewProfileLearningReviewObservation[];
}> {
  return runProfileLearningReviewReviewers({ evidence });
}
