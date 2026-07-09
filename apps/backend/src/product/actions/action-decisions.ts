import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  mapProfilePortalDecisionCommandToPersisted,
  type ProfilePortalActionDecisionCommand,
} from "@ai-assistants/control-plane-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { requireDecisionChannelForAction } from "./channel-resolution";
import type { ToolInvocationContext, TrustedChannelOrigin } from "./schemas";
import { actionIsExpired, expireProfileAction } from "./action-lifecycle";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { profileActionDiagnosticAttrs } from "../../shared/lifecycle-diagnostics";
import { executeProfileActionInline } from "./execution/execute-action-inline";
import { recordProfileActionOutcomeActivitySafe } from "../agent-activity/agent-activity";

type ProfileActionDecisionResult = {
  ok: boolean;
  status: string;
  action?: TableRow<"profile_actions">;
  assistantWorkItemId?: string | null;
};

async function loadPendingActionForDecision(
  db: SupabaseServiceClient,
  profileId: string,
  actionId: string,
): Promise<TableRow<"profile_actions">> {
  const result = await db.from("profile_actions").select().eq("id", actionId).maybeSingle();
  const action = requireSupabaseData(`Load profile action ${actionId}`, result.data, result.error);
  if (action.profile_id !== profileId)
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Profile action ${actionId} belongs to another profile.`,
    );
  if (action.status !== "pending_approval")
    throw new DomainError(
      domainCodes.CONFLICT,
      `That action is already ${action.status}; there is no pending approval to decide.`,
    );
  if (!action.expires_at)
    throw new DomainError(
      domainCodes.CONFLICT,
      `Profile action ${actionId} is pending approval without expires_at.`,
    );
  if (actionIsExpired(action)) {
    await expireProfileAction(db, action);
    throw new DomainError(domainCodes.CONFLICT, `Profile action ${actionId} has expired.`);
  }
  if (action.decision)
    throw new DomainError(
      domainCodes.CONFLICT,
      `Profile action ${actionId} already has a final decision.`,
    );
  return action;
}

async function recordProfileActionDecision(
  db: SupabaseServiceClient,
  input: {
    action: TableRow<"profile_actions">;
    decision: ProfilePortalActionDecisionCommand;
    source: "portal" | "trusted_channel";
    decidedByUserId?: string | null;
    decidedByChannelId?: string | null;
  },
) {
  const finalDecision = mapProfilePortalDecisionCommandToPersisted(input.decision);
  const finalActionStatus = input.decision === "approve" ? "processing" : "rejected";
  const decidedAt = new Date().toISOString();

  const updated = await db
    .from("profile_actions")
    .update({
      status: finalActionStatus,
      decision: finalDecision,
      decision_source: input.source,
      decision_expected_request_hash: input.action.request_hash,
      decided_by_user_id: input.decidedByUserId ?? null,
      decided_by_channel_id: input.decidedByChannelId ?? null,
      decided_at: decidedAt,
      result_payload: requireJsonObject(
        {
          decision: finalDecision,
          decisionSource: input.source,
          decidedAt,
          decidedByUserId: input.decidedByUserId ?? null,
          decidedByChannelId: input.decidedByChannelId ?? null,
        },
        "profileAction.resultPayload",
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.action.id)
    .eq("status", "pending_approval")
    .is("decision", null)
    .select()
    .single();
  const action = requireSupabaseData(
    "Update profile action after decision",
    updated.data,
    updated.error,
  );
  emitDiagnostic(backendDiagnosticLogger(), "profile_action.decided", {
    ok: true,
    profile_id: action.profile_id,
    action_id: action.id,
    tool_call_id: action.tool_call_id,
    attrs: profileActionDiagnosticAttrs(action, {
      decision: finalDecision,
      decision_source: input.source,
      previous_status: input.action.status,
      next_status: action.status,
      decided_by_user_id: input.decidedByUserId ?? null,
      decided_by_channel_id: input.decidedByChannelId ?? null,
    }),
  });

  if (input.decision === "reject") {
    await recordProfileActionOutcomeActivitySafe(db, action);
    return {
      ok: true,
      status: "rejected",
      action,
      assistantWorkItemId: null,
    } satisfies ProfileActionDecisionResult;
  }

  const executed = await executeProfileActionInline(db, action);
  return {
    ok: true,
    status: executed.status,
    action: executed,
  } satisfies ProfileActionDecisionResult;
}

export async function decideProfileActionFromPortal(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    actionId: string;
    userId: string;
    decision: ProfilePortalActionDecisionCommand;
  },
) {
  const action = await loadPendingActionForDecision(db, input.profileId, input.actionId);
  return recordProfileActionDecision(db, {
    action,
    decision: input.decision,
    source: "portal",
    decidedByUserId: input.userId,
  });
}

export async function decideProfileActionFromAssistantTool(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    actionId: string;
    decision: ProfilePortalActionDecisionCommand;
    invocation: ToolInvocationContext;
    trustedChannel?: TrustedChannelOrigin | null;
  },
): Promise<ProfileActionDecisionResult> {
  const action = await loadPendingActionForDecision(db, input.profileId, input.actionId);
  const channel = await requireDecisionChannelForAction(
    db,
    input.profileId,
    action,
    input.trustedChannel ?? null,
    input.invocation,
  );
  return recordProfileActionDecision(db, {
    action,
    decision: input.decision,
    source: "trusted_channel",
    decidedByChannelId: channel.id,
  });
}
