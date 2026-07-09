import type { BackendToolResult } from "@ai-assistants/tool-contracts";
import {
  toolRequiresExternalAction,
  toolError,
  trustedChannelRequirementForContract,
  validateSuccessfulToolResult,
} from "@ai-assistants/tool-contracts";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { requireAssistantProfile } from "../../../auth/assistant-resolution";
import { resolveTrustedChannelOrigin } from "../../../product/actions/channel-resolution";
import { backendToolRegistry } from "../registry";
import type { BackendToolExecuteRequest } from "../request-schema";
import { runExternalWriteBranch } from "./external-write-branch";
import { dispatchNonSyncTool } from "./backend-tool-dispatch";
import { expectedBackendToolErrorToResult } from "./expected-tool-error";
import type { BackendToolExecutionDiagnosticContext } from "./tool-diagnostics";

export type BackendToolExecuteInput = BackendToolExecuteRequest;

export type BackendToolExecution = {
  result: BackendToolResult;
  diagnosticContext: BackendToolExecutionDiagnosticContext;
};

function parseAgentIdFromSessionKey(sessionKey: string): string | null {
  const match = /^agent:([^:]+):/i.exec(sessionKey.trim());
  return match?.[1] ?? null;
}

function validateInvocation(input: BackendToolExecuteInput): BackendToolResult | null {
  if (input.invocation.agentId !== input.agentId) {
    return toolError({
      message: "Backend tool invocation agentId does not match the request agentId.",
    });
  }
  if (input.invocation.toolCallId !== input.toolCallId) {
    return toolError({
      message: "Backend tool invocation toolCallId does not match the request toolCallId.",
    });
  }
  const sessionAgentId = parseAgentIdFromSessionKey(input.invocation.sessionKey);
  if (sessionAgentId && sessionAgentId.toLowerCase() !== input.agentId.toLowerCase()) {
    return toolError({
      message: "Backend tool invocation sessionKey belongs to a different assistant.",
    });
  }
  return null;
}

export async function executeBackendToolExecution(
  db: SupabaseServiceClient,
  input: BackendToolExecuteInput,
): Promise<BackendToolExecution> {
  let diagnosticContext: BackendToolExecutionDiagnosticContext = {};
  try {
    const contract = backendToolRegistry.contractForTool(input.toolName);
    if (!contract)
      throw new DomainError(
        domainCodes.NOT_FOUND,
        `Unknown backend tool contract: ${input.toolName}`,
      );
    const { assistant, profile } = await requireAssistantProfile(db, input.agentId);
    diagnosticContext = { profile_id: profile.id };
    const invalidInvocation = validateInvocation(input);
    if (invalidInvocation) return { result: invalidInvocation, diagnosticContext };

    const requiresTrustedChannel = trustedChannelRequirementForContract(contract);
    if (requiresTrustedChannel && !input.trustedChannel) {
      return {
        result: toolError({
          message: "Trusted channel origin is required for this backend tool.",
        }),
        diagnosticContext,
      };
    }
    const resolvedTrustedChannelOrigin = input.trustedChannel
      ? await resolveTrustedChannelOrigin(
          db,
          profile.id,
          input.trustedChannel,
          input.invocation,
        )
      : undefined;
    const params = backendToolRegistry.parseToolParams(input.toolName, input.params ?? {});

    const result = validateSuccessfulToolResult(
      contract,
      toolRequiresExternalAction(contract)
        ? await runExternalWriteBranch({
            db,
            profile,
            assistant,
            toolInput: input,
            params,
            contract,
            ...(resolvedTrustedChannelOrigin ? { resolvedTrustedChannelOrigin } : {}),
          })
        : await dispatchNonSyncTool({
            db,
            input,
            assistant,
            profile,
            params,
            ...(resolvedTrustedChannelOrigin ? { resolvedTrustedChannelOrigin } : {}),
          }),
    );
    return { result, diagnosticContext };
  } catch (error) {
    const expectedFailure = expectedBackendToolErrorToResult(
      error,
      backendToolRegistry.contractForTool(input.toolName) ?? undefined,
    );
    if (expectedFailure) {
      return { result: expectedFailure, diagnosticContext };
    }
    throw error;
  }
}

export async function executeBackendTool(
  db: SupabaseServiceClient,
  input: BackendToolExecuteInput,
): Promise<BackendToolResult> {
  return (await executeBackendToolExecution(db, input)).result;
}
