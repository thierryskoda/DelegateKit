import {
  profileCapabilitySpec,
  requireCapabilityActivationPolicyForSlug,
  type CapabilityReadinessStatus,
  type ProfileCapabilitySlug,
} from "@ai-assistants/capability-catalog";
import {
  profileOperationalContextSchema,
  profileOverviewSchema,
  operationalWorkItemStatusSchema,
  type OperationalWorkItemStatus,
  type ProfileCapabilitiesListItem,
  type ProfileOperationalContext,
  type ProfileOverview,
} from "@ai-assistants/profile-context-contracts/schemas";
import { requireSupabaseData, type SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { capabilityOverviewForProfile } from "../profile-capabilities/profile-capability-overview";
import { preferencesFromProfile, stringPreference } from "./preferences";
import { portalAccessForProfile } from "./portal-access-links";
import { agentActionDto } from "../actions/agent-action-dtos";
import { parseAssistantWorkItemPayload } from "../assistant-work-items/assistant-work-items";

export function capabilityListFromOverview(
  overview: Awaited<ReturnType<typeof capabilityOverviewForProfile>>,
): ProfileCapabilitiesListItem[] {
  const linkedCapabilitySlugs = new Set(overview.capabilities.map((inst) => inst.capability_slug));
  const linkedCapabilityItems = overview.capabilities.map((inst) => {
    const r = inst.readiness;
    const connected = inst.connectedAccount;
    const isHealthy =
      connected &&
      connected.connection_status === "connected" &&
      connected.credential_status === "healthy";
    return {
      instanceId: inst.id,
      capabilitySlug: inst.capability_slug,
      provider: inst.provider,
      label: inst.label || null,
      accountHint: isHealthy ? (connected.display_label ?? connected.account_email ?? null) : null,
      readinessStatus: (r?.status ?? "unknown") as ProfileCapabilitiesListItem["readinessStatus"],
      blockerCode: r?.blockerCode ?? null,
      blockerSummary: r?.blockerSummary ?? null,
      lastError: r?.state?.readiness_last_error ?? null,
    };
  });
  const profileOnlyCapabilityItems = overview.profileCapabilities
    .filter((capability) => !linkedCapabilitySlugs.has(capability.capability_slug))
    .map((capability) => {
      const spec = profileCapabilitySpec(capability.capability_slug);
      if (!spec) throw new Error(`Unknown profile capability slug ${capability.capability_slug}.`);
      const policy = requireCapabilityActivationPolicyForSlug(capability.capability_slug);
      const readinessStatus = (
        capability.status === "enabled" && policy.credentialMode === "none" ? "ready" : "unknown"
      ) satisfies CapabilityReadinessStatus | "unknown";
      return {
        instanceId: capability.id,
        capabilitySlug: capability.capability_slug as ProfileCapabilitySlug,
        provider: spec.defaultProvider,
        label: spec.label,
        accountHint: null,
        readinessStatus,
        blockerCode: null,
        blockerSummary: null,
        lastError: null,
      } satisfies ProfileCapabilitiesListItem;
    });
  return [...linkedCapabilityItems, ...profileOnlyCapabilityItems].sort(
    (left, right) =>
      left.capabilitySlug.localeCompare(right.capabilitySlug) ||
      left.provider.localeCompare(right.provider),
  );
}

async function requireAssistantForContext(db: SupabaseServiceClient, assistantId: string) {
  const result = await db.from("assistants").select().eq("assistant_id", assistantId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data)
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `No canonical profile mapping exists for assistant ${assistantId}.`,
    );
  return result.data;
}

function workItemTitle(row: { kind: string; payload: unknown }): string {
  try {
    return parseAssistantWorkItemPayload(row.kind as never, row.payload).title;
  } catch {
    return row.kind;
  }
}

function operationalWorkItemStatus(status: string): OperationalWorkItemStatus {
  return operationalWorkItemStatusSchema.parse(status === "claimed" ? "running" : status);
}

