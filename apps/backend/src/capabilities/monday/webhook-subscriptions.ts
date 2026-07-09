import type { BackendJob } from "@ai-assistants/backend-jobs";
import { requireSupabaseData, type SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes, formatUnknownError } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import {
  deleteProviderWebhookSubscriptionAndDeliveries,
  enqueueProviderWebhookSubscriptionReconcile,
  listProviderWebhookSubscriptionsForConnectedAccount,
  patchProviderWebhookSubscription,
  type ProviderWebhookSubscriptionReconcileEnqueueResult,
  upsertProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { backendApiEnv } from "../../shared/env";
import { requireMondayNango } from "./connection";
import { mondayLiveDiscoverBoards, type MondayLiveRawDiscoveryBoard } from "./live-graphql";
import { mondayProxyGraphql, mondayProviderId, mondayRequireObject } from "./graphql-proxy";
import {
  cleanMondayString,
  MONDAY_BOARD_WEBHOOK_ADAPTER_KEY,
  MONDAY_WEBHOOK_EVENT_KINDS,
  MONDAY_WEBHOOK_PROVIDER_KEY,
  MONDAY_WEBHOOK_RECONCILE_INTERVAL_MS,
  MONDAY_WEBHOOK_RECONCILE_PRIORITY,
  mondayWebhookStateSchema,
  type MondayWebhookEventKind,
  type MondayWebhookState,
} from "./webhook-types";

const mondayLiveWebhookSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    event: z.string().trim().min(1),
    board_id: z.union([z.string(), z.number()]).nullable().optional(),
    config: z.unknown().optional(),
  })
  .passthrough();

type MondayDesiredWebhookTarget = {
  boardId: string;
  boardName: string | null;
  eventKind: MondayWebhookEventKind;
};

type MondayLiveWebhook = {
  id: string;
  eventKind: MondayWebhookEventKind;
  boardId: string | null;
  url: string | null;
};

export function mondayWebhookPublicUrl(): string {
  const base = backendApiEnv().backendPublicUrl;
  return `${base}/webhooks/monday`;
}

export async function loadMondayWebhookStateBySubscription(
  db: SupabaseServiceClient,
  subscriptionId: string,
): Promise<MondayWebhookState> {
  const result = await db
    .from("provider_webhook_subscriptions")
    .select()
    .eq("provider_key", MONDAY_WEBHOOK_PROVIDER_KEY)
    .eq("adapter_key", MONDAY_BOARD_WEBHOOK_ADAPTER_KEY)
    .eq("external_subscription_id", subscriptionId)
    .maybeSingle();
  const row = requireSupabaseData(
    "Load Monday webhook subscription state",
    result.data,
    result.error,
  );
  return mondayWebhookStateSchema.parse(row);
}

export async function maybeLoadMondayWebhookStateBySubscription(
  db: SupabaseServiceClient,
  subscriptionId: string,
): Promise<MondayWebhookState | null> {
  const result = await db
    .from("provider_webhook_subscriptions")
    .select()
    .eq("provider_key", MONDAY_WEBHOOK_PROVIDER_KEY)
    .eq("adapter_key", MONDAY_BOARD_WEBHOOK_ADAPTER_KEY)
    .eq("external_subscription_id", subscriptionId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? mondayWebhookStateSchema.parse(result.data) : null;
}

export async function markMondayWebhookState(
  db: SupabaseServiceClient,
  stateId: string,
  patch: Partial<{
    status: MondayWebhookState["status"];
    last_error: string | null;
    last_notification_at: string | null;
  }>,
): Promise<void> {
  await patchProviderWebhookSubscription(db, stateId, {
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.last_notification_at !== undefined
      ? { last_notification_at: patch.last_notification_at }
      : {}),
    ...(patch.last_error !== undefined
      ? { last_error_code: patch.last_error, last_error_message: patch.last_error }
      : {}),
  });
}

function desiredTargetKey(input: { boardId: string; eventKind: string }): string {
  return `${input.boardId}\0${input.eventKind}`;
}

