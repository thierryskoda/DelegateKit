import {
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { loadClientDurableState } from "../client-state/read-model";
import type { ProfileLearningReviewWindow } from "./types";
import {
  listRecentLearningReviewCandidateOutcomes,
  type ProfileLearningReviewCandidate,
} from "./storage";

const MAX_EVIDENCE_ITEMS_PER_KIND = 80;

export type ProfileLearningReviewEvidence = {
  profile: Pick<TableRow<"profiles">, "id" | "display_name" | "timezone" | "status">;
  window: ProfileLearningReviewWindow;
  channelMessages: TableRow<"agent_events">[];
  activities: TableRow<"agent_events">[];
  assistantEvents: TableRow<"agent_events">[];
  workItems: TableRow<"assistant_work_items">[];
  actions: TableRow<"profile_actions">[];
  proposals: TableRow<"profile_proposals">[];
  scheduledTasks: TableRow<"assistant_scheduled_tasks">[];
  workRoutes: TableRow<"profile_assistant_work_routes">[];
  profileGuidance: TableRow<"profile_guidance">[];
  priorOutcomes: ProfileLearningReviewCandidate[];
};

type ProfileLearningReviewEvidencePacketScope = "source" | "context";

export type ProfileLearningReviewEvidencePacket = {
  ref: string;
  scope: ProfileLearningReviewEvidencePacketScope;
  sourceKind: string;
  occurredAt: string;
  targetRefs: string[];
  title: string | null;
  text: string | null;
  status: string | null;
};

function evidencePacketScope(
  window: ProfileLearningReviewWindow,
  occurredAt: string,
): ProfileLearningReviewEvidencePacketScope {
  return occurredAt >= window.sourceWindowStartAt && occurredAt < window.sourceWindowEndAt
    ? "source"
    : "context";
}

function textFromObject(value: unknown, keys: readonly string[]): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const key of keys) {
    const item = (value as Record<string, unknown>)[key];
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  return null;
}

function eventPayload(event: TableRow<"agent_events">): Record<string, unknown> {
  return event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)
    ? (event.payload as Record<string, unknown>)
    : {};
}

function stringArrayFromObject(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function compactJsonText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = JSON.stringify(value);
  return text === undefined || text === "{}" || text === "null" ? null : text.slice(0, 2_000);
}

function assistantEventPacketText(payload: Record<string, unknown>): string | null {
  const eventType = textFromObject(payload, ["eventType"]);
  if (eventType === "assistant.message.text") return textFromObject(payload, ["text"]);
  if (eventType === "assistant.model.response") {
    return compactJsonText({
      model: payload.model,
      responseId: payload.responseId,
      usage: payload.usage,
      finishReason: payload.finishReason,
    });
  }
  if (eventType === "assistant.tool.call") {
    return compactJsonText({
      toolName: payload.toolName,
      toolCallId: payload.toolCallId,
      input: payload.input,
    });
  }
  if (eventType === "assistant.tool.result") {
    return compactJsonText({
      toolName: payload.toolName,
      toolCallId: payload.toolCallId,
      status: payload.status,
      output: payload.output,
      error: payload.error,
    });
  }
  return null;
}

