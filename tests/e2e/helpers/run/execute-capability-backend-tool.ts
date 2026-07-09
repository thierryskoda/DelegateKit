import assert from "node:assert/strict";
import type { z } from "zod";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  buildE2eBackendToolRequest,
  e2eBackendToolCallId,
  executeE2eBackendTool,
  withE2eTrustedChannel,
  type E2eBackendToolRequest,
} from "../../../../apps/backend/src/test-support/backend-tools";
import {
  toolContractByName,
  type BackendToolResult,
  type ToolContract,
  type ToolContractByName,
  type ToolNameFor,
} from "@ai-assistants/tool-contracts";
import { TESTING_AGENT_ID } from "./testing-launch-support";

export type CapabilityToolCoverageExercise = {
  exercise: (toolName: string) => void;
};

export type CapabilityToolCallPayload = {
  capabilityId: string;
  agentId?: string;
  toolName: E2eBackendToolRequest["toolName"];
  params: Record<string, unknown>;
};

export function capabilityToolCallId(capabilityId: string, toolName: string): string {
  return e2eBackendToolCallId(capabilityId, toolName);
}

export function buildCapabilityToolRequest(
  input: CapabilityToolCallPayload,
): E2eBackendToolRequest {
  return buildE2eBackendToolRequest({
    agentId: input.agentId ?? TESTING_AGENT_ID,
    capabilityId: input.capabilityId,
    toolName: input.toolName,
    params: input.params,
  });
}

export function withTrustedChannel(
  request: E2eBackendToolRequest,
  capabilityId: string,
): E2eBackendToolRequest {
  return withE2eTrustedChannel(request, capabilityId);
}

export async function executeCapabilityTool(
  db: SupabaseServiceClient,
  request: E2eBackendToolRequest,
): Promise<BackendToolResult> {
  return executeE2eBackendTool(db, request);
}

export function parseCapabilityToolOutput<
  const TContracts extends readonly ToolContract[],
  const TName extends ToolNameFor<TContracts>,
>(
  result: BackendToolResult,
  contracts: TContracts,
  toolName: TName,
): z.infer<ToolContractByName<TContracts, TName>["outputSchema"]> {
  assert.equal(
    "data" in result,
    true,
    `${toolName} expected data result, got ${JSON.stringify(result)}`,
  );
  assert.ok("data" in result);
  return toolContractByName(contracts, toolName).outputSchema.parse(result.data) as z.infer<
    ToolContractByName<TContracts, TName>["outputSchema"]
  >;
}

export async function executeTypedCapabilityTool<
  const TContracts extends readonly ToolContract[],
  const TName extends ToolNameFor<TContracts>,
>(
  db: SupabaseServiceClient,
  contracts: TContracts,
  input: {
    capabilityId: string;
    toolName: TName;
    params: Record<string, unknown>;
    trusted?: boolean;
  },
): Promise<z.infer<ToolContractByName<TContracts, TName>["outputSchema"]>> {
  let request = buildCapabilityToolRequest({
    capabilityId: input.capabilityId,
    toolName: input.toolName,
    params: input.params,
  });
  if (input.trusted) {
    request = withTrustedChannel(request, input.capabilityId);
  }
  const result = await executeCapabilityTool(db, request);
  return parseCapabilityToolOutput(result, contracts, input.toolName);
}