function extractMondayWebhookUrl(config: unknown): string | null {
  if (typeof config === "string") {
    const trimmed = config.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
    try {
      return extractMondayWebhookUrl(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const record = config as Record<string, unknown>;
  for (const key of ["url", "webhook_url", "webhookUrl"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function isMondayWebhookEventKind(value: string): value is MondayWebhookEventKind {
  return MONDAY_WEBHOOK_EVENT_KINDS.includes(value as MondayWebhookEventKind);
}

function isMondaySubitemsBoard(board: MondayLiveRawDiscoveryBoard): boolean {
  const objectType =
    typeof board.object_type_unique_key === "string"
      ? board.object_type_unique_key.trim().toLowerCase()
      : "";
  if (objectType === "sub_items_board") return true;
  const boardName = typeof board.name === "string" ? board.name.trim().toLowerCase() : "";
  return boardName.startsWith("subitems of ");
}

async function desiredMondayWebhookTargets(input: {
  providerConfigKey: string;
  connectionId: string;
}): Promise<MondayDesiredWebhookTarget[]> {
  const discovery = await mondayLiveDiscoverBoards({
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    boardLimit: 500,
    sampleItemsPerBoard: 0,
  });
  return discovery.boards.flatMap((board) => {
    if (isMondaySubitemsBoard(board)) return [];
    const boardId = mondayProviderId(board);
    if (!boardId) return [];
    return MONDAY_WEBHOOK_EVENT_KINDS.map((eventKind) => ({
      boardId,
      boardName: typeof board.name === "string" ? board.name : null,
      eventKind,
    }));
  });
}

function shouldManageLiveWebhook(input: {
  webhook: MondayLiveWebhook;
  boardId: string;
  url: string;
}): boolean {
  if (input.webhook.boardId && input.webhook.boardId !== input.boardId) return false;
  return input.webhook.url === null || input.webhook.url === input.url;
}

function isMondayWebhookAlreadyGone(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /not found|does not exist|already deleted|invalid webhook/i.test(error.message);
}

async function listMondayBoardWebhooks(input: {
  providerConfigKey: string;
  connectionId: string;
  boardId: string;
}): Promise<MondayLiveWebhook[]> {
  const data = await mondayProxyGraphql({
    operation: "monday.webhooks.list",
    publicSummary: "Monday webhook listing failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    query: `query MondayBoardWebhooks($boardId: ID!) {
      webhooks(board_id: $boardId, app_webhooks_only: true) { id event board_id config }
    }`,
    variables: { boardId: input.boardId },
  });
  const rawWebhooks = Array.isArray(data["webhooks"]) ? data["webhooks"] : [];
  const webhooks: MondayLiveWebhook[] = [];
  for (const raw of rawWebhooks) {
    const parsed = mondayLiveWebhookSchema.safeParse(raw);
    if (!parsed.success) continue;
    const id = cleanMondayString(parsed.data.id);
    const boardId = cleanMondayString(parsed.data.board_id);
    if (!id || !isMondayWebhookEventKind(parsed.data.event)) continue;
    webhooks.push({
      id,
      eventKind: parsed.data.event,
      boardId,
      url: extractMondayWebhookUrl(parsed.data.config),
    });
  }
  return webhooks;
}

async function createMondayWebhook(input: {
  providerConfigKey: string;
  connectionId: string;
  boardId: string;
  eventKind: MondayWebhookEventKind;
  url: string;
}): Promise<string> {
  const data = await mondayProxyGraphql({
    operation: "monday.webhooks.create",
    publicSummary: "Monday webhook creation failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    query: `mutation CreateMondayWebhook($boardId: ID!, $url: String!, $event: WebhookEventType!) {
      create_webhook(board_id: $boardId, url: $url, event: $event) { id board_id }
    }`,
    variables: { boardId: input.boardId, url: input.url, event: input.eventKind },
  });
  const record = mondayRequireObject(data, "create_webhook", "webhook creation");
  const id = mondayProviderId(record);
  if (!id) {
    throw new DomainError(domainCodes.INTERNAL, "Monday create_webhook returned no webhook id.");
  }
  return id;
}

async function deleteMondayWebhook(input: {
  providerConfigKey: string;
  connectionId: string;
  webhookId: string;
}): Promise<void> {
  await mondayProxyGraphql({
    operation: "monday.webhooks.delete",
    publicSummary: "Monday webhook deletion failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    query: `mutation DeleteMondayWebhook($id: ID!) {
      delete_webhook(id: $id) { id board_id }
    }`,
    variables: { id: input.webhookId },
  });
}

async function upsertMondayWebhookState(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccountId: string;
  providerConfigKey: string;
  nangoConnectionId: string;
  boardId: string;
  boardName: string | null;
  eventKind: MondayWebhookEventKind;
  webhookId?: string | null;
  webhookUrl: string;
  status?: "active" | "unhealthy";
  lastError?: string | null;
}): Promise<MondayWebhookState> {
  return mondayWebhookStateSchema.parse(
    await upsertProviderWebhookSubscription(input.db, {
      profileId: input.profileId,
      capabilityAccountLinkId: input.capabilityAccountLinkId,
      connectedProviderAccountId: input.connectedProviderAccountId,
      providerKey: MONDAY_WEBHOOK_PROVIDER_KEY,
      adapterKey: MONDAY_BOARD_WEBHOOK_ADAPTER_KEY,
      externalSubscriptionId: input.webhookId ?? null,
      resourceType: "monday.board",
      resourceId: input.boardId,
      eventScope: input.eventKind,
      status: input.status ?? "active",
      providerState: {
        nangoProviderConfigKey: input.providerConfigKey,
        nangoConnectionId: input.nangoConnectionId,
        providerBoardName: input.boardName,
        mondayEventKind: input.eventKind,
        webhookUrl: input.webhookUrl,
      },
      lastErrorCode: input.lastError ?? null,
      lastErrorMessage: input.lastError ?? null,
    }),
  );
}

function reconcileDedupeKey(input: { capabilityAccountLinkId: string; runAfter?: Date }): string {
  if (!input.runAfter)
    return `provider.webhook.subscription.reconcile:monday.board:${input.capabilityAccountLinkId}:immediate`;
  const bucketMs =
    Math.floor(input.runAfter.getTime() / MONDAY_WEBHOOK_RECONCILE_INTERVAL_MS) *
    MONDAY_WEBHOOK_RECONCILE_INTERVAL_MS;
  return `provider.webhook.subscription.reconcile:monday.board:${input.capabilityAccountLinkId}:${new Date(bucketMs).toISOString()}`;
}

export async function enqueueMondayWebhookReconcile(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilityAccountLinkId: string;
  providerConfigKey: string;
  nangoConnectionId: string;
  runAfter?: Date;
}): Promise<ProviderWebhookSubscriptionReconcileEnqueueResult> {
  const binding = await requireMondayNango(input.db, input.profileId, {
    capabilityAccountLinkId: input.capabilityAccountLinkId,
  });
  if (
    binding.nangoProviderConfigKey !== input.providerConfigKey ||
    binding.nangoConnectionId !== input.nangoConnectionId
  ) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Monday webhook reconcile enqueue no longer matches the active Nango connection.",
    );
  }
  const result = await enqueueProviderWebhookSubscriptionReconcile(input.db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    adapterKey: MONDAY_BOARD_WEBHOOK_ADAPTER_KEY,
    connectedProviderAccountId: binding.account.id,
    priority: MONDAY_WEBHOOK_RECONCILE_PRIORITY,
    ...(input.runAfter ? { runAfter: input.runAfter } : {}),
    dedupeKey: reconcileDedupeKey({
      capabilityAccountLinkId: input.capabilityAccountLinkId,
      ...(input.runAfter ? { runAfter: input.runAfter } : {}),
    }),
  });
  return result;
}

async function enqueueNextMondayWebhookReconcile(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilityAccountLinkId: string;
  providerConfigKey: string;
  nangoConnectionId: string;
}): Promise<ProviderWebhookSubscriptionReconcileEnqueueResult> {
  return enqueueMondayWebhookReconcile({
    ...input,
    runAfter: new Date(Date.now() + MONDAY_WEBHOOK_RECONCILE_INTERVAL_MS),
  });
}

export async function reconcileMondayWebhooks(
  db: SupabaseServiceClient,
  input: { job: BackendJob; connectedProviderAccountId: string },
): Promise<
  {
    boards: number;
    subscriptionsCreated: number;
    subscriptionsActive: number;
    subscriptionsDeleted: number;
  } & (
    | {
        nextReconcileJobId: string;
        joinedExistingNextReconcileJob: boolean;
      }
    | { nextReconcileSkippedReason: "subscription_management_disabled" }
  )
> {
  const capabilityAccountLinkId = input.job.capability_account_link_id;
  if (!capabilityAccountLinkId) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Monday webhook reconcile job is missing capability_account_link_id.",
    );
  }
  const binding = await requireMondayNango(db, input.job.profile_id, {
    capabilityAccountLinkId,
  });
  if (binding.account.id !== input.connectedProviderAccountId) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Monday webhook reconcile job no longer matches the active provider connection.",
    );
  }

  const desiredTargets = await desiredMondayWebhookTargets({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
  });
  const desiredKeys = new Set(desiredTargets.map((target) => desiredTargetKey(target)));
  const desiredBoardIds = [...new Set(desiredTargets.map((target) => target.boardId))];
  const existingResult = await listProviderWebhookSubscriptionsForConnectedAccount({
    db,
    connectedProviderAccountId: binding.account.id,
    adapterKey: MONDAY_BOARD_WEBHOOK_ADAPTER_KEY,
  });
  const existing = existingResult.map((row) => mondayWebhookStateSchema.parse(row));
  const existingByKey = new Map(
    existing.map((row) => [
      desiredTargetKey({ boardId: row.resource_id, eventKind: row.event_scope }),
      row,
    ]),
  );
  const boardIdsToInspect = [
    ...new Set([...desiredBoardIds, ...existing.map((row) => row.resource_id)]),
  ];

  let subscriptionsCreated = 0;
  let subscriptionsActive = 0;
  let subscriptionsDeleted = 0;
  const url = mondayWebhookPublicUrl();
  const liveByBoardId = new Map<string, MondayLiveWebhook[]>();
  for (const boardId of boardIdsToInspect) {
    liveByBoardId.set(
      boardId,
      await listMondayBoardWebhooks({
        providerConfigKey: binding.nangoProviderConfigKey,
        connectionId: binding.nangoConnectionId,
        boardId,
      }),
    );
  }

  for (const target of desiredTargets) {
    const key = desiredTargetKey(target);
    const existingState = existingByKey.get(key);
    const liveWebhooks =
      liveByBoardId
        .get(target.boardId)
        ?.filter(
          (webhook) =>
            webhook.eventKind === target.eventKind &&
            shouldManageLiveWebhook({ webhook, boardId: target.boardId, url }),
        ) ?? [];
    const liveMatchingExisting = existingState?.external_subscription_id
      ? liveWebhooks.find((webhook) => webhook.id === existingState.external_subscription_id)
      : null;

    if (existingState?.status === "active" && liveMatchingExisting) {
      subscriptionsActive += 1;
      continue;
    }

    const adoptableLiveWebhook = liveWebhooks[0] ?? null;
    if (adoptableLiveWebhook) {
      await upsertMondayWebhookState({
        db,
        profileId: input.job.profile_id,
        capabilityAccountLinkId,
        connectedProviderAccountId: binding.account.id,
        providerConfigKey: binding.nangoProviderConfigKey,
        nangoConnectionId: binding.nangoConnectionId,
        boardId: target.boardId,
        boardName: target.boardName,
        eventKind: target.eventKind,
        webhookId: adoptableLiveWebhook.id,
        webhookUrl: url,
        status: "active",
        lastError: null,
      });
      subscriptionsActive += 1;
      continue;
    }

    let state = await upsertMondayWebhookState({
      db,
      profileId: input.job.profile_id,
      capabilityAccountLinkId,
      connectedProviderAccountId: binding.account.id,
      providerConfigKey: binding.nangoProviderConfigKey,
      nangoConnectionId: binding.nangoConnectionId,
      boardId: target.boardId,
      boardName: target.boardName,
      eventKind: target.eventKind,
      webhookUrl: url,
      status: "active",
    });
    try {
      const webhookId = await createMondayWebhook({
        providerConfigKey: binding.nangoProviderConfigKey,
        connectionId: binding.nangoConnectionId,
        boardId: target.boardId,
        eventKind: target.eventKind,
        url,
      });
      state = await upsertMondayWebhookState({
        db,
        profileId: input.job.profile_id,
        capabilityAccountLinkId,
        connectedProviderAccountId: binding.account.id,
        providerConfigKey: binding.nangoProviderConfigKey,
        nangoConnectionId: binding.nangoConnectionId,
        boardId: target.boardId,
        boardName: target.boardName,
        eventKind: target.eventKind,
        webhookId,
        webhookUrl: url,
        status: "active",
        lastError: null,
      });
      subscriptionsCreated += 1;
      if (state.status === "active") subscriptionsActive += 1;
    } catch (error) {
      await markMondayWebhookState(db, state.id, {
        status: "unhealthy",
        last_error: formatUnknownError(error),
      });
    }
  }

  const desiredLiveIds = new Set<string>();
  for (const target of desiredTargets) {
    const key = desiredTargetKey(target);
    const existingState = existingByKey.get(key);
    if (existingState?.external_subscription_id) {
      desiredLiveIds.add(existingState.external_subscription_id);
    }
  }

  const deletedExternalWebhookIds = new Set<string>();
  for (const [boardId, webhooks] of liveByBoardId) {
    for (const webhook of webhooks) {
      if (!shouldManageLiveWebhook({ webhook, boardId, url })) continue;
      const key = desiredTargetKey({ boardId, eventKind: webhook.eventKind });
      if (desiredKeys.has(key) && desiredLiveIds.has(webhook.id)) continue;
      if (desiredKeys.has(key)) continue;
      try {
        await deleteMondayWebhook({
          providerConfigKey: binding.nangoProviderConfigKey,
          connectionId: binding.nangoConnectionId,
          webhookId: webhook.id,
        });
        deletedExternalWebhookIds.add(webhook.id);
      } catch (error) {
        if (!isMondayWebhookAlreadyGone(error)) throw error;
        deletedExternalWebhookIds.add(webhook.id);
      }
    }
  }

  const stale = existing.filter(
    (state) =>
      !desiredKeys.has(
        desiredTargetKey({ boardId: state.resource_id, eventKind: state.event_scope }),
      ),
  );
  for (const state of stale) {
    if (
      state.external_subscription_id &&
      !deletedExternalWebhookIds.has(state.external_subscription_id)
    ) {
      try {
        await deleteMondayWebhook({
          providerConfigKey: binding.nangoProviderConfigKey,
          connectionId: binding.nangoConnectionId,
          webhookId: state.external_subscription_id,
        });
        deletedExternalWebhookIds.add(state.external_subscription_id);
      } catch (error) {
        if (!isMondayWebhookAlreadyGone(error)) throw error;
        deletedExternalWebhookIds.add(state.external_subscription_id);
      }
    }
    await deleteProviderWebhookSubscriptionAndDeliveries(db, state.id);
    subscriptionsDeleted += 1;
  }

  const next = await enqueueNextMondayWebhookReconcile({
    db,
    profileId: input.job.profile_id,
    capabilityAccountLinkId,
    providerConfigKey: binding.nangoProviderConfigKey,
    nangoConnectionId: binding.nangoConnectionId,
  });

  emitDiagnostic(backendDiagnosticLogger(), "monday.webhook_subscriptions.reconciled", {
    ok: true,
    profile_id: input.job.profile_id,
    capability_account_link_id: capabilityAccountLinkId,
    job_id: input.job.id,
    attrs: {
      boards: desiredBoardIds.length,
      subscriptions_created: subscriptionsCreated,
      subscriptions_active: subscriptionsActive,
      subscriptions_deleted: subscriptionsDeleted,
      ...(next.enqueued
        ? {
            next_reconcile_job_id: next.jobId,
            joined_existing_next_reconcile_job: next.joinedExistingJob,
          }
        : { next_reconcile_skipped_reason: next.reason }),
    },
  });

  return {
    boards: desiredBoardIds.length,
    subscriptionsCreated,
    subscriptionsActive,
    subscriptionsDeleted,
    ...(next.enqueued
      ? {
          nextReconcileJobId: next.jobId,
          joinedExistingNextReconcileJob: next.joinedExistingJob,
        }
      : { nextReconcileSkippedReason: next.reason }),
  };
}
