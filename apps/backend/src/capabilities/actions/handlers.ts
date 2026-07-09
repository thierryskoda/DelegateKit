import {
  profileActionDecideInputSchema,
  profileActionGetInputSchema,
  profileActionListInputSchema,
  profileWritePolicyUpdateInputSchema,
} from "@ai-assistants/actions-contracts/schemas";
import { actionsToolContracts } from "@ai-assistants/actions-contracts/contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { BackendImmediateToolHandlers } from "../registry/backend-capability-module";
import { backendToolData, backendToolDomainError } from "../../shared/tool-result";
import { agentActionDto, profileActionLifecycleToolData } from "../../product/actions/agent-action-dtos";
import { decideProfileActionFromAssistantTool } from "../../product/actions/action-decisions";
import { getProfileActionForAssistantTool, listProfileActionsForAssistantTool } from "../../product/actions/assistant-tools";
import { getWritePolicyForProfile, patchWritePolicyForProfile } from "../../product/profiles/context-write-policy";

export const actionHandlers = {
  async action_list(ctx) {
    const actions = await listProfileActionsForAssistantTool(
      ctx.db,
      ctx.profile.id,
      profileActionListInputSchema.parse(ctx.params),
    );
    return backendToolData(actionsToolContracts, "action_list", { actions: actions.map(agentActionDto) });
  },
  async action_get(ctx) {
    const { actionId } = profileActionGetInputSchema.parse(ctx.params);
    return backendToolData(actionsToolContracts, "action_get", {
      action: agentActionDto(await getProfileActionForAssistantTool(ctx.db, ctx.profile.id, actionId)),
    });
  },
  async write_policy_get(ctx) {
    return backendToolData(actionsToolContracts, "write_policy_get", {
      writePolicy: await getWritePolicyForProfile(ctx.db, ctx.profile.id),
    });
  },
  async write_policy_update(ctx) {
    const input = profileWritePolicyUpdateInputSchema.parse(ctx.params);
    const writePolicy = await patchWritePolicyForProfile(ctx.db, ctx.profile.id, input, {
      assistantId: ctx.assistant.assistant_id,
      toolCallId: ctx.input.toolCallId,
      trustedChannelOrigin: ctx.resolvedTrustedChannelOrigin ?? null,
    });
    return backendToolData(actionsToolContracts, "write_policy_update", { writePolicy });
  },
  async action_decide(ctx) {
    const parsed = profileActionDecideInputSchema.parse(ctx.params);
    try {
      const decision = await decideProfileActionFromAssistantTool(ctx.db, {
        profileId: ctx.profile.id,
        actionId: parsed.actionId,
        decision: parsed.decision,
        invocation: ctx.input.invocation,
        trustedChannel: ctx.input.trustedChannel ?? null,
      });
      if (!decision.action) {
        throw new DomainError(domainCodes.INTERNAL, "Profile approval decision returned no action.");
      }
      return backendToolData(actionsToolContracts, "action_decide", {
        action: profileActionLifecycleToolData(decision.action),
      });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
} satisfies BackendImmediateToolHandlers<typeof actionsToolContracts>;

