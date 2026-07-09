import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";

export async function cleanupTestingProfileActions(
  db: SupabaseServiceClient,
  actions: readonly TableRow<"profile_actions">[],
  options?: { runId?: string },
): Promise<void> {
  try {
    for (const action of actions) {
      const deletedReceipts = await db
        .from("provider_write_receipts")
        .delete()
        .eq("profile_action_id", action.id)
        .eq("profile_id", action.profile_id);
      requireSupabaseData(
        "Delete E2E profile action provider write receipts",
        deletedReceipts.data ?? [],
        deletedReceipts.error,
      );

      const deletedJobs = await db
        .from("backend_jobs")
        .delete()
        .eq("profile_id", action.profile_id)
        .in("dedupe_key", [
          `assistant-event:action-completion:${action.id}:executed`,
          `assistant-event:action-completion:${action.id}:rejected`,
          `assistant-event:action-completion:${action.id}:failed`,
        ]);
      requireSupabaseData(
        "Delete E2E profile action backend jobs",
        deletedJobs.data ?? [],
        deletedJobs.error,
      );

      const deletedAction = await db.from("profile_actions").delete().eq("id", action.id);
      requireSupabaseData(
        "Delete E2E profile action",
        deletedAction.data ?? [],
        deletedAction.error,
      );
    }
  } catch (error) {
    const prefix = options?.runId ? `[e2e cleanup failed runId=${options.runId}] ` : "";
    throw new Error(`${prefix}${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}
