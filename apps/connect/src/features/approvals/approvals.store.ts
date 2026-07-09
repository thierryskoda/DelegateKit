import { create } from "zustand";

type ApprovalsUiState = {
  openDetailActionId: string | null;
  openDetailProposalId: string | null;
  openDetailLearningRecommendationId: string | null;
  setOpenDetailActionId: (id: string | null) => void;
  setOpenDetailProposalId: (id: string | null) => void;
  setOpenDetailLearningRecommendationId: (id: string | null) => void;
};

export const useApprovalsUiStore = create<ApprovalsUiState>()((set) => ({
  openDetailActionId: null,
  openDetailProposalId: null,
  openDetailLearningRecommendationId: null,
  setOpenDetailActionId: (id) => set({ openDetailActionId: id }),
  setOpenDetailProposalId: (id) => set({ openDetailProposalId: id }),
  setOpenDetailLearningRecommendationId: (id) => set({ openDetailLearningRecommendationId: id }),
}));
