import path from "node:path";
import { runJsonJudge } from "@ai-assistants/llm-judge";
import {
  profileRuntimeDir,
  repoRoot,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import { z } from "zod";
import type {
  CleanupAction,
  IntegrationDataCandidate,
  IntegrationDataCategory,
} from "./types";

const PROMPT_VERSION = 1;
const SCHEMA_VERSION = 1;
const JUDGE_TIMEOUT_MS = 45_000;
const MAX_REVIEW_CANDIDATES = 80;
const PROMOTION_CONFIDENCE = 0.82;

const reviewableCategories = new Set<IntegrationDataCategory>(["manual_review"]);

const candidateReviewSchema = z
  .object({
    id: z.string().trim().min(1),
    category: z.enum(["likely_stale", "manual_review"]),
    cleanupAction: z.enum([
      "archive_monday_item",
      "delete_profile_artifact",
      "trash_google_drive_file",
      "delete_microsoft_onedrive_item",
      "revoke_boldsign_document",
      "report_only",
    ]),
    confidence: z.number().min(0).max(1),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const semanticReviewResultSchema = z
  .object({
    reviews: z.array(candidateReviewSchema),
  })
  .strict();

type CandidateReview = z.infer<typeof candidateReviewSchema>;

export type SemanticReviewSummary = {
  candidates: IntegrationDataCandidate[];
  status: "succeeded" | "failed";
  cacheStatus?: string;
  reviewedCandidates: number;
  promotedCandidates: number;
  errorMessage?: string;
};

function cleanupActionForCandidate(candidate: IntegrationDataCandidate): CleanupAction {
  if (candidate.cleanupAction !== "report_only") return candidate.cleanupAction;
  if (candidate.provider === "monday" && candidate.kind === "item") return "archive_monday_item";
  if (candidate.provider === "google-drive") return "trash_google_drive_file";
  if (candidate.provider === "microsoft-onedrive") return "delete_microsoft_onedrive_item";
  if (candidate.provider === "boldsign" && candidate.kind === "signature_request") {
    return "revoke_boldsign_document";
  }
  return "report_only";
}

function compactEvidence(candidate: IntegrationDataCandidate): Record<string, unknown> {
  const source = candidate.evidence;
  const fieldsByKey = source.fieldsByKey;
  return {
    itemId: source.itemId,
    fileId: source.fileId,
    eventId: source.eventId,
    documentId: source.documentId,
    title: source.title,
    name: source.name,
    status: source.status,
    sentAt: source.sentAt,
    mimeType: source.mimeType,
    type: source.type,
    fieldsByKey:
      fieldsByKey && typeof fieldsByKey === "object"
        ? Object.fromEntries(Object.entries(fieldsByKey).slice(0, 20))
        : undefined,
  };
}

function reviewEvidence(candidates: readonly IntegrationDataCandidate[]) {
  return {
    instruction:
      "Classify testing-profile integration data candidates. Preserve real baseline client data and terminal signature requests. Recommend likely_stale only for clear AI Assistants/E2E/test-run leftovers, synthetic fixtures, or stale generated artifacts. Use manual_review when evidence is ambiguous.",
    categories: {
      likely_stale:
        "Safe candidate for explicit maintainer cleanup after dry-run review and --candidate selection.",
      manual_review: "Needs human inspection before cleanup.",
    },
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      provider: candidate.provider,
      kind: candidate.kind,
      label: candidate.label,
      deterministicCategory: candidate.category,
      deterministicReason: candidate.reason,
      defaultCleanupAction: cleanupActionForCandidate(candidate),
      evidence: compactEvidence(candidate),
    })),
  };
}

function reviewInstructions(): string {
  return [
    "You are a read-only cleanup audit judge for testing-profile integration data.",
    "Return JSON only.",
    "",
    "Rules:",
    "- Do not invent candidate ids.",
    "- Return exactly one review for each supplied candidate id.",
    "- Use likely_stale only when the evidence clearly indicates AI Assistants/E2E/testing generated leftovers.",
    "- Use manual_review for real client baseline data, ambiguous records, terminal signed/completed/declined/revoked/cancelled signature requests, or anything that could be a legitimate current testing fixture.",
    "- cleanupAction must be report_only for manual_review.",
    "- cleanupAction for likely_stale should match the supplied defaultCleanupAction.",
    "- Keep reasons concrete and cite visible evidence from the candidate.",
  ].join("\n");
}

