import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../../shared/diagnostics";
import { profileLearningReviewEvidencePackets } from "../evidence";
import { compactLearningReviewTargets } from "../prompt-shaping";
import type { NewProfileLearningReviewObservation } from "../storage";
import type {
  ProfileLearningReviewDecision,
  ProfileLearningReviewGeneratedCandidate,
} from "../types";
import { verifyLearningReviewCandidates } from "../verification";
import { crossStateConsistencyReviewer } from "./cross-state-consistency-reviewer";
import { dailySignalReviewer } from "./daily-signal-reviewer";
import { durableStateStructureReviewer } from "./durable-state-structure-reviewer";
import { stateDestinationReviewer } from "./state-destination-reviewer";
import { citedPacketsForCandidates, knownLearningReviewEvidenceRefs } from "./shared";
import type { ProfileLearningReviewReviewer } from "./types";

const REVIEWERS: readonly ProfileLearningReviewReviewer[] = [
  dailySignalReviewer,
  stateDestinationReviewer,
  durableStateStructureReviewer,
  crossStateConsistencyReviewer,
];

function candidateMergeKey(candidate: ProfileLearningReviewGeneratedCandidate): string {
  return [
    candidate.candidateType,
    candidate.targetKind,
    candidate.targetId ?? "none",
    JSON.stringify(candidate.proposedPatch),
  ].join(":");
}

function dedupeCandidates(
  candidates: readonly ProfileLearningReviewGeneratedCandidate[],
): ProfileLearningReviewGeneratedCandidate[] {
  const seen = new Set<string>();
  const deduped: ProfileLearningReviewGeneratedCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidateMergeKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return removeCompetingTargetEdits(deduped);
}

function scheduledTaskSourceRefs(candidate: ProfileLearningReviewGeneratedCandidate): string[] {
  return candidate.evidenceRefs.filter((ref) => ref.startsWith("scheduled_task:"));
}

function scheduledTaskEditRefs(
  candidates: readonly ProfileLearningReviewGeneratedCandidate[],
): Set<string> {
  return new Set(
    candidates.flatMap((candidate) =>
      candidate.targetKind === "assistant_scheduled_task" &&
      candidate.targetId &&
      candidate.candidateType === "scheduled_task_update"
        ? [`scheduled_task:${candidate.targetId}`]
        : [],
    ),
  );
}

function dropUnpairedScheduledTaskSplitCreates(
  candidates: readonly ProfileLearningReviewGeneratedCandidate[],
): ProfileLearningReviewGeneratedCandidate[] {
  const taskEditRefs = scheduledTaskEditRefs(candidates);
  return candidates.filter((candidate) => {
    if (candidate.candidateType !== "scheduled_task_create") return true;
    const sourceRefs = scheduledTaskSourceRefs(candidate);
    if (sourceRefs.length === 0) return true;
    return sourceRefs.every((ref) => taskEditRefs.has(ref));
  });
}

function targetEditKey(candidate: ProfileLearningReviewGeneratedCandidate): string | null {
  if (!candidate.targetId || candidate.targetKind === "none") return null;
  if (candidate.candidateType.endsWith("_create")) {
    return null;
  }
  return `${candidate.targetKind}:${candidate.targetId}`;
}

function confidenceRank(candidate: ProfileLearningReviewGeneratedCandidate): number {
  if (candidate.confidence === "high") return 3;
  if (candidate.confidence === "medium") return 2;
  return 1;
}

function removeCompetingTargetEdits(
  candidates: readonly ProfileLearningReviewGeneratedCandidate[],
): ProfileLearningReviewGeneratedCandidate[] {
  const groups = new Map<string, ProfileLearningReviewGeneratedCandidate[]>();
  const passthrough: ProfileLearningReviewGeneratedCandidate[] = [];
  for (const candidate of candidates) {
    const key = targetEditKey(candidate);
    if (!key) {
      passthrough.push(candidate);
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  for (const group of groups.values()) {
    if (group.length === 1) {
      const only = group[0];
      if (only) passthrough.push(only);
      continue;
    }
    const ranked = [...group].sort((left, right) => confidenceRank(right) - confidenceRank(left));
    const top = ranked[0];
    const second = ranked[1];
    if (top && second && confidenceRank(top) > confidenceRank(second)) {
      passthrough.push(top);
    }
  }
  return passthrough;
}

export async function runProfileLearningReviewReviewers(input: {
  evidence: Parameters<typeof profileLearningReviewEvidencePackets>[0];
}): Promise<{
  decision: ProfileLearningReviewDecision;
  observations: NewProfileLearningReviewObservation[];
}> {
  const packets = profileLearningReviewEvidencePackets(input.evidence);
  const refs = knownLearningReviewEvidenceRefs({ evidence: input.evidence, packets });
  const observations: NewProfileLearningReviewObservation[] = [];
  const candidates: ProfileLearningReviewGeneratedCandidate[] = [];
  const summaries: string[] = [];

  for (const reviewer of REVIEWERS) {
    const result = await reviewer.review({
      evidence: input.evidence,
      packets,
      refs,
      proposedRecommendationsSoFar: candidates,
    });
    observations.push(...result.observations);
    candidates.push(...result.candidates);
    summaries.push(result.summary);
    emitDiagnostic(backendDiagnosticLogger(), "profile_learning_review.reviewer_completed", {
      ok: true,
      level: "debug",
      profile_id: input.evidence.window.profileId,
      attrs: {
        local_date: input.evidence.window.localDate,
        reviewer_id: result.reviewerId,
        candidates: result.candidates.length,
        observations: result.observations.length,
      },
    });
  }

  const structurallyCompleteCandidates = dropUnpairedScheduledTaskSplitCreates(candidates);
  if (structurallyCompleteCandidates.length < candidates.length) {
    emitDiagnostic(backendDiagnosticLogger(), "profile_learning_review.unpaired_split_dropped", {
      ok: true,
      level: "warn",
      profile_id: input.evidence.window.profileId,
      attrs: {
        local_date: input.evidence.window.localDate,
        dropped_candidates: candidates.length - structurallyCompleteCandidates.length,
      },
    });
  }

  const dedupedCandidates = dedupeCandidates(structurallyCompleteCandidates);
  const citedPackets = citedPacketsForCandidates({ candidates: dedupedCandidates, packets });
  const verifiedCandidates = await verifyLearningReviewCandidates({
    evidence: input.evidence,
    targets: compactLearningReviewTargets(input.evidence),
    candidates: dedupedCandidates,
    citedPackets,
    packets,
    refs,
  });

  return {
    decision: {
      summary:
        summaries.filter(Boolean).join(" ").trim() ||
        "Learning review found no durable profile changes.",
      candidates: verifiedCandidates,
    },
    observations,
  };
}
