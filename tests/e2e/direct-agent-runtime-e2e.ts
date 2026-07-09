#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { test } from "node:test";
import { requireSupabaseData } from "@ai-assistants/control-db";
import { timeToolContracts } from "@ai-assistants/time-contracts/contracts";
import { googleDriveToolContracts } from "@ai-assistants/google-drive-contracts/contracts";
import { actionsToolContracts } from "@ai-assistants/actions-contracts/contracts";
import { attachE2eSupabase } from "./helpers/processes/attach-supabase";
import { createE2eRun, createMarker } from "./helpers/run/e2e-run";
import { requireTestingE2eAgent } from "./helpers/run/testing-launch-support";
import { useE2eDb } from "./helpers/db/e2e-db";
import { enableTestingProviderSandboxBinding } from "./helpers/provider-runtime/testing-provider-runtime";
import { seedGoogleDriveSandboxFileFixtureForE2e } from "./helpers/fixtures/google-drive-seed";
import { startBackend } from "./helpers/processes/start-backend";
import {
  listDirectAgentRuntimeToolEvents,
  sendDirectAgentRuntimeMessage,
  useDirectAgentRuntimeChannel,
} from "./helpers/channel/direct-agent-runtime";
import { listProfileChannelMessages } from "../../apps/backend/src/test-support/agent-runtime";

const TEST_ID = "direct-agent-runtime";
const googleDriveProviderReadContracts = googleDriveToolContracts.filter(
  (contract) =>
    contract.name === "google_drive_accounts_list" || contract.name === "google_drive_search",
);
const writePolicyUpdateContracts = actionsToolContracts.filter(
  (contract) => contract.name === "write_policy_update",
);

type ChannelRouteResponse = {
  ok: boolean;
  profileId: string;
  sessionKey: string;
  metadata: { agentRunId: string };
  deliveries: Array<{ status: string; contentText: string }>;
};

function jsonRecord(value: unknown, label: string): Record<string, unknown> {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    `${label} must be a JSON object.`,
  );
  return value as Record<string, unknown>;
}

function policyRules(value: unknown): { defaultMode?: unknown; actions?: unknown } {
  return jsonRecord(value, "approval_policies.rules");
}

function latestOutboundText(turn: {
  outboundMessages: readonly { contentText: string }[];
}): string {
  return turn.outboundMessages.at(-1)?.contentText ?? "";
}

function stringArray(value: unknown, label: string): string[] {
  assert.ok(Array.isArray(value), `${label} must be an array.`);
  return value.map((item) => {
    assert.equal(typeof item, "string", `${label} entries must be strings.`);
    return item;
  });
}

async function loadConversationContextSelectionPayload(
  agentRunId: string,
): Promise<Record<string, unknown>> {
  const db = await useE2eDb();
  const result = await db
    .from("agent_events")
    .select("payload")
    .eq("agent_run_id", agentRunId)
    .eq("event_type", "assistant.conversation_context.selection")
    .single();
  return jsonRecord(
    requireSupabaseData(
      "Load direct runtime conversation context selection event",
      result.data,
      result.error,
    ).payload,
    "assistant.conversation_context.selection.payload",
  );
}

