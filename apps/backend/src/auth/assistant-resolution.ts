import {
  requireSupabaseData,
  type Assistant,
  type Profile,
  type SupabaseServiceClient,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";

export type ResolvedAssistantProfile = {
  assistant: Assistant;
  profile: Profile;
};

export async function requireAssistantProfile(
  db: SupabaseServiceClient,
  agentId: string | undefined,
): Promise<ResolvedAssistantProfile> {
  const assistantId = agentId?.trim();
  if (!assistantId) throw new DomainError(domainCodes.BAD_REQUEST, "agentId is required.");

  const assistantResult = await db
    .from("assistants")
    .select()
    .eq("assistant_id", assistantId)
    .maybeSingle();
  if (assistantResult.error) throw assistantResult.error;
  if (!assistantResult.data)
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `No canonical profile mapping exists for agent ${assistantId}.`,
    );

  const profileResult = await db
    .from("profiles")
    .select()
    .eq("id", assistantResult.data.profile_id)
    .maybeSingle();
  const profile = requireSupabaseData(
    `Load profile ${assistantResult.data.profile_id} for agent ${assistantId}`,
    profileResult.data,
    profileResult.error,
  );
  if (profile.status !== "active")
    throw new DomainError(domainCodes.CONFLICT, `Profile ${profile.id} is not active.`);
  return { assistant: assistantResult.data, profile };
}

export async function requireAssistantProfileByProfileId(
  db: SupabaseServiceClient,
  profileId: string | undefined,
): Promise<ResolvedAssistantProfile> {
  const resolvedProfileId = profileId?.trim();
  if (!resolvedProfileId) throw new DomainError(domainCodes.BAD_REQUEST, "profileId is required.");

  const profileResult = await db.from("profiles").select().eq("id", resolvedProfileId).maybeSingle();
  const profile = requireSupabaseData(
    `Load profile ${resolvedProfileId}`,
    profileResult.data,
    profileResult.error,
  );
  if (profile.status !== "active")
    throw new DomainError(domainCodes.CONFLICT, `Profile ${profile.id} is not active.`);

  const assistantResult = await db
    .from("assistants")
    .select()
    .eq("profile_id", profile.id)
    .order("assistant_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  const assistant = requireSupabaseData(
    `Load assistant for profile ${profile.id}`,
    assistantResult.data,
    assistantResult.error,
  );
  return { assistant, profile };
}
