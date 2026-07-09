import { z } from "zod";
import {
  actionApprovalResponseSchema,
  actionsResponseSchema,
  connectProfileActionDecisionCommandSchema,
  connectProfileActionStatusSchema,
  learningRecommendationDecisionResponseSchema,
  learningRecommendationsResponseSchema,
  connectProposalDecisionRequestSchema,
  proposalDecisionResponseSchema,
  proposalsResponseSchema,
  type ConnectActionDto,
  type ConnectProfileActionDecisionCommand,
  type ConnectLearningRecommendationDto,
  type ConnectProposalDto,
  profileIdParamSchema,
} from "@ai-assistants/connect-api-contracts";
import { backendFetch } from "../../shared/api/backend-api";

const actionIdParamSchema = z.string().trim().uuid("Action id must be a UUID.");

export type ApprovalDecision = ConnectProfileActionDecisionCommand;
export type ApprovalRequest = ConnectActionDto;
export type ProposalRequest = ConnectProposalDto;
export type LearningRecommendationRequest = ConnectLearningRecommendationDto;

const approvalInputSchema = z
  .object({
    profileId: profileIdParamSchema,
    actionId: actionIdParamSchema,
    decision: connectProfileActionDecisionCommandSchema,
  })
  .strict();

export async function listApprovals(
  profileId: string,
  filter?: {
    status?: z.infer<typeof connectProfileActionStatusSchema>;
    statuses?: readonly z.infer<typeof connectProfileActionStatusSchema>[];
  },
): Promise<ApprovalRequest[]> {
  const parsedProfileId = profileIdParamSchema.parse(profileId);
  const params = new URLSearchParams();
  if (filter?.statuses?.length) {
    params.set(
      "statuses",
      filter.statuses.map((status) => connectProfileActionStatusSchema.parse(status)).join(","),
    );
  } else if (filter?.status) {
    params.set("status", connectProfileActionStatusSchema.parse(filter.status));
  }
  const query = params.toString();
  const path = `/profiles/${encodeURIComponent(parsedProfileId)}/actions${query ? `?${query}` : ""}`;
  const payload = await backendFetch(path, actionsResponseSchema);
  return payload.actions;
}

export async function decideApproval(input: unknown): Promise<ApprovalRequest> {
  const { profileId, actionId, decision } = approvalInputSchema.parse(input);
  const endpoint = decision === "approve" ? "approve" : "reject";
  const payload = await backendFetch(
    `/profiles/${encodeURIComponent(profileId)}/actions/${encodeURIComponent(actionId)}/${endpoint}`,
    actionApprovalResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  return payload.action;
}

export async function listProposals(profileId: string): Promise<ProposalRequest[]> {
  const parsedProfileId = profileIdParamSchema.parse(profileId);
  const payload = await backendFetch(
    `/profiles/${encodeURIComponent(parsedProfileId)}/proposals`,
    proposalsResponseSchema,
  );
  return payload.proposals;
}

const proposalDecisionInputSchema = z
  .object({
    profileId: profileIdParamSchema,
    proposalId: z.string().trim().uuid(),
    decision: connectProfileActionDecisionCommandSchema,
    expectedRevision: connectProposalDecisionRequestSchema.shape.expectedRevision,
  })
  .strict();

export async function decideProposal(input: unknown): Promise<ProposalRequest> {
  const { profileId, proposalId, decision, expectedRevision } =
    proposalDecisionInputSchema.parse(input);
  const endpoint = decision === "approve" ? "approve" : "reject";
  const payload = await backendFetch(
    `/profiles/${encodeURIComponent(profileId)}/proposals/${encodeURIComponent(proposalId)}/${endpoint}`,
    proposalDecisionResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({ expectedRevision }),
    },
  );
  return payload.proposal;
}

export async function listLearningRecommendations(
  profileId: string,
): Promise<LearningRecommendationRequest[]> {
  const parsedProfileId = profileIdParamSchema.parse(profileId);
  const payload = await backendFetch(
    `/profiles/${encodeURIComponent(parsedProfileId)}/learning-recommendations`,
    learningRecommendationsResponseSchema,
  );
  return payload.recommendations;
}

const learningRecommendationDecisionInputSchema = z
  .object({
    profileId: profileIdParamSchema,
    recommendationId: z.string().trim().uuid(),
    decision: connectProfileActionDecisionCommandSchema,
  })
  .strict();

export async function decideLearningRecommendation(
  input: unknown,
): Promise<LearningRecommendationRequest> {
  const { profileId, recommendationId, decision } =
    learningRecommendationDecisionInputSchema.parse(input);
  const endpoint = decision === "approve" ? "approve" : "reject";
  const payload = await backendFetch(
    `/profiles/${encodeURIComponent(profileId)}/learning-recommendations/${encodeURIComponent(recommendationId)}/${endpoint}`,
    learningRecommendationDecisionResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  return payload.recommendation;
}
