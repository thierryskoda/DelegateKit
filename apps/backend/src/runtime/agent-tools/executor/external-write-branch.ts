import type { ExternalActionType, ToolContract } from "@ai-assistants/tool-contracts";
import { externalActionTypeSchema } from "@ai-assistants/tool-contracts";
import type { BackendToolExecuteRequest } from "../request-schema";
import { prepareProfileAction, type PrepareProfileActionArgs } from "../../../product/actions/action-prepare";
import {
  buildValidatedWritePlan,
  resolvedRequestHashForWritePlan,
} from "../../../product/actions/external-write-contracts/registry";
import type { Assistant, Profile, SupabaseServiceClient } from "@ai-assistants/control-db";
import type { ResolvedTrustedChannelOrigin } from "../../../product/actions/channel-resolution";

export async function runExternalWriteBranch(input: {
  db: SupabaseServiceClient;
  profile: Profile;
  assistant: Assistant;
  toolInput: BackendToolExecuteRequest;
  params: Record<string, unknown>;
  contract: ToolContract & { externalAction: ExternalActionType };
  resolvedTrustedChannelOrigin?: ResolvedTrustedChannelOrigin;
}) {
  const { db, profile, assistant, toolInput, params, contract } = input;
  const plan = await buildValidatedWritePlan(toolInput.toolName, {
    db,
    profileId: profile.id,
    assistantId: assistant.assistant_id,
    toolCallId: toolInput.toolCallId,
    params,
  });
  const actionType = externalActionTypeSchema.parse(contract.externalAction);
  const prepareArgs: PrepareProfileActionArgs = {
    profileId: profile.id,
    agentId: assistant.assistant_id,
    toolName: toolInput.toolName,
    actionType,
    toolCallId: toolInput.toolCallId,
    params: plan.actionPayload,
    requestHash: resolvedRequestHashForWritePlan(plan),
    invocation: toolInput.invocation,
    reviewTitle: plan.reviewTitle,
    reviewSummary: plan.reviewSummary,
    reviewPayload: plan.reviewPayload,
  };
  if (input.resolvedTrustedChannelOrigin) {
    prepareArgs.trustedChannelOrigin = input.resolvedTrustedChannelOrigin;
  }
  return prepareProfileAction(db, prepareArgs);
}
