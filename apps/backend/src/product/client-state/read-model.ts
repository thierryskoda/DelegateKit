import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { truncateForLlmPrompt } from "../llm-decisions/cheap-structured-decision";

type ClientStateRefKind =
  | "scheduled_task"
  | "work_route"
  | "profile_guidance";

type ClientStateRef = `${ClientStateRefKind}:${string}`;

export type ClientDurableState = {
  profile: TableRow<"profiles">;
  approvalPolicy: TableRow<"approval_policies"> | null;
  scheduledTasks: TableRow<"assistant_scheduled_tasks">[];
  workRoutes: TableRow<"profile_assistant_work_routes">[];
  profileGuidance: TableRow<"profile_guidance">[];
  capabilities: TableRow<"profile_capabilities">[];
  capabilityAccountLinks: TableRow<"capability_account_links">[];
  channels: TableRow<"profile_channels">[];
  connectedAccounts: TableRow<"connected_provider_accounts">[];
};

type ClientDurableStateLoadMode = "snapshot" | "reviewer";

export type LoadClientDurableStateOptions = {
  profileId: string;
  mode: ClientDurableStateLoadMode;
  limit?: number;
};

function ref(kind: ClientStateRefKind, id: string): ClientStateRef {
  return `${kind}:${id}`;
}

function scheduledTaskRef(id: string): ClientStateRef {
  return ref("scheduled_task", id);
}

function workRouteRef(id: string): ClientStateRef {
  return ref("work_route", id);
}

function profileGuidanceRef(id: string): ClientStateRef {
  return ref("profile_guidance", id);
}

export function durableStateRefs(
  state: Pick<
    ClientDurableState,
    "scheduledTasks" | "workRoutes" | "profileGuidance"
  >,
): ClientStateRef[] {
  return [
    ...state.scheduledTasks.map((task) => scheduledTaskRef(task.id)),
    ...state.workRoutes.map((route) => workRouteRef(route.id)),
    ...state.profileGuidance.map((guidance) => profileGuidanceRef(guidance.id)),
  ];
}

export async function loadClientDurableState(
  db: SupabaseServiceClient,
  options: LoadClientDurableStateOptions,
): Promise<ClientDurableState> {
  const reviewerOnly = options.mode === "reviewer";
  const limit = options.limit ?? (reviewerOnly ? 100 : 1_000);

  const scheduledTasksQuery = db
    .from("assistant_scheduled_tasks")
    .select()
    .eq("profile_id", options.profileId);
  if (reviewerOnly) scheduledTasksQuery.neq("status", "deleted");

  const guidanceQuery = db.from("profile_guidance").select().eq("profile_id", options.profileId);
  if (reviewerOnly) guidanceQuery.eq("status", "active");

  const [
    profileResult,
    approvalPolicyResult,
    scheduledTasksResult,
    workRoutesResult,
    profileGuidanceResult,
    capabilitiesResult,
    capabilityLinksResult,
    channelsResult,
    connectedAccountsResult,
  ] = await Promise.all([
    db.from("profiles").select().eq("id", options.profileId).maybeSingle(),
    db.from("approval_policies").select().eq("profile_id", options.profileId).maybeSingle(),
    scheduledTasksQuery
      .order(reviewerOnly ? "created_at" : "status", { ascending: reviewerOnly ? false : true })
      .order(reviewerOnly ? "id" : "title")
      .limit(limit),
    db
      .from("profile_assistant_work_routes")
      .select()
      .eq("profile_id", options.profileId)
      .order("event_type")
      .order("connected_provider_account_id", { nullsFirst: true })
      .order("id")
      .limit(limit),
    guidanceQuery
      .order(reviewerOnly ? "updated_at" : "status", {
        ascending: reviewerOnly ? false : true,
      })
      .order(reviewerOnly ? "id" : "key")
      .limit(limit),
    db
      .from("profile_capabilities")
      .select()
      .eq("profile_id", options.profileId)
      .order("capability_slug")
      .order("id")
      .limit(limit),
    db
      .from("capability_account_links")
      .select()
      .eq("profile_id", options.profileId)
      .order("capability_slug")
      .order("provider")
      .order("label")
      .order("id")
      .limit(limit),
    db
      .from("profile_channels")
      .select()
      .eq("profile_id", options.profileId)
      .order("provider")
      .order("external_identity")
      .order("id")
      .limit(limit),
    db
      .from("connected_provider_accounts")
      .select()
      .eq("profile_id", options.profileId)
      .order("provider")
      .order("display_label")
      .order("id")
      .limit(limit),
  ]);

  if (approvalPolicyResult.error) throw approvalPolicyResult.error;

  return {
    profile: requireSupabaseData(
      `Load profile ${options.profileId}`,
      profileResult.data,
      profileResult.error,
    ),
    approvalPolicy: approvalPolicyResult.data,
    scheduledTasks: requireSupabaseRows(
      `Load ${options.profileId} scheduled tasks`,
      scheduledTasksResult.data,
      scheduledTasksResult.error,
    ),
    workRoutes: requireSupabaseRows(
      `Load ${options.profileId} assistant work routes`,
      workRoutesResult.data,
      workRoutesResult.error,
    ),
    profileGuidance: requireSupabaseRows(
      `Load ${options.profileId} profile guidance`,
      profileGuidanceResult.data,
      profileGuidanceResult.error,
    ),
    capabilities: requireSupabaseRows(
      `Load ${options.profileId} profile capabilities`,
      capabilitiesResult.data,
      capabilitiesResult.error,
    ),
    capabilityAccountLinks: requireSupabaseRows(
      `Load ${options.profileId} capability account links`,
      capabilityLinksResult.data,
      capabilityLinksResult.error,
    ),
    channels: requireSupabaseRows(
      `Load ${options.profileId} channels`,
      channelsResult.data,
      channelsResult.error,
    ),
    connectedAccounts: requireSupabaseRows(
      `Load ${options.profileId} connected accounts`,
      connectedAccountsResult.data,
      connectedAccountsResult.error,
    ),
  };
}

