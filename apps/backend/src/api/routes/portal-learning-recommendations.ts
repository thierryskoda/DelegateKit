import type { Context, Hono } from "hono";
import {
  learningRecommendationDecisionResponseSchema,
  learningRecommendationParamsSchema,
  learningRecommendationsResponseSchema,
  profileParamsSchema,
} from "@ai-assistants/connect-api-contracts";
import { requireOwnedProfile } from "../../auth/profile-access";
import { parseRouteParams } from "../../shared/http-validation";
import { authenticatedUser } from "../http-auth";
import { controlDb } from "../control-db";
import {
  approveProfileLearningReviewCandidateFromPortal,
  rejectProfileLearningReviewCandidateFromPortal,
} from "../../product/profile-learning-review/apply";
import {
  getLearningReviewCandidate,
  listPortalLearningReviewCandidates,
} from "../../product/profile-learning-review/storage";
import {
  learningRecommendationTargetSummaries,
  learningRecommendationTargetSummary,
  toConnectLearningRecommendationDto,
} from "../../product/profile-learning-review/connect-learning-recommendation-dtos";

async function decideLearningRecommendation(c: Context, decision: "approve" | "reject") {
  const user = await authenticatedUser(c);
  const { profileId, recommendationId } = parseRouteParams(
    c,
    learningRecommendationParamsSchema,
    "Learning recommendation decision route params",
  );
  await requireOwnedProfile(controlDb(), user, profileId);
  const candidate = await getLearningReviewCandidate(controlDb(), {
    profileId,
    candidateId: recommendationId,
  });
  const targetSummary = await learningRecommendationTargetSummary(controlDb(), candidate);
  const updated =
    decision === "approve"
      ? await approveProfileLearningReviewCandidateFromPortal(controlDb(), {
          profileId,
          candidate,
        })
      : await rejectProfileLearningReviewCandidateFromPortal(controlDb(), {
          profileId,
          candidate,
        });
  return c.json(
    learningRecommendationDecisionResponseSchema.parse({
      ok: true,
      recommendation: toConnectLearningRecommendationDto(updated, { targetSummary }),
    }),
  );
}

export function registerPortalLearningRecommendationRoutes(app: Hono) {
  app.get("/profiles/:profileId/learning-recommendations", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId } = parseRouteParams(
      c,
      profileParamsSchema,
      "Learning recommendations route params",
    );
    await requireOwnedProfile(controlDb(), user, profileId);
    const candidates = await listPortalLearningReviewCandidates(controlDb(), profileId);
    const targetSummaries = await learningRecommendationTargetSummaries(
      controlDb(),
      profileId,
      candidates,
    );
    return c.json(
      learningRecommendationsResponseSchema.parse({
        ok: true,
        recommendations: candidates.map((candidate) =>
          toConnectLearningRecommendationDto(candidate, {
            targetSummary: targetSummaries.get(candidate.id) ?? null,
          }),
        ),
      }),
    );
  });

  app.post("/profiles/:profileId/learning-recommendations/:recommendationId/approve", (c) =>
    decideLearningRecommendation(c, "approve"),
  );
  app.post("/profiles/:profileId/learning-recommendations/:recommendationId/reject", (c) =>
    decideLearningRecommendation(c, "reject"),
  );
}
