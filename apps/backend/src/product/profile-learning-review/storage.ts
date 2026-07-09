import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type Database,
  type SupabaseServiceClient,
  type TableInsert,
} from "@ai-assistants/control-db";
import {
  profileLearningReviewCandidateRowSchema,
  profileLearningReviewCursorRowSchema,
  profileLearningReviewObservationRowSchema,
  profileLearningReviewRunRowSchema,
  type ControlPlaneJson,
} from "@ai-assistants/control-plane-contracts";
import type { z } from "zod";
import {
  PROFILE_LEARNING_REVIEW_MODEL,
  type ProfileLearningReviewGeneratedCandidate,
  type ProfileLearningReviewWindow,
} from "./types";

export type ProfileLearningReviewRun = z.infer<typeof profileLearningReviewRunRowSchema>;
export type ProfileLearningReviewCandidate = z.infer<
  typeof profileLearningReviewCandidateRowSchema
>;
export type ProfileLearningReviewCursor = z.infer<typeof profileLearningReviewCursorRowSchema>;
export type ProfileLearningReviewObservation = z.infer<
  typeof profileLearningReviewObservationRowSchema
>;

export type NewProfileLearningReviewObservation = {
  observationType: ProfileLearningReviewObservation["observation_type"];
  targetKind: ProfileLearningReviewObservation["target_kind"];
  targetId: string | null;
  statement: string;
  confidence: ProfileLearningReviewObservation["confidence"];
  evidence: Record<string, unknown>;
  missingContext?: string | null;
};

function jsonObject(value: Record<string, unknown>, label: string): ControlPlaneJson {
  return requireJsonObject(value, label);
}

export async function loadLearningReviewRunByLocalDate(
  db: SupabaseServiceClient,
  input: { profileId: string; localDate: string },
): Promise<ProfileLearningReviewRun | null> {
  const result = await db
    .from("profile_learning_review_runs")
    .select()
    .eq("profile_id", input.profileId)
    .eq("review_mode", "date_replay")
    .eq("local_date", input.localDate)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? profileLearningReviewRunRowSchema.parse(result.data) : null;
}

export async function loadLearningReviewRunByScheduledSourceEnd(
  db: SupabaseServiceClient,
  input: { profileId: string; sourceWindowEndAt: string },
): Promise<ProfileLearningReviewRun | null> {
  const result = await db
    .from("profile_learning_review_runs")
    .select()
    .eq("profile_id", input.profileId)
    .eq("review_mode", "scheduled_cursor")
    .eq("source_window_end_at", input.sourceWindowEndAt)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? profileLearningReviewRunRowSchema.parse(result.data) : null;
}

export async function createLearningReviewRun(
  db: SupabaseServiceClient,
  window: ProfileLearningReviewWindow,
): Promise<ProfileLearningReviewRun> {
  const insert = {
    profile_id: window.profileId,
    local_date: window.localDate,
    review_mode: window.reviewMode,
    window_start_at: window.windowStartAt,
    window_end_at: window.windowEndAt,
    source_window_start_at: window.sourceWindowStartAt,
    source_window_end_at: window.sourceWindowEndAt,
    context_window_start_at: window.contextWindowStartAt,
    context_window_end_at: window.contextWindowEndAt,
    status: "running",
    model: PROFILE_LEARNING_REVIEW_MODEL,
    metadata: jsonObject({}, "profileLearningReviewRun.metadata"),
  } satisfies TableInsert<"profile_learning_review_runs">;
  const result = await db.from("profile_learning_review_runs").insert(insert).select().single();
  return profileLearningReviewRunRowSchema.parse(
    requireSupabaseData("Create profile learning review run", result.data, result.error),
  );
}

