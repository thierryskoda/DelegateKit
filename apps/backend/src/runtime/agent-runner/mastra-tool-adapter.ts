import { createTool, type Tool, type ToolExecutionContext } from "@mastra/core/tools";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { formatUnknownError } from "@ai-assistants/errors";
import {
  backendToolResultSchemaForContract,
  type BackendToolExecuteRequest,
  type BackendToolResult,
  type ToolContract,
} from "@ai-assistants/tool-contracts";
import { randomUUID } from "node:crypto";
import { recordAgentEventSafe } from "../../product/agent-events/agent-event-ledger";
import { safeAgentEventJsonObject } from "../../product/agent-events/evidence-identity";
import { executeBackendToolExecution } from "../agent-tools/executor";

type BackendToolInvocation = BackendToolExecuteRequest["invocation"];

type MastraBackendToolRunContext = {
  db: SupabaseServiceClient;
  profileId: string;
  agentId: string;
  agentRunId: string;
  sessionKey: string;
  sessionId?: string | undefined;
  requestId: string;
  runKind: BackendToolInvocation["runKind"];
  runKindSource?: BackendToolInvocation["runKindSource"] | undefined;
  trustedChannel?: BackendToolExecuteRequest["trustedChannel"] | undefined;
};

type MastraBackendTool = Tool<
  Record<string, unknown>,
  BackendToolResult,
  unknown,
  unknown,
  ToolExecutionContext,
  string
>;

type MastraBackendToolMap = Record<string, MastraBackendTool>;

function mastraToolCallId(
  contract: ToolContract,
  runContext: MastraBackendToolRunContext,
  toolContext: ToolExecutionContext,
): string {
  const mastraToolCallId = toolContext.agent?.toolCallId?.trim();
  return mastraToolCallId || `mastra:${runContext.requestId}:${contract.name}:${randomUUID()}`;
}

function agentRuntimeToolSourceEventKey(input: {
  agentRunId: string;
  eventType: "assistant.tool.call" | "assistant.tool.result";
  toolCallId: string;
}): string {
  return `agent_run:${input.agentRunId}:${input.eventType}:${input.toolCallId}`;
}

async function recordMastraToolCall(input: {
  contract: ToolContract;
  runContext: MastraBackendToolRunContext;
  toolCallId: string;
  params: Record<string, unknown>;
}): Promise<void> {
  await recordAgentEventSafe(input.runContext.db, {
    profileId: input.runContext.profileId,
    agentRunId: input.runContext.agentRunId,
    eventType: "assistant.tool.call",
    source: "agent_runtime",
    sourceEventKey: agentRuntimeToolSourceEventKey({
      agentRunId: input.runContext.agentRunId,
      eventType: "assistant.tool.call",
      toolCallId: input.toolCallId,
    }),
    occurredAt: new Date().toISOString(),
    visibility: "internal",
    payload: {
      eventType: "assistant.tool.call",
      toolName: input.contract.name,
      toolCallId: input.toolCallId,
      requestId: input.runContext.requestId,
      input: safeAgentEventJsonObject(input.params),
      sessionKey: input.runContext.sessionKey,
      provenance: safeAgentEventJsonObject({
        observer: "agent_runtime",
        runKind: input.runContext.runKind,
        runKindSource: input.runContext.runKindSource ?? "default",
      }),
    },
  });
}

async function recordMastraToolResult(input: {
  contract: ToolContract;
  runContext: MastraBackendToolRunContext;
  toolCallId: string;
  result: BackendToolResult;
}): Promise<void> {
  const resultPayload =
    "error" in input.result
      ? {
          status: "failed" as const,
          output: null,
          error: safeAgentEventJsonObject(input.result.error),
        }
      : {
          status: "succeeded" as const,
          output: safeAgentEventJsonObject(input.result.data),
          error: null,
        };
  await recordAgentEventSafe(input.runContext.db, {
    profileId: input.runContext.profileId,
    agentRunId: input.runContext.agentRunId,
    eventType: "assistant.tool.result",
    source: "agent_runtime",
    sourceEventKey: agentRuntimeToolSourceEventKey({
      agentRunId: input.runContext.agentRunId,
      eventType: "assistant.tool.result",
      toolCallId: input.toolCallId,
    }),
    occurredAt: new Date().toISOString(),
    visibility: "internal",
    payload: {
      eventType: "assistant.tool.result",
      toolName: input.contract.name,
      toolCallId: input.toolCallId,
      status: resultPayload.status,
      requestId: input.runContext.requestId,
      output: resultPayload.output,
      error: resultPayload.error,
      sessionKey: input.runContext.sessionKey,
      provenance: safeAgentEventJsonObject({ observer: "agent_runtime" }),
    },
  });
}

async function recordMastraToolException(input: {
  contract: ToolContract;
  runContext: MastraBackendToolRunContext;
  toolCallId: string;
  error: unknown;
}): Promise<void> {
  await recordMastraToolResult({
    contract: input.contract,
    runContext: input.runContext,
    toolCallId: input.toolCallId,
    result: {
      error: {
        message: formatUnknownError(input.error),
        details: safeAgentEventJsonObject(input.error),
      },
    },
  });
}

function contractToMastraTool(
  contract: ToolContract,
  runContext: MastraBackendToolRunContext,
): MastraBackendTool {
  const outputSchema = backendToolResultSchemaForContract(contract);

  return createTool({
    id: contract.name,
    description: contract.description,
    inputSchema: contract.inputSchema,
    outputSchema,
    strict: true,
    execute: async (inputData, toolContext) => {
      const params = contract.inputSchema.parse(inputData);
      const toolCallId = mastraToolCallId(contract, runContext, toolContext);
      await recordMastraToolCall({ contract, runContext, toolCallId, params });
      const invocation = {
          agentId: runContext.agentId,
          toolCallId,
          sessionKey: runContext.sessionKey,
          ...(runContext.sessionId ? { sessionId: runContext.sessionId } : {}),
          requestId: runContext.requestId,
          runKind: runContext.runKind,
          runKindSource: runContext.runKindSource ?? "default",
      } satisfies BackendToolInvocation;
      try {
        const execution = await executeBackendToolExecution(runContext.db, {
          agentId: runContext.agentId,
          toolName: contract.name,
          toolCallId,
          params,
          invocation,
          ...(runContext.trustedChannel ? { trustedChannel: runContext.trustedChannel } : {}),
        });
        const result = outputSchema.parse(execution.result);
        await recordMastraToolResult({ contract, runContext, toolCallId, result });
        return result;
      } catch (error) {
        await recordMastraToolException({ contract, runContext, toolCallId, error });
        throw error;
      }
    },
  }) as MastraBackendTool;
}

export function contractsToMastraTools(
  contracts: readonly ToolContract[],
  runContext: MastraBackendToolRunContext,
): MastraBackendToolMap {
  const tools: MastraBackendToolMap = {};
  for (const contract of contracts) {
    tools[contract.name] = contractToMastraTool(contract, runContext);
  }
  return tools;
}
