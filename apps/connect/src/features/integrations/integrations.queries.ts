import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { invalidateConnectIntegrations } from "../../app/connect-query-cache";
import { connectQueryKeys } from "../../shared/api/connect-query-keys";
import { optimisticListMutationHandlers } from "../../shared/api/connect-optimistic-mutation";
import { useConnectUiStore } from "../../shared/ui/connect.store";
import {
  deleteIntegrationAccount,
  disconnectIntegrationAccount,
} from "./integrations.cache-updates";
import type { IntegrationGroup } from "./integrations.api";
import {
  beginIntegrationConnect,
  presentIntegrationConnectResult,
  resumePendingNangoReconnects,
  type ConnectOAuthTarget,
} from "./integrations.oauth";
import { isTelegramMiniApp } from "../telegram/telegram-mini-app.launch";
import {
  createConnectIntent,
  deleteCapabilityAccountLink,
  disconnectCapabilityAccountLink,
  listIntegrationGroups,
} from "./integrations.api";

const TELEGRAM_INTEGRATIONS_REFETCH_MS = 5_000;

export function integrationsQueryOptions(profileId: string) {
  return queryOptions({
    queryKey: connectQueryKeys.integrations.list(profileId),
    queryFn: () => listIntegrationGroups(profileId),
  });
}

export function useIntegrationsQuery(profileId: string) {
  const queryClient = useQueryClient();
  const setNotice = useConnectUiStore((state) => state.setNotice);
  useEffect(() => {
    resumePendingNangoReconnects(profileId, {
      queryClient,
      onConnectSuccess: () => {
        setNotice({ tone: "success", message: "Integration connected." });
      },
    });
  }, [profileId, queryClient, setNotice]);
  return useQuery({
    ...integrationsQueryOptions(profileId),
    refetchInterval: isTelegramMiniApp() ? TELEGRAM_INTEGRATIONS_REFETCH_MS : false,
  });
}

function connectMutationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useStartNangoConnectSessionMutation(profileId: string) {
  const queryClient = useQueryClient();
  const setNotice = useConnectUiStore((state) => state.setNotice);
  return useMutation({
    mutationFn: (target: ConnectOAuthTarget) => beginIntegrationConnect(profileId, target),
    onSuccess: (result) => {
      presentIntegrationConnectResult(profileId, result, {
        queryClient,
        onExternalConnect: () => {
          setNotice({
            tone: "info",
            message: isTelegramMiniApp()
              ? "Opened the browser portal. Connect integrations there, then return to Telegram."
              : "Opened the connection page in your browser. Return here when you are done.",
          });
        },
        onConnectSuccess: () => {
          setNotice({ tone: "success", message: "Integration connected." });
        },
        onError: (message) => setNotice({ tone: "error", message }),
      });
    },
    onError: (error) => {
      setNotice({ tone: "error", message: connectMutationErrorMessage(error) });
    },
  });
}

export function useDisconnectIntegrationMutation(profileId: string) {
  const queryClient = useQueryClient();
  const setNotice = useConnectUiStore((state) => state.setNotice);
  const integrationsQueryKey = connectQueryKeys.integrations.list(profileId);
  const optimistic = optimisticListMutationHandlers<IntegrationGroup[], string>({
    queryClient,
    queryKey: integrationsQueryKey,
    update: disconnectIntegrationAccount,
  });
  return useMutation({
    mutationFn: (capabilityAccountLinkId: string) =>
      disconnectCapabilityAccountLink({ profileId, capabilityAccountLinkId }),
    onMutate: optimistic.onMutate,
    onError: (error, variables, context) => {
      optimistic.onError(error, variables, context);
      setNotice({ tone: "error", message: connectMutationErrorMessage(error) });
    },
    onSuccess: () => {
      setNotice({ tone: "success", message: "Account disconnected." });
    },
    onSettled: optimistic.onSettled,
  });
}

export function useDeleteIntegrationMutation(profileId: string) {
  const queryClient = useQueryClient();
  const setNotice = useConnectUiStore((state) => state.setNotice);
  const integrationsQueryKey = connectQueryKeys.integrations.list(profileId);
  const optimistic = optimisticListMutationHandlers<IntegrationGroup[], string>({
    queryClient,
    queryKey: integrationsQueryKey,
    update: deleteIntegrationAccount,
  });
  return useMutation({
    mutationFn: (capabilityAccountLinkId: string) =>
      deleteCapabilityAccountLink({ profileId, capabilityAccountLinkId }),
    onMutate: optimistic.onMutate,
    onError: (error, variables, context) => {
      optimistic.onError(error, variables, context);
      setNotice({ tone: "error", message: connectMutationErrorMessage(error) });
    },
    onSuccess: () => {
      setNotice({ tone: "success", message: "Account deleted." });
    },
    onSettled: optimistic.onSettled,
  });
}

export function useAddIntegrationAccountMutation(profileId: string) {
  const queryClient = useQueryClient();
  const setNotice = useConnectUiStore((state) => state.setNotice);
  return useMutation({
    mutationFn: async (input: { capabilitySlug: string; provider: string; label: string }) => {
      return createConnectIntent({
        profileId,
        capabilitySlug: input.capabilitySlug,
        provider: input.provider,
        requestedLabel: input.label,
      });
    },
    onSuccess: async () => {
      await invalidateConnectIntegrations(queryClient, profileId);
    },
    onError: (error) => setNotice({ tone: "error", message: connectMutationErrorMessage(error) }),
  });
}
