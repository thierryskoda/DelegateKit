import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import type { SupabaseServiceClient, TableInsert } from "@ai-assistants/control-db";
import { requireSupabaseData } from "@ai-assistants/control-db";
import { profileLearningReviewRunRowSchema } from "@ai-assistants/control-plane-contracts";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import {
  durableStateRefs,
  loadClientDurableState,
  toLearningReviewTargets,
} from "../client-state/read-model";
import {
  cheapStructuredDecision,
  DURABLE_STRUCTURED_DECISION_MODEL,
  renderSanitizedJsonForLlm,
} from "../llm-decisions/cheap-structured-decision";
import { normalizeLearningReviewCandidate } from "../profile-learning-review/candidate-normalization";
import {
  profileLearningReviewDecisionSchema,
  type ProfileLearningReviewDecision,
  type ProfileLearningReviewGeneratedCandidate,
  type ProfileLearningReviewWindow,
} from "../profile-learning-review/types";
import {
  finishLearningReviewRun,
  insertLearningReviewCandidates,
  listRecentLearningReviewCandidateOutcomes,
  type ProfileLearningReviewRun,
} from "../profile-learning-review/storage";
import { verifyLearningReviewCandidates } from "../profile-learning-review/verification";
import type {
  ProfileLearningReviewEvidence,
  ProfileLearningReviewEvidencePacket,
} from "../profile-learning-review/evidence";

const HYGIENE_PROMPT_MAX_CHARS = 28_000;
const HYGIENE_MAX_OUTPUT_TOKENS = 8_000;

type ProfileStateHygieneResult = {
  runId: string;
  status: "succeeded" | "failed";
  summary: string;
  proposedCandidates: number;
  persistedCandidates: number;
};

function currentLocalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentWindow(profileId: string): ProfileLearningReviewWindow {
  const start = new Date();
  const end = new Date(start.getTime() + 1_000);
  return {
    profileId,
    reviewMode: "date_replay",
    localDate: currentLocalDate(),
    windowStartAt: start.toISOString(),
    windowEndAt: end.toISOString(),
    sourceWindowStartAt: start.toISOString(),
    sourceWindowEndAt: end.toISOString(),
    contextWindowStartAt: start.toISOString(),
    contextWindowEndAt: end.toISOString(),
    cursorProcessedThroughAt: null,
  };
}

async function createStateHygieneRun(
  db: SupabaseServiceClient,
  window: ProfileLearningReviewWindow,
): Promise<ProfileLearningReviewRun> {
  const insert = {
    profile_id: window.profileId,
    local_date: window.localDate,
    review_mode: "date_replay",
    window_start_at: window.windowStartAt,
    window_end_at: window.windowEndAt,
    source_window_start_at: window.sourceWindowStartAt,
    source_window_end_at: window.sourceWindowEndAt,
    context_window_start_at: window.contextWindowStartAt,
    context_window_end_at: window.contextWindowEndAt,
    status: "running",
    model: DURABLE_STRUCTURED_DECISION_MODEL,
    metadata: {
      reviewKind: "profile_state_hygiene",
      source: "on_demand",
    },
  } satisfies TableInsert<"profile_learning_review_runs">;
  const result = await db.from("profile_learning_review_runs").insert(insert).select().single();
  return profileLearningReviewRunRowSchema.parse(
    requireSupabaseData("Create profile state hygiene review run", result.data, result.error),
  );
}

function packetText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return null;
  const text = JSON.stringify(value);
  return text && text !== "{}" && text !== "null" ? text.slice(0, 2_000) : null;
}

function durablePackets(
  evidence: ProfileLearningReviewEvidence,
): ProfileLearningReviewEvidencePacket[] {
  const occurredAt = evidence.window.windowEndAt;
  return [
    ...evidence.scheduledTasks.map((task) => ({
      ref: `scheduled_task:${task.id}`,
      scope: "context" as const,
      sourceKind: "durable_state.scheduled_task",
      occurredAt,
      targetRefs: [`scheduled_task:${task.id}`],
      title: task.title,
      text: [task.instructions, packetText(task.schedule)].filter(Boolean).join("\n\n"),
      status: task.status,
    })),
    ...evidence.workRoutes.map((route) => ({
      ref: `work_route:${route.id}`,
      scope: "context" as const,
      sourceKind: "durable_state.work_route",
      occurredAt,
      targetRefs: [`work_route:${route.id}`],
      title: route.event_type,
      text: packetText(route.config),
      status: route.managed_by,
    })),
    ...evidence.profileGuidance.map((guidance) => ({
      ref: `profile_guidance:${guidance.id}`,
      scope: "context" as const,
      sourceKind: "durable_state.profile_guidance",
      occurredAt,
      targetRefs: [`profile_guidance:${guidance.id}`],
      title: guidance.title,
      text: [guidance.selector_description, guidance.body_markdown].filter(Boolean).join("\n\n"),
      status: guidance.status,
    })),
  ].filter((packet) => packet.title || packet.text);
}

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
  return deduped;
}

