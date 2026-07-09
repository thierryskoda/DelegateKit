import {
  profileLearningReviewCandidateRowSchema,
  profileLearningReviewCursorRowSchema,
  profileLearningReviewObservationRowSchema,
  profileLearningReviewRunRowSchema,
} from "@ai-assistants/control-plane-contracts";
import { requireSupabaseRows } from "@ai-assistants/control-db";
import type { Hono } from "hono";
import { z } from "zod";
import { parseQuery, parseRouteParams } from "../../shared/http-validation";
import { controlDb } from "../control-db";
import { requireMachine } from "../http-auth";
import { parseProfileLearningReviewCandidateEvidence } from "../../product/profile-learning-review/types";

const routeParamsSchema = z
  .object({
    profileId: z.string().trim().min(1),
  })
  .strict();

const listQuerySchema = z
  .object({
    since: z.string().date().optional(),
    until: z.string().date().optional(),
    limit: z.coerce.number().int().positive().max(100).default(30),
  })
  .strict();

type InternalLearningReviewCandidateDto = {
  id: string;
  candidateType: string;
  targetKind: string;
  targetId: string | null;
  status: string;
  confidence: string;
  rationale: string;
  proposedPatch: unknown;
  evidence: {
    supportingRefs: string[];
    counterRefs: string[];
    observationIds: string[];
    verifier: unknown;
  };
  appliedAt: string | null;
  appliedReference: unknown;
  failureMessage: string | null;
  createdAt: string;
};

type InternalLearningReviewObservationDto = {
  id: string;
  observationType: string;
  targetKind: string;
  targetId: string | null;
  statement: string;
  confidence: string;
  evidence: unknown;
  missingContext: string | null;
  createdAt: string;
};

function candidateDto(
  candidate: z.infer<typeof profileLearningReviewCandidateRowSchema>,
): InternalLearningReviewCandidateDto {
  const evidence = parseProfileLearningReviewCandidateEvidence(candidate.evidence);
  return {
    id: candidate.id,
    candidateType: candidate.candidate_type,
    targetKind: candidate.target_kind,
    targetId: candidate.target_id,
    status: candidate.status,
    confidence: candidate.confidence,
    rationale: candidate.rationale,
    proposedPatch: candidate.proposed_patch,
    evidence: {
      supportingRefs: evidence.supportingRefs,
      counterRefs: evidence.counterRefs,
      observationIds: evidence.observationIds,
      verifier: evidence.verifier,
    },
    appliedAt: candidate.applied_at,
    appliedReference: candidate.applied_reference,
    failureMessage: candidate.failure_message,
    createdAt: candidate.created_at,
  };
}

function statusCounts(candidates: readonly InternalLearningReviewCandidateDto[]) {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    counts[candidate.status] = (counts[candidate.status] ?? 0) + 1;
  }
  return counts;
}

function observationsByType(observations: readonly InternalLearningReviewObservationDto[]) {
  const byType: Record<string, InternalLearningReviewObservationDto[]> = {};
  for (const observation of observations) {
    byType[observation.observationType] = [
      ...(byType[observation.observationType] ?? []),
      observation,
    ];
  }
  return byType;
}

export function registerInternalLearningReviewRoutes(app: Hono) {
  app.get("/internal/ai-assistants/profiles/:profileId/learning-reviews", async (c) => {
    requireMachine(c);
    const params = parseRouteParams(c, routeParamsSchema);
    const query = parseQuery(c, listQuerySchema, "Learning review query");
    const db = controlDb();

    const cursorResult = await db
      .from("profile_learning_review_cursors")
      .select()
      .eq("profile_id", params.profileId)
      .maybeSingle();
    if (cursorResult.error) throw cursorResult.error;
    const cursor = cursorResult.data
      ? profileLearningReviewCursorRowSchema.parse(cursorResult.data)
      : null;

    let runsQuery = db
      .from("profile_learning_review_runs")
      .select()
      .eq("profile_id", params.profileId)
      .order("source_window_end_at", { ascending: false })
      .limit(query.limit);
    if (query.since) runsQuery = runsQuery.gte("source_window_end_at", query.since);
    if (query.until) runsQuery = runsQuery.lte("source_window_end_at", query.until);

    const runsResult = await runsQuery;
    const runs = requireSupabaseRows(
      "List profile learning review runs",
      runsResult.data,
      runsResult.error,
    ).map((row) => profileLearningReviewRunRowSchema.parse(row));

    const runIds = runs.map((run) => run.id);
    const candidatesResult =
      runIds.length === 0
        ? null
        : await db
            .from("profile_learning_review_candidates")
            .select()
            .eq("profile_id", params.profileId)
            .in("run_id", runIds)
            .order("created_at", { ascending: true });
    const candidates =
      candidatesResult === null
        ? []
        : requireSupabaseRows(
            "List profile learning review candidates",
            candidatesResult.data,
            candidatesResult.error,
          ).map((row) => profileLearningReviewCandidateRowSchema.parse(row));
    const observationsResult =
      runIds.length === 0
        ? null
        : await db
            .from("profile_learning_review_observations")
            .select()
            .eq("profile_id", params.profileId)
            .in("run_id", runIds)
            .order("created_at", { ascending: true });
    const observations =
      observationsResult === null
        ? []
        : requireSupabaseRows(
            "List profile learning review observations",
            observationsResult.data,
            observationsResult.error,
          ).map((row) => profileLearningReviewObservationRowSchema.parse(row));

    const candidatesByRun = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      candidatesByRun.set(candidate.run_id, [
        ...(candidatesByRun.get(candidate.run_id) ?? []),
        candidate,
      ]);
    }
    const observationsByRun = new Map<string, typeof observations>();
    for (const observation of observations) {
      observationsByRun.set(observation.run_id, [
        ...(observationsByRun.get(observation.run_id) ?? []),
        observation,
      ]);
    }

    return c.json({
      cursor: cursor
        ? {
            profileId: cursor.profile_id,
            processedThroughAt: cursor.processed_through_at,
            lastSuccessfulRunId: cursor.last_successful_run_id,
            metadata: cursor.metadata,
            updatedAt: cursor.updated_at,
          }
        : null,
      runs: runs.map((run) => ({
        id: run.id,
        profileId: run.profile_id,
        reviewMode: run.review_mode,
        localDate: run.local_date,
        windowStartAt: run.window_start_at,
        windowEndAt: run.window_end_at,
        sourceWindowStartAt: run.source_window_start_at,
        sourceWindowEndAt: run.source_window_end_at,
        contextWindowStartAt: run.context_window_start_at,
        contextWindowEndAt: run.context_window_end_at,
        processedSourceEndAt: run.processed_source_end_at,
        status: run.status,
        model: run.model,
        summary: run.summary,
        errorCode: run.error_code,
        errorMessage: run.error_message,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
        statusCounts: statusCounts((candidatesByRun.get(run.id) ?? []).map(candidateDto)),
        observationsByType: observationsByType(
          (observationsByRun.get(run.id) ?? []).map((observation) => ({
            id: observation.id,
            observationType: observation.observation_type,
            targetKind: observation.target_kind,
            targetId: observation.target_id,
            statement: observation.statement,
            confidence: observation.confidence,
            evidence: observation.evidence,
            missingContext: observation.missing_context,
            createdAt: observation.created_at,
          })),
        ),
        candidates: (candidatesByRun.get(run.id) ?? []).map(candidateDto),
      })),
    });
  });
}
