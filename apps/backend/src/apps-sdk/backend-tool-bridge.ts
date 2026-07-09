import { getSupabaseServiceClient } from "@ai-assistants/control-db";
import { formatUnknownError } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import {
  toolRequiresExternalAction,
  type ToolContract,
} from "@ai-assistants/tool-contracts";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { executeBackendToolExecution } from "../runtime/agent-tools/executor";
import { backendToolContracts } from "../runtime/agent-tools/registry";
import { backendDiagnosticLogger } from "../shared/diagnostics";
import { resolveChatGptAppInvocationContext } from "./context";

type AppsSdkToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

const CORE_READ_PLUGIN_IDS = new Set([
  "profile-context-tools",
  "time-tools",
  "work-tools",
  "actions-tools",
  "scheduled-tasks-tools",
  "profile-links-tools",
  "proposals-tools",
]);

const PLUGIN_ID_TO_CAPABILITY_SLUG = new Map<string, string>([
  ["boldsign-tools", "boldsign"],
  ["document-tools", "document-tools"],
  ["file-analysis-tools", "file-analysis"],
  ["gmail-tools", "gmail"],
  ["google-calendar-tools", "google-calendar"],
  ["google-drive-tools", "google-drive"],
  ["microsoft-onedrive-tools", "microsoft-onedrive"],
  ["microsoft-sharepoint-tools", "microsoft-sharepoint"],
  ["microsoft-todo-tools", "microsoft-todo"],
  ["monday-tools", "monday"],
  ["outlook-calendar-tools", "outlook-calendar"],
  ["outlook-mail-tools", "outlook-mail"],
  ["phone-tools", "phone"],
  ["public-web-tools", "public-web"],
]);

const DEFAULT_CHATGPT_APP_TOOL_ALLOWLIST = new Set([
  "profile_context_get",
  "profile_activity_search",
  "gmail_accounts_list",
  "gmail_messages_search",
  "gmail_message_get",
  "google_calendar_accounts_list",
  "google_calendar_calendars_list",
  "google_calendar_events_list",
  "google_calendar_events_search",
  "google_calendar_freebusy_query",
  "google_calendar_free_slots_find",
  "google_drive_accounts_list",
  "google_drive_search",
  "google_drive_file_get",
  "google_drive_folder_list",
  "monday_workspace_list",
  "monday_board_list",
  "monday_board_get",
  "monday_item_list",
  "monday_item_get",
  "monday_subitem_list",
  "monday_update_list",
]);

function backendToolIsBridgeable(contract: ToolContract): boolean {
  return (
    contract.executionKind === "backend_proxy" &&
    contract.effect === "read" &&
    !toolRequiresExternalAction(contract) &&
    DEFAULT_CHATGPT_APP_TOOL_ALLOWLIST.has(contract.name)
  );
}

function pluginCapabilitySlug(pluginId: string): string | null {
  return PLUGIN_ID_TO_CAPABILITY_SLUG.get(pluginId) ?? null;
}

async function enabledCapabilitySlugs(profileId: string): Promise<Set<string>> {
  const result = await getSupabaseServiceClient()
    .from("profile_capabilities")
    .select("capability_slug")
    .eq("profile_id", profileId)
    .eq("status", "enabled");
  if (result.error) throw result.error;
  return new Set((result.data ?? []).map((row) => row.capability_slug));
}

async function bridgeableContractsForProfile(profileId: string | null): Promise<ToolContract[]> {
  const enabledCapabilities = profileId ? await enabledCapabilitySlugs(profileId) : null;
  return backendToolContracts
    .filter(backendToolIsBridgeable)
    .filter((contract) => {
      if (CORE_READ_PLUGIN_IDS.has(contract.pluginId)) return true;
      const capabilitySlug = pluginCapabilitySlug(contract.pluginId);
      if (!capabilitySlug) return false;
      return enabledCapabilities ? enabledCapabilities.has(capabilitySlug) : true;
    });
}

function toTextContent(text: string): CallToolResult["content"] {
  return [
    {
      type: "text",
      text,
    },
  ];
}

