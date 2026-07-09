import { createHmac } from "node:crypto";
import {
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  listChannelMessagesResponseSchema,
  type ListChannelMessagesResponse,
  type RecordChannelMessageRequest,
  type RecordChannelMessageResponse,
} from "@ai-assistants/control-plane-contracts";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { requireAssistantProfile } from "../../auth/assistant-resolution";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { backendApiEnv } from "../../shared/env";
import { recordAgentEvent, upsertAgentRun } from "../agent-events/agent-event-ledger";
import { runtimeRunId } from "../agent-events/evidence-identity";

type ProfileChannel = TableRow<"profile_channels">;
type AgentEvent = TableRow<"agent_events">;

export type ListProfileChannelMessagesInput = {
  profileId: string;
  since: string;
  until: string;
  limit: number;
  conversationId?: string | undefined;
};

type ChannelMessageDirection = "inbound" | "outbound";
type ChannelMessageStatus = "received" | "sent" | "failed";
type ChannelMessageEventType =
  | "channel.message.received"
  | "channel.message.delivered"
  | "channel.message.delivery_failed";

export type RecordProfileChannelMessageInput = RecordChannelMessageRequest & {
  agentRunId?: string | null | undefined;
  source?: "backend" | "agent_runtime" | undefined;
};

function recordKindStorage(input: RecordProfileChannelMessageInput): {
  direction: ChannelMessageDirection;
  status: ChannelMessageStatus;
  eventType: ChannelMessageEventType;
} {
  switch (input.kind) {
    case "inbound_received":
      return { direction: "inbound", status: "received", eventType: "channel.message.received" };
    case "outbound_sent":
      return { direction: "outbound", status: "sent", eventType: "channel.message.delivered" };
    case "outbound_failed":
      return {
        direction: "outbound",
        status: "failed",
        eventType: "channel.message.delivery_failed",
      };
  }
}

function deliveryConfigAccountId(channel: ProfileChannel): string {
  const config = channel.delivery_config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return "default";
  const accountId = (config as Record<string, unknown>).accountId;
  return typeof accountId === "string" && accountId.trim() ? accountId.trim() : "default";
}

async function resolveProfileChannel(
  db: SupabaseServiceClient,
  input: RecordProfileChannelMessageInput,
): Promise<ProfileChannel | null> {
  const result = await db
    .from("profile_channels")
    .select()
    .eq("provider", input.channelId)
    .eq("external_identity", input.conversationId)
    .eq("status", "active");
  const channels = requireSupabaseRows(
    "Resolve channel message profile channel",
    result.data,
    result.error,
  );
  const matched = input.accountId
    ? channels.filter((channel) => deliveryConfigAccountId(channel) === input.accountId)
    : channels;
  return matched[0] ?? null;
}

function emitLedgerDiagnostic(
  name: string,
  input: RecordProfileChannelMessageInput,
  attrs: Record<string, unknown>,
): void {
  emitDiagnostic(backendDiagnosticLogger(), name, {
    level: name.endsWith(".failed") ? "error" : "warn",
    ok: false,
    attrs: {
      channel_id: input.channelId,
      account_id: input.accountId ?? null,
      conversation_id: input.conversationId,
      external_message_id: input.externalMessageId ?? null,
      session_key: input.sessionKey ?? null,
      kind: input.kind,
      ...attrs,
    },
  });
}

function channelMessageSourceEventKey(input: {
  profileChannelId: string;
  direction: ChannelMessageDirection;
  externalMessageId?: string | undefined;
  conversationId: string;
  occurredAt: string;
  contentText: string;
}): string {
  if (input.externalMessageId) {
    return [
      "channel_message",
      input.profileChannelId,
      input.direction,
      input.externalMessageId,
    ].join(":");
  }
  const contentDigest = createHmac(
    "sha256",
    backendApiEnv().backendMachineToken,
  )
    .update(
      JSON.stringify({
        profileChannelId: input.profileChannelId,
        direction: input.direction,
        conversationId: input.conversationId,
        occurredAt: input.occurredAt,
        contentText: input.contentText,
      }),
    )
    .digest("hex");
  return [
    "channel_message",
    input.profileChannelId,
    input.direction,
    input.conversationId,
    input.occurredAt,
    contentDigest,
  ].join(":");
}

