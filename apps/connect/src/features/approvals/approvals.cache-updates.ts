import type {
  ApprovalDecision,
  ApprovalRequest,
  LearningRecommendationRequest,
  ProposalRequest,
} from "./approvals.api";

export function applyApprovalDecision(
  previous: ApprovalRequest[],
  variables: { actionId: string; decision: ApprovalDecision },
): ApprovalRequest[] {
  return previous.map((action) =>
    action.id === variables.actionId
      ? {
          ...action,
          status: variables.decision === "approve" ? "processing" : "rejected",
        }
      : action,
  );
}

export function applyProposalDecision(
  previous: ProposalRequest[],
  variables: { proposalId: string; decision: ApprovalDecision },
): ProposalRequest[] {
  return previous.map((proposal) =>
    proposal.id === variables.proposalId
      ? {
          ...proposal,
          status: variables.decision === "approve" ? "converted" : "rejected",
        }
      : proposal,
  );
}

export function applyLearningRecommendationDecision(
  previous: LearningRecommendationRequest[],
  variables: { recommendationId: string; decision: ApprovalDecision },
): LearningRecommendationRequest[] {
  return previous.map((recommendation) =>
    recommendation.id === variables.recommendationId
      ? {
          ...recommendation,
          status: variables.decision === "approve" ? "client_applied" : "rejected",
        }
      : recommendation,
  );
}
