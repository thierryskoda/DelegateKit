import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  loadRuntimeGuidanceRegistry,
  type ProfileGuidanceIndexRecord,
  type ProfileGuidanceMarkdownRecord,
  type RuntimeGuidanceRegistry,
} from "@ai-assistants/runtime-guidance";
import {
  listActiveProfileGuidanceIndex,
  loadActiveProfileGuidanceMarkdown,
} from "../../product/profile-guidance/profile-guidance";

export type ProfileAssistantGuidanceRegistry = {
  profileId: string;
  sourceGuidance: RuntimeGuidanceRegistry | null;
  profileGuidanceIndex: ProfileGuidanceIndexRecord[];
};

export async function loadProfileAssistantGuidanceRegistry(
  db: SupabaseServiceClient,
  input: { profileId: string; workspaceDir?: string | null },
): Promise<ProfileAssistantGuidanceRegistry> {
  const [sourceGuidance, profileGuidanceIndex] = await Promise.all([
    input.workspaceDir ? loadRuntimeGuidanceRegistry(input.workspaceDir) : null,
    listActiveProfileGuidanceIndex(db, input.profileId),
  ]);
  return {
    profileId: input.profileId,
    sourceGuidance,
    profileGuidanceIndex,
  };
}

export async function loadProfileAssistantGuidanceMarkdown(
  db: SupabaseServiceClient,
  input: { profileId: string; profileGuidanceDbIds: readonly string[] },
): Promise<ProfileGuidanceMarkdownRecord[]> {
  return loadActiveProfileGuidanceMarkdown(db, {
    profileId: input.profileId,
    guidanceIds: input.profileGuidanceDbIds,
  });
}
