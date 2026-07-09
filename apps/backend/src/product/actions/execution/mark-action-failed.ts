import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { serializeProviderFailure } from "../../../integrations/provider-runtime/provider-http";

export async function markActionExecutionFailed(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  error: unknown,
): Promise<TableRow<"profile_actions">> {
  const failure = serializeProviderFailure(error, { operation: action.tool_name });
  const now = new Date().toISOString();
  const uncertainProviderWrite =
    action.provider_execution_status === "started" ||
    action.provider_execution_status === "unknown";
  const updated = await db
    .from("profile_actions")
    .update({
      status: uncertainProviderWrite ? "unknown" : "failed",
      provider_execution_status: uncertainProviderWrite ? "unknown" : "failed",
      provider_execution_finished_at: uncertainProviderWrite
        ? now
        : action.provider_execution_finished_at,
      provider_error: requireJsonObject(failure, "action.providerError"),
      updated_at: now,
    })
    .eq("id", action.id)
    .select()
    .single();
  return requireSupabaseData(`Mark action ${action.id} failed`, updated.data, updated.error);
}
