import assert from "node:assert/strict";
import { test } from "node:test";
import { readDiagnosticRecords } from "@ai-assistants/runtime-diagnostics";
import { JSONRPCResponseSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  appStatusOutputSchema,
  contextStatusOutputSchema,
  morningBriefOutputSchema,
} from "../../../apps/backend/src/test-support/apps-sdk-mcp";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { startBackend, type BackendServerHandle } from "../helpers/processes/start-backend";
import { createE2eRun } from "../helpers/run/e2e-run";

const SCENARIO_ID = "chatgpt-apps-sdk-mcp";
const PROFILE_ID = "testing";

async function callMcp(input: {
  backend: BackendServerHandle;
  path?: string;
  method: string;
  params?: Record<string, unknown>;
}) {
  const response = await fetch(`${input.backend.baseUrl}${input.path ?? "/mcp"}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: input.method,
      params: input.params ?? {},
    }),
  });

  const text = await response.text();
  assert.equal(response.status, 200, `MCP HTTP ${response.status}: ${text}`);
  return JSONRPCResponseSchema.parse(JSON.parse(text));
}

function resultOf(
  response: ReturnType<typeof JSONRPCResponseSchema.parse>,
): Record<string, unknown> {
  assert.ok("result" in response, `Expected JSON-RPC result, got ${JSON.stringify(response)}`);
  assert.equal(response.id, 1);
  assert.ok(
    response.result && typeof response.result === "object" && !Array.isArray(response.result),
  );
  return response.result as Record<string, unknown>;
}

function structuredContentOf(response: ReturnType<typeof JSONRPCResponseSchema.parse>): unknown {
  const result = resultOf(response);
  return result.structuredContent;
}

test(`${SCENARIO_ID}: ChatGPT Apps SDK MCP route lists tools and serves profile brief`, async (t) => {
  const run = await createE2eRun(t, { id: SCENARIO_ID });
  const supabase = await attachE2eSupabase(run);
  const backend = await startBackend(run, { supabase });

  const toolList = resultOf(await callMcp({ backend, method: "tools/list" }));
  const tools = toolList.tools;
  assert.ok(Array.isArray(tools), "MCP tools/list should return tools array");
  const toolNames = new Set(
    tools.map((tool) => {
      assert.ok(tool && typeof tool === "object" && "name" in tool);
      return String(tool.name);
    }),
  );
  assert.ok(toolNames.has("get_app_status"));
  assert.ok(toolNames.has("get_workbench_context_status"));
  assert.ok(toolNames.has("get_morning_brief"));

  const appStatus = appStatusOutputSchema.parse(
    structuredContentOf(
      await callMcp({
        backend,
        method: "tools/call",
        params: { name: "get_app_status", arguments: {} },
      }),
    ),
  );
  assert.equal(appStatus.status, "ok");
  assert.equal(appStatus.mode, "prototype");

  const missingContext = resultOf(
    await callMcp({
      backend,
      method: "tools/call",
      params: { name: "get_workbench_context_status", arguments: {} },
    }),
  );
  assert.equal(missingContext.isError, true);
  assert.deepEqual(missingContext.structuredContent, {
    error: {
      code: "CHATGPT_APP_CONTEXT_REQUIRED",
      message:
        "This assistant tool needs a profile context. Reconnect the app with a profileId before using profile-specific tools.",
    },
  });

  const contextPath = `/mcp?profileId=${encodeURIComponent(PROFILE_ID)}&devIdentity=testing-dev&conversationId=e2e-chatgpt-apps-sdk`;
  const contextToolList = resultOf(
    await callMcp({ backend, path: contextPath, method: "tools/list" }),
  );
  const contextTools = contextToolList.tools;
  assert.ok(Array.isArray(contextTools), "profile-scoped MCP tools/list should return tools array");
  const contextToolNames = new Set(
    contextTools.map((tool) => {
      assert.ok(tool && typeof tool === "object" && "name" in tool);
      return String(tool.name);
    }),
  );
  assert.ok(contextToolNames.has("profile_context_get"));
  assert.ok(contextToolNames.has("gmail_accounts_list"));
  assert.ok(contextToolNames.has("monday_board_list"));
  assert.equal(
    contextToolNames.has("gmail_message_send"),
    false,
    "write tools should not be exposed through the Apps SDK bridge yet",
  );

  const contextStatus = contextStatusOutputSchema.parse(
    structuredContentOf(
      await callMcp({
        backend,
        path: contextPath,
        method: "tools/call",
        params: { name: "get_workbench_context_status", arguments: {} },
      }),
    ),
  );
  assert.equal(contextStatus.profileId, PROFILE_ID);
  assert.equal(contextStatus.authKind, "prototype-dev");
  assert.equal(contextStatus.conversationId, "e2e-chatgpt-apps-sdk");

  const morningBrief = morningBriefOutputSchema.parse(
    structuredContentOf(
      await callMcp({
        backend,
        path: contextPath,
        method: "tools/call",
        params: { name: "get_morning_brief", arguments: {} },
      }),
    ),
  );
  assert.equal(morningBrief.profileName, "John");
  assert.equal(morningBrief.timezone, "America/Toronto");
  assert.ok(morningBrief.summary.includes("John"));
  assert.ok(morningBrief.configuredBriefSources.length > 0);
  assert.ok(morningBrief.attentionItems.length > 0);
  assert.equal(morningBrief.pendingApprovalCount, 0);

  const profileContext = structuredContentOf(
    await callMcp({
      backend,
      path: contextPath,
      method: "tools/call",
      params: { name: "profile_context_get", arguments: {} },
    }),
  );
  assert.ok(
    profileContext && typeof profileContext === "object" && !Array.isArray(profileContext),
  );
  assert.equal(
    ((profileContext as Record<string, unknown>).overview as { profile?: { id?: string } })
      .profile?.id,
    PROFILE_ID,
  );

  const serialized = JSON.stringify(morningBrief);
  assert.equal(serialized.includes(PROFILE_ID), false, "brief should not expose profile id");
  assert.equal(
    serialized.includes("profile_actions"),
    false,
    "brief should not expose table names",
  );
  assert.equal(
    serialized.includes("assistant_scheduled_tasks"),
    false,
    "brief should not expose tables",
  );

  const diagnostics = readDiagnosticRecords(run.runtimeRoot, {
    service: "backend-api",
    days: 1,
  }).filter(
    (record) =>
      record.kind === "apps_sdk.mcp.tool_call" && Date.parse(record.ts) >= run.diagnosticsStartMs,
  );
  const diagnosticToolNames = new Set(
    diagnostics.map((record) => {
      assert.ok(record.attrs, "MCP tool diagnostic should include attrs");
      return String(record.attrs.tool_name);
    }),
  );
  assert.ok(diagnosticToolNames.has("get_app_status"));
  assert.ok(diagnosticToolNames.has("get_workbench_context_status"));
  assert.ok(diagnosticToolNames.has("get_morning_brief"));
  assert.ok(diagnosticToolNames.has("profile_context_get"));
  assert.ok(
    diagnostics.some(
      (record) =>
        record.ok === false &&
        record.attrs?.tool_name === "get_workbench_context_status" &&
        record.attrs.error_code === "CHATGPT_APP_CONTEXT_REQUIRED",
    ),
    "missing-context tool call should emit a safe error diagnostic",
  );
  assert.ok(
    diagnostics.some(
      (record) =>
        record.ok === true &&
        record.profile_id === PROFILE_ID &&
        record.attrs?.tool_name === "get_morning_brief",
    ),
    "morning brief tool call should emit a successful profile-scoped diagnostic",
  );
  assert.ok(
    diagnostics.some(
      (record) =>
      record.ok === true &&
      record.profile_id === PROFILE_ID &&
      record.attrs?.tool_name === "profile_context_get" &&
      record.attrs.bridge === "assistant-backend-tool",
    ),
    "contract-backed assistant tool calls should emit bridge diagnostics",
  );
});
