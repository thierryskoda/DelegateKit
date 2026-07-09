import { createHash } from "node:crypto";
import {
  buildEquivalentActionKey,
  createProfileActionAttempt,
  findExistingEquivalentProfileAction,
} from "./action-attempts";
import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  toolError,
  toolData,
  type BackendToolResult,
  type ExternalActionType,
} from "@ai-assistants/tool-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { loadDefaultWritePolicyRules, writePolicyModeFromRules } from "../profiles/write-policy";
import type { ToolInvocationContext } from "./schemas";
import type { ResolvedTrustedChannelOrigin } from "./channel-resolution";
import { actionIsExpired, expireProfileAction } from "./action-lifecycle";
import { executeProfileActionInline } from "./execution/execute-action-inline";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { profileActionDiagnosticAttrs } from "../../shared/lifecycle-diagnostics";
import { recordProfileActionOutcomeActivitySafe } from "../agent-activity/agent-activity";
import { agentActionDto, profileActionWriteToolData } from "./agent-action-dtos";

const PROFILE_ACTION_APPROVAL_TTL_MS = 36 * 60 * 60_000;

export type PrepareProfileActionArgs = {
  profileId: string;
  agentId: string;
  toolName: string;
  actionType: ExternalActionType;
  toolCallId: string;
  params: object;
  requestHash?: string | null;
  invocation: ToolInvocationContext;
  trustedChannelOrigin?: ResolvedTrustedChannelOrigin | null;
  reviewTitle?: string | null;
  reviewSummary?: string | null;
  reviewPayload?: Record<string, unknown> | null;
};