async function generateHygieneDecision(input: {
  evidence: ProfileLearningReviewEvidence;
  targets: unknown;
  refs: ReadonlySet<string>;
}): Promise<ProfileLearningReviewDecision> {
  const result = await cheapStructuredDecision({
    profileId: input.evidence.profile.id,
    diagnosticKind: "profile_state_hygiene.reviewer",
    schema: profileLearningReviewDecisionSchema,
    outputName: "ProfileStateHygieneReview",
    outputDescription: "Review-first durable state hygiene recommendations.",
    instructions:
      "Find duplicate, misplaced, contradictory, stale-looking, or overloaded durable profile state. Return no candidates when evidence is thin.",
    prompt: [
      "You are auditing durable state for a private assistant.",
      "This is not a daily learning review. Do not infer new preferences from missing interaction evidence.",
      "Use only durable state refs provided in currentMutableTargets/evidenceRefs.",
      "Do not propose provider writes, assistant work items, client-visible messages, or direct external actions.",
      "Prefer review-first recommendations. Broad structural splits, deletes, archives, and cross-state moves must remain proposed candidates.",
      "Good findings include duplicate guidance, overloaded scheduled tasks, overloaded routes, contradictory guidance, and guidance that belongs as a scheduled task or route.",
      "Return at most 3 candidates. Prefer the highest-impact durable-state fixes over exhaustiveness.",
      "Keep summary, rationales, and verifier reasons concise. Do not repeat full state text inside candidate fields.",
      "Patch contracts:",
      "- scheduled_task_update uses targetKind assistant_scheduled_task, targetId existing task id, and proposedPatch containing at least one of title, instructions, schedule, plus changeSummary?.",
      "- scheduled_task_pause and scheduled_task_delete use targetKind assistant_scheduled_task, targetId existing task id, and proposedPatch { changeSummary? }.",
      "- guidance_archive uses targetKind profile_guidance, targetId existing guidance id, and proposedPatch { expectedRevision, changeSummary }. Use the target revision from currentMutableTargets.",
      "- guidance_update uses targetKind profile_guidance, targetId existing guidance id, and proposedPatch containing expectedRevision, changeSummary, plus at least one of title, selectorDescription, bodyMarkdown.",
      "Return no candidates when the durable state is already coherent or when a change would need client confirmation.",
      "",
      renderSanitizedJsonForLlm(
        {
          profile: input.evidence.profile,
          currentMutableTargets: input.targets,
          allowedRefs: [...input.refs],
          priorLearningOutcomes: input.evidence.priorOutcomes.map((outcome) => ({
            candidateType: outcome.candidate_type,
            targetKind: outcome.target_kind,
            targetId: outcome.target_id,
            status: outcome.status,
            rationale: outcome.rationale,
            updatedAt: outcome.updated_at,
          })),
        },
        HYGIENE_PROMPT_MAX_CHARS,
      ),
    ].join("\n"),
    timeoutMs: 18_000,
    maxOutputTokens: HYGIENE_MAX_OUTPUT_TOKENS,
    model: DURABLE_STRUCTURED_DECISION_MODEL,
    attrs: { profile_id: input.evidence.profile.id },
  });
  if (!result.ok) {
    throw new Error(`Profile state hygiene reviewer failed: ${result.error}`);
  }
  return result.value;
}

export async function runProfileStateHygieneReview(
  db: SupabaseServiceClient,
  input: { profileId: string },
): Promise<ProfileStateHygieneResult> {
  const window = currentWindow(input.profileId);
  const run = await createStateHygieneRun(db, window);
  try {
    const [durableState, priorOutcomes] = await Promise.all([
      loadClientDurableState(db, {
        profileId: input.profileId,
        mode: "reviewer",
        limit: 200,
      }),
      listRecentLearningReviewCandidateOutcomes(db, { profileId: input.profileId }),
    ]);
    const evidence: ProfileLearningReviewEvidence = {
      profile: {
        id: durableState.profile.id,
        display_name: durableState.profile.display_name,
        timezone: durableState.profile.timezone,
        status: durableState.profile.status,
      },
      window,
      channelMessages: [],
      activities: [],
      assistantEvents: [],
      workItems: [],
      actions: [],
      proposals: [],
      scheduledTasks: durableState.scheduledTasks,
      workRoutes: durableState.workRoutes,
      profileGuidance: durableState.profileGuidance,
      priorOutcomes,
    };
    const targets = toLearningReviewTargets({ durableState, priorOutcomes });
    const packets = durablePackets(evidence);
    const refs = new Set([
      ...durableStateRefs(durableState),
      ...packets.map((packet) => packet.ref),
    ]);
    const decision = await generateHygieneDecision({ evidence, targets, refs });
    const normalized = dedupeCandidates(
      decision.candidates
        .filter((candidate) => candidate.evidenceRefs.every((ref) => refs.has(ref)))
        .map(normalizeLearningReviewCandidate)
        .filter((candidate): candidate is ProfileLearningReviewGeneratedCandidate =>
          Boolean(candidate),
        ),
    );
    const verified = await verifyLearningReviewCandidates({
      evidence,
      targets,
      candidates: normalized,
      citedPackets: packets.filter((packet) =>
        normalized.some((candidate) => candidate.evidenceRefs.includes(packet.ref)),
      ),
      packets,
      refs,
    });
    const persisted = await insertLearningReviewCandidates(db, {
      run,
      candidates: verified,
    });
    await finishLearningReviewRun(db, {
      runId: run.id,
      profileId: input.profileId,
      status: "succeeded",
      summary: decision.summary,
      processedSourceEndAt: window.sourceWindowEndAt,
    });
    emitDiagnostic(backendDiagnosticLogger(), "profile_state_hygiene.completed", {
      ok: true,
      level: "info",
      profile_id: input.profileId,
      attrs: {
        run_id: run.id,
        proposed_candidates: decision.candidates.length,
        persisted_candidates: persisted.length,
      },
    });
    return {
      runId: run.id,
      status: "succeeded",
      summary: decision.summary,
      proposedCandidates: decision.candidates.length,
      persistedCandidates: persisted.length,
    };
  } catch (error) {
    await finishLearningReviewRun(db, {
      runId: run.id,
      profileId: input.profileId,
      status: "failed",
      errorCode: "profile_state_hygiene_failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
