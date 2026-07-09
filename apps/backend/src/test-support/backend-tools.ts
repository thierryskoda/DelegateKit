import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  backendToolResultSchema,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import {
  executeBackendTool,
  type BackendToolExecuteInput,
} from "../runtime/agent-tools/executor";

export type E2eBackendToolRequest = BackendToolExecuteInput;
export type E2eBackendToolResult = BackendToolResult;

const E2E_TEST_CHANNEL_DEFAULT_PEER_ID = "e2e-user";

export type E2eBackendToolCallPayload = {
  capabilityId: string;
  agentId: string;
  toolName: BackendToolExecuteInput["toolName"];
  params: Record<string, unknown>;
};

export function e2eBackendToolCallId(capabilityId: string, toolName: string): string {
  return `e2e-${capabilityId}-${toolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildE2eBackendToolRequest(
  input: E2eBackendToolCallPayload,
): E2eBackendToolRequest {
  const toolCallId = e2eBackendToolCallId(input.capabilityId, input.toolName);
  return {
    agentId: input.agentId,
    toolName: input.toolName,
    toolCallId,
    params: input.params,
    invocation: {
      agentId: input.agentId,
      toolCallId,
      sessionKey: `e2e:${input.capabilityId}:${toolCallId}`,
      requestId: toolCallId,
      runKind: "manual",
      runKindSource: "default",
    },
  };
}

export function withE2eTrustedChannel(
  request: E2eBackendToolRequest,
  capabilityId: string,
): E2eBackendToolRequest {
  return {
    ...request,
    trustedChannel: {
      messageChannel: "e2e-test",
      requesterSenderId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
      senderIsOwner: true,
      deliveryContext: { capabilityId, toolCallId: request.toolCallId },
    },
  };
}

export async function executeE2eBackendTool(
  db: SupabaseServiceClient,
  request: E2eBackendToolRequest,
): Promise<E2eBackendToolResult> {
  return backendToolResultSchema.parse(await executeBackendTool(db, request));
}