export function profileLearningReviewEvidencePackets(
  evidence: ProfileLearningReviewEvidence,
): ProfileLearningReviewEvidencePacket[] {
  return [
    ...evidence.channelMessages.map((message) => {
      const payload = eventPayload(message);
      return {
        ref: `channel_message:${message.id}`,
        scope: evidencePacketScope(evidence.window, message.occurred_at),
        sourceKind: "channel_message",
        occurredAt: message.occurred_at,
        targetRefs: [],
        title: [textFromObject(payload, ["direction"]), textFromObject(payload, ["status"])]
          .filter(Boolean)
          .join(" "),
        text: textFromObject(payload, ["contentText"]),
        status: textFromObject(payload, ["status"]) ?? message.event_type,
      };
    }),
    ...evidence.activities.map((activity) => {
      const payload = eventPayload(activity);
      return {
        ref: `activity:${activity.id}`,
        scope: evidencePacketScope(evidence.window, activity.occurred_at),
        sourceKind: "activity",
        occurredAt: activity.occurred_at,
        targetRefs: stringArrayFromObject(payload.referenceKeys),
        title: textFromObject(payload, ["title"]),
        text: textFromObject(payload, ["summary"]),
        status: textFromObject(payload.metadata, ["activityEventType"]) ?? activity.event_type,
      };
    }),
    ...evidence.assistantEvents.map((event) => {
      const payload = eventPayload(event);
      const eventType = textFromObject(payload, ["eventType"]) ?? event.event_type;
      const toolName = textFromObject(payload, ["toolName"]);
      const toolCallId = textFromObject(payload, ["toolCallId"]);
      const sessionKey = textFromObject(payload, ["sessionKey"]);
      return {
        ref: `agent_event:${event.id}`,
        scope: evidencePacketScope(evidence.window, event.occurred_at),
        sourceKind: event.event_type,
        occurredAt: event.occurred_at,
        targetRefs: [
          sessionKey ? `session:${sessionKey}` : "",
          toolCallId ? `tool_call:${toolCallId}` : "",
          toolName ? `tool:${toolName}` : "",
        ].filter(Boolean),
        title:
          event.event_type === "assistant.tool.call" || event.event_type === "assistant.tool.result"
            ? `${event.event_type} ${toolName ?? "unknown_tool"}`
            : eventType,
        text: assistantEventPacketText(payload),
        status: textFromObject(payload, ["status", "finishReason"]) ?? event.event_type,
      };
    }),
    ...evidence.workItems.map((workItem) => ({
      ref: `work_item:${workItem.id}`,
      scope: evidencePacketScope(evidence.window, workItem.updated_at),
      sourceKind: "work_item",
      occurredAt: workItem.updated_at,
      targetRefs: [
        workItem.origin_scheduled_task_id
          ? `scheduled_task:${workItem.origin_scheduled_task_id}`
          : "",
      ].filter(Boolean),
      title: textFromObject(workItem.payload, ["title"]) ?? workItem.kind,
      text:
        textFromObject(workItem.payload, ["detail", "instructions"]) ??
        textFromObject(workItem.result, ["message", "summary", "error"]) ??
        workItem.last_error,
      status: workItem.status,
    })),
    ...evidence.actions.map((action) => ({
      ref: `profile_action:${action.id}`,
      scope: evidencePacketScope(evidence.window, action.updated_at),
      sourceKind: "profile_action",
      occurredAt: action.updated_at,
      targetRefs: [action.target_id ? `target:${action.target_id}` : ""].filter(Boolean),
      title: action.title,
      text: action.summary,
      status: action.status,
    })),
    ...evidence.proposals.map((proposal) => ({
      ref: `profile_proposal:${proposal.id}`,
      scope: evidencePacketScope(evidence.window, proposal.updated_at),
      sourceKind: "profile_proposal",
      occurredAt: proposal.updated_at,
      targetRefs: [
        proposal.source_scheduled_task_id
          ? `scheduled_task:${proposal.source_scheduled_task_id}`
          : "",
        proposal.source_work_item_id ? `work_item:${proposal.source_work_item_id}` : "",
      ].filter(Boolean),
      title: proposal.title,
      text: proposal.summary,
      status: proposal.status,
    })),
  ]
    .filter((packet) => packet.title || packet.text)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export async function loadProfileLearningReviewEvidence(
  db: SupabaseServiceClient,
  window: ProfileLearningReviewWindow,
): Promise<ProfileLearningReviewEvidence> {
  const [
    durableState,
    channelMessagesResult,
    activitiesResult,
    assistantEventsResult,
    workItemsResult,
    actionsResult,
    proposalsResult,
    priorOutcomes,
  ] = await Promise.all([
    loadClientDurableState(db, {
      profileId: window.profileId,
      mode: "reviewer",
      limit: 100,
    }),
    db
      .from("agent_events")
      .select()
      .eq("profile_id", window.profileId)
      .in("event_type", [
        "channel.message.received",
        "channel.message.delivered",
        "channel.message.delivery_failed",
      ])
      .gte("occurred_at", window.contextWindowStartAt)
      .lt("occurred_at", window.contextWindowEndAt)
      .order("occurred_at", { ascending: true })
      .limit(MAX_EVIDENCE_ITEMS_PER_KIND),
    db
      .from("agent_events")
      .select()
      .eq("profile_id", window.profileId)
      .in("event_type", [
        "provider.event.route_triaged",
        "work_item.terminal",
        "artifact.created",
        "profile_action.outcome",
        "provider.write.result",
      ])
      .gte("occurred_at", window.contextWindowStartAt)
      .lt("occurred_at", window.contextWindowEndAt)
      .order("occurred_at", { ascending: true })
      .limit(MAX_EVIDENCE_ITEMS_PER_KIND),
    db
      .from("agent_events")
      .select()
      .eq("profile_id", window.profileId)
      .in("event_type", [
        "assistant.message.text",
        "assistant.model.response",
        "assistant.tool.call",
        "assistant.tool.result",
      ])
      .gte("occurred_at", window.contextWindowStartAt)
      .lt("occurred_at", window.contextWindowEndAt)
      .order("occurred_at", { ascending: true })
      .limit(MAX_EVIDENCE_ITEMS_PER_KIND),
    db
      .from("assistant_work_items")
      .select()
      .eq("profile_id", window.profileId)
      .gte("updated_at", window.contextWindowStartAt)
      .lt("updated_at", window.contextWindowEndAt)
      .order("updated_at", { ascending: true })
      .limit(MAX_EVIDENCE_ITEMS_PER_KIND),
    db
      .from("profile_actions")
      .select()
      .eq("profile_id", window.profileId)
      .gte("updated_at", window.contextWindowStartAt)
      .lt("updated_at", window.contextWindowEndAt)
      .order("updated_at", { ascending: true })
      .limit(MAX_EVIDENCE_ITEMS_PER_KIND),
    db
      .from("profile_proposals")
      .select()
      .eq("profile_id", window.profileId)
      .gte("updated_at", window.contextWindowStartAt)
      .lt("updated_at", window.contextWindowEndAt)
      .order("updated_at", { ascending: true })
      .limit(MAX_EVIDENCE_ITEMS_PER_KIND),
    listRecentLearningReviewCandidateOutcomes(db, { profileId: window.profileId }),
  ]);

  return {
    profile: {
      id: durableState.profile.id,
      display_name: durableState.profile.display_name,
      timezone: durableState.profile.timezone,
      status: durableState.profile.status,
    },
    window,
    channelMessages: requireSupabaseRows(
      "Load profile learning review channel messages",
      channelMessagesResult.data,
      channelMessagesResult.error,
    ),
    activities: requireSupabaseRows(
      "Load profile learning review activities",
      activitiesResult.data,
      activitiesResult.error,
    ),
    assistantEvents: requireSupabaseRows(
      "Load profile learning review assistant events",
      assistantEventsResult.data,
      assistantEventsResult.error,
    ),
    workItems: requireSupabaseRows(
      "Load profile learning review work items",
      workItemsResult.data,
      workItemsResult.error,
    ),
    actions: requireSupabaseRows(
      "Load profile learning review actions",
      actionsResult.data,
      actionsResult.error,
    ),
    proposals: requireSupabaseRows(
      "Load profile learning review proposals",
      proposalsResult.data,
      proposalsResult.error,
    ),
    scheduledTasks: durableState.scheduledTasks,
    workRoutes: durableState.workRoutes,
    profileGuidance: durableState.profileGuidance,
    priorOutcomes,
  };
}