export async function loadLearningReviewCursor(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<ProfileLearningReviewCursor | null> {
  const result = await db
    .from("profile_learning_review_cursors")
    .select()
    .eq("profile_id", profileId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? profileLearningReviewCursorRowSchema.parse(result.data) : null;
}

export async function advanceLearningReviewCursor(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    runId: string;
    processedThroughAt: string;
    metadata?: Record<string, unknown>;
  },
): Promise<ProfileLearningReviewCursor> {
  const runResult = await db
    .from("profile_learning_review_runs")
    .select("id, profile_id, status, source_window_start_at, source_window_end_at")
    .eq("id", input.runId)
    .eq("profile_id", input.profileId)
    .maybeSingle();
  const run = requireSupabaseData(
    "Load succeeded profile learning review run before cursor advance",
    runResult.data,
    runResult.error,
  );
  if (run.status !== "succeeded") {
    throw new Error(
      `Cannot advance learning review cursor for ${input.runId}: run is not succeeded.`,
    );
  }
  const processedThroughMs = new Date(input.processedThroughAt).getTime();
  const sourceStartMs = new Date(run.source_window_start_at).getTime();
  const sourceEndMs = new Date(run.source_window_end_at).getTime();
  if (
    !Number.isFinite(processedThroughMs) ||
    !Number.isFinite(sourceStartMs) ||
    !Number.isFinite(sourceEndMs) ||
    processedThroughMs <= sourceStartMs ||
    processedThroughMs > sourceEndMs
  ) {
    throw new Error(
      `Cannot advance learning review cursor outside run source window ${input.runId}.`,
    );
  }

  const upsert = {
    profile_id: input.profileId,
    processed_through_at: input.processedThroughAt,
    last_successful_run_id: input.runId,
    metadata: jsonObject(input.metadata ?? {}, "profileLearningReviewCursor.metadata"),
  } satisfies TableInsert<"profile_learning_review_cursors">;
  const result = await db
    .from("profile_learning_review_cursors")
    .upsert(upsert, { onConflict: "profile_id" })
    .select()
    .single();
  return profileLearningReviewCursorRowSchema.parse(
    requireSupabaseData("Advance profile learning review cursor", result.data, result.error),
  );
}

export async function restartLearningReviewRun(
  db: SupabaseServiceClient,
  input: { run: ProfileLearningReviewRun; window: ProfileLearningReviewWindow },
): Promise<ProfileLearningReviewRun> {
  const update = {
    status: "running",
    started_at: new Date().toISOString(),
    finished_at: null,
    window_start_at: input.window.windowStartAt,
    window_end_at: input.window.windowEndAt,
    review_mode: input.window.reviewMode,
    local_date: input.window.localDate,
    source_window_start_at: input.window.sourceWindowStartAt,
    source_window_end_at: input.window.sourceWindowEndAt,
    context_window_start_at: input.window.contextWindowStartAt,
    context_window_end_at: input.window.contextWindowEndAt,
    processed_source_end_at: null,
    summary: null,
    error_code: null,
    error_message: null,
    model: PROFILE_LEARNING_REVIEW_MODEL,
    metadata: jsonObject({}, "profileLearningReviewRun.metadata"),
  } satisfies Database["public"]["Tables"]["profile_learning_review_runs"]["Update"];
  const result = await db
    .from("profile_learning_review_runs")
    .update(update)
    .eq("id", input.run.id)
    .eq("profile_id", input.run.profile_id)
    .select()
    .single();
  return profileLearningReviewRunRowSchema.parse(
    requireSupabaseData("Restart profile learning review run", result.data, result.error),
  );
}

export async function finishLearningReviewRun(
  db: SupabaseServiceClient,
  input: {
    runId: string;
    profileId: string;
    status: "succeeded" | "failed";
    summary?: string;
    errorCode?: string;
    errorMessage?: string;
    processedSourceEndAt?: string | null;
  },
): Promise<ProfileLearningReviewRun> {
  const update: Database["public"]["Tables"]["profile_learning_review_runs"]["Update"] = {
    status: input.status,
    finished_at: new Date().toISOString(),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    ...(input.errorCode === undefined ? {} : { error_code: input.errorCode }),
    ...(input.errorMessage === undefined ? {} : { error_message: input.errorMessage }),
    ...(input.processedSourceEndAt === undefined
      ? {}
      : { processed_source_end_at: input.processedSourceEndAt }),
  };
  const result = await db
    .from("profile_learning_review_runs")
    .update(update)
    .eq("id", input.runId)
    .eq("profile_id", input.profileId)
    .select()
    .single();
  return profileLearningReviewRunRowSchema.parse(
    requireSupabaseData("Finish profile learning review run", result.data, result.error),
  );
}

export async function insertLearningReviewObservations(
  db: SupabaseServiceClient,
  input: {
    run: ProfileLearningReviewRun;
    observations: readonly NewProfileLearningReviewObservation[];
  },
): Promise<ProfileLearningReviewObservation[]> {
  if (input.observations.length === 0) return [];
  const inserts = input.observations.map((observation) => {
    const insert = {
      run_id: input.run.id,
      profile_id: input.run.profile_id,
      observation_type: observation.observationType,
      target_kind: observation.targetKind,
      target_id: observation.targetKind === "none" ? null : observation.targetId,
      statement: observation.statement,
      confidence: observation.confidence,
      evidence: jsonObject(observation.evidence, "profileLearningReviewObservation.evidence"),
      missing_context: observation.missingContext ?? null,
    } satisfies TableInsert<"profile_learning_review_observations">;
    return insert;
  });
  const result = await db.from("profile_learning_review_observations").insert(inserts).select();
  return requireSupabaseRows(
    "Insert profile learning review observations",
    result.data,
    result.error,
  ).map((row) => profileLearningReviewObservationRowSchema.parse(row));
}

export async function insertLearningReviewCandidates(
  db: SupabaseServiceClient,
  input: {
    run: ProfileLearningReviewRun;
    candidates: readonly ProfileLearningReviewGeneratedCandidate[];
    observationIdsByEvidenceRef?: ReadonlyMap<string, readonly string[]>;
  },
): Promise<ProfileLearningReviewCandidate[]> {
  if (input.candidates.length === 0) return [];
  const inserts = input.candidates.map((candidate) => {
    const evidenceRefs = [...new Set(candidate.evidenceRefs.map((ref) => ref.trim()))];
    const observationIds = [
      ...new Set(
        evidenceRefs.flatMap((ref) => [...(input.observationIdsByEvidenceRef?.get(ref) ?? [])]),
      ),
    ];
    const insert = {
      run_id: input.run.id,
      profile_id: input.run.profile_id,
      candidate_type: candidate.candidateType,
      target_kind: candidate.targetKind,
      target_id: candidate.targetKind === "none" ? null : candidate.targetId,
      status: "proposed",
      confidence: candidate.confidence,
      rationale: candidate.rationale,
      evidence: jsonObject(
        {
          supportingRefs: evidenceRefs,
          counterRefs: [...new Set(candidate.counterEvidenceRefs ?? [])],
          observationIds,
          verifier: candidate.verifier ?? null,
        },
        "profileLearningReviewCandidate.evidence",
      ),
      proposed_patch: jsonObject(
        candidate.proposedPatch,
        "profileLearningReviewCandidate.proposedPatch",
      ),
      applied_reference: jsonObject({}, "profileLearningReviewCandidate.appliedReference"),
    } satisfies TableInsert<"profile_learning_review_candidates">;
    return insert;
  });
  const result = await db.from("profile_learning_review_candidates").insert(inserts).select();
  return requireSupabaseRows(
    "Insert profile learning review candidates",
    result.data,
    result.error,
  ).map((row) => profileLearningReviewCandidateRowSchema.parse(row));
}

export async function updateLearningReviewCandidateStatus(
  db: SupabaseServiceClient,
  input: {
    candidateId: string;
    profileId: string;
    status: "applying" | "auto_applied" | "client_applied" | "rejected" | "skipped" | "failed";
    appliedReference?: Record<string, unknown>;
    failureMessage?: string;
  },
): Promise<ProfileLearningReviewCandidate> {
  const update: Database["public"]["Tables"]["profile_learning_review_candidates"]["Update"] = {
    status: input.status,
    ...(input.status === "auto_applied" || input.status === "client_applied"
      ? { applied_at: new Date().toISOString() }
      : {}),
    ...(input.appliedReference === undefined
      ? {}
      : {
          applied_reference: jsonObject(
            input.appliedReference,
            "profileLearningReviewCandidate.appliedReference",
          ),
        }),
    ...(input.failureMessage === undefined ? {} : { failure_message: input.failureMessage }),
  };
  const result = await db
    .from("profile_learning_review_candidates")
    .update(update)
    .eq("id", input.candidateId)
    .eq("profile_id", input.profileId)
    .select()
    .single();
  return profileLearningReviewCandidateRowSchema.parse(
    requireSupabaseData("Update profile learning review candidate", result.data, result.error),
  );
}

export async function claimLearningReviewCandidateForApply(
  db: SupabaseServiceClient,
  input: { candidateId: string; profileId: string },
): Promise<ProfileLearningReviewCandidate> {
  const result = await db
    .from("profile_learning_review_candidates")
    .update({
      status: "applying",
      failure_message: null,
    } satisfies Database["public"]["Tables"]["profile_learning_review_candidates"]["Update"])
    .eq("id", input.candidateId)
    .eq("profile_id", input.profileId)
    .eq("status", "proposed")
    .select()
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new Error("Learning recommendation is no longer awaiting a decision.");
  }
  return profileLearningReviewCandidateRowSchema.parse(result.data);
}

