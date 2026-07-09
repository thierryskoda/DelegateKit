import { truncateForLlmPrompt } from "../llm-decisions/cheap-structured-decision";
import { toLearningReviewTargets } from "../client-state/read-model";
import type {
  ProfileLearningReviewEvidence,
  ProfileLearningReviewEvidencePacket,
} from "./evidence";

export function compactLearningReviewPacket(packet: ProfileLearningReviewEvidencePacket) {
  return {
    ref: packet.ref,
    scope: packet.scope,
    sourceKind: packet.sourceKind,
    occurredAt: packet.occurredAt,
    targetRefs: packet.targetRefs,
    title: packet.title,
    text: packet.text ? truncateForLlmPrompt(packet.text, 1_200) : null,
    status: packet.status,
  };
}

export function compactLearningReviewTargets(evidence: ProfileLearningReviewEvidence) {
  return toLearningReviewTargets({
    durableState: evidence,
    priorOutcomes: evidence.priorOutcomes,
  });
}