async function operationalContextForProfile(
  db: SupabaseServiceClient,
  profileId: string,
  capabilityItems: ProfileCapabilitiesListItem[],
): Promise<ProfileOperationalContext> {
  const nowIso = new Date().toISOString();
  const [
    pendingActionsResult,
    activeProposalsResult,
    browserTasksResult,
    dueWorkItemsResult,
    runningWorkItemsResult,
    blockedActionsResult,
    blockedWorkItemsResult,
    blockedBrowserTasksResult,
    recentActionsResult,
    recentProposalsResult,
    scheduledTasksResult,
  ] = await Promise.all([
    db
      .from("profile_actions")
      .select()
      .eq("profile_id", profileId)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("profile_proposals")
      .select()
      .eq("profile_id", profileId)
      .in("status", ["proposed", "blocked", "converting"])
      .order("updated_at", { ascending: false })
      .limit(5),
    db
      .from("browser_tasks")
      .select()
      .eq("profile_id", profileId)
      .in("status", ["queued", "running", "waiting", "blocked"])
      .order("updated_at", { ascending: false })
      .limit(5),
    db
      .from("assistant_work_items")
      .select()
      .eq("profile_id", profileId)
      .eq("status", "pending")
      .lte("available_at", nowIso)
      .order("priority", { ascending: true })
      .order("available_at", { ascending: true })
      .limit(5),
    db
      .from("assistant_work_items")
      .select()
      .eq("profile_id", profileId)
      .eq("status", "claimed")
      .order("claimed_at", { ascending: true, nullsFirst: false })
      .limit(5),
    db
      .from("profile_actions")
      .select()
      .eq("profile_id", profileId)
      .eq("status", "blocked")
      .order("updated_at", { ascending: false })
      .limit(5),
    db
      .from("assistant_work_items")
      .select()
      .eq("profile_id", profileId)
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(5),
    db
      .from("browser_tasks")
      .select()
      .eq("profile_id", profileId)
      .eq("status", "blocked")
      .order("updated_at", { ascending: false })
      .limit(5),
    db
      .from("profile_actions")
      .select()
      .eq("profile_id", profileId)
      .in("status", ["executed", "rejected", "expired", "failed", "unknown", "blocked"])
      .order("updated_at", { ascending: false })
      .limit(5),
    db
      .from("profile_proposals")
      .select()
      .eq("profile_id", profileId)
      .in("status", ["converted", "rejected", "expired", "superseded"])
      .order("updated_at", { ascending: false })
      .limit(5),
    db
      .from("assistant_scheduled_tasks")
      .select()
      .eq("profile_id", profileId)
      .in("status", ["active", "paused"])
      .order("next_run_at", { ascending: true, nullsFirst: false })
      .limit(5),
  ]);
  const pendingActions = requireSupabaseData(
    "List overview pending actions",
    pendingActionsResult.data,
    pendingActionsResult.error,
  ).map(agentActionDto);
  const activeProposals = requireSupabaseData(
    "List overview active proposals",
    activeProposalsResult.data,
    activeProposalsResult.error,
  ).map((row) => ({
    proposalId: row.id,
    kind: row.proposal_kind,
    status: row.status,
    revision: row.revision,
    title: row.title,
    summary: row.summary,
    expiresAt: row.expires_at,
    blockerSummary: row.blocker_summary,
  }));
  const activeBrowserTasks = requireSupabaseData(
    "List overview browser tasks",
    browserTasksResult.data,
    browserTasksResult.error,
  ).map((row) => ({
    id: row.id,
    status: row.status,
    goal: row.goal,
    summary: row.summary,
    updatedAt: row.updated_at,
  }));
  const workItemSummary = (row: NonNullable<typeof dueWorkItemsResult.data>[number]) => ({
    id: row.id,
    kind: row.kind,
    status: operationalWorkItemStatus(row.status),
    title: workItemTitle(row),
    dueAt: row.available_at,
    runningByAgentId: row.claimed_by_agent_id,
    runExpiresAt: row.claim_expires_at,
    lastError: row.last_error,
  });
  const dueWorkItems = requireSupabaseData(
    "List overview due work items",
    dueWorkItemsResult.data,
    dueWorkItemsResult.error,
  ).map(workItemSummary);
  const runningWorkItems = requireSupabaseData(
    "List overview running work items",
    runningWorkItemsResult.data,
    runningWorkItemsResult.error,
  ).map(workItemSummary);
  const blockedProposals = activeProposals
    .filter((proposal) => proposal.status === "blocked")
    .map((proposal) => ({
      sourceType: "proposal" as const,
      sourceId: proposal.proposalId,
      title: proposal.title,
      status: proposal.status,
      reason: proposal.blockerSummary,
      updatedAt:
        activeProposalsResult.data?.find((row) => row.id === proposal.proposalId)?.updated_at ??
        new Date().toISOString(),
    }));
  const blockedActions = requireSupabaseData(
    "List overview blocked actions",
    blockedActionsResult.data,
    blockedActionsResult.error,
  ).map((row) => ({
    sourceType: "action" as const,
    sourceId: row.id,
    title: row.title,
    status: row.status,
    reason: row.provider_error ? "Provider or policy blocked this action." : row.summary,
    updatedAt: row.updated_at,
  }));
  const blockedBrowserTasks = requireSupabaseData(
    "List overview blocked browser tasks",
    blockedBrowserTasksResult.data,
    blockedBrowserTasksResult.error,
  ).map((row) => ({
    sourceType: "browser_task" as const,
    sourceId: row.id,
    title: row.goal,
    status: row.status,
    reason: row.summary,
    updatedAt: row.updated_at,
  }));
  const blockedWorkItems = requireSupabaseData(
    "List overview blocked work items",
    blockedWorkItemsResult.data,
    blockedWorkItemsResult.error,
  ).map((row) => ({
    sourceType: "work_item" as const,
    sourceId: row.id,
    title: workItemTitle(row),
    status: row.status,
    reason: row.last_error,
    updatedAt: row.updated_at,
  }));
  const blockedCapabilities = capabilityItems
    .filter((item) => item.readinessStatus !== "ready")
    .map((item) => ({
      sourceType: "capability" as const,
      sourceId: item.instanceId,
      title: item.label ?? item.capabilitySlug,
      status: item.readinessStatus,
      reason: item.blockerSummary ?? item.lastError,
      updatedAt: nowIso,
    }));
  const recentTerminalEvents = [
    ...requireSupabaseData(
      "List overview recent actions",
      recentActionsResult.data,
      recentActionsResult.error,
    ).map((row) => ({
      sourceType: "action" as const,
      sourceId: row.id,
      title: row.title,
      status: row.status,
      updatedAt: row.updated_at,
    })),
    ...requireSupabaseData(
      "List overview recent proposals",
      recentProposalsResult.data,
      recentProposalsResult.error,
    ).map((row) => ({
      sourceType: "proposal" as const,
      sourceId: row.id,
      title: row.title,
      status: row.status,
      updatedAt: row.updated_at,
    })),
  ]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, 10);
  const scheduledTasks = requireSupabaseData(
    "List overview scheduled tasks",
    scheduledTasksResult.data,
    scheduledTasksResult.error,
  ).map((row) => ({
    id: row.id,
    status: row.status,
    title: row.title,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    revision: row.revision,
  }));
  return profileOperationalContextSchema.parse({
    pendingActions,
    activeProposals,
    activeBrowserTasks,
    dueWorkItems,
    runningWorkItems,
    blockedItems: [
      ...blockedProposals,
      ...blockedActions,
      ...blockedBrowserTasks,
      ...blockedWorkItems,
      ...blockedCapabilities,
    ],
    recentTerminalEvents,
    scheduledTasks,
  });
}

