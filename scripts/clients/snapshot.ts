#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createSupabaseServiceClient,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { assertRuntimeProfile, repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { loadClientDurableState } from "../../apps/backend/src/ops-support/client-state";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";
import { loadClientRuntimeSources, type ClientRuntimeSource } from "./source";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const RECENT_OPERATIONAL_LIMIT = 200;
const RECENT_AGENT_RUNS_LIMIT = 100;
const RECENT_AGENT_EVENTS_LIMIT = 300;
const RECENT_PROVIDER_WRITE_RECEIPTS_LIMIT = 200;
const RECENT_BACKEND_JOBS_LIMIT = 300;
const RECENT_WEBHOOK_DELIVERIES_LIMIT = 300;
const RECENT_DAYS = 60;

type ClientSnapshotArgs = {
  profile: RuntimeProfile;
  clientId: string | null;
  output:
    | {
        kind: "file";
        path: string;
      }
    | {
        kind: "directory";
        path: string;
      };
};

const defaultSnapshotDir = path.join(
  repoRoot(import.meta.url),
  "clients",
  "client-state-snapshots.generated",
);

function usage(): string {
  return [
    "Usage:",
    "  npm run clients -- snapshot --profile=prod --client=<client-id>",
    "  npm run clients -- snapshot --profile=dev",
    "  npm run clients -- snapshot --profile=prod --out-file=/tmp/client-state.generated.json",
    "  npm run clients -- snapshot --profile=prod --out-dir=/tmp/client-state",
    "",
    "Writes deterministic read-only client state snapshots to clients/client-state-snapshots.generated/<client>.json by default.",
    "Snapshots contain control-plane profile state and never include credentials or OAuth tokens.",
    "",
    "Options:",
    "  --profile=dev|e2e|prod   Supabase/runtime profile to inspect (default: dev).",
    "  --client=<profile-id>    Limit output to one runtime client.",
    "  --out-file=<path>        Output one aggregate JSON file.",
    "  --out-dir=<path>         Output one JSON file per client in this directory (default: clients/client-state-snapshots.generated).",
  ].join("\n");
}

const snapshotCliSchema = z
  .object({
    help: z.boolean().optional(),
    profile: z.string().optional(),
    client: z.string().optional(),
    "out-file": z.string().optional(),
    "out-dir": z.string().optional(),
  })
  .transform((raw) => {
    const profile = raw.profile?.trim() || "dev";
    assertRuntimeProfile(profile);
    const outFile = raw["out-file"]?.trim();
    const outDir = raw["out-dir"]?.trim();
    if (outFile && outDir) throw new Error("Pass only one of --out-file or --out-dir.");
    return {
      help: raw.help ?? false,
      profile,
      clientId: raw.client?.trim() || null,
      output: outDir
        ? { kind: "directory" as const, path: outDir }
        : outFile
          ? { kind: "file" as const, path: outFile }
          : { kind: "directory" as const, path: defaultSnapshotDir },
    };
  });

