import type {
  ProfileLearningReviewEvidence,
  ProfileLearningReviewEvidencePacket,
} from "../evidence";
import { durableStateRefs } from "../../client-state/read-model";
import { normalizeLearningReviewCandidate } from "../candidate-normalization";
import type { ProfileLearningReviewGeneratedCandidate } from "../types";

export function knownLearningReviewEvidenceRefs(input: {
  evidence: ProfileLearningReviewEvidence;
  packets: readonly ProfileLearningReviewEvidencePacket[];
}): Set<string> {
  return new Set([
    ...input.packets.map((packet) => packet.ref),
    ...durableStateRefs(input.evidence),
    ...input.evidence.activities.map((activity) => `activity:${activity.id}`),
  ]);
}

export function normalizeSupportedReviewerCandidates(input: {
  candidates: readonly ProfileLearningReviewGeneratedCandidate[];
  refs: ReadonlySet<string>;
}): ProfileLearningReviewGeneratedCandidate[] {
  return input.candidates
    .filter((candidate) => candidate.evidenceRefs.every((ref) => input.refs.has(ref)))
    .map(normalizeLearningReviewCandidate)
    .filter((candidate): candidate is ProfileLearningReviewGeneratedCandidate =>
      Boolean(candidate),
    );
}

export function citedPacketsForCandidates(input: {
  candidates: readonly ProfileLearningReviewGeneratedCandidate[];
  packets: readonly ProfileLearningReviewEvidencePacket[];
}): ProfileLearningReviewEvidencePacket[] {
  const refs = new Set(input.candidates.flatMap((candidate) => candidate.evidenceRefs));
  return input.packets.filter((packet) => refs.has(packet.ref));
}
