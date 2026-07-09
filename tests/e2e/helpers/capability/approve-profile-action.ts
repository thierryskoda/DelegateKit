import assert from "node:assert/strict";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { decideProfileActionFromPortal } from "../../../../apps/backend/src/test-support/actions";

export async function approveAndExecuteProfileAction(input: {
  db: SupabaseServiceClient;
  action: TableRow<"profile_actions">;
  decisionUserId: string;
}): Promise<TableRow<"profile_actions">> {
  let action = input.action;
  if (action.status === "pending_approval") {
    const decision = await decideProfileActionFromPortal(input.db, {
      profileId: action.profile_id,
      actionId: action.id,
      userId: input.decisionUserId,
      decision: "approve",
    });
    assert.equal(decision.status, "executed");
    assert.ok(decision.action, "approval decision should return the updated action");
    action = decision.action;
  }

  const finalActionResult = await input.db
    .from("profile_actions")
    .select()
    .eq("id", action.id)
    .single();
  const finalAction = requireSupabaseData(
    `Load final profile action ${action.id}`,
    finalActionResult.data,
    finalActionResult.error,
  );
  assert.equal(
    finalAction.status,
    "executed",
    [
      `expected profile action ${action.id} to execute; final status=${finalAction.status}`,
      `provider_execution_status=${finalAction.provider_execution_status}`,
      `provider_error=${JSON.stringify(finalAction.provider_error)}`,
    ].join("; "),
  );
  return finalAction;
}
