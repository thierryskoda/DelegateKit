import { requireSupabaseData, type SupabaseServiceClient } from "@ai-assistants/control-db";

export async function resetTestingProfileWorkState(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<void> {
  const clearArtifacts = await db
    .from("artifacts")
    .update({ profile_action_id: null, browser_task_id: null })
    .eq("profile_id", profileId);
  requireSupabaseData(
    `Clear testing scenario artifact work links for ${profileId}`,
    clearArtifacts.data ?? [],
    clearArtifacts.error,
  );

  const tables = [
    "assistant_work_items",
    "provider_write_receipts",
    "profile_actions",
    "browser_tasks",
  ] as const;

  for (const table of tables) {
    const result = await db.from(table).delete().eq("profile_id", profileId);
    requireSupabaseData(
      `Reset testing scenario ${table} for ${profileId}`,
      result.data ?? [],
      result.error,
    );
  }
}
