import { setTimeout as delay } from "node:timers/promises";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";

const DEFAULT_WAIT_MS = 120_000;

export async function loadAssistantWorkItemsByDedupeKey(
  db: SupabaseServiceClient,
  input: { profileId: string; dedupeKey: string },
): Promise<TableRow<"assistant_work_items">[]> {
  const result = await db
    .from("assistant_work_items")
    .select()
    .eq("profile_id", input.profileId)
    .eq("dedupe_key", input.dedupeKey);
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function waitForAssistantWorkItemSucceeded(
  db: SupabaseServiceClient,
  input: { workItemId: string; timeoutMs?: number },
): Promise<TableRow<"assistant_work_items">> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_WAIT_MS;
  const startedAt = Date.now();
  let lastStatus = "unknown";
  while (Date.now() - startedAt < timeoutMs) {
    const row = await db
      .from("assistant_work_items")
      .select()
      .eq("id", input.workItemId)
      .maybeSingle();
    const workItem = requireSupabaseData(
      "Load assistant work item status",
      row.data,
      row.error,
    );
    lastStatus = workItem.status;
    if (workItem.status === "succeeded") return workItem;
    if (workItem.status === "failed" || workItem.status === "cancelled") {
      throw new Error(`Expected work item to succeed, got ${workItem.status}.`);
    }
    await delay(1_000);
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for work item ${input.workItemId}; last status ${lastStatus}.`,
  );
}