test("backend direct agent runtime persists an E2E channel turn through backend services", async (t) => {
  const run = await createE2eRun(t, {
    id: TEST_ID,
    requiredEnv: ["DEEPSEEK_API_KEY"],
    clearDiagnosticLogs: true,
  });
  requireTestingE2eAgent();
  await attachE2eSupabase(run);

  const channel = await useDirectAgentRuntimeChannel(run);
  const marker = createMarker("direct-runtime");
  const turn = await sendDirectAgentRuntimeMessage(channel, marker, [
    `This is E2E marker ${marker}.`,
    "Reply with one short sentence that includes the marker and the words direct backend runtime.",
    "This is just a quick chat check-in.",
  ]);

  assert.equal(turn.inboundMessages.length, 1);
  assert.equal(turn.outboundMessages.length, 1);
  assert.ok(turn.agentRunId, "expected direct runtime agent run id");
  assert.ok(turn.outboundText.includes(marker), `expected outbound text to include ${marker}`);
  assert.match(turn.outboundText, /direct backend runtime/i);
  assert.equal(turn.inboundMessages[0]?.contentText, turn.inboundText);
  assert.equal(turn.inboundMessages[0]?.sessionKey, turn.sessionKey);
  assert.equal(turn.outboundMessages[0]?.sessionKey, turn.sessionKey);

  const db = await useE2eDb();
  const guidanceResult = await db
    .from("agent_events")
    .select("payload")
    .eq("agent_run_id", turn.agentRunId)
    .eq("event_type", "assistant.guidance.selection")
    .single();
  const guidancePayload = jsonRecord(
    requireSupabaseData(
      "Load direct runtime guidance selection event",
      guidanceResult.data,
      guidanceResult.error,
    ).payload,
    "assistant.guidance.selection.payload",
  );
  assert.deepEqual(guidancePayload.sourceGuidanceIds, []);

  const selectionResult = await db
    .from("agent_events")
    .select("payload")
    .eq("agent_run_id", turn.agentRunId)
    .eq("event_type", "assistant.tool.selection")
    .single();
  const selectionPayload = jsonRecord(
    requireSupabaseData(
      "Load direct runtime tool selection event",
      selectionResult.data,
      selectionResult.error,
    ).payload,
    "assistant.tool.selection.payload",
  );
  assert.equal(selectionPayload.mode, "llm");
  assert.ok(
    typeof selectionPayload.candidateToolCount === "number" &&
      selectionPayload.candidateToolCount > 20,
    "expected default runtime to evaluate the full candidate backend tool set",
  );
  assert.equal(selectionPayload.selectedToolCount, 0);
  assert.deepEqual(selectionPayload.selectedToolSurfaceIds, []);
  assert.deepEqual(selectionPayload.selectedToolNames, []);

  const toolCalls = await listDirectAgentRuntimeToolEvents(turn, {
    eventType: "assistant.tool.call",
  });
  assert.equal(toolCalls.length, 0);
});

test("backend direct agent runtime skips prior chat context for standalone messages", async (t) => {
  const run = await createE2eRun(t, {
    id: `${TEST_ID}-context-skip`,
    requiredEnv: ["DEEPSEEK_API_KEY"],
    clearDiagnosticLogs: true,
  });
  requireTestingE2eAgent();
  await attachE2eSupabase(run);

  const channel = await useDirectAgentRuntimeChannel(run);
  await sendDirectAgentRuntimeMessage(
    channel,
    createMarker("context-old"),
    [
      "The aside for later is blue cedar portfolio.",
      "Please reply with one short sentence saying the aside was heard.",
    ],
    {
      maxSteps: 1,
      toolContracts: [],
    },
  );
  const currentTurn = await sendDirectAgentRuntimeMessage(
    channel,
    createMarker("context-new"),
    ["New topic: send a one sentence greeting.", "Use the exact words fresh start check."],
    {
      maxSteps: 1,
      toolContracts: [],
    },
  );

  const selectionPayload = await loadConversationContextSelectionPayload(currentTurn.agentRunId);
  assert.equal(selectionPayload.mode, "llm");
  assert.equal(selectionPayload.selectedContextMode, "none");
  assert.equal(selectionPayload.selectedMessageCount, 0);
  assert.deepEqual(stringArray(selectionPayload.selectedMessageIds, "selectedMessageIds"), []);
  assert.ok(
    typeof selectionPayload.candidateMessageCount === "number" &&
      selectionPayload.candidateMessageCount >= 2,
    "expected prior channel messages to be loaded as candidates",
  );
  assert.doesNotMatch(latestOutboundText(currentTurn), /blue cedar portfolio/i);
});

test("backend direct agent runtime selects prior chat context for continuation messages", async (t) => {
  const run = await createE2eRun(t, {
    id: `${TEST_ID}-context-select`,
    requiredEnv: ["DEEPSEEK_API_KEY"],
    clearDiagnosticLogs: true,
  });
  requireTestingE2eAgent();
  await attachE2eSupabase(run);

  const channel = await useDirectAgentRuntimeChannel(run);
  const setupTurn = await sendDirectAgentRuntimeMessage(
    channel,
    createMarker("context-setup"),
    [
      "For my next message, the phrase to use is maple ledger.",
      "Do not repeat the phrase now; reply with one short sentence saying you are ready.",
    ],
    {
      maxSteps: 1,
      toolContracts: [],
    },
  );
  const followUpTurn = await sendDirectAgentRuntimeMessage(
    channel,
    createMarker("context-followup"),
    "Use the phrase from my previous message in one short sentence.",
    {
      maxSteps: 1,
      toolContracts: [],
    },
  );

  const selectionPayload = await loadConversationContextSelectionPayload(followUpTurn.agentRunId);
  assert.equal(selectionPayload.mode, "llm");
  assert.notEqual(selectionPayload.selectedContextMode, "none");
  assert.ok(
    stringArray(selectionPayload.selectedMessageIds, "selectedMessageIds").includes(
      setupTurn.inboundMessages[0]?.id ?? "",
    ),
    "expected selector to include the prior user message that defines the phrase",
  );
  assert.match(latestOutboundText(followUpTurn), /maple ledger/i);
});

