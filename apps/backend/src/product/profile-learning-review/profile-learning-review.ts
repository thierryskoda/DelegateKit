import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
} from "@ai-assistants/control-db";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { applyProfileLearningReviewCandidates } from "./apply";
import { loadProfileLearningReviewEvidence, type ProfileLearningReviewEvidence } from "./evidence";
import { generateProfileLearningReviewDecisionAndObservations } from "./generate";
import {
  createLearningReviewRun,
  advanceLearningReviewCursor,
  finishLearningReviewRun,
  insertLearningReviewCandidates,
  insertLearningReviewObservations,
  type ProfileLearningReviewObservation,
  loadLearningReviewCursor,
  loadLearningReviewRunByScheduledSourceEnd,
  loadLearningReviewRunByLocalDate,
  restartLearningReviewRun,
} from "./storage";
import type { ProfileLearningReviewWindow } from "./types";

const DAILY_REVIEW_PROFILE_LIMIT = 200;
const LEARNING_REVIEW_CONTEXT_OVERLAP_MS = 72 * 60 * 60 * 1_000;
const LEARNING_REVIEW_MAX_BOOTSTRAP_LOOKBACK_MS = 24 * 60 * 60 * 1_000;

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error(`Could not compute local date parts for ${timeZone}.`);
  }
  return { year, month, day };
}

function localDateString(input: { year: number; month: number; day: number }): string {
  return [
    String(input.year).padStart(4, "0"),
    String(input.month).padStart(2, "0"),
    String(input.day).padStart(2, "0"),
  ].join("-");
}

function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid local date ${localDate}.`);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return localDateString({
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  });
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const offset = parts.find((part) => part.type === "timeZoneName")?.value;
  if (!offset || offset === "GMT" || offset === "UTC") return 0;
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offset);
  if (!match) throw new Error(`Could not parse timezone offset ${offset} for ${timeZone}.`);
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * ((hours * 60 + minutes) * 60_000);
}

function utcInstantForLocalMidnight(localDate: string, timeZone: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid local date ${localDate}.`);
  let utcMs = Date.UTC(year, month - 1, day);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    utcMs = Date.UTC(year, month - 1, day) - timeZoneOffsetMs(new Date(utcMs), timeZone);
  }
  return new Date(utcMs).toISOString();
}

export function completedLocalDateForProfile(input: { now: Date; timeZone: string }): string {
  const today = localDateString(datePartsInTimeZone(input.now, input.timeZone));
  return addDaysToLocalDate(today, -1);
}

export function learningReviewWindowForLocalDate(input: {
  profileId: string;
  localDate: string;
  timeZone: string;
}): ProfileLearningReviewWindow {
  const windowStartAt = utcInstantForLocalMidnight(input.localDate, input.timeZone);
  const windowEndAt = utcInstantForLocalMidnight(
    addDaysToLocalDate(input.localDate, 1),
    input.timeZone,
  );
  return {
    profileId: input.profileId,
    reviewMode: "date_replay",
    localDate: input.localDate,
    windowStartAt,
    windowEndAt,
    sourceWindowStartAt: windowStartAt,
    sourceWindowEndAt: windowEndAt,
    contextWindowStartAt: windowStartAt,
    contextWindowEndAt: windowEndAt,
    cursorProcessedThroughAt: null,
  };
}