export async function getLearningReviewCandidate(
  db: SupabaseServiceClient,
  input: { profileId: string; candidateId: string },
): Promise<ProfileLearningReviewCandidate> {
  const result = await db
    .from("profile_learning_review_candidates")
    .select()
    .eq("profile_id", input.profileId)
    .eq("id", input.candidateId)
    .maybeSingle();
  return profileLearningReviewCandidateRowSchema.parse(
    requireSupabaseData("Load profile learning review candidate", result.data, result.error),
  );
}

export async function listPortalLearningReviewCandidates(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<ProfileLearningReviewCandidate[]> {
  const result = await db
    .from("profile_learning_review_candidates")
    .select()
    .eq("profile_id", profileId)
    .eq("status", "proposed")
    .neq("candidate_type", "no_action")
    .order("created_at", { ascending: false })
    .limit(50);
  return requireSupabaseRows(
    "List portal profile learning review candidates",
    result.data,
    result.error,
  ).map((row) => profileLearningReviewCandidateRowSchema.parse(row));
}

export async function listRecentLearningReviewCandidateOutcomes(
  db: SupabaseServiceClient,
  input: { profileId: string; limit?: number },
): Promise<ProfileLearningReviewCandidate[]> {
  const result = await db
    .from("profile_learning_review_candidates")
    .select()
    .eq("profile_id", input.profileId)
    .in("status", ["auto_applied", "client_applied", "rejected", "failed", "skipped"])
    .order("updated_at", { ascending: false })
    .limit(input.limit ?? 30);
  return requireSupabaseRows(
    "List recent profile learning review candidate outcomes",
    result.data,
    result.error,
  ).map((row) => profileLearningReviewCandidateRowSchema.parse(row));
}
