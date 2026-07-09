import type { SupabaseServiceClient } from "@ai-assistants/control-db";

/**
 * Deletes `backend_jobs` rows by primary key. Throws `AggregateError` with message
 * `[e2e cleanup failed runId=${runId}]` when any delete fails (matches pilot pattern).
 */
export async function cleanupBackendJobsForRun(
  db: SupabaseServiceClient,
  ids: ReadonlySet<string>,
  runId: string,
): Promise<void> {
  const errors: Error[] = [];
  for (const id of ids) {
    const result = await db.from("backend_jobs").delete().eq("id", id);
    if (result.error) {
      errors.push(new Error(`backend_jobs id=${id}: ${result.error.message}`));
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, `[e2e cleanup failed runId=${runId}]`);
  }
}

async function cleanupRowsByIdForRun(
  db: SupabaseServiceClient,
  table: "assistant_work_items" | "provider_webhook_deliveries" | "profile_assistant_work_routes",
  ids: ReadonlySet<string>,
  runId: string,
): Promise<void> {
  const errors: Error[] = [];
  for (const id of ids) {
    const result = await db.from(table).delete().eq("id", id);
    if (result.error) {
      errors.push(new Error(`${table} id=${id}: ${result.error.message}`));
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, `[e2e cleanup failed runId=${runId}]`);
  }
}

export async function cleanupAssistantWorkItemsForRun(
  db: SupabaseServiceClient,
  ids: ReadonlySet<string>,
  runId: string,
): Promise<void> {
  await cleanupRowsByIdForRun(db, "assistant_work_items", ids, runId);
}

export async function cleanupProviderWebhookDeliveriesForRun(
  db: SupabaseServiceClient,
  ids: ReadonlySet<string>,
  runId: string,
): Promise<void> {
  await cleanupRowsByIdForRun(db, "provider_webhook_deliveries", ids, runId);
}

export async function cleanupProfileAssistantWorkRoutesForRun(
  db: SupabaseServiceClient,
  ids: ReadonlySet<string>,
  runId: string,
): Promise<void> {
  await cleanupRowsByIdForRun(db, "profile_assistant_work_routes", ids, runId);
}