function backendErrorResult(toolName: string, message: string): CallToolResult {
  return {
    isError: true,
    structuredContent: {
      error: {
        code: "ASSISTANT_BACKEND_TOOL_ERROR",
        toolName,
        message,
      },
    },
    content: toTextContent(message),
  };
}

function toolCallId(toolName: string, extra: AppsSdkToolExtra): string {
  return `chatgpt-app:${String(extra.requestId)}:${toolName}`;
}

function sessionKey(profileId: string, extra: AppsSdkToolExtra): string {
  const conversationId =
    extra.requestInfo?.url?.searchParams.get("conversationId")?.trim() ||
    extra.sessionId ||
    String(extra.requestId);
  return `agent:${profileId}:chatgpt-app:${conversationId}`;
}

function backendToolHandler(toolName: string) {
  return async (params: Record<string, unknown>, extra: AppsSdkToolExtra): Promise<CallToolResult> => {
    const startedAt = Date.now();
    const resolved = resolveChatGptAppInvocationContext(extra);
    if (!resolved.ok) return resolved.result;

    const context = resolved.context;
    try {
      const id = toolCallId(toolName, extra);
      const execution = await executeBackendToolExecution(getSupabaseServiceClient(), {
        agentId: context.profileId,
        toolName,
        toolCallId: id,
        params,
        invocation: {
          agentId: context.profileId,
          toolCallId: id,
          sessionKey: sessionKey(context.profileId, extra),
          ...(context.correlation.conversationId
            ? { sessionId: context.correlation.conversationId }
            : {}),
          requestId: context.requestId,
          runKind: "user",
          runKindSource: "default",
        },
      });

      emitDiagnostic(backendDiagnosticLogger(), "apps_sdk.mcp.tool_call", {
        ok: "data" in execution.result,
        level: "data" in execution.result ? "info" : "warn",
        duration_ms: Date.now() - startedAt,
        profile_id: context.profileId,
        request_id: context.requestId,
        attrs: {
          tool_name: toolName,
          auth_kind: context.auth.kind,
          bridge: "assistant-backend-tool",
          has_conversation_id: Boolean(context.correlation.conversationId),
          ...("error" in execution.result
            ? { error_code: "ASSISTANT_BACKEND_TOOL_ERROR" }
            : {}),
        },
      });

      if ("error" in execution.result) {
        return backendErrorResult(toolName, execution.result.error.message);
      }

      return {
        structuredContent: execution.result.data as Record<string, unknown>,
        content: toTextContent(`Backend tool ${toolName} completed successfully.`),
      };
    } catch (error) {
      emitDiagnostic(backendDiagnosticLogger(), "apps_sdk.mcp.tool_call", {
        ok: false,
        level: "error",
        duration_ms: Date.now() - startedAt,
        profile_id: context.profileId,
        request_id: context.requestId,
        err: error,
        attrs: {
          tool_name: toolName,
          auth_kind: context.auth.kind,
          bridge: "assistant-backend-tool",
          has_conversation_id: Boolean(context.correlation.conversationId),
        },
      });
      throw error;
    }
  };
}

export async function registerBackendMcpTools(
  server: McpServer,
  profileId: string | null,
): Promise<void> {
  let contracts: ToolContract[];
  try {
    contracts = await bridgeableContractsForProfile(profileId);
  } catch (error) {
    server.registerTool(
      "backend_tool_bridge_status",
      {
        title: "Backend tool bridge status",
        description:
          "Use this when the backend tool bridge fails to load available profile tools.",
        outputSchema: {} as z.ZodRawShape,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      () =>
        backendErrorResult(
          "backend_tool_bridge_status",
          `Backend tool bridge failed to load: ${formatUnknownError(error)}`,
        ),
    );
    return;
  }

  for (const contract of contracts) {
    server.registerTool(
      contract.name,
      {
        title: contract.label,
        description: contract.description,
        inputSchema: contract.inputSchema,
        outputSchema: contract.outputSchema,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: true,
        },
        _meta: {
          "ai-assistants/pluginId": contract.pluginId,
          "ai-assistants/effect": contract.effect,
        },
      },
      backendToolHandler(contract.name),
    );
  }
}
