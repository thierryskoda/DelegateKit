import type { QueryClient } from "@tanstack/react-query";
import {
  approvalsQueryOptions,
  proposalsQueryOptions,
} from "../features/approvals/approvals.queries";
import { integrationsQueryOptions } from "../features/integrations/integrations.queries";
import type { ProfileRow } from "../features/user-profiles/profiles.api";
import { profilesQueryOptions } from "../features/user-profiles/profiles.queries";
import { connectQueryKeys } from "../shared/api/connect-query-keys";

export function clearConnectCache(queryClient: QueryClient): void {
  queryClient.removeQueries({ queryKey: connectQueryKeys.root() });
}

export function invalidateConnectIntegrations(
  queryClient: QueryClient,
  profileId: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: connectQueryKeys.integrations.list(profileId),
  });
}

export async function prefetchConnectPortalData(queryClient: QueryClient): Promise<void> {
  await queryClient.prefetchQuery(profilesQueryOptions());
  const profiles = queryClient.getQueryData<ProfileRow[]>(profilesQueryOptions().queryKey);
  if (!profiles?.length) return;

  await Promise.allSettled(
    profiles.flatMap((profile) => [
      queryClient.prefetchQuery(integrationsQueryOptions(profile.id)),
      queryClient.prefetchQuery(approvalsQueryOptions(profile.id)),
      queryClient.prefetchQuery(proposalsQueryOptions(profile.id)),
    ]),
  );
}