function routeInstructions(config: unknown): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const value = (config as Record<string, unknown>).instructions;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function routePriority(config: unknown): unknown {
  return config && typeof config === "object" && !Array.isArray(config)
    ? ((config as Record<string, unknown>).priority ?? null)
    : null;
}

export function toLearningReviewTargets(input: {
  durableState: Pick<
    ClientDurableState,
    "scheduledTasks" | "workRoutes" | "profileGuidance"
  >;
  priorOutcomes: readonly {
    id: string;
    candidate_type: string;
    target_kind: string;
    target_id: string | null;
    status: string;
    confidence: string | number;
    rationale: string;
    failure_message: string | null;
    applied_reference: unknown;
    updated_at: string;
  }[];
}) {
  const state = input.durableState;
  return {
    scheduledTasks: state.scheduledTasks.map((task) => ({
      ref: scheduledTaskRef(task.id),
      id: task.id,
      title: task.title,
      status: task.status,
      schedule: task.schedule,
      target: task.target,
      nextRunAt: task.next_run_at,
      instructions: truncateForLlmPrompt(task.instructions, 1_000),
      revision: task.revision,
      updatedAt: task.updated_at,
    })),
    workRoutes: state.workRoutes.map((route) => ({
      ref: workRouteRef(route.id),
      id: route.id,
      eventType: route.event_type,
      priority: routePriority(route.config),
      instructions: truncateForLlmPrompt(routeInstructions(route.config) ?? "", 1_000),
      updatedAt: route.updated_at,
    })),
    profileGuidance: state.profileGuidance.map((guidance) => ({
      ref: profileGuidanceRef(guidance.id),
      id: guidance.id,
      key: guidance.key,
      title: guidance.title,
      selectorDescription: truncateForLlmPrompt(guidance.selector_description, 500),
      bodyMarkdown: truncateForLlmPrompt(guidance.body_markdown, 1_500),
      revision: guidance.revision,
      updatedAt: guidance.updated_at,
    })),
    priorLearningOutcomes: input.priorOutcomes.map((candidate) => ({
      id: candidate.id,
      candidateType: candidate.candidate_type,
      targetKind: candidate.target_kind,
      targetId: candidate.target_id,
      status: candidate.status,
      confidence: candidate.confidence,
      rationale: truncateForLlmPrompt(candidate.rationale, 500),
      failureMessage: candidate.failure_message
        ? truncateForLlmPrompt(candidate.failure_message, 500)
        : null,
      appliedReference: candidate.applied_reference,
      updatedAt: candidate.updated_at,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function rows(record: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.map(recordOrEmpty);
}

function omitRemovedConfigRows(input: Record<string, unknown>[]): Record<string, unknown>[] {
  return input.filter((row) => {
    const status = stringValue(row, "status");
    return status !== "deleted" && status !== "archived";
  });
}

function stringValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function objectValue(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return recordOrEmpty(record[key]);
}

function rawValue(record: Record<string, unknown>, key: string): unknown {
  return record[key] ?? null;
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isRecord(value) && Object.keys(value).length === 0) continue;
    output[key] = value;
  }
  return output;
}

function accountReference(account: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!account) return null;
  return compactObject({
    provider: stringValue(account, "provider"),
    displayLabel: stringValue(account, "displayLabel"),
    accountEmail: stringValue(account, "accountEmail"),
    connectionStatus: stringValue(account, "connectionStatus"),
    credentialStatus: stringValue(account, "credentialStatus"),
  });
}

function payloadSummary(value: unknown): Record<string, unknown> | null {
  const payload = recordOrEmpty(value);
  if (Object.keys(payload).length === 0) return null;
  return compactObject({
    title: stringValue(payload, "title"),
    summary: stringValue(payload, "summary"),
    sourceKind: stringValue(payload, "sourceKind"),
    status: stringValue(objectValue(payload, "metadata"), "status"),
    kind: stringValue(objectValue(payload, "metadata"), "kind"),
  });
}

export function toClientSnapshotSummary(input: {
  runtimeProfile: string;
  snapshot: unknown;
}): Record<string, unknown> {
  const snapshot = recordOrEmpty(input.snapshot);
  const profile = objectValue(snapshot, "profile");
  const connectedAccounts = rows(snapshot, "connectedAccounts");
  const accountsById = new Map(
    connectedAccounts
      .map((account) => [stringValue(account, "id"), account] as const)
      .filter((entry): entry is readonly [string, Record<string, unknown>] => entry[0] !== null),
  );

  return {
    schemaVersion: 1,
    runtimeProfile: stringValue(snapshot, "runtimeProfile") ?? input.runtimeProfile,
    profile: compactObject({
      displayName: stringValue(profile, "displayName"),
      timezone: stringValue(profile, "timezone"),
      status: stringValue(profile, "status"),
      assistantName: stringValue(profile, "assistantName"),
    }),
    approvalPolicy: (() => {
      const policy = snapshot.approvalPolicy;
      if (!isRecord(policy)) return null;
      return compactObject({ rules: rawValue(policy, "rules") });
    })(),
    scheduledTasks: omitRemovedConfigRows(rows(snapshot, "scheduledTasks")).map((task) =>
      compactObject({
        status: stringValue(task, "status"),
        title: stringValue(task, "title"),
        instructions: stringValue(task, "instructions"),
        schedule: rawValue(task, "schedule"),
        timezone: stringValue(task, "timezone"),
        nextRunAt: stringValue(task, "nextRunAt"),
        lastRunAt: stringValue(task, "lastRunAt"),
      }),
    ),
    assistantWorkRoutes: rows(snapshot, "assistantWorkRoutes").map((route) =>
      compactObject({
        eventType: stringValue(route, "eventType"),
        managedBy: stringValue(route, "managedBy"),
        instructions: stringValue(objectValue(route, "config"), "instructions"),
        priority: numberValue(objectValue(route, "config"), "priority"),
      }),
    ),
    guidance: omitRemovedConfigRows(rows(snapshot, "guidance")).map((entry) =>
      compactObject({
        key: stringValue(entry, "key"),
        status: stringValue(entry, "status"),
        title: stringValue(entry, "title"),
        selectorDescription: stringValue(entry, "selectorDescription"),
        bodyMarkdown: stringValue(entry, "bodyMarkdown"),
      }),
    ),
    integrations: {
      capabilities: rows(snapshot, "capabilities").map((capability) =>
        compactObject({
          slug: stringValue(capability, "slug"),
          status: stringValue(capability, "status"),
          required: booleanValue(capability, "required"),
          config: rawValue(capability, "config"),
        }),
      ),
      connectedAccounts: connectedAccounts.map((account) =>
        compactObject({
          provider: stringValue(account, "provider"),
          displayLabel: stringValue(account, "displayLabel"),
          accountEmail: stringValue(account, "accountEmail"),
          connectionStatus: stringValue(account, "connectionStatus"),
          credentialKind: stringValue(account, "credentialKind"),
          credentialStatus: stringValue(account, "credentialStatus"),
          nangoProviderConfigKey: stringValue(account, "nangoProviderConfigKey"),
          lastError: rawValue(account, "lastError"),
        }),
      ),
      capabilityAccountLinks: rows(snapshot, "capabilityAccountLinks").map((link) => {
        const connectedProviderAccountId = stringValue(link, "connectedProviderAccountId");
        return compactObject({
          capabilitySlug: stringValue(link, "capabilitySlug"),
          provider: stringValue(link, "provider"),
          label: stringValue(link, "label"),
          status: stringValue(link, "status"),
          required: booleanValue(link, "required"),
          isDefault: booleanValue(link, "isDefault"),
          readiness: rawValue(link, "readiness"),
          connectedAccount: accountReference(
            connectedProviderAccountId
              ? (accountsById.get(connectedProviderAccountId) ?? null)
              : null,
          ),
        });
      }),
      channels: rows(snapshot, "channels").map((channel) =>
        compactObject({
          provider: stringValue(channel, "provider"),
          accountId: stringValue(channel, "accountId"),
          externalIdentity: stringValue(channel, "externalIdentity"),
          status: stringValue(channel, "status"),
        }),
      ),
      webhookSubscriptions: rows(snapshot, "providerWebhookSubscriptions").map((subscription) => {
        const connectedProviderAccountId = stringValue(subscription, "connectedProviderAccountId");
        return compactObject({
          providerKey: stringValue(subscription, "providerKey"),
          adapterKey: stringValue(subscription, "adapterKey"),
          resourceType: stringValue(subscription, "resourceType"),
          eventScope: stringValue(subscription, "eventScope"),
          status: stringValue(subscription, "status"),
          hasExternalSubscriptionId: booleanValue(subscription, "hasExternalSubscriptionId"),
          connectedAccount: accountReference(
            connectedProviderAccountId
              ? (accountsById.get(connectedProviderAccountId) ?? null)
              : null,
          ),
          lastNotificationAt: stringValue(subscription, "lastNotificationAt"),
          lastSuccessAt: stringValue(subscription, "lastSuccessAt"),
          lastErrorCode: stringValue(subscription, "lastErrorCode"),
          lastErrorMessage: stringValue(subscription, "lastErrorMessage"),
          nextReconcileAt: stringValue(subscription, "nextReconcileAt"),
          expiresAt: stringValue(subscription, "expiresAt"),
        });
      }),
    },
    recentActivity: {
      window: rawValue(snapshot, "recentOperationalWindow"),
      workItems: rows(snapshot, "recentWorkItems").map((workItem) =>
        compactObject({
          kind: stringValue(workItem, "kind"),
          status: stringValue(workItem, "status"),
          title: stringValue(workItem, "title"),
          resultSummary: stringValue(workItem, "resultSummary"),
          lastError: rawValue(workItem, "lastError"),
          availableAt: stringValue(workItem, "availableAt"),
          finishedAt: stringValue(workItem, "finishedAt"),
          attempts: numberValue(workItem, "attempts"),
        }),
      ),
      actions: rows(snapshot, "recentProfileActions").map((action) =>
        compactObject({
          status: stringValue(action, "status"),
          title: stringValue(action, "title"),
          summary: stringValue(action, "summary"),
          toolName: stringValue(action, "toolName"),
          actionType: stringValue(action, "actionType"),
          riskLevel: stringValue(action, "riskLevel"),
          decision: stringValue(action, "decision"),
          providerExecutionStatus: stringValue(action, "providerExecutionStatus"),
          providerError: rawValue(action, "providerError"),
          providerExecutionFinishedAt: stringValue(action, "providerExecutionFinishedAt"),
        }),
      ),
      proposals: rows(snapshot, "recentProposals").map((proposal) =>
        compactObject({
          kind: stringValue(proposal, "kind"),
          status: stringValue(proposal, "status"),
          title: stringValue(proposal, "title"),
          summary: stringValue(proposal, "summary"),
          decision: stringValue(proposal, "decision"),
          blockerCode: stringValue(proposal, "blockerCode"),
          blockerSummary: stringValue(proposal, "blockerSummary"),
        }),
      ),
      browserTasks: rows(snapshot, "recentBrowserTasks").map((task) =>
        compactObject({
          mode: stringValue(task, "mode"),
          status: stringValue(task, "status"),
          goal: stringValue(task, "goal"),
          note: stringValue(task, "note"),
          summary: stringValue(task, "summary"),
          wait: rawValue(task, "wait"),
          result: rawValue(task, "result"),
          updatedAt: stringValue(task, "updatedAt"),
          endedAt: stringValue(task, "endedAt"),
        }),
      ),
      artifacts: rows(snapshot, "recentArtifacts").map((artifact) =>
        compactObject({
          type: stringValue(artifact, "type"),
          filename: stringValue(artifact, "filename"),
          mimeType: stringValue(artifact, "mimeType"),
          byteSize: numberValue(artifact, "byteSize"),
          description: stringValue(artifact, "description"),
          createdAt: stringValue(artifact, "createdAt"),
        }),
      ),
      backendJobs: rows(snapshot, "recentBackendJobs").map((job) =>
        compactObject({
          kind: stringValue(job, "kind"),
          status: stringValue(job, "status"),
          lastError: rawValue(job, "lastError"),
          attempts: numberValue(job, "attempts"),
          runAfter: stringValue(job, "runAfter"),
          startedAt: stringValue(job, "startedAt"),
          finishedAt: stringValue(job, "finishedAt"),
        }),
      ),
      agentRuns: rows(snapshot, "recentAgentRuns").map((run) =>
        compactObject({
          status: stringValue(run, "status"),
          agentId: stringValue(run, "agentId"),
          sessionId: stringValue(run, "sessionId"),
          sessionKey: stringValue(run, "sessionKey"),
          runtimeRunId: stringValue(run, "runtimeRunId"),
          failure: rawValue(run, "failure"),
          startedAt: stringValue(run, "startedAt"),
          endedAt: stringValue(run, "endedAt"),
        }),
      ),
      providerWebhookDeliveries: rows(snapshot, "recentProviderWebhookDeliveries").map((delivery) =>
        compactObject({
          providerKey: stringValue(delivery, "providerKey"),
          adapterKey: stringValue(delivery, "adapterKey"),
          status: stringValue(delivery, "status"),
          authenticated: booleanValue(delivery, "authenticated"),
          errorCode: stringValue(delivery, "errorCode"),
          errorMessage: stringValue(delivery, "errorMessage"),
          receivedAt: stringValue(delivery, "receivedAt"),
          processedAt: stringValue(delivery, "processedAt"),
        }),
      ),
      agentEvents: rows(snapshot, "recentAgentEvents").map((event) =>
        compactObject({
          eventType: stringValue(event, "eventType"),
          source: stringValue(event, "source"),
          visibility: stringValue(event, "visibility"),
          summary: payloadSummary(rawValue(event, "payload")),
          occurredAt: stringValue(event, "occurredAt"),
        }),
      ),
      providerWriteReceipts: rows(snapshot, "recentProviderWriteReceipts").map((receipt) =>
        compactObject({
          providerKey: stringValue(receipt, "providerKey"),
          capabilitySlug: stringValue(receipt, "capabilitySlug"),
          toolName: stringValue(receipt, "toolName"),
          operation: stringValue(receipt, "operation"),
          externalResourceType: stringValue(receipt, "externalResourceType"),
          externalResourceId: stringValue(receipt, "externalResourceId"),
          profileActionId: stringValue(receipt, "profileActionId"),
          metadata: rawValue(receipt, "metadata"),
          finishedAt: stringValue(receipt, "finishedAt"),
        }),
      ),
    },
  };
}
