import { profileActionListQuerySchema } from "@ai-assistants/connect-api-contracts";
import {
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  listUserProfiles as listOwnedProfiles,
  requireOwnedProfile,
} from "../../auth/profile-access";
import type { AuthenticatedUser } from "../../auth/user-auth";
import type { z } from "zod";

type ProfileActionListQuery = z.infer<typeof profileActionListQuerySchema>;

export async function listPortalProfiles(
  db: SupabaseServiceClient,
  user: AuthenticatedUser,
): Promise<TableRow<"profiles">[]> {
  return listOwnedProfiles(db, user);
}

export async function portalProfileOverview(
  db: SupabaseServiceClient,
  user: AuthenticatedUser,
  profileId: string,
) {
  await requireOwnedProfile(db, user, profileId);
  const [profileResult, assistantsResult] = await Promise.all([
    db.from("profiles").select().eq("id", profileId).maybeSingle(),
    db.from("assistants").select().eq("profile_id", profileId).order("assistant_id"),
  ]);
  if (profileResult.error) throw profileResult.error;
  const assistants = requireSupabaseRows(
    "List profile assistants",
    assistantsResult.data,
    assistantsResult.error,
  );
  return { profile: profileResult.data ?? null, assistants };
}

export async function listPortalProfileActions(
  db: SupabaseServiceClient,
  profileId: string,
  query: ProfileActionListQuery = {},
) {
  if (query.statuses) {
    const result = await db
      .from("profile_actions")
      .select()
      .eq("profile_id", profileId)
      .in("status", query.statuses)
      .order("created_at", { ascending: false })
      .limit(100);
    return requireSupabaseRows("List profile actions", result.data, result.error);
  }

  if (query.status) {
    const result = await db
      .from("profile_actions")
      .select()
      .eq("profile_id", profileId)
      .eq("status", query.status)
      .order("created_at", { ascending: false })
      .limit(100);
    return requireSupabaseRows("List profile actions", result.data, result.error);
  }

  const [pendingResult, recentResult] = await Promise.all([
    db
      .from("profile_actions")
      .select()
      .eq("profile_id", profileId)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("profile_actions")
      .select()
      .eq("profile_id", profileId)
      .neq("status", "pending_approval")
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);
  return [
    ...requireSupabaseRows("List pending profile actions", pendingResult.data, pendingResult.error),
    ...requireSupabaseRows("List recent profile actions", recentResult.data, recentResult.error),
  ];
}

export async function getPortalProfileAction(
  db: SupabaseServiceClient,
  profileId: string,
  actionId: string,
) {
  const result = await db
    .from("profile_actions")
    .select()
    .eq("profile_id", profileId)
    .eq("id", actionId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data)
    throw new DomainError(domainCodes.NOT_FOUND, `Profile action ${actionId} was not found.`);
  return result.data;
}