async function learningReviewCursorWindow(input: {
  db: SupabaseServiceClient;
  profileId: string;
  now: Date;
}): Promise<ProfileLearningReviewWindow | null> {
  const timeZone = await loadProfileTimeZone(input.db, input.profileId);
  const completeLocalDate = completedLocalDateForProfile({ now: input.now, timeZone });
  const sourceWindowEndAt = utcInstantForLocalMidnight(
    addDaysToLocalDate(completeLocalDate, 1),
    timeZone,
  );
  const cursor = await loadLearningReviewCursor(input.db, input.profileId);
  const sourceWindowStartAt =
    cursor?.processed_through_at ??
    new Date(
      new Date(sourceWindowEndAt).getTime() - LEARNING_REVIEW_MAX_BOOTSTRAP_LOOKBACK_MS,
    ).toISOString();
  if (sourceWindowStartAt >= sourceWindowEndAt) return null;

  const contextWindowStartAt = new Date(
    Math.max(0, new Date(sourceWindowStartAt).getTime() - LEARNING_REVIEW_CONTEXT_OVERLAP_MS),
  ).toISOString();

  return {
    profileId: input.profileId,
    reviewMode: "scheduled_cursor",
    localDate: null,
    windowStartAt: sourceWindowStartAt,
    windowEndAt: sourceWindowEndAt,
    sourceWindowStartAt,
    sourceWindowEndAt,
    contextWindowStartAt,
    contextWindowEndAt: sourceWindowEndAt,
    cursorProcessedThroughAt: cursor?.processed_through_at ?? null,
  };
}

async function loadProfileTimeZone(db: SupabaseServiceClient, profileId: string): Promise<string> {
  const result = await db.from("profiles").select("timezone").eq("id", profileId).maybeSingle();
  const row = requireSupabaseData(`Load profile timezone ${profileId}`, result.data, result.error);
  return row.timezone;
}

function evidenceIsEmpty(evidence: ProfileLearningReviewEvidence): boolean {
  return (
    evidence.channelMessages.length === 0 &&
    evidence.activities.length === 0 &&
    evidence.workItems.length === 0 &&
    evidence.actions.length === 0 &&
    evidence.proposals.length === 0
  );
}

function requireReplayLocalDate(window: ProfileLearningReviewWindow): string {
  if (window.reviewMode !== "date_replay" || !window.localDate) {
    throw new Error("Date replay learning review window requires localDate.");
  }
  return window.localDate;
}

function observationIdsByEvidenceRef(
  observations: readonly ProfileLearningReviewObservation[],
): Map<string, string[]> {
  const byRef = new Map<string, string[]>();
  for (const observation of observations) {
    const supportingRefs = Array.isArray(observation.evidence.supportingRefs)
      ? observation.evidence.supportingRefs
      : [];
    for (const ref of supportingRefs) {
      if (typeof ref !== "string" || !ref.trim()) continue;
      byRef.set(ref, [...(byRef.get(ref) ?? []), observation.id]);
    }
  }
  return byRef;
}

