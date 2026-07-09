import assert from "node:assert/strict";
import {
  requireSupabaseRows,
  type TableRow,
} from "@ai-assistants/control-db";
import type { ToolContract } from "@ai-assistants/tool-contracts";
import {
  BACKEND_E2E_CHANNEL_PROVIDER,
  listProfileChannelMessages,
  runBackendChannelTurn,
  type ProfileAssistantInboundAttachment,
  type ProfileAssistantOutboundAction,
  type ProfileAssistantOutboundFileAction,
} from "../../../../apps/backend/src/test-support/agent-runtime";
import {
  ensureDefaultTestingTrustedE2eChannel,
  hasDefaultTestingTrustedE2eChannel,
} from "../fixtures/testing-trusted-channel-fixture";
import { useE2eDb } from "../db/e2e-db";
import type { E2eRun } from "../run/e2e-run";
import { e2eWorkspaceDir } from "../run/workspace";

const DIRECT_E2E_MACHINE_TOKEN = "e2e-direct-backend-machine-token";

type DirectAgentRuntimeMessage = Awaited<
  ReturnType<typeof listProfileChannelMessages>
>["messages"][number];

export type DirectAgentRuntimeChannel = {
  run: E2eRun;
  peerId: string;
};

export type DirectAgentRuntimeTurn = {
  marker: string;
  sessionKey: string;
  inboundText: string;
  outboundText: string;
  messages: readonly DirectAgentRuntimeMessage[];
  inboundMessages: readonly DirectAgentRuntimeMessage[];
  outboundMessages: readonly DirectAgentRuntimeMessage[];
  outboundActions: readonly ProfileAssistantOutboundAction[];
  outboundFiles: readonly ProfileAssistantOutboundFileAction[];
  agentRunId: string;
  latencyMs: {
    agentRun: number;
    totalSendMessage: number;
  };
};

export type SendDirectAgentRuntimeMessageOptions = {
  instructions?: string;
  maxSteps?: number;
  toolContracts?: readonly ToolContract[];
  inboundAttachments?: readonly ProfileAssistantInboundAttachment[];
};

function ensureDirectRuntimeEnv(): void {
  process.env.AI_ASSISTANTS_BACKEND_MACHINE_TOKEN ??= DIRECT_E2E_MACHINE_TOKEN;
}

function normalizeMessage(message: string | readonly string[]): string {
  return typeof message === "string" ? message : message.join(" ");
}

function directSessionKey(input: { run: E2eRun; peerId: string }): string {
  return `direct-e2e:${input.run.agentId}:${input.peerId}:${input.run.runId}`;
}

export async function useDirectAgentRuntimeChannel(
  run: E2eRun,
): Promise<DirectAgentRuntimeChannel> {
  ensureDirectRuntimeEnv();
  if (!hasDefaultTestingTrustedE2eChannel(run)) {
    const db = await useE2eDb();
    await ensureDefaultTestingTrustedE2eChannel({ db, run });
  }
  return { run, peerId: run.peerId };
}

export async function sendDirectAgentRuntimeMessage(
  channel: DirectAgentRuntimeChannel,
  marker: string,
  message: string | readonly string[],
  options: SendDirectAgentRuntimeMessageOptions = {},
): Promise<DirectAgentRuntimeTurn> {
  ensureDirectRuntimeEnv();
  const db = await useE2eDb();
  const run = channel.run;
  const inputText = normalizeMessage(message);
  const sessionKey = directSessionKey({ run, peerId: channel.peerId });
  const since = new Date(Date.now() - 1_000).toISOString();
  const t0 = performance.now();
  const result = await runBackendChannelTurn({
    db,
    provider: BACKEND_E2E_CHANNEL_PROVIDER,
    senderId: channel.peerId,
    inputText,
    sessionKey,
    requestId: `direct-e2e:${run.runId}:${marker}`,
    ...(options.instructions ? { instructions: options.instructions } : {}),
    ...(options.maxSteps ? { maxSteps: options.maxSteps } : {}),
    ...(options.toolContracts ? { toolContracts: options.toolContracts } : {}),
    ...(options.inboundAttachments ? { inboundAttachments: options.inboundAttachments } : {}),
    workspaceDir: e2eWorkspaceDir(run.runtimeRoot, run.agentId),
    inboundExternalMessageId: `direct-e2e-inbound:${run.runId}:${marker}`,
    deliveryContext: { marker, runId: run.runId },
  });
  const t1 = performance.now();
  const listed = await listProfileChannelMessages(db, {
    profileId: result.metadata.profileId,
    conversationId: channel.peerId,
    since,
    until: new Date(Date.now() + 60_000).toISOString(),
    limit: 100,
  });
  const messages = [...listed.messages].sort((left, right) =>
    left.occurredAt.localeCompare(right.occurredAt),
  );
  const inboundMessages = messages.filter((item) => item.direction === "inbound");
  const outboundMessages = messages.filter((item) => item.direction === "outbound");
  const outboundText = outboundMessages.map((item) => item.contentText).join("\n");
  const outboundFiles = result.outboundActions.filter(
    (action): action is ProfileAssistantOutboundFileAction => action.kind === "send_file",
  );
  assert.ok(inboundMessages.length > 0, `${marker}: expected persisted inbound channel message.`);
  assert.ok(
    outboundMessages.length > 0,
    `${marker}: expected persisted outbound channel message.`,
  );
  assert.ok(outboundText.trim(), `${marker}: expected non-empty outbound text.`);
  const t2 = performance.now();
  return {
    marker,
    sessionKey,
    inboundText: inputText,
    outboundText,
    messages,
    inboundMessages,
    outboundMessages,
    outboundActions: result.outboundActions,
    outboundFiles,
    agentRunId: result.metadata.agentRunId,
    latencyMs: {
      agentRun: Math.round(t1 - t0),
      totalSendMessage: Math.round(t2 - t0),
    },
  };
}

export async function listDirectAgentRuntimeToolEvents(
  turn: DirectAgentRuntimeTurn,
  input: {
    eventType: "assistant.tool.call" | "assistant.tool.result";
    toolName?: string;
  },
): Promise<TableRow<"agent_events">[]> {
  const db = await useE2eDb();
  let query = db
    .from("agent_events")
    .select()
    .eq("agent_run_id", turn.agentRunId)
    .eq("event_type", input.eventType);
  if (input.toolName) {
    query = query.contains("payload", { toolName: input.toolName });
  }
  const result = await query.order("occurred_at", { ascending: true });
  return requireSupabaseRows(
    `Load direct agent runtime ${input.eventType} events for ${turn.marker}`,
    result.data,
    result.error,
  );
}
