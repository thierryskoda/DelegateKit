import { createHash } from "node:crypto";
import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { ProviderHttpError } from "../../../integrations/provider-runtime/provider-http";
import type { ActionResult } from "./types";

export function providerIdempotencyKey(action: TableRow<"profile_actions">): string {
  return action.provider_idempotency_key || action.idempotency_key || action.id;
}

export function providerKeyHash(action: TableRow<"profile_actions">): string {
  return createHash("sha256").update(providerIdempotencyKey(action)).digest("hex");
}

function providerExecutionPreviouslyStarted(action: TableRow<"profile_actions">): boolean {
  return (
    action.provider_execution_status === "started" || action.provider_execution_status === "unknown"
  );
}

function unsafeProviderExecutionRetry(action: TableRow<"profile_actions">): never {
  throw new ProviderHttpError({
    kind: "provider_contract",
    retryable: false,
    provider: null,
    operation: action.tool_name,
    detail: `Action ${action.id} already has provider execution status ${JSON.stringify(action.provider_execution_status)}. The external write may already have succeeded for idempotency key ${providerIdempotencyKey(action)}; manual/provider reconciliation is required before retrying.`,
  });
}

export async function updateActionResult(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  result: ActionResult,
): Promise<TableRow<"profile_actions">> {
  const now = new Date().toISOString();
  const updated = await db
    .from("profile_actions")
    .update({
      status: "executed",
      provider_execution_status: "completed",
      provider_execution_finished_at: now,
      result_payload: requireJsonObject(result, "action.resultPayload"),
      provider_error: null,
      updated_at: now,
    })
    .eq("id", action.id)
    .select()
    .single();
  return requireSupabaseData(`Mark action ${action.id} executed`, updated.data, updated.error);
}

export async function markProviderExecutionStarted(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
): Promise<TableRow<"profile_actions">> {
  if (providerExecutionPreviouslyStarted(action)) unsafeProviderExecutionRetry(action);
  const now = new Date().toISOString();
  const updated = await db
    .from("profile_actions")
    .update({
      provider_execution_status: "started",
      provider_execution_started_at: action.provider_execution_started_at ?? now,
      provider_execution_finished_at: null,
      provider_execution_attempts: (action.provider_execution_attempts ?? 0) + 1,
      updated_at: now,
    })
    .eq("id", action.id)
    .eq("status", "processing")
    .eq("provider_execution_status", "not_started")
    .select()
    .maybeSingle();
  if (updated.error) throw updated.error;
  if (updated.data) return updated.data;

  const reloaded = await db.from("profile_actions").select().eq("id", action.id).maybeSingle();
  const current = requireSupabaseData(
    `Reload provider execution ${action.id}`,
    reloaded.data,
    reloaded.error,
  );
  if (current.status !== "processing") {
    throw new ProviderHttpError({
      kind: "provider_contract",
      retryable: false,
      provider: null,
      operation: current.tool_name,
      detail: `Action ${current.id} is ${current.status}; expected processing before provider execution.`,
    });
  }
  unsafeProviderExecutionRetry(current);
}