export async function runProfileLearningReview(
  db: SupabaseServiceClient,
  input: { profileId: string; localDate?: string; now?: Date },
): Promise<{
  status: "succeeded" | "skipped";
  runId: string | null;
  candidates: number;
  applied: number;
  skipped: number;
  failed: number;
}> {
  const timeZone = await loadProfileTimeZone(db, input.profileId);
  const window = input.localDate
    ? learningReviewWindowForLocalDate({
        profileId: input.profileId,
        localDate: input.localDate,
        timeZone,
      })
    : await learningReviewCursorWindow({
        db,
        profileId: input.profileId,
        now: input.now ?? new Date(),
      });
  if (!window) {
    return {
      status: "skipped",
      runId: null,
      candidates: 0,
      applied: 0,
      skipped: 0,
      failed: 0,
    };
  }
  const existing =
    window.reviewMode === "date_replay"
      ? await loadLearningReviewRunByLocalDate(db, {
          profileId: input.profileId,
          localDate: requireReplayLocalDate(window),
        })
      : await loadLearningReviewRunByScheduledSourceEnd(db, {
          profileId: input.profileId,
          sourceWindowEndAt: window.sourceWindowEndAt,
        });
  if (existing?.status === "succeeded") {
    return {
      status: "skipped",
      runId: existing.id,
      candidates: 0,
      applied: 0,
      skipped: 0,
      failed: 0,
    };
  }
  if (existing?.status === "running") {
    return {
      status: "skipped",
      runId: existing.id,
      candidates: 0,
      applied: 0,
      skipped: 0,
      failed: 0,
    };
  }
  const run = existing
    ? await restartLearningReviewRun(db, { run: existing, window })
    : await createLearningReviewRun(db, window);
  try {
    const evidence = await loadProfileLearningReviewEvidence(db, window);
    if (evidenceIsEmpty(evidence)) {
      await finishLearningReviewRun(db, {
        runId: run.id,
        profileId: input.profileId,
        status: "succeeded",
        summary: "No profile interactions found for the review window.",
        processedSourceEndAt:
          window.reviewMode === "scheduled_cursor" ? window.sourceWindowEndAt : null,
      });
      if (window.reviewMode === "scheduled_cursor") {
        await advanceLearningReviewCursor(db, {
          profileId: input.profileId,
          runId: run.id,
          processedThroughAt: window.sourceWindowEndAt,
          metadata: {
            observations: 0,
            candidates: 0,
            applied: 0,
            skipped: 0,
            failed: 0,
          },
        });
      }
      return {
        status: "succeeded",
        runId: run.id,
        candidates: 0,
        applied: 0,
        skipped: 0,
        failed: 0,
      };
    }
    const { decision, observations } =
      await generateProfileLearningReviewDecisionAndObservations(evidence);
    const persistedObservations = await insertLearningReviewObservations(db, { run, observations });
    const candidates = await insertLearningReviewCandidates(db, {
      run,
      candidates: decision.candidates,
      observationIdsByEvidenceRef: observationIdsByEvidenceRef(persistedObservations),
    });
    const applied = await applyProfileLearningReviewCandidates(db, candidates);
    await finishLearningReviewRun(db, {
      runId: run.id,
      profileId: input.profileId,
      status: "succeeded",
      summary: decision.summary,
      processedSourceEndAt:
        window.reviewMode === "scheduled_cursor" ? window.sourceWindowEndAt : null,
    });
    if (window.reviewMode === "scheduled_cursor") {
      await advanceLearningReviewCursor(db, {
        profileId: input.profileId,
        runId: run.id,
        processedThroughAt: window.sourceWindowEndAt,
        metadata: {
          observations: persistedObservations.length,
          candidates: candidates.length,
          applied: applied.applied,
          skipped: applied.skipped,
          failed: applied.failed,
        },
      });
    }
    emitDiagnostic(backendDiagnosticLogger(), "profile_learning_review.completed", {
      ok: true,
      profile_id: input.profileId,
      attrs: {
        run_id: run.id,
        local_date: window.localDate,
        review_mode: window.reviewMode,
        source_window_start_at: window.sourceWindowStartAt,
        source_window_end_at: window.sourceWindowEndAt,
        context_window_start_at: window.contextWindowStartAt,
        context_window_end_at: window.contextWindowEndAt,
        candidates: candidates.length,
        ...applied,
      },
    });
    return {
      status: "succeeded",
      runId: run.id,
      candidates: candidates.length,
      ...applied,
    };
  } catch (error) {
    await finishLearningReviewRun(db, {
      runId: run.id,
      profileId: input.profileId,
      status: "failed",
      errorCode: "profile_learning_review_failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function listProfilesDueForLearningReview(
  db: SupabaseServiceClient,
  input: { now: Date; limit?: number },
): Promise<Array<{ profileId: string; localDate: string | null; sourceWindowEndAt: string }>> {
  const profilesResult = await db
    .from("profiles")
    .select("id, timezone")
    .eq("status", "active")
    .order("id", { ascending: true })
    .limit(input.limit ?? DAILY_REVIEW_PROFILE_LIMIT);
  const profiles = requireSupabaseRows(
    "List profiles due for learning review",
    profilesResult.data,
    profilesResult.error,
  );
  const due: Array<{ profileId: string; localDate: string | null; sourceWindowEndAt: string }> = [];
  for (const profile of profiles) {
    const window = await learningReviewCursorWindow({
      db,
      profileId: profile.id,
      now: input.now,
    });
    if (!window) continue;
    const existing = await loadLearningReviewRunByScheduledSourceEnd(db, {
      profileId: profile.id,
      sourceWindowEndAt: window.sourceWindowEndAt,
    });
    if (existing?.status === "succeeded" || existing?.status === "running") continue;
    due.push({
      profileId: profile.id,
      localDate: window.localDate,
      sourceWindowEndAt: window.sourceWindowEndAt,
    });
  }
  return due;
}
