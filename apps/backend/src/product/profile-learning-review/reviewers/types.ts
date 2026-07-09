import type {
  ProfileLearningReviewEvidence,
  ProfileLearningReviewEvidencePacket,
} from "../evidence";
import type { NewProfileLearningReviewObservation } from "../storage";
import type { ProfileLearningReviewGeneratedCandidate } from "../types";

const PROFILE_LEARNING_REVIEW_REVIEWER_IDS = [
  "daily_signal_reviewer",
  "state_destination_reviewer",
  "durable_state_structure_reviewer",
  "cross_state_consistency_reviewer",
] as const;

type ProfileLearningReviewReviewerId = (typeof PROFILE_LEARNING_REVIEW_REVIEWER_IDS)[number];

export type ProfileLearningReviewReviewerInput = {
  evidence: ProfileLearningReviewEvidence;
  packets: readonly ProfileLearningReviewEvidencePacket[];
  refs: ReadonlySet<string>;
  proposedRecommendationsSoFar: readonly ProfileLearningReviewGeneratedCandidate[];
};

export type ProfileLearningReviewReviewerResult = {
  reviewerId: ProfileLearningReviewReviewerId;
  summary: string;
  observations: NewProfileLearningReviewObservation[];
  candidates: ProfileLearningReviewGeneratedCandidate[];
};

export type ProfileLearningReviewReviewer = {
  id: ProfileLearningReviewReviewerId;
  review(input: ProfileLearningReviewReviewerInput): Promise<ProfileLearningReviewReviewerResult>;
};
