import type { AuthenticatedUser } from "./user-auth";
import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";

export type OwnedProfile = TableRow<"profiles">;

function cleanProfileId(profileId: string): string {
  const clean = profileId.trim();
  if (!clean) throw new DomainError(domainCodes.BAD_REQUEST, "profileId is required.");
  return clean;
}

function assertActiveProfile(profile: OwnedProfile): void {
  if (profile.status !== "active") {
    throw new DomainError(domainCodes.CONFLICT, `Profile ${profile.id} is ${profile.status}.`);
  }
}

async function requireCurrentProfile(
  db: SupabaseServiceClient,
  user: AuthenticatedUser,
): Promise<OwnedProfile> {
  const result = await db.from("profiles").select().eq("user_id", user.id).maybeSingle();
  if (result.error) throw result.error;
  const profile = result.data;
  if (!profile)
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Authenticated user ${user.email ?? user.id} has no profile.`,
    );
  assertActiveProfile(profile);
  return profile;
}

export async function requireOwnedProfile(
  db: SupabaseServiceClient,
  user: AuthenticatedUser,
  profileId: string,
): Promise<OwnedProfile> {
  const clean = cleanProfileId(profileId);
  const result = await db.from("profiles").select().eq("id", clean).maybeSingle();
  if (result.error) throw result.error;
  const profile = result.data;
  if (!profile) throw new DomainError(domainCodes.NOT_FOUND, `Profile ${clean} does not exist.`);
  if (profile.user_id !== user.id) {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Authenticated user ${user.email ?? user.id} does not own profile ${clean}.`,
    );
  }
  assertActiveProfile(profile);
  return profile;
}

export async function listUserProfiles(
  db: SupabaseServiceClient,
  user: AuthenticatedUser,
): Promise<OwnedProfile[]> {
  return [await requireCurrentProfile(db, user)];
}