test("backend direct agent runtime executes a local read tool through backend services", async (t) => {
  const run = await createE2eRun(t, {
    id: `${TEST_ID}-tool`,
    requiredEnv: ["DEEPSEEK_API_KEY"],
    clearDiagnosticLogs: true,
  });
  requireTestingE2eAgent();
  await attachE2eSupabase(run);

  const channel = await useDirectAgentRuntimeChannel(run);
  const marker = createMarker("direct-time-tool");
  const turn = await sendDirectAgentRuntimeMessage(
    channel,
    marker,
    [
      `This is E2E marker ${marker}.`,
      "You must call the time_resolve tool before answering.",
      "Resolve the relative date today for my profile timezone.",
      "Reply with one short sentence that includes the marker and the timezone.",
    ],
    {
      maxSteps: 3,
      toolContracts: timeToolContracts,
    },
  );

  const calls = await listDirectAgentRuntimeToolEvents(turn, {
    eventType: "assistant.tool.call",
    toolName: "time_resolve",
  });
  const results = await listDirectAgentRuntimeToolEvents(turn, {
    eventType: "assistant.tool.result",
    toolName: "time_resolve",
  });

  assert.ok(calls.length >= 1, "expected direct runtime to call time_resolve");
  assert.ok(results.length >= 1, "expected direct runtime to record time_resolve result");
  assert.ok(turn.outboundText.includes(marker), `expected outbound text to include ${marker}`);
});