export async function recordProfileChannelMessage(
  db: SupabaseServiceClient,
  input: RecordProfileChannelMessageInput,
): Promise<RecordChannelMessageResponse> {
  const channel = await resolveProfileChannel(db, input);
  if (!channel) {
    emitLedgerDiagnostic("channel_message.unresolved", input, {});
    return { recorded: false, reason: "unresolved_channel" };
  }

  const storage = recordKindStorage(input);
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const agentRunRuntimeId = input.agentId
    ? runtimeRunId({
        agentId: input.agentId,
        runId: input.runId,
        sessionId: input.sessionId,
        sessionKey: input.sessionKey,
      })
    : null;
  const agentRun =
    input.agentRunId
      ? { id: input.agentRunId }
      : input.agentId && agentRunRuntimeId
      ? await (async () => {
          const { profile } = await requireAssistantProfile(db, input.agentId);
          if (profile.id !== channel.profile_id) {
            emitLedgerDiagnostic("channel_message.agent_profile_mismatch", input, {
              channel_profile_id: channel.profile_id,
              assistant_profile_id: profile.id,
            });
            return null;
          }
          return upsertAgentRun(db, {
            profileId: channel.profile_id,
            agentId: input.agentId,
            sessionKey: input.sessionKey,
            sessionId: input.sessionId,
            runtimeRunId: agentRunRuntimeId,
            status: "unknown",
            startedAt: occurredAt,
          });
        })()
      : null;
  const commonPayload = {
    profileChannelId: channel.id,
    provider: channel.provider,
    conversationId: input.conversationId,
    externalMessageId: input.externalMessageId ?? null,
    contentText: input.contentText,
    sessionKey: input.sessionKey ?? null,
    accountId: input.accountId ?? null,
  };
  const payload =
    storage.eventType === "channel.message.received"
      ? {
          ...commonPayload,
          eventType: "channel.message.received" as const,
          direction: "inbound" as const,
          status: "received" as const,
        }
      : storage.eventType === "channel.message.delivered"
        ? {
            ...commonPayload,
            eventType: "channel.message.delivered" as const,
            direction: "outbound" as const,
            status: "sent" as const,
          }
        : {
            ...commonPayload,
            eventType: "channel.message.delivery_failed" as const,
            direction: "outbound" as const,
            status: "failed" as const,
            failureReason: input.failureReason ?? "Unknown delivery failure.",
          };
  const { event } = await recordAgentEvent(db, {
    profileId: channel.profile_id,
    agentRunId: agentRun?.id ?? null,
    eventType: storage.eventType,
    source: input.source ?? "agent_runtime",
    sourceEventKey: channelMessageSourceEventKey({
      profileChannelId: channel.id,
      direction: storage.direction,
      externalMessageId: input.externalMessageId,
      conversationId: input.conversationId,
      occurredAt,
      contentText: input.contentText,
    }),
    occurredAt,
    visibility: "client_visible",
    payload,
  });
  return { recorded: true, messageId: event.id };
}

function channelPayload(row: AgentEvent): Record<string, unknown> {
  return row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? (row.payload as Record<string, unknown>)
    : {};
}

function stringPayloadValue(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function timelineItem(row: AgentEvent) {
  const payload = channelPayload(row);
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    direction: stringPayloadValue(payload, "direction"),
    status: stringPayloadValue(payload, "status"),
    provider: stringPayloadValue(payload, "provider") ?? "unknown",
    profileChannelId: stringPayloadValue(payload, "profileChannelId") ?? "unknown",
    conversationId: stringPayloadValue(payload, "conversationId") ?? "unknown",
    externalMessageId: stringPayloadValue(payload, "externalMessageId"),
    contentText: stringPayloadValue(payload, "contentText") ?? "",
    sessionKey: stringPayloadValue(payload, "sessionKey"),
    failureReason: stringPayloadValue(payload, "failureReason"),
  };
}

export async function listProfileChannelMessages(
  db: SupabaseServiceClient,
  input: ListProfileChannelMessagesInput,
): Promise<ListChannelMessagesResponse> {
  let query = db
    .from("agent_events")
    .select()
    .eq("profile_id", input.profileId)
    .in("event_type", [
      "channel.message.received",
      "channel.message.delivered",
      "channel.message.delivery_failed",
    ])
    .gte("occurred_at", input.since)
    .lt("occurred_at", input.until)
    .order("occurred_at", { ascending: false });
  if (input.conversationId) {
    query = query.contains("payload", { conversationId: input.conversationId });
  }
  const result = await query.limit(input.limit);
  const rows = requireSupabaseRows("List profile channel events", result.data, result.error);
  const messages = rows.map(timelineItem);
  return listChannelMessagesResponseSchema.parse({ messages });
}
