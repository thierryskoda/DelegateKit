import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../../shared/diagnostics";
import { profileActionDiagnosticAttrs } from "../../../shared/lifecycle-diagnostics";
import { recordProfileActionOutcomeActivitySafe } from "../../agent-activity/agent-activity";
import { executeActionByToolName } from "./action-tool-router";
import { markActionExecutionFailed } from "./mark-action-failed";
import { updateActionResult } from "./provider-runtime";

async function reloadAction(
  db: SupabaseServiceClient,
  actionId: string,
): Promise<TableRow<"profile_actions">> {
  const result = await db.from("profile_actions").select().eq("id", actionId).maybeSingle();
  return requireSupabaseData(`Reload profile action ${actionId}`, result.data, result.error);
}

async function markActionProcessing(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
): Promise<TableRow<"profile_actions">> {
  if (action.status === "processing") return action;
  if (action.status === "executed" || action.status === "failed" || action.status === "unknown") {
    return action;
  }
  if (action.status !== "pending_approval") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Action ${action.id} is ${action.status}; expected pending_approval before execution.`,
    );
  }
  const updated = await db
    .from("profile_actions")
    .update({
      status: "processing",
      result_payload: requireJsonObject({ acceptedForExecution: true }, "action.resultPayload"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", action.id)
    .eq("status", "pending_approval")
    .select()
    .single();
  const processing = requireSupabaseData(
    `Mark profile action ${action.id} processing`,
    updated.data,
    updated.error,
  );
  emitDiagnostic(backendDiagnosticLogger(), "profile_action.processing", {
    ok: true,
    profile_id: processing.profile_id,
    action_id: processing.id,
    tool_call_id: processing.tool_call_id,
    attrs: profileActionDiagnosticAttrs(processing, {
      previous_status: action.status,
      next_status: processing.status,
    }),
  });
  return processing;
}

export async function executeProfileActionInline(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
): Promise<TableRow<"profile_actions">> {
  const processingAction = await markActionProcessing(db, action);
  if (
    processingAction.status === "executed" ||
    processingAction.status === "failed" ||
    processingAction.status === "unknown"
  ) {
    return processingAction;
  }

  try {
    const result = await executeActionByToolName(db, processingAction);
    const executed = await updateActionResult(db, processingAction, result);
    emitDiagnostic(backendDiagnosticLogger(), "profile_action.executed", {
      ok: true,
      profile_id: executed.profile_id,
      action_id: executed.id,
      tool_call_id: executed.tool_call_id,
      attrs: profileActionDiagnosticAttrs(executed, {
        previous_status: processingAction.status,
        next_status: executed.status,
        result_status: result.status,
        result_provider: result.provider,
      }),
    });
    await recordProfileActionOutcomeActivitySafe(db, executed);
    return executed;
  } catch (error) {
    const current = await reloadAction(db, processingAction.id);
    const failed = await markActionExecutionFailed(db, current, error);
    await recordProfileActionOutcomeActivitySafe(db, failed);
    return failed;
  }
}