test("backend channel route runs E2E ingress and delivery through backend services", async (t) => {
  const run = await createE2eRun(t, {
    id: `${TEST_ID}-route`,
    requiredEnv: ["DEEPSEEK_API_KEY"],
    clearDiagnosticLogs: true,
  });
  requireTestingE2eAgent();
  const supabase = await attachE2eSupabase(run);
  const backend = await startBackend(run, { supabase });
  await useDirectAgentRuntimeChannel(run);

  const marker = createMarker("direct-route");
  const since = new Date(Date.now() - 1_000).toISOString();
  const response = await fetch(
    `${backend.baseUrl}/internal/ai-assistants/channels/e2e-test/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ai-assistants-machine-token": process.env.AI_ASSISTANTS_BACKEND_MACHINE_TOKEN ?? "",
      },
      body: JSON.stringify({
        senderId: run.peerId,
        requestId: `direct-route:${run.runId}:${marker}`,
        externalMessageId: `direct-route-inbound:${run.runId}:${marker}`,
        text: [
          `This is E2E marker ${marker}.`,
          "Reply with one short sentence that includes the marker and the words backend channel route.",
          "Do not call any tools.",
        ].join(" "),
      }),
    },
  );
  const responseText = await response.text();
  assert.equal(response.status, 200, responseText);
  const body = JSON.parse(responseText) as ChannelRouteResponse;
  assert.equal(body.ok, true);
  assert.ok(body.metadata.agentRunId, "expected agent run id from channel route");
  assert.ok(body.deliveries.some((delivery) => delivery.status === "sent"));

  const db = await useE2eDb();
  const listed = await listProfileChannelMessages(db, {
    profileId: body.profileId,
    conversationId: run.peerId,
    since,
    until: new Date(Date.now() + 60_000).toISOString(),
    limit: 100,
  });
  const inbound = listed.messages.filter((message) => message.direction === "inbound");
  const outbound = listed.messages.filter((message) => message.direction === "outbound");
  assert.ok(inbound.some((message) => message.contentText.includes(marker)));
  assert.ok(outbound.some((message) => message.contentText.includes(marker)));
  assert.ok(outbound.some((message) => /backend channel route/i.test(message.contentText)));
});

test("backend direct channel preserves trusted metadata for protected write tools", async (t) => {
  const run = await createE2eRun(t, {
    id: `${TEST_ID}-trusted-write`,
    requiredEnv: ["DEEPSEEK_API_KEY"],
    clearDiagnosticLogs: true,
  });
  requireTestingE2eAgent();
  await attachE2eSupabase(run);
  const db = await useE2eDb();
  const policyResult = await db
    .from("approval_policies")
    .select()
    .eq("profile_id", run.agentId)
    .single();
  const policy = requireSupabaseData(
    "Load testing write policy",
    policyResult.data,
    policyResult.error,
  );
  const originalRules = policy.rules;
  run.cleanup.add(async () => {
    const restored = await db
      .from("approval_policies")
      .update({ rules: originalRules, updated_at: new Date().toISOString() })
      .eq("id", policy.id);
    requireSupabaseData("Restore testing write policy", restored.data ?? [], restored.error);
  });
  const reset = await db
    .from("approval_policies")
    .update({
      rules: { defaultMode: "auto_execute", actions: {} },
      updated_at: new Date().toISOString(),
    })
    .eq("id", policy.id);
  requireSupabaseData("Reset testing write policy", reset.data ?? [], reset.error);

  const channel = await useDirectAgentRuntimeChannel(run);
  const marker = createMarker("trusted-write");
  const turn = await sendDirectAgentRuntimeMessage(
    channel,
    marker,
    [
      `This is E2E marker ${marker}.`,
      "Call write_policy_update exactly once with defaultMode set to needs_review and actions set to an empty object.",
      "Then reply with one short sentence that includes the marker and says trusted channel write updated.",
    ],
    {
      maxSteps: 4,
      toolContracts: writePolicyUpdateContracts,
      instructions:
        "This validation turn is authorized from a trusted channel. Use the available write_policy_update tool exactly as requested before replying.",
    },
  );

  const results = await listDirectAgentRuntimeToolEvents(turn, {
    eventType: "assistant.tool.result",
    toolName: "write_policy_update",
  });
  assert.ok(results.length >= 1, "expected write_policy_update result event");
  assert.ok(
    results.some((event) => {
      const payload = jsonRecord(event.payload, "assistant.tool.result.payload");
      return payload.status === "succeeded";
    }),
    "expected write_policy_update to succeed through trusted channel metadata",
  );
  const updatedResult = await db.from("approval_policies").select().eq("id", policy.id).single();
  const updated = requireSupabaseData(
    "Load updated testing write policy",
    updatedResult.data,
    updatedResult.error,
  );
  assert.equal(policyRules(updated.rules).defaultMode, "needs_review");
  assert.ok(turn.outboundText.includes(marker));
  assert.match(turn.outboundText, /trusted channel write updated/i);
});

test("backend direct agent runtime performs a provider read through backend services", async (t) => {
  const run = await createE2eRun(t, {
    id: `${TEST_ID}-provider-read`,
    requiredEnv: ["DEEPSEEK_API_KEY"],
    clearDiagnosticLogs: true,
  });
  requireTestingE2eAgent();
  await attachE2eSupabase(run);
  const db = await useE2eDb();
  await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: "google-drive",
    provider: "google-drive",
  });

  const marker = createMarker("direct-drive-read");
  const seeded = await seedGoogleDriveSandboxFileFixtureForE2e(db, {
    name: `${marker} Closing Statement.pdf`,
    mimeType: "application/pdf",
    content: [
      "Closing statement for Jordan Rowan.",
      `E2E verification marker: ${marker}.`,
      "Status: signed and ready for review.",
    ].join("\n"),
  });
  const channel = await useDirectAgentRuntimeChannel(run);
  const turn = await sendDirectAgentRuntimeMessage(
    channel,
    marker,
    [
      `This is E2E marker ${marker}.`,
      `You must use google_drive_search before answering. Search Google Drive for "${seeded.name}".`,
      `Reply with one short sentence that includes the marker and the exact file name "${seeded.name}".`,
    ],
    {
      maxSteps: 6,
      toolContracts: googleDriveProviderReadContracts,
    },
  );

  const calls = await listDirectAgentRuntimeToolEvents(turn, {
    eventType: "assistant.tool.call",
    toolName: "google_drive_search",
  });
  const results = await listDirectAgentRuntimeToolEvents(turn, {
    eventType: "assistant.tool.result",
    toolName: "google_drive_search",
  });

  assert.ok(calls.length >= 1, "expected direct runtime to call google_drive_search");
  assert.ok(results.length >= 1, "expected direct runtime to record google_drive_search result");
  assert.ok(turn.outboundText.includes(marker), `expected outbound text to include ${marker}`);
  assert.ok(
    turn.outboundText.includes(seeded.name),
    `expected outbound text to include seeded Drive file ${seeded.name}`,
  );
});