function parseArgs(argv: readonly string[]): ClientSnapshotArgs {
  const parsed = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      client: { type: "string" },
      "out-file": { type: "string" },
      "out-dir": { type: "string" },
    },
    schema: snapshotCliSchema,
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!path.isAbsolute(parsed.output.path)) {
    throw new Error(
      `--out-${parsed.output.kind === "file" ? "file" : "dir"} must be absolute; got ${JSON.stringify(parsed.output.path)}.`,
    );
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function assistantNameFromPreferences(profile: TableRow<"profiles">): string {
  const preferences = jsonRecord(profile.preferences, `profiles.${profile.id}.preferences`);
  const assistant = jsonRecord(
    preferences.assistant,
    `profiles.${profile.id}.preferences.assistant`,
  );
  const name = assistant.name;
  if (typeof name !== "string" || !name.trim()) {
    throw new Error(`Profile ${profile.id} preferences.assistant.name must be a non-empty string.`);
  }
  return name.trim();
}

function channelAccountId(row: TableRow<"profile_channels">): string {
  const config = jsonRecord(row.delivery_config, `profile_channels.${row.id}.delivery_config`);
  const accountId = config.accountId;
  return typeof accountId === "string" && accountId.trim() ? accountId.trim() : "default";
}

function stableRedaction(value: string | null): string | null {
  if (value === null) return null;
  const clean = value.trim();
  if (!clean) return "";
  const hash = createHash("sha256").update(clean).digest("hex").slice(0, 12);
  return `<redacted:${hash}>`;
}

function isSensitiveJsonKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes("token") ||
    lower.includes("secret") ||
    lower.includes("password") ||
    lower.includes("cookie") ||
    lower.includes("authorization") ||
    lower.includes("service_role") ||
    lower === "credential" ||
    lower.endsWith("_credential") ||
    lower === "apikey" ||
    lower === "api_key" ||
    lower.endsWith("_api_key")
  );
}

function sanitizeJson(value: unknown, key = ""): JsonValue {
  if (isSensitiveJsonKey(key)) return "<redacted>";
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item));
  if (isRecord(value)) {
    const out: Record<string, JsonValue> = {};
    for (const childKey of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      out[childKey] = sanitizeJson(value[childKey], childKey);
    }
    return out;
  }
  return String(value);
}

