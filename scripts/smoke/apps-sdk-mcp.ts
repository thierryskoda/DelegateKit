#!/usr/bin/env tsx
import { JSONRPCResponseSchema } from "@modelcontextprotocol/sdk/types.js";
import { timedFetch } from "@ai-assistants/workspace-shared";

const MCP_SMOKE_TIMEOUT_MS = 20_000;

type Args = {
  url: string;
  profileId: string;
  devIdentity: string;
  conversationId: string;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run smoke:apps-sdk-mcp -- --url http://127.0.0.1:8797/mcp --profile testing",
    "  npm run smoke:apps-sdk-mcp -- --url https://example.ts.net/mcp --profile testing --dev-identity testing-dev",
  ].join("\n");
}

function valueAfter(argv: string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) return null;
  const value = argv[index + 1]?.trim();
  return value || null;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const url = valueAfter(argv, "--url");
  const profileId = valueAfter(argv, "--profile") ?? "testing";
  const devIdentity = valueAfter(argv, "--dev-identity") ?? "smoke-dev";
  const conversationId = valueAfter(argv, "--conversation") ?? "smoke-apps-sdk-mcp";
  if (!url) throw new Error(usage());
  return { url, profileId, devIdentity, conversationId };
}

function withContext(input: Args): string {
  const url = new URL(input.url);
  url.searchParams.set("profileId", input.profileId);
  url.searchParams.set("devIdentity", input.devIdentity);
  url.searchParams.set("conversationId", input.conversationId);
  return url.toString();
}

async function callMcp(url: string, method: string, params: Record<string, unknown> = {}) {
  const response = await timedFetch.fetch(url, {
    timeoutMs: MCP_SMOKE_TIMEOUT_MS,
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`MCP HTTP ${response.status}: ${text}`);
  return JSONRPCResponseSchema.parse(JSON.parse(text));
}

function resultOf(response: Awaited<ReturnType<typeof callMcp>>): Record<string, unknown> {
  if (!("result" in response))
    throw new Error(`Expected JSON-RPC result: ${JSON.stringify(response)}`);
  const result = response.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error(`Expected object result: ${JSON.stringify(response)}`);
  }
  return result as Record<string, unknown>;
}

function requireStructuredObject(
  response: Awaited<ReturnType<typeof callMcp>>,
  label: string,
): Record<string, unknown> {
  const structuredContent = resultOf(response).structuredContent;
  if (
    !structuredContent ||
    typeof structuredContent !== "object" ||
    Array.isArray(structuredContent)
  ) {
    throw new Error(`${label} did not return structuredContent object.`);
  }
  return structuredContent as Record<string, unknown>;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const contextUrl = withContext(args);

  const toolsResult = resultOf(await callMcp(args.url, "tools/list"));
  const tools = toolsResult.tools;
  if (!Array.isArray(tools)) throw new Error("tools/list did not return an array.");
  const toolNames = new Set(tools.map((tool) => String((tool as { name?: unknown }).name)));
  for (const name of ["get_app_status", "get_workbench_context_status", "get_morning_brief"]) {
    if (!toolNames.has(name)) throw new Error(`Missing MCP tool: ${name}`);
  }

  const appStatus = requireStructuredObject(
    await callMcp(args.url, "tools/call", {
      name: "get_app_status",
      arguments: {},
    }),
    "get_app_status",
  );
  if (appStatus.status !== "ok")
    throw new Error(`Unexpected app status: ${JSON.stringify(appStatus)}`);

  const contextStatus = requireStructuredObject(
    await callMcp(contextUrl, "tools/call", {
      name: "get_workbench_context_status",
      arguments: {},
    }),
    "get_workbench_context_status",
  );
  if (contextStatus.profileId !== args.profileId) {
    throw new Error(`Unexpected context profile: ${JSON.stringify(contextStatus)}`);
  }

  const morningBrief = requireStructuredObject(
    await callMcp(contextUrl, "tools/call", {
      name: "get_morning_brief",
      arguments: {},
    }),
    "get_morning_brief",
  );
  if (typeof morningBrief.summary !== "string" || !morningBrief.summary.trim()) {
    throw new Error(`Morning brief missing summary: ${JSON.stringify(morningBrief)}`);
  }

  console.log("Apps SDK MCP smoke OK");
  console.log(`- URL: ${args.url}`);
  console.log(`- profileId: ${args.profileId}`);
  console.log(`- summary: ${morningBrief.summary}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