function shouldApplyReview(
  candidate: IntegrationDataCandidate,
  review: CandidateReview,
): boolean {
  if (candidate.category !== "manual_review") return false;
  const expectedCleanupAction = cleanupActionForCandidate(candidate);
  if (expectedCleanupAction === "report_only") return false;
  return (
    review.category === "likely_stale" &&
    review.confidence >= PROMOTION_CONFIDENCE &&
    review.cleanupAction === expectedCleanupAction
  );
}

function applyReviews(
  candidates: readonly IntegrationDataCandidate[],
  reviews: readonly CandidateReview[],
): { candidates: IntegrationDataCandidate[]; promotedCandidates: number } {
  const byId = new Map(reviews.map((review) => [review.id, review]));
  let promotedCandidates = 0;
  const reviewed = candidates.map((candidate) => {
    const review = byId.get(candidate.id);
    if (!review) return candidate;
    const semanticReview = {
      category: review.category,
      cleanupAction: review.cleanupAction,
      confidence: review.confidence,
      reason: review.reason,
    };
    if (!shouldApplyReview(candidate, review)) return { ...candidate, semanticReview };
    promotedCandidates += 1;
    return {
      ...candidate,
      category: "likely_stale" as const,
      cleanupAction: review.cleanupAction,
      reason: `Semantic review: ${review.reason}`,
      semanticReview,
    };
  });
  return { candidates: reviewed, promotedCandidates };
}

function requireExactReviews(
  candidatesToReview: readonly IntegrationDataCandidate[],
  reviews: readonly CandidateReview[],
): void {
  const expectedIds = new Set(candidatesToReview.map((candidate) => candidate.id));
  const reviewedIds = new Set<string>();
  for (const review of reviews) {
    if (!expectedIds.has(review.id)) throw new Error(`Semantic judge returned unknown id ${review.id}.`);
    if (reviewedIds.has(review.id)) throw new Error(`Semantic judge returned duplicate id ${review.id}.`);
    reviewedIds.add(review.id);
  }
  for (const expectedId of expectedIds) {
    if (!reviewedIds.has(expectedId)) throw new Error(`Semantic judge omitted id ${expectedId}.`);
  }
}

export async function reviewTestingDataCandidatesWithCursor(input: {
  profile: RuntimeProfile;
  candidates: readonly IntegrationDataCandidate[];
}): Promise<SemanticReviewSummary> {
  const candidatesToReview = input.candidates
    .filter((candidate) => reviewableCategories.has(candidate.category))
    .slice(0, MAX_REVIEW_CANDIDATES);
  if (candidatesToReview.length === 0) {
    return {
      candidates: [...input.candidates],
      status: "succeeded",
      reviewedCandidates: 0,
      promotedCandidates: 0,
    };
  }

  try {
    const root = repoRoot(import.meta.url);
    const judged = await runJsonJudge({
      id: "testing-data-cleanup-semantic-review",
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      schema: semanticReviewResultSchema,
      instructions: reviewInstructions(),
      evidence: reviewEvidence(candidatesToReview),
      repoRoot: root,
      cacheDir: path.join(
        profileRuntimeDir(input.profile),
        "cache",
        "llm-judges",
        "testing-data-cleanup",
      ),
      timeoutMs: JUDGE_TIMEOUT_MS,
    });
    requireExactReviews(candidatesToReview, judged.result.reviews);
    const { candidates, promotedCandidates } = applyReviews(input.candidates, judged.result.reviews);
    return {
      candidates,
      status: "succeeded",
      cacheStatus: judged.cacheStatus,
      reviewedCandidates: candidatesToReview.length,
      promotedCandidates,
    };
  } catch (error) {
    return {
      candidates: [...input.candidates],
      status: "failed",
      reviewedCandidates: candidatesToReview.length,
      promotedCandidates: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