function stableJson(value: JsonValue): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function jsonObjectOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function compactText(value: unknown, maxLength: number): string | null {
  const text = nonEmptyString(value);
  if (!text) return null;
  const compact = text.replace(/\s+/g, " ");
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function snapshotFilePayload(input: {
  profile: RuntimeProfile;
  clientId: string | null;
  snapshots: Record<string, JsonValue>;
}): JsonValue {
  return {
    schemaVersion: 1,
    runtimeProfile: input.profile,
    selectedClientId: input.clientId,
    snapshots: input.snapshots,
  };
}

async function loadSnapshot(input: {
  db: SupabaseServiceClient;
  runtimeProfile: RuntimeProfile;
  source: ClientRuntimeSource;
}): Promise<JsonValue> {
  const profileId = input.source.runtime.profileId;
  const recentSince = daysAgoIso(RECENT_DAYS);
  const [
    durableState,
    assistantsResult,
    workItemsResult,
    actionsResult,
    proposalsResult,
    browserTasksResult,
    artifactsResult,
    webhookSubscriptionsResult,
    webhookDeliveriesResult,
    backendJobsResult,
    agentRunsResult,
    providerWriteReceiptsResult,
  ] = await Promise.all([
    loadClientDurableState(input.db, { profileId, mode: "snapshot" }),
    input.db.from("assistants").select().eq("profile_id", profileId).order("assistant_id"),
    input.db
      .from("assistant_work_items")
      .select()
      .eq("profile_id", profileId)
      .gte("created_at", recentSince)
      .order("created_at", { ascending: false })
      .limit(RECENT_OPERATIONAL_LIMIT),
    input.db
      .from("profile_actions")
      .select()
      .eq("profile_id", profileId)
      .gte("created_at", recentSince)
      .order("created_at", { ascending: false })
      .limit(RECENT_OPERATIONAL_LIMIT),
    input.db
      .from("profile_proposals")
      .select()
      .eq("profile_id", profileId)
      .gte("created_at", recentSince)
      .order("updated_at", { ascending: false })
      .limit(RECENT_OPERATIONAL_LIMIT),
    input.db
      .from("browser_tasks")
      .select()
      .eq("profile_id", profileId)
      .gte("created_at", recentSince)
      .order("updated_at", { ascending: false })
      .limit(RECENT_OPERATIONAL_LIMIT),
    input.db
      .from("artifacts")
      .select(
        "id,profile_id,artifact_type,filename,mime_type,byte_size,description,metadata,profile_action_id,browser_task_id,created_at",
      )
      .eq("profile_id", profileId)
      .gte("created_at", recentSince)
      .order("created_at", { ascending: false })
      .limit(RECENT_OPERATIONAL_LIMIT),
    input.db
      .from("provider_webhook_subscriptions")
      .select()
      .eq("profile_id", profileId)
      .order("provider_key")
      .order("resource_type")
      .order("resource_id"),
    input.db
      .from("provider_webhook_deliveries")
      .select()
      .gte("received_at", recentSince)
      .order("received_at", { ascending: false })
      .limit(RECENT_WEBHOOK_DELIVERIES_LIMIT),
    input.db
      .from("backend_jobs")
      .select()
      .eq("profile_id", profileId)
      .gte("created_at", recentSince)
      .order("created_at", { ascending: false })
      .limit(RECENT_BACKEND_JOBS_LIMIT),
    input.db
      .from("agent_runs")
      .select()
      .eq("profile_id", profileId)
      .gte("started_at", recentSince)
      .order("started_at", { ascending: false })
      .limit(RECENT_AGENT_RUNS_LIMIT),
    input.db
      .from("provider_write_receipts")
      .select()
      .eq("profile_id", profileId)
      .gte("finished_at", recentSince)
      .order("finished_at", { ascending: false })
      .limit(RECENT_PROVIDER_WRITE_RECEIPTS_LIMIT),
  ]);
  const agentEventsResult = await input.db
    .from("agent_events")
    .select()
    .eq("profile_id", profileId)
    .gte("occurred_at", recentSince)
    .order("occurred_at", { ascending: false })
    .limit(RECENT_AGENT_EVENTS_LIMIT);

  const assistants = requireSupabaseRows(
    `Load ${profileId} assistants`,
    assistantsResult.data,
    assistantsResult.error,
  );
  const profile = durableState.profile;
  const scheduledTasks = durableState.scheduledTasks;
  const workRoutes = durableState.workRoutes;
  const guidance = durableState.profileGuidance;
  const capabilities = durableState.capabilities;
  const capabilityLinks = durableState.capabilityAccountLinks;
  const channels = durableState.channels;
  const connectedAccounts = durableState.connectedAccounts;
  const workItems = requireSupabaseRows(
    `Load ${profileId} recent work items`,
    workItemsResult.data,
    workItemsResult.error,
  );
  const actions = requireSupabaseRows(
    `Load ${profileId} recent profile actions`,
    actionsResult.data,
    actionsResult.error,
  );
  const proposals = requireSupabaseRows(
    `Load ${profileId} recent proposals`,
    proposalsResult.data,
    proposalsResult.error,
  );
  const browserTasks = requireSupabaseRows(
    `Load ${profileId} recent browser tasks`,
    browserTasksResult.data,
    browserTasksResult.error,
  );
  const artifacts = requireSupabaseRows(
    `Load ${profileId} recent artifacts`,
    artifactsResult.data,
    artifactsResult.error,
  );
  const webhookSubscriptions = requireSupabaseRows(
    `Load ${profileId} provider webhook subscriptions`,
    webhookSubscriptionsResult.data,
    webhookSubscriptionsResult.error,
  );
  const webhookSubscriptionIds = new Set(
    webhookSubscriptions.map((subscription) => subscription.id),
  );
  const webhookDeliveries = requireSupabaseRows(
    `Load recent provider webhook deliveries`,
    webhookDeliveriesResult.data,
    webhookDeliveriesResult.error,
  ).filter(
    (delivery) =>
      delivery.subscription_id === null || webhookSubscriptionIds.has(delivery.subscription_id),
  );
  const backendJobs = requireSupabaseRows(
    `Load ${profileId} recent backend jobs`,
    backendJobsResult.data,
    backendJobsResult.error,
  );
  const agentRuns = requireSupabaseRows(
    `Load ${profileId} recent agent runs`,
    agentRunsResult.data,
    agentRunsResult.error,
  );
  const providerWriteReceipts = requireSupabaseRows(
    `Load ${profileId} recent provider write receipts`,
    providerWriteReceiptsResult.data,
    providerWriteReceiptsResult.error,
  );
  return sanitizeJson({
    schemaVersion: 1,
    runtimeProfile: input.runtimeProfile,
    clientSource: {
      clientId: input.source.clientId,
      runtimeProfiles: input.source.runtime.runtimeProfiles,
      defaultAssistant: input.source.runtime.defaultAssistant,
      hasSeedBootstrap: input.source.seedPath !== null,
    },
    profile: {
      id: profile.id,
      displayName: profile.display_name,
      timezone: profile.timezone,
      status: profile.status,
      assistantName: assistantNameFromPreferences(profile),
      preferences: sanitizeJson(profile.preferences),
      metadata: sanitizeJson(profile.metadata),
    },
    assistants: assistants.map((assistant) => ({
      assistantId: assistant.assistant_id,
      createdAt: assistant.created_at,
      updatedAt: assistant.updated_at,
    })),
    approvalPolicy: durableState.approvalPolicy
      ? {
          id: durableState.approvalPolicy.id,
          rules: sanitizeJson(durableState.approvalPolicy.rules),
          createdAt: durableState.approvalPolicy.created_at,
          updatedAt: durableState.approvalPolicy.updated_at,
        }
      : null,
    scheduledTasks: scheduledTasks.map((task) => ({
      id: task.id,
      status: task.status,
      title: task.title,
      instructions: task.instructions,
      schedule: sanitizeJson(task.schedule),
      timezone: task.timezone,
      revision: task.revision,
      nextRunAt: task.next_run_at,
      lastRunAt: task.last_run_at,
      createdByAgentId: task.created_by_agent_id,
      createdBySessionId: task.created_by_session_id,
      createdBySessionKey: task.created_by_session_key,
      createdByToolCallId: task.created_by_tool_call_id,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    })),
    assistantWorkRoutes: workRoutes.map((route) => ({
      id: route.id,
      eventType: route.event_type,
      connectedProviderAccountId: route.connected_provider_account_id,
      managedBy: route.managed_by,
      config: sanitizeJson(route.config),
      createdAt: route.created_at,
      updatedAt: route.updated_at,
    })),
    guidance: guidance.map((entry) => ({
      id: entry.id,
      key: entry.key,
      title: entry.title,
      selectorDescription: entry.selector_description,
      bodyMarkdown: entry.body_markdown,
      status: entry.status,
      revision: entry.revision,
      createdAt: entry.created_at,
      updatedAt: entry.updated_at,
    })),
    capabilities: capabilities.map((capability) => ({
      id: capability.id,
      slug: capability.capability_slug,
      status: capability.status,
      required: capability.required,
      config: sanitizeJson(capability.config),
      createdAt: capability.created_at,
      updatedAt: capability.updated_at,
    })),
    capabilityAccountLinks: capabilityLinks.map((link) => ({
      id: link.id,
      capabilitySlug: link.capability_slug,
      provider: link.provider,
      label: link.label,
      status: link.status,
      required: link.required,
      isDefault: link.is_default,
      config: sanitizeJson(link.config),
      readiness: {
        status: link.readiness_status,
        blockerCode: link.readiness_blocker_code,
        lastError: link.readiness_last_error,
        latestBackendJobId: link.readiness_latest_backend_job_id,
      },
      connectedProviderAccountId: link.connected_provider_account_id,
      createdAt: link.created_at,
      updatedAt: link.updated_at,
    })),
    channels: channels.map((channel) => ({
      id: channel.id,
      provider: channel.provider,
      externalIdentity: stableRedaction(channel.external_identity),
      accountId: channelAccountId(channel),
      status: channel.status,
      deliveryConfig: sanitizeJson(channel.delivery_config),
      createdAt: channel.created_at,
      updatedAt: channel.updated_at,
    })),
    connectedAccounts: connectedAccounts.map((account) => ({
      id: account.id,
      provider: account.provider,
      providerAccountId: stableRedaction(account.provider_account_id),
      accountEmail: account.account_email,
      displayLabel: account.display_label,
      connectionStatus: account.connection_status,
      credentialKind: account.credential_kind,
      credentialStatus: account.credential_status,
      nangoProviderConfigKey: account.nango_provider_config_key,
      nangoConnectionId: stableRedaction(account.nango_connection_id),
      scopes: sanitizeJson(account.scopes),
      metadata: sanitizeJson(account.metadata),
      lastError: account.last_error,
      connectedAt: account.connected_at,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    })),
    recentOperationalWindow: {
      since: recentSince,
      days: RECENT_DAYS,
      limitPerSection: RECENT_OPERATIONAL_LIMIT,
    },
    recentWorkItems: workItems.map((workItem) => {
      const payload = jsonObjectOrEmpty(workItem.payload);
      const result = jsonObjectOrEmpty(workItem.result);
      return {
        id: workItem.id,
        kind: workItem.kind,
        status: workItem.status,
        title: nonEmptyString(payload.title) ?? workItem.kind,
        instructions: nonEmptyString(payload.instructions),
        guidanceIds: sanitizeJson(payload.guidanceIds ?? []),
        profileGuidanceDbIds: sanitizeJson(payload.profileGuidanceDbIds ?? []),
        payload: sanitizeJson(workItem.payload),
        result: sanitizeJson(workItem.result),
        resultSummary:
          compactText(result.summary, 500) ??
          compactText(result.message, 500) ??
          compactText(result.outcome, 500),
        lastError: workItem.last_error,
        priority: workItem.priority,
        attempts: workItem.attempts,
        maxAttempts: workItem.max_attempts,
        availableAt: workItem.available_at,
        runStartedAt: workItem.claimed_at,
        runExpiresAt: workItem.claim_expires_at,
        runningByAgentId: workItem.claimed_by_agent_id,
        originAgentId: workItem.origin_agent_id,
        originScheduledTaskId: workItem.origin_scheduled_task_id,
        originSessionId: workItem.origin_session_id,
        originToolCallId: workItem.origin_tool_call_id,
        dedupeKey: workItem.dedupe_key,
        finishedAt: workItem.finished_at,
        createdAt: workItem.created_at,
        updatedAt: workItem.updated_at,
      };
    }),
    recentProfileActions: actions.map((action) => ({
      id: action.id,
      status: action.status,
      title: action.title,
      summary: action.summary,
      toolName: action.tool_name,
      actionType: action.action_type,
      riskLevel: action.risk_level,
      decision: action.decision,
      decisionSource: action.decision_source,
      providerExecutionStatus: action.provider_execution_status,
      providerError: sanitizeJson(action.provider_error),
      reviewPayload: sanitizeJson(action.review_payload),
      executionPayload: sanitizeJson(action.execution_payload),
      resultPayload: sanitizeJson(action.result_payload),
      targetId: action.target_id,
      requesterAssistantId: action.requester_assistant_id,
      originChannelProvider: action.origin_channel_provider,
      originProfileChannelId: action.origin_profile_channel_id,
      decidedByChannelId: action.decided_by_channel_id,
      createdAt: action.created_at,
      updatedAt: action.updated_at,
      decidedAt: action.decided_at,
      expiresAt: action.expires_at,
      providerExecutionStartedAt: action.provider_execution_started_at,
      providerExecutionFinishedAt: action.provider_execution_finished_at,
    })),
    recentProposals: proposals.map((proposal) => ({
      id: proposal.id,
      kind: proposal.proposal_kind,
      status: proposal.status,
      title: proposal.title,
      summary: proposal.summary,
      revision: proposal.revision,
      decision: proposal.decision,
      decisionSource: proposal.decision_source,
      blockerCode: proposal.blocker_code,
      blockerSummary: proposal.blocker_summary,
      proposalPayload: sanitizeJson(proposal.proposal_payload),
      reviewPayload: sanitizeJson(proposal.review_payload),
      evidence: sanitizeJson(proposal.evidence),
      sourceScheduledTaskId: proposal.source_scheduled_task_id,
      sourceWorkItemId: proposal.source_work_item_id,
      convertedProfileActionId: proposal.converted_profile_action_id,
      supersededByProposalId: proposal.superseded_by_proposal_id,
      createdAt: proposal.created_at,
      updatedAt: proposal.updated_at,
      decidedAt: proposal.decided_at,
      expiresAt: proposal.expires_at,
    })),
    recentBrowserTasks: browserTasks.map((task) => ({
      id: task.id,
      mode: task.mode,
      status: task.status,
      goal: task.goal,
      note: task.note,
      summary: task.summary,
      assignedAssistantId: task.assigned_assistant_id,
      state: sanitizeJson(task.state),
      wait: sanitizeJson(task.wait),
      result: sanitizeJson(task.result),
      dedupeKey: task.dedupe_key,
      revision: task.revision,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
      endedAt: task.ended_at,
      cancelRequestedAt: task.cancel_requested_at,
    })),
    recentArtifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      type: artifact.artifact_type,
      filename: artifact.filename,
      mimeType: artifact.mime_type,
      byteSize: artifact.byte_size,
      description: artifact.description,
      metadata: sanitizeJson(artifact.metadata),
      profileActionId: artifact.profile_action_id,
      browserTaskId: artifact.browser_task_id,
      createdAt: artifact.created_at,
    })),
    providerWebhookSubscriptions: webhookSubscriptions.map((subscription) => ({
      id: subscription.id,
      providerKey: subscription.provider_key,
      adapterKey: subscription.adapter_key,
      resourceType: subscription.resource_type,
      resourceId: subscription.resource_id,
      eventScope: subscription.event_scope,
      status: subscription.status,
      hasExternalSubscriptionId: Boolean(subscription.external_subscription_id),
      providerState: sanitizeJson(subscription.provider_state),
      cursor: sanitizeJson(subscription.cursor),
      capabilityAccountLinkId: subscription.capability_account_link_id,
      connectedProviderAccountId: subscription.connected_provider_account_id,
      expiresAt: subscription.expires_at,
      lastNotificationAt: subscription.last_notification_at,
      lastSuccessAt: subscription.last_success_at,
      lastErrorCode: subscription.last_error_code,
      lastErrorMessage: subscription.last_error_message,
      nextReconcileAt: subscription.next_reconcile_at,
      createdAt: subscription.created_at,
      updatedAt: subscription.updated_at,
    })),
    recentProviderWebhookDeliveries: webhookDeliveries.map((delivery) => ({
      id: delivery.id,
      providerKey: delivery.provider_key,
      adapterKey: delivery.adapter_key,
      status: delivery.status,
      authenticated: delivery.authenticated,
      subscriptionId: delivery.subscription_id,
      backendJobId: delivery.backend_job_id,
      deliveryKey: stableRedaction(delivery.delivery_key),
      payloadHash: delivery.payload_hash,
      requestHeaders: sanitizeJson(delivery.request_headers),
      errorCode: delivery.error_code,
      errorMessage: delivery.error_message,
      receivedAt: delivery.received_at,
      processedAt: delivery.processed_at,
      createdAt: delivery.created_at,
      updatedAt: delivery.updated_at,
    })),
    recentBackendJobs: backendJobs.map((job) => ({
      id: job.id,
      kind: job.kind,
      status: job.status,
      payload: sanitizeJson(job.payload),
      priority: job.priority,
      attempts: job.attempts,
      maxAttempts: job.max_attempts,
      lastError: job.last_error,
      capabilityAccountLinkId: job.capability_account_link_id,
      originAgentId: job.origin_agent_id,
      originSessionId: job.origin_session_id,
      originToolCallId: job.origin_tool_call_id,
      dedupeKey: job.dedupe_key,
      runAfter: job.run_after,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
      leaseExpiresAt: job.lease_expires_at,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    })),
    recentAgentRuns: agentRuns.map((run) => ({
      id: run.id,
      status: run.status,
      agentId: run.agent_id,
      sessionId: run.session_id,
      sessionKey: run.session_key,
      runtimeRunId: run.runtime_run_id,
      failure: sanitizeJson(run.failure),
      startedAt: run.started_at,
      endedAt: run.ended_at,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
    })),
    recentAgentEvents: requireSupabaseRows(
      `Load ${profileId} recent agent events`,
      agentEventsResult.data,
      agentEventsResult.error,
    ).map((row) => {
      const event = jsonObjectOrEmpty(row);
      return sanitizeJson({
        id: event.id,
        eventType: event.event_type,
        source: event.source,
        visibility: event.visibility,
        payload: event.payload,
        sourceEventKey: stableRedaction(nonEmptyString(event.source_event_key)),
        agentRunId: event.agent_run_id,
        occurredAt: event.occurred_at,
        createdAt: event.created_at,
      });
    }),
    recentProviderWriteReceipts: providerWriteReceipts.map((receipt) => ({
      id: receipt.id,
      providerKey: receipt.provider_key,
      capabilitySlug: receipt.capability_slug,
      toolName: receipt.tool_name,
      operation: receipt.operation,
      externalResourceType: receipt.external_resource_type,
      externalResourceId: stableRedaction(receipt.external_resource_id),
      profileActionId: receipt.profile_action_id,
      capabilityAccountLinkId: receipt.capability_account_link_id,
      connectedProviderAccountId: receipt.connected_provider_account_id,
      metadata: sanitizeJson(receipt.metadata),
      startedAt: receipt.started_at,
      finishedAt: receipt.finished_at,
      createdAt: receipt.created_at,
    })),
  });
}