function stringParam(params: object, key: string): string | undefined {
  const value = Reflect.get(params, key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requestHashForArgs(args: PrepareProfileActionArgs): string {
  return (
    args.requestHash?.trim() ||
    createHash("sha256").update(JSON.stringify(args.params)).digest("hex")
  );
}

function titleForArgs(args: PrepareProfileActionArgs): string {
  return args.reviewTitle?.trim() || args.toolName.replaceAll("_", " ");
}

function summaryForArgs(args: PrepareProfileActionArgs): string {
  return args.reviewSummary?.trim() || "Approval is required before this external action runs.";
}

function reviewPayloadForArgs(
  args: PrepareProfileActionArgs,
  requestHash: string,
  targetId: string | null,
): Record<string, unknown> {
  return (
    args.reviewPayload ?? {
      visibleTarget: targetId,
      proposedChange: args.params,
      evidence: summaryForArgs(args),
      executionPayloadHash: requestHash,
    }
  );
}

function existingActionResult(
  action: TableRow<"profile_actions">,
  status: string,
): BackendToolResult {
  if (
    status === "processing" ||
    status === "executed" ||
    status === "failed" ||
    status === "unknown"
  ) {
    return toolData(profileActionWriteToolData(action));
  }
  return toolError({
    message: `This idempotent profile action is already ${status}.`,
    details: {
      status,
      action: agentActionDto(action),
    },
  });
}

async function resultForExistingPreparedAction(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
): Promise<BackendToolResult> {
  if (action.status === "processing") {
    return existingActionResult(action, "processing");
  }
  if (action.status === "pending_approval") {
    if (actionIsExpired(action)) {
      await expireProfileAction(db, action);
      throw new DomainError(
        domainCodes.CONFLICT,
        `Profile action ${action.id} has expired. Draft a new action instead.`,
      );
    }
    return toolData(profileActionWriteToolData(action));
  }
  return existingActionResult(action, action.status);
}

function isEquivalentActionUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = Reflect.get(error, "code");
  const message = String(Reflect.get(error, "message") ?? "");
  const details = String(Reflect.get(error, "details") ?? "");
  return (
    code === "23505" &&
    (message.includes("profile_actions_active_equivalent_unique") ||
      details.includes("profile_actions_active_equivalent_unique"))
  );
}

export async function prepareProfileAction(
  db: SupabaseServiceClient,
  args: PrepareProfileActionArgs,
): Promise<BackendToolResult> {
  const targetId =
    stringParam(args.params, "itemId") ||
    stringParam(args.params, "recordId") ||
    stringParam(args.params, "providerRecordId") ||
    stringParam(args.params, "fileItemId") ||
    stringParam(args.params, "targetFolderItemId") ||
    stringParam(args.params, "parentFolderItemId") ||
    stringParam(args.params, "artifactId") ||
    stringParam(args.params, "previewArtifactId") ||
    stringParam(args.params, "finalArtifactId") ||
    (() => {
      if (args.toolName !== "monday_item_archive") return null;
      const targets = Reflect.get(args.params, "targets");
      if (
        !Array.isArray(targets) ||
        !targets[0] ||
        typeof targets[0] !== "object" ||
        Array.isArray(targets[0])
      )
        return null;
      const first = targets[0];
      return (
        stringParam(first, "itemId") ||
        stringParam(first, "recordId") ||
        stringParam(first, "providerRecordId") ||
        null
      );
    })() ||
    null;
  const rules = await loadDefaultWritePolicyRules(db, args.profileId);
  const mode = writePolicyModeFromRules(rules, args.actionType);
  const requestHash = requestHashForArgs(args);
  const equivalentActionKey = buildEquivalentActionKey({
    toolName: args.toolName,
    actionType: args.actionType,
    executionPayload: args.params,
  });
  const expiresAt =
    mode === "needs_review"
      ? new Date(Date.now() + PROFILE_ACTION_APPROVAL_TTL_MS).toISOString()
      : null;
  const status =
    mode === "auto_execute" ? "processing" : mode === "blocked" ? "blocked" : "pending_approval";

  const existingEquivalentAction = await findExistingEquivalentProfileAction(db, {
    profileId: args.profileId,
    equivalentActionKey,
  });
  if (existingEquivalentAction) {
    emitDiagnostic(backendDiagnosticLogger(), "profile_action.deduped", {
      ok: true,
      profile_id: existingEquivalentAction.profile_id,
      action_id: existingEquivalentAction.id,
      tool_call_id: existingEquivalentAction.tool_call_id,
      attrs: profileActionDiagnosticAttrs(existingEquivalentAction, {
        requested_status: status,
        existing_status: existingEquivalentAction.status,
        dedupe_source: "equivalent_action_key",
      }),
    });
    return resultForExistingPreparedAction(db, existingEquivalentAction);
  }

  let attempt: Awaited<ReturnType<typeof createProfileActionAttempt>>;
  try {
    attempt = await createProfileActionAttempt(db, {
      profileId: args.profileId,
      toolName: args.toolName,
      actionType: args.actionType,
      targetId,
      toolCallId: args.toolCallId,
      requestHash,
      equivalentActionKey,
      executionPayload: args.params,
      status,
      title: titleForArgs(args),
      reviewPayload: reviewPayloadForArgs(args, requestHash, targetId),
      expiresAt,
      requesterAssistantId: args.agentId,
      originProfileChannelId: args.trustedChannelOrigin?.profileChannel.id ?? null,
      originChannelProvider: args.trustedChannelOrigin?.provider ?? null,
      originSenderId: args.trustedChannelOrigin?.externalIdentity ?? null,
      originSessionKey: args.invocation.sessionKey,
      originSessionId: args.invocation.sessionId ?? null,
    });
  } catch (error) {
    if (!isEquivalentActionUniqueViolation(error)) throw error;
    const racedAction = await findExistingEquivalentProfileAction(db, {
      profileId: args.profileId,
      equivalentActionKey,
    });
    if (!racedAction) throw error;
    emitDiagnostic(backendDiagnosticLogger(), "profile_action.deduped", {
      ok: true,
      profile_id: racedAction.profile_id,
      action_id: racedAction.id,
      tool_call_id: racedAction.tool_call_id,
      attrs: profileActionDiagnosticAttrs(racedAction, {
        requested_status: status,
        existing_status: racedAction.status,
        dedupe_source: "equivalent_action_key_unique_violation",
      }),
    });
    return resultForExistingPreparedAction(db, racedAction);
  }

  if (!attempt.created) {
    emitDiagnostic(backendDiagnosticLogger(), "profile_action.deduped", {
      ok: true,
      profile_id: attempt.action.profile_id,
      action_id: attempt.action.id,
      tool_call_id: attempt.action.tool_call_id,
      attrs: profileActionDiagnosticAttrs(attempt.action, {
        requested_status: status,
        existing_status: attempt.action.status,
      }),
    });
    return resultForExistingPreparedAction(db, attempt.action);
  }

  if (mode === "blocked") {
    const blocked = await db
      .from("profile_actions")
      .update({
        result_payload: requireJsonObject({ blockedByPolicy: true }, "action.resultPayload"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", attempt.action.id)
      .select()
      .single();
    const action = requireSupabaseData("Mark blocked profile action", blocked.data, blocked.error);
    emitDiagnostic(backendDiagnosticLogger(), "profile_action.created", {
      ok: false,
      level: "warn",
      profile_id: action.profile_id,
      action_id: action.id,
      tool_call_id: action.tool_call_id,
      attrs: profileActionDiagnosticAttrs(action, {
        approval_mode: mode,
        next_status: action.status,
      }),
    });
    await recordProfileActionOutcomeActivitySafe(db, action);
    return toolError({
      message: "This action is blocked by the configured write policy.",
      details: { actionType: args.actionType, action: agentActionDto(action) },
    });
  }

  if (mode === "needs_review") {
    emitDiagnostic(backendDiagnosticLogger(), "profile_action.created", {
      ok: true,
      profile_id: attempt.action.profile_id,
      action_id: attempt.action.id,
      tool_call_id: attempt.action.tool_call_id,
      attrs: profileActionDiagnosticAttrs(attempt.action, {
        approval_mode: mode,
        next_status: attempt.action.status,
      }),
    });
    return toolData(profileActionWriteToolData(attempt.action));
  }

  if (mode === "auto_execute") {
    emitDiagnostic(backendDiagnosticLogger(), "profile_action.created", {
      ok: true,
      profile_id: attempt.action.profile_id,
      action_id: attempt.action.id,
      tool_call_id: attempt.action.tool_call_id,
      attrs: profileActionDiagnosticAttrs(attempt.action, {
        approval_mode: mode,
        next_status: attempt.action.status,
      }),
    });
    const executed = await executeProfileActionInline(db, attempt.action);
    return toolData(profileActionWriteToolData(executed));
  }

  const _exhaustive: never = mode;
  throw new DomainError(
    domainCodes.INTERNAL,
    `Unhandled write policy mode ${String(_exhaustive)}.`,
  );
}
