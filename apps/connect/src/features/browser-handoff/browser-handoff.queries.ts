import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { connectQueryKeys } from "../../shared/api/connect-query-keys";
import { useConnectUiStore } from "../../shared/ui/connect.store";
import {
  cancelBrowserHandoff,
  completeBrowserHandoff,
  getBrowserHandoff,
} from "./browser-handoff.api";

const HANDOFF_REFETCH_MS = 5_000;

function mutationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function browserHandoffQueryOptions(profileId: string, handoffId: string) {
  return queryOptions({
    queryKey: connectQueryKeys.browserHandoffs.detail(profileId, handoffId),
    queryFn: () => getBrowserHandoff({ profileId, handoffId }),
    refetchInterval: (query) => (query.state.data?.status === "waiting" ? HANDOFF_REFETCH_MS : false),
  });
}

export function useBrowserHandoffQuery(profileId: string, handoffId: string) {
  return useQuery(browserHandoffQueryOptions(profileId, handoffId));
}

export function useCompleteBrowserHandoffMutation(profileId: string, handoffId: string) {
  const queryClient = useQueryClient();
  const setNotice = useConnectUiStore((state) => state.setNotice);
  return useMutation({
    mutationFn: () => completeBrowserHandoff({ profileId, handoffId }),
    onError: (error) => setNotice({ tone: "error", message: mutationErrorMessage(error) }),
    onSuccess: async (handoff) => {
      setNotice({ tone: "success", message: "Done. You can return to the chat." });
      queryClient.setQueryData(
        connectQueryKeys.browserHandoffs.detail(profileId, handoffId),
        handoff,
      );
    },
  });
}

export function useCancelBrowserHandoffMutation(profileId: string, handoffId: string) {
  const queryClient = useQueryClient();
  const setNotice = useConnectUiStore((state) => state.setNotice);
  return useMutation({
    mutationFn: () => cancelBrowserHandoff({ profileId, handoffId }),
    onError: (error) => setNotice({ tone: "error", message: mutationErrorMessage(error) }),
    onSuccess: async (handoff) => {
      setNotice({ tone: "info", message: "Cancelled." });
      queryClient.setQueryData(
        connectQueryKeys.browserHandoffs.detail(profileId, handoffId),
        handoff,
      );
    },
  });
}
