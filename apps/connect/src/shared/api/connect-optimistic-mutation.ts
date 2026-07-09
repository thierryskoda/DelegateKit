import type { QueryClient, QueryKey } from "@tanstack/react-query";

type OptimisticMutationSnapshot<T> = {
  previous: T | undefined;
};

async function beginOptimisticUpdate<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
): Promise<OptimisticMutationSnapshot<T>> {
  await queryClient.cancelQueries({ queryKey });
  return { previous: queryClient.getQueryData<T>(queryKey) };
}

function applyOptimisticUpdate<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  next: T,
): void {
  queryClient.setQueryData<T>(queryKey, next);
}

function rollbackOptimisticUpdate<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  snapshot: OptimisticMutationSnapshot<T> | undefined,
): void {
  if (snapshot?.previous === undefined) return;
  queryClient.setQueryData<T>(queryKey, snapshot.previous);
}

export function finishOptimisticMutation(
  queryClient: QueryClient,
  queryKey: QueryKey,
): Promise<void> {
  return queryClient.invalidateQueries({ queryKey });
}

export function optimisticListMutationHandlers<TData, TVariables>(input: {
  queryClient: QueryClient;
  queryKey: QueryKey;
  update: (previous: TData, variables: TVariables) => TData;
}) {
  return {
    onMutate: async (variables: TVariables) => {
      const snapshot = await beginOptimisticUpdate<TData>(input.queryClient, input.queryKey);
      if (snapshot.previous !== undefined) {
        applyOptimisticUpdate(
          input.queryClient,
          input.queryKey,
          input.update(snapshot.previous, variables),
        );
      }
      return snapshot;
    },
    onError: (
      _error: unknown,
      _variables: TVariables,
      context: OptimisticMutationSnapshot<TData> | undefined,
    ) => {
      rollbackOptimisticUpdate(input.queryClient, input.queryKey, context);
    },
    onSettled: () => finishOptimisticMutation(input.queryClient, input.queryKey),
  };
}