export async function profileOverviewForAssistant(
  db: SupabaseServiceClient,
  profileId: string,
  assistantId: string,
): Promise<ProfileOverview> {
  const [profileResult, capabilities, assistant] = await Promise.all([
    db.from("profiles").select().eq("id", profileId).maybeSingle(),
    capabilityOverviewForProfile(db, profileId),
    requireAssistantForContext(db, assistantId),
  ]);

  const profile = requireSupabaseData(
    `Load profile ${profileId}`,
    profileResult.data,
    profileResult.error,
  );
  if (profile.status !== "active")
    throw new DomainError(domainCodes.CONFLICT, `Profile ${profileId} is not active.`);
  if (assistant.profile_id !== profile.id)
    throw new DomainError(
      domainCodes.FORBIDDEN,
      `Assistant ${assistantId} is not mapped to profile ${profileId}.`,
    );

  const groupedPreferences = preferencesFromProfile(profile);
  const capabilityItems = capabilityListFromOverview(capabilities);
  const operationalContext = await operationalContextForProfile(db, profile.id, capabilityItems);
  const overview = {
    profile: {
      id: profile.id,
      displayName: profile.display_name,
      timezone: profile.timezone,
      status: profile.status,
    },
    assistant: {
      id: assistant.assistant_id,
      name: stringPreference(groupedPreferences, "assistant", "name"),
    },
    portal: portalAccessForProfile(),
    capabilities: capabilityItems,
    operationalContext,
  };
  return profileOverviewSchema.parse(overview);
}
