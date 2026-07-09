import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { connectQueryKeys } from "../../shared/api/connect-query-keys";
import {
  finishOptimisticMutation,
  optimisticListMutationHandlers,
} from "../../shared/api/connect-optimistic-mutation";
import { useConnectUiStore } from "../../shared/ui/connect.store";
import {
  applyApprovalDecision,
  applyLearningRecommendationDecision,
  applyProposalDecision,
} from "./approvals.cache-updates";
import {
  decideApproval,
  decideLearningRecommendation,
  decideProposal,
  listApprovals,
  listLearningRecommendations,
  listProposals,
  type ApprovalDecision,
  type ApprovalRequest,
  type LearningRecommendationRequest,
  type ProposalRequest,
} from "./approvals.api";

const APPROVALS_REFETCH_MS = 5_000;
const ACTION_STATUSES_ON_APPROVALS_PAGE = ["pending_approval"] as const;

async function listApprovalPageActions(profileId: string): Promise<ApprovalRequest[]> {
  return listApprovals(profileId, { statuses: ACTION_STATUSES_ON_APPROVALS_PAGE });
}

function mutationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function approvalsQueryOptions(profileId: string) {
  return queryOptions({
    queryKey: connectQueryKeys.approvals.actions(profileId),
    queryFn: () => listApprovalPageActions(profileId),
    refetchInterval: APPROVALS_REFETCH_MS,
  });
}

export function useApprovalsQuery(profileId: string) {
  return useQuery(approvalsQueryOptions(profileId));
}

export function proposalsQueryOptions(profileId: string) {
  return queryOptions({
    queryKey: connectQueryKeys.approvals.proposals(profileId),
    queryFn: () => listProposals(profileId),
    refetchInterval: APPROVALS_REFETCH_MS,
  });
}

export function useProposalsQuery(profileId: string) {
  return useQuery(proposalsQueryOptions(profileId));
}

function learningRecommendationsQueryOptions(profileId: string) {
  return queryOptions({
    queryKey: connectQueryKeys.approvals.learningRecommendations(profileId),
    queryFn: () => listLearningRecommendations(profileId),
    refetchInterval: APPROVALS_REFETCH_MS,
  });
}

export function useLearningRecommendationsQuery(profileId: string) {
  return useQuery(learningRecommendationsQueryOptions(profileId));
}

export function useApprovalDecisionMutation(profileId: string) {
  const queryClient = useQueryClient();
  const setNotice = useConnectUiStore((state) => state.setNotice);
  const queryKey = connectQueryKeys.approvals.actions(profileId);
  const optimistic = optimisticListMutationHandlers<
    ApprovalRequest[],
    { actionId: string; decision: ApprovalDecision }
  >({
    queryClient,
    queryKey,
    update: applyApprovalDecision,
  });
  return useMutation({
    mutationFn: (input: { actionId: string; decision: ApprovalDecision }) =>
      decideApproval({ profileId, ...input }),
    onMutate: optimistic.onMutate,
    onError: (error, variables, context) => {
      optimistic.onError(error, variables, context);
      setNotice({ tone: "error", message: mutationErrorMessage(error) });
    },
    onSuccess: async (action, input) => {
      setNotice({
        tone:
          input.decision === "approve" &&
          (action.status === "failed" || action.status === "unknown")
            ? "error"
            : input.decision === "approve"
              ? "success"
              : "info",
        message:
          input.decision === "approve" && action.status === "failed"
            ? "Approved, but it failed."
            : input.decision === "approve" && action.status === "unknown"
              ? "Approved, but the result is uncertain."
              : input.decision === "approve"
                ? "Approved."
                : "Rejected.",
      });
      return action;
    },
    onSettled: optimistic.onSettled,
  });
}

export function useProposalDecisionMutation(profileId: string) {
  const queryClient = useQueryClient();
  const setNotice = useConnectUiStore((state) => state.setNotice);
  const proposalsQueryKey = connectQueryKeys.approvals.proposals(profileId);
  const approvalsQueryKey = connectQueryKeys.approvals.actions(profileId);
  const optimistic = optimisticListMutationHandlers<
    ProposalRequest[],
    { proposalId: string; decision: ApprovalDecision; expectedRevision: number }
  >({
    queryClient,
    queryKey: proposalsQueryKey,
    update: (previous, variables) =>
      applyProposalDecision(previous, {
        proposalId: variables.proposalId,
        decision: variables.decision,
      }),
  });
  return useMutation({
    mutationFn: (input: {
      proposalId: string;
      decision: ApprovalDecision;
      expectedRevision: number;
    }) => decideProposal({ profileId, ...input }),
    onMutate: optimistic.onMutate,
    onError: (error, variables, context) => {
      optimistic.onError(error, variables, context);
      setNotice({ tone: "error", message: mutationErrorMessage(error) });
    },
    onSuccess: async (proposal, input) => {
      setNotice({
        tone:
          input.decision === "approve" && proposal.status === "blocked"
            ? "error"
            : input.decision === "approve"
              ? "success"
              : "info",
        message:
          input.decision === "approve" && proposal.status === "blocked"
            ? "Approved, but it needs attention."
            : input.decision === "approve"
              ? "Approved and sending."
              : "Rejected.",
      });
      return proposal;
    },
    onSettled: () => finishOptimisticMutation(queryClient, approvalsQueryKey),
  });
}

export function useLearningRecommendationDecisionMutation(profileId: string) {
  const queryClient = useQueryClient();
  const setNotice = useConnectUiStore((state) => state.setNotice);
  const queryKey = connectQueryKeys.approvals.learningRecommendations(profileId);
  const optimistic = optimisticListMutationHandlers<
    LearningRecommendationRequest[],
    { recommendationId: string; decision: ApprovalDecision }
  >({
    queryClient,
    queryKey,
    update: applyLearningRecommendationDecision,
  });
  return useMutation({
    mutationFn: (input: { recommendationId: string; decision: ApprovalDecision }) =>
      decideLearningRecommendation({ profileId, ...input }),
    onMutate: optimistic.onMutate,
    onError: (error, variables, context) => {
      optimistic.onError(error, variables, context);
      setNotice({ tone: "error", message: mutationErrorMessage(error) });
    },
    onSuccess: async (_recommendation, input) => {
      setNotice({
        tone: input.decision === "approve" ? "success" : "info",
        message:
          input.decision === "approve" ? "Recommendation applied." : "Recommendation rejected.",
      });
    },
    onSettled: optimistic.onSettled,
  });
}
