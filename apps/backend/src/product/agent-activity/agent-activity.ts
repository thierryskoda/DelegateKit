import {
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  profileActivityEntrySchema,
  type ProfileActivityEntry,
} from "@ai-assistants/profile-context-contracts/schemas";
import { externalWriteStatusFromStorage } from "@ai-assistants/tool-contracts";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { recordAgentEventSafe } from "../agent-events/agent-event-ledger";
import { AGENT_ACTIVITY_EVENT_TYPES, profileActionActivityEventType } from "./event-types";

type AgentEvent = TableRow<"agent_events">;
const ACTIVITY_RAW_EVENT_TYPES = [
  "provider.event.route_triaged",
  "work_item.terminal",
  "artifact.created",
  "profile_action.outcome",
  "provider.write.result",
] as const;
const ACTIVITY_SCAN_PAGE_SIZE = 100;
const ACTIVITY_FILTERED_SCAN_LIMIT = 1_000;

export type ProfileActivitySearchParams = {
  query?: string | undefined;
  eventTypes?: readonly string[] | undefined;
  sourceKinds?: readonly string[] | undefined;
  referenceKeys?: readonly string[] | undefined;
  since?: string | undefined;
  until?: string | undefined;
  limit: number;
};

function trimmed(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function nonEmpty(value: string | null | undefined): string | null {
  const clean = value?.trim();
  return clean ? clean : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? nonEmpty(value) : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function uniqueReferenceKeys(values: readonly string[] = []): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sourceEventKey(input: {
  profileId: string;
  eventType: string;
  sourceKind: string;
  sourceId: string;
}): string {
  return [
    "agent_activity",
    input.profileId,
    input.eventType,
    input.sourceKind,
    input.sourceId,
  ].join(":");
}

async function recordOperationalActivityEvent(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    eventType: string;
    rawEventType:
      | "provider.event.route_triaged"
      | "work_item.terminal"
      | "artifact.created"
      | "profile_action.outcome";
    sourceKind: string;
    sourceId: string;
    occurredAt: string;
    title: string;
    summary: string;
    referenceKeys?: readonly string[];
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const eventType = trimmed(input.eventType);
  const sourceKind = trimmed(input.sourceKind);
  const sourceId = trimmed(input.sourceId);
  const referenceKeys = uniqueReferenceKeys(input.referenceKeys);
  await recordAgentEventSafe(db, {
    profileId: input.profileId,
    eventType: input.rawEventType,
    source: "backend",
    sourceEventKey: sourceEventKey({
      profileId: input.profileId,
      eventType,
      sourceKind,
      sourceId,
    }),
    occurredAt: input.occurredAt,
    visibility: "internal",
    payload: {
      eventType: input.rawEventType,
      sourceKind,
      sourceId,
      title: trimmed(input.title),
      summary: trimmed(input.summary),
      referenceKeys,
      metadata: {
        ...(input.metadata ?? {}),
        activityEventType: eventType,
      },
    },
  });
}

function activityEntryFromEvent(row: AgentEvent): ProfileActivityEntry | null {
  const payload = objectValue(row.payload);
  const metadata = objectValue(payload.metadata);
  const eventType = stringValue(metadata.activityEventType) ?? row.event_type;
  const sourceKind = stringValue(payload.sourceKind);
  const sourceId = stringValue(payload.sourceId);
  const title = stringValue(payload.title);
  const summary = stringValue(payload.summary);
  if (!sourceKind || !sourceId || !title || !summary) return null;

  return profileActivityEntrySchema.parse({
    id: row.id,
    eventType,
    title,
    summary,
    occurredAt: row.occurred_at,
    source: { kind: sourceKind, id: sourceId },
    referenceKeys: stringArrayValue(payload.referenceKeys),
  });
}

function textScore(entry: ProfileActivityEntry, query: string | null): number {
  if (!query) return 1;
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  if (terms.length === 0) return 1;
  const haystack = [
    entry.eventType,
    entry.title,
    entry.summary,
    entry.source.kind,
    entry.source.id,
    ...entry.referenceKeys,
  ]
    .join("\n")
    .toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

export async function searchProfileActivityForAssistantTool(
  db: SupabaseServiceClient,
  profileId: string,
  params: ProfileActivitySearchParams,
): Promise<ProfileActivityEntry[]> {
  const hasPostFilters = Boolean(
    nonEmpty(params.query) ||
    params.eventTypes?.length ||
    params.sourceKinds?.length ||
    params.referenceKeys?.length,
  );
  const scanLimit = hasPostFilters
    ? Math.max(ACTIVITY_FILTERED_SCAN_LIMIT, params.limit)
    : params.limit;
  const rows: AgentEvent[] = [];
  for (let offset = 0; offset < scanLimit; offset += ACTIVITY_SCAN_PAGE_SIZE) {
    const pageSize = Math.min(ACTIVITY_SCAN_PAGE_SIZE, scanLimit - offset);
    let query = db
      .from("agent_events")
      .select()
      .eq("profile_id", profileId)
      .in("event_type", [...ACTIVITY_RAW_EVENT_TYPES])
      .order("occurred_at", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (params.since) query = query.gte("occurred_at", params.since);
    if (params.until) query = query.lt("occurred_at", params.until);

    const result = await query;
    const page = requireSupabaseRows(
      "Search dynamic agent activity events",
      result.data,
      result.error,
    );
    rows.push(...page);
    if (page.length < pageSize) break;
    if (!hasPostFilters && rows.length >= params.limit) break;
  }
  const queryText = nonEmpty(params.query);
  const eventTypes = params.eventTypes ? new Set(params.eventTypes) : null;
  const sourceKinds = params.sourceKinds ? new Set(params.sourceKinds) : null;
  const referenceKeys = params.referenceKeys
    ? new Set(uniqueReferenceKeys(params.referenceKeys))
    : null;

  return rows
    .map(activityEntryFromEvent)
    .filter((entry): entry is ProfileActivityEntry => entry !== null)
    .filter((entry) => !eventTypes || eventTypes.has(entry.eventType))
    .filter((entry) => !sourceKinds || sourceKinds.has(entry.source.kind))
    .filter((entry) => !referenceKeys || entry.referenceKeys.some((key) => referenceKeys.has(key)))
    .map((entry) => ({ entry, score: textScore(entry, queryText) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, params.limit)
    .map(({ entry }) => entry);
}

function workItemTitle(workItem: TableRow<"assistant_work_items">): string {
  return stringValue(objectValue(workItem.payload).title) ?? workItem.kind;
}

function workItemSummary(workItem: TableRow<"assistant_work_items">): string | null {
  const result = objectValue(workItem.result);
  return (
    stringValue(result.message) ??
    stringValue(result.summary) ??
    stringValue(result.outcome) ??
    stringValue(result.result) ??
    workItem.last_error ??
    null
  );
}

export async function recordProviderEventRouteTriageActivitySafe(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    eventType: string;
    routeId: string;
    sourceId: string;
    title: string;
    pass: boolean;
    confidence: "low" | "medium" | "high";
    reason: string;
    noiseKind: "unrelated" | "automated_noise" | "duplicate_like" | "none";
  },
): Promise<void> {
  await recordOperationalActivityEvent(db, {
    profileId: input.profileId,
    eventType: AGENT_ACTIVITY_EVENT_TYPES.providerEventRouteTriaged,
    rawEventType: "provider.event.route_triaged",
    sourceKind: "provider_event_route_triage",
    sourceId: input.sourceId,
    occurredAt: new Date().toISOString(),
    title: input.pass
      ? `Provider event route triage passed for ${input.eventType}`
      : `Provider event route triage ignored ${input.eventType}`,
    summary: input.pass
      ? `Route triage passed with ${input.confidence} confidence: ${input.reason}`
      : `Route triage ignored "${input.title}" as ${input.noiseKind} with ${input.confidence} confidence: ${input.reason}`,
    referenceKeys: [`route:${input.routeId}`, `event_type:${input.eventType}`],
    metadata: {
      routeId: input.routeId,
      eventType: input.eventType,
      pass: input.pass,
      confidence: input.confidence,
      reason: input.reason,
      noiseKind: input.noiseKind,
      title: input.title,
    },
  });
}

export async function recordWorkItemTerminalActivitySafe(
  db: SupabaseServiceClient,
  workItem: TableRow<"assistant_work_items">,
  terminalEvidence: {
    runningByAgentId?: string | null | undefined;
    runningBySessionKey?: string | null | undefined;
    startedAt?: string | null | undefined;
  } = {},
): Promise<void> {
  const eventType =
    workItem.status === "succeeded"
      ? AGENT_ACTIVITY_EVENT_TYPES.workItemCompleted
      : workItem.status === "ignored"
        ? AGENT_ACTIVITY_EVENT_TYPES.workItemIgnored
        : workItem.status === "failed"
          ? AGENT_ACTIVITY_EVENT_TYPES.workItemFailed
          : null;
  if (!eventType) return;

  const summary = workItemSummary(workItem);
  if (!summary) {
    emitDiagnostic(backendDiagnosticLogger(), "agent_activity.work_item_summary_skipped", {
      ok: false,
      level: "warn",
      profile_id: workItem.profile_id,
      attrs: { work_item_id: workItem.id, kind: workItem.kind, status: workItem.status },
    });
    return;
  }

  await recordOperationalActivityEvent(db, {
    profileId: workItem.profile_id,
    eventType,
    rawEventType: "work_item.terminal",
    sourceKind: "work_item",
    sourceId: workItem.id,
    occurredAt: workItem.finished_at ?? workItem.updated_at,
    title: workItemTitle(workItem),
    summary,
    referenceKeys: [
      `work_item:${workItem.id}`,
      workItem.origin_scheduled_task_id
        ? `scheduled_task:${workItem.origin_scheduled_task_id}`
        : "",
      `work_item_kind:${workItem.kind}`,
      terminalEvidence.runningByAgentId ? `agent:${terminalEvidence.runningByAgentId}` : "",
      terminalEvidence.runningBySessionKey
        ? `session_key:${terminalEvidence.runningBySessionKey}`
        : "",
    ],
    metadata: {
      status: workItem.status,
      kind: workItem.kind,
      scheduledTaskId: workItem.origin_scheduled_task_id,
      runningByAgentId: terminalEvidence.runningByAgentId ?? null,
      runningBySessionKey: terminalEvidence.runningBySessionKey ?? null,
      startedAt: terminalEvidence.startedAt ?? null,
      originAgentId: workItem.origin_agent_id,
      originSessionId: workItem.origin_session_id,
      originSessionKey: workItem.origin_session_key,
      originToolCallId: workItem.origin_tool_call_id,
    },
  });
}

export async function recordArtifactCreatedActivitySafe(
  db: SupabaseServiceClient,
  artifact: TableRow<"artifacts">,
): Promise<void> {
  await recordOperationalActivityEvent(db, {
    profileId: artifact.profile_id,
    eventType: AGENT_ACTIVITY_EVENT_TYPES.artifactCreated,
    rawEventType: "artifact.created",
    sourceKind: "artifact",
    sourceId: artifact.id,
    occurredAt: artifact.created_at,
    title: `Saved ${artifact.filename}`,
    summary: artifact.description ?? `Saved artifact ${artifact.filename}.`,
    referenceKeys: [
      `artifact:${artifact.id}`,
      `artifact_type:${artifact.artifact_type}`,
      artifact.sha256 ? `artifact_sha256:${artifact.sha256}` : "",
      artifact.profile_action_id ? `profile_action:${artifact.profile_action_id}` : "",
      artifact.browser_task_id ? `browser_task:${artifact.browser_task_id}` : "",
    ],
    metadata: {
      artifactType: artifact.artifact_type,
      mimeType: artifact.mime_type,
      byteSize: artifact.byte_size,
      profileActionId: artifact.profile_action_id,
      browserTaskId: artifact.browser_task_id,
    },
  });
}

function actionFailureMessage(action: TableRow<"profile_actions">): string | null {
  const error = objectValue(action.provider_error);
  return stringValue(error.message) ?? stringValue(error.detail);
}

export async function recordProfileActionOutcomeActivitySafe(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
): Promise<void> {
  const { status } = externalWriteStatusFromStorage({
    status: action.status,
    providerExecutionStatus: action.provider_execution_status,
  });
  const outcome =
    status === "completed"
      ? "succeeded"
      : status === "failed" || status === "unknown" || status === "rejected" || status === "blocked"
        ? status
        : null;
  if (!outcome) return;

  const eventType = profileActionActivityEventType({ toolName: action.tool_name, outcome });
  const summary =
    outcome === "failed" || outcome === "unknown"
      ? (actionFailureMessage(action) ?? stringValue(action.summary))
      : stringValue(action.summary);
  if (!summary) {
    emitDiagnostic(backendDiagnosticLogger(), "agent_activity.action_summary_skipped", {
      ok: false,
      level: "warn",
      profile_id: action.profile_id,
      attrs: {
        action_id: action.id,
        status: action.status,
        provider_execution_status: action.provider_execution_status,
      },
    });
    return;
  }

  await recordOperationalActivityEvent(db, {
    profileId: action.profile_id,
    eventType,
    rawEventType: "profile_action.outcome",
    sourceKind: "profile_action",
    sourceId: action.id,
    occurredAt:
      action.provider_execution_finished_at ??
      action.decided_at ??
      action.updated_at ??
      action.created_at,
    title: action.title,
    summary,
    referenceKeys: [
      `profile_action:${action.id}`,
      `tool:${action.tool_name}`,
      `action_type:${action.action_type}`,
      action.target_id ? `target:${action.target_id}` : "",
    ],
    metadata: {
      status: action.status,
      providerExecutionStatus: action.provider_execution_status,
      toolName: action.tool_name,
      actionType: action.action_type,
      targetId: action.target_id,
    },
  });
}
