import { queryOptions, useQuery } from "@tanstack/react-query";
import { connectQueryKeys } from "../../shared/api/connect-query-keys";
import { listProfiles } from "./profiles.api";

export function profilesQueryOptions() {
  return queryOptions({ queryKey: connectQueryKeys.profiles.list(), queryFn: listProfiles });
}

export function useProfilesQuery() {
  return useQuery(profilesQueryOptions());
}
