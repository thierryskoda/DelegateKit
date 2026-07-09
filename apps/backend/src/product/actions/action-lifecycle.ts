import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { profileActionDiagnosticAttrs } from "../../shared/lifecycle-diagnostics";

export function actionIsExpired(action: TableRow<"profile_actions">): boolean {
  return Boolean(action.expires_at && Date.parse(action.expires_at) <= Date.now());
}

export async function expireProfileAction(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
): Promise<TableRow<"profile_actions">> {
  const updated = await db
    .from("profile_actions")
    .update({
      status: "expired",
      result_payload: requireJsonObject(
        { expiredAt: new Date().toISOString() },
        "action.resultPayload",
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", action.id)
    .eq("status", "pending_approval")
    .select()
    .single();
  const expired = requireSupabaseData(
    `Expire profile action ${action.id}`,
    updated.data,
    updated.error,
  );
  emitDiagnostic(backendDiagnosticLogger(), "profile_action.expired", {
    ok: true,
    profile_id: expired.profile_id,
    action_id: expired.id,
    tool_call_id: expired.tool_call_id,
    attrs: profileActionDiagnosticAttrs(expired, {
      previous_status: action.status,
      next_status: expired.status,
    }),
  });
  return expired;
}
