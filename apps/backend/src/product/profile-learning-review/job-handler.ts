import {
  enqueueBackendJob,
  requireBackendJobPayload,
  type EnqueueBackendJobResult,
} from "@ai-assistants/backend-jobs";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { z } from "zod";
import type { BackendJobHandlerRegistry } from "../../runtime/worker/types";
import {
  listProfilesDueForLearningReview,
  runProfileLearningReview,
} from "./profile-learning-review";
import { PROFILE_LEARNING_REVIEW_JOB_KIND } from "./types";

const profileLearningReviewJobPayloadSchema = z.discriminatedUnion("mode", [
  z
    .object({ mode: z.literal("scheduled_cursor"), sourceWindowEndAt: z.string().datetime() })
    .strict(),
  z.object({ mode: z.literal("date_replay"), localDate: z.string().date() }).strict(),
]);

async function enqueueProfileLearningReviewJob(input: {
  db: SupabaseServiceClient;
  profileId: string;
  sourceWindowEndAt: string;
  priority?: number;
  runAfter?: string;
}): Promise<EnqueueBackendJobResult> {
  const payload = profileLearningReviewJobPayloadSchema.parse({
    mode: "scheduled_cursor",
    sourceWindowEndAt: input.sourceWindowEndAt,
  });
  return enqueueBackendJob(input.db, {
    profileId: input.profileId,
    kind: PROFILE_LEARNING_REVIEW_JOB_KIND,
    payload,
    dedupeKey: `${PROFILE_LEARNING_REVIEW_JOB_KIND}:${input.profileId}:${input.sourceWindowEndAt}`,
    maxAttempts: 3,
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.runAfter === undefined ? {} : { runAfter: input.runAfter }),
  });
}

export async function enqueueDueProfileLearningReviewJobs(
  db: SupabaseServiceClient,
  input: { now: Date; priority?: number },
): Promise<{
  profileDates: Array<{ profileId: string; localDate: string | null; sourceWindowEndAt: string }>;
}> {
  const profileDates = await listProfilesDueForLearningReview(db, { now: input.now });
  for (const profileDate of profileDates) {
    await enqueueProfileLearningReviewJob({
      db,
      profileId: profileDate.profileId,
      sourceWindowEndAt: profileDate.sourceWindowEndAt,
      priority: input.priority ?? 140,
    });
  }
  return { profileDates };
}

export const profileLearningReviewJobHandlers = {
  [PROFILE_LEARNING_REVIEW_JOB_KIND]: async ({ db, job }) => {
    const payload = profileLearningReviewJobPayloadSchema.parse(
      requireBackendJobPayload(job, PROFILE_LEARNING_REVIEW_JOB_KIND),
    );
    return runProfileLearningReview(db, {
      profileId: job.profile_id,
      ...(payload.mode === "date_replay" ? { localDate: payload.localDate } : {}),
    });
  },
} satisfies Partial<BackendJobHandlerRegistry>;
