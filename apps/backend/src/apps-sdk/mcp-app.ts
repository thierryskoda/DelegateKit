import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import type { Hono } from "hono";
import { resolveBackendProfile } from "../bootstrap-env";
import { backendDiagnosticLogger } from "../shared/diagnostics";
import { resolveChatGptAppDiagnosticContext } from "./context";
import { getContextStatus, contextStatusOutputSchema } from "./tools/context-status";
import { getMorningBrief, morningBriefOutputSchema } from "./tools/get-morning-brief";
import { getAppStatus, appStatusOutputSchema } from "./tools/app-status";
import { registerBackendMcpTools } from "./backend-tool-bridge";

type AppsSdkToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;
type AppsSdkToolHandler = (extra: AppsSdkToolExtra) => CallToolResult | Promise<CallToolResult>;

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeToolErrorCode(result: CallToolResult): string | null {
  const structuredContent = result.structuredContent;
  if (
    !structuredContent ||
    typeof structuredContent !== "object" ||
    Array.isArray(structuredContent)
  )
    return null;
  const error = (structuredContent as Record<string, unknown>).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  return stringValue((error as Record<string, unknown>).code);
}

function monitoredTool(toolName: string, handler: AppsSdkToolHandler): AppsSdkToolHandler {
  return async (extra) => {
    const startedAt = Date.now();
    const context = resolveChatGptAppDiagnosticContext(extra);
    try {
      const result = await handler(extra);
      const errorCode = result.isError ? safeToolErrorCode(result) : null;
      emitDiagnostic(backendDiagnosticLogger(), "apps_sdk.mcp.tool_call", {
        ok: !result.isError,
        level: result.isError ? "warn" : "info",
        duration_ms: Date.now() - startedAt,
        profile_id: context.profileId,
        request_id: String(extra.requestId),
        attrs: {
          tool_name: toolName,
          auth_kind: context.developerId ? "prototype-dev" : "missing",
          has_conversation_id: Boolean(context.conversationId),
          ...(errorCode ? { error_code: errorCode } : {}),
        },
      });
      return result;
    } catch (error) {
      emitDiagnostic(backendDiagnosticLogger(), "apps_sdk.mcp.tool_call", {
        ok: false,
        level: "error",
        duration_ms: Date.now() - startedAt,
        profile_id: context.profileId,
        request_id: String(extra.requestId),
        err: error,
        attrs: {
          tool_name: toolName,
          auth_kind: context.developerId ? "prototype-dev" : "missing",
          has_conversation_id: Boolean(context.conversationId),
        },
      });
      throw error;
    }
  };
}

function appsSdkPrototypeIsEnabled(): boolean {
  return resolveBackendProfile() !== "prod";
}

function profileIdFromRequestUrl(url: string): string | null {
  return new URL(url).searchParams.get("profileId")?.trim() || null;
}

async function createAppsSdkMcpServer(profileId: string | null): Promise<McpServer> {
  const server = new McpServer(
    {
      name: "ai-assistants-workbench",
      version: "0.1.0",
    },
    {
      instructions:
        "AI Assistants Workbench exposes client-safe assistant tools backed by the user's assistant profile. Prefer the specific assistant tool that matches the user's request. Use read-only tools for discovery before making claims about connected provider data.",
    },
  );

  server.registerTool(
    "get_app_status",
    {
      title: "Get app status",
      description:
        "Use this when you need to confirm that the AI Assistants Workbench ChatGPT app is connected and available.",
      outputSchema: appStatusOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    monitoredTool("get_app_status", () => getAppStatus()),
  );

  server.registerTool(
    "get_workbench_context_status",
    {
      title: "Get workbench context status",
      description:
        "Use this when you need to confirm whether AI Assistants Workbench has the profile and prototype identity context required for profile-specific tools.",
      outputSchema: contextStatusOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    monitoredTool("get_workbench_context_status", getContextStatus),
  );

  server.registerTool(
    "get_morning_brief",
    {
      title: "Get morning brief",
      description:
        "Use this when the user asks what needs attention today, asks for a morning brief, or wants a concise read-only overview of pending approvals and configured brief sources for their assistant profile.",
      outputSchema: morningBriefOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    monitoredTool("get_morning_brief", getMorningBrief),
  );

  await registerBackendMcpTools(server, profileId);

  return server;
}

export function registerAppsSdkMcpRoutes(app: Hono): void {
  app.all("/mcp", async (c) => {
    if (!appsSdkPrototypeIsEnabled()) {
      return c.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "ChatGPT Apps SDK prototype endpoint is disabled in production.",
          },
          id: null,
        },
        404,
      );
    }

    const server = await createAppsSdkMcpServer(profileIdFromRequestUrl(c.req.url));
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });

    await server.connect(transport);
    const response = await transport.handleRequest(c.req.raw);
    await server.close();

    return response;
  });
}