export async function runClientSnapshotCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const runtimeSources = (await loadClientRuntimeSources()).filter((source) =>
    source.runtime.runtimeProfiles.includes(args.profile),
  );
  const selectedSources = args.clientId
    ? runtimeSources.filter((source) => source.clientId === args.clientId)
    : runtimeSources;
  if (args.clientId && selectedSources.length === 0) {
    throw new Error(`No client runtime source ${args.clientId} targets profile ${args.profile}.`);
  }
  if (selectedSources.length === 0) {
    throw new Error(`No client runtime sources target profile ${args.profile}.`);
  }

  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));
  const snapshots: Record<string, JsonValue> = {};
  for (const source of selectedSources) {
    snapshots[source.clientId] = await loadSnapshot({ db, runtimeProfile: args.profile, source });
  }

  const written: string[] = [];
  if (args.output.kind === "directory") {
    await mkdir(args.output.path, { recursive: true });
    for (const source of selectedSources) {
      const outPath = path.join(args.output.path, `${source.clientId}.json`);
      await writeFile(outPath, stableJson(snapshots[source.clientId]), "utf8");
      written.push(outPath);
    }
  } else {
    await mkdir(path.dirname(args.output.path), { recursive: true });
    await writeFile(
      args.output.path,
      stableJson(
        snapshotFilePayload({
          profile: args.profile,
          clientId: args.clientId,
          snapshots,
        }),
      ),
      "utf8",
    );
    written.push(args.output.path);
  }
  console.log(
    [
      "",
      `Wrote ${written.length} ${args.profile} client state snapshot(s):`,
      ...written.map((file) => `  - ${file}`),
      "",
    ].join("\n"),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCliMain(() => runClientSnapshotCli());
}
