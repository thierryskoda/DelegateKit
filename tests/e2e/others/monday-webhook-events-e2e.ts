#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { z } from "zod";
import {
  registerProviderWebhookAdapter,
  upsertProviderWebhookSubscription,
  type ProviderWebhookReceiveResult,
} from "../../../apps/backend/src/test-support/provider-webhooks";
import { providerWebhookAdapters } from "../../../apps/backend/src/test-support/provider-webhooks";
import { mondayBoardList, mondayItemList } from "../../../apps/backend/src/test-support/capabilities/monday";
import { mondayWebhookPublicUrl } from "../../../apps/backend/src/test-support/capabilities/monday";
import {
  MONDAY_BOARD_WEBHOOK_ADAPTER_KEY,
  MONDAY_WEBHOOK_PROVIDER_KEY,
  type MondayWebhookEventKind,
} from "../../../apps/backend/src/test-support/capabilities/monday";
import { backendApiEnv } from "../../../apps/backend/src/test-support/env";
import { requireSingleTestingNangoConnection } from "../helpers/readiness/testing-provider-readiness";
import { CONNECTED_TESTING_CAPABILITIES as CONNECTED } from "../helpers/readiness/testing-capability-readiness";
import { requireE2eBackendPublicUrl } from "../helpers/readiness/e2e-public-url-readiness";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { startBackend, type BackendServerHandle } from "../helpers/processes/start-backend";
import { useE2eDb } from "../helpers/db/e2e-db";
import { runWorkerJobById } from "../../../apps/backend/src/test-support/worker";
import { mondayAuthorizationHeader, postJsonWebhook } from "../helpers/webhooks/http-webhooks";

const PROFILE_ID = "testing";
const EVENT_UPDATED = "monday.item.updated";
const REQUIRED_ENV = ["BACKEND_PUBLIC_URL", "MONDAY_SIGNING_SECRET"] as const;
const mondayLiveWorkItemPayloadSchema = z
  .object({
    providerBoardId: z.string(),
    providerItemId: z.string(),
    snapshotStatus: z.literal("live"),
    columnValuesById: z.record(z.string(), z.unknown()),
  })
  .passthrough();

for (const adapter of providerWebhookAdapters) {
  registerProviderWebhookAdapter(adapter);
}

async function createRoute(input: {
  db: SupabaseServiceClient;
  marker: string;
  eventType: string;
}): Promise<TableRow<"profile_assistant_work_routes">> {
  const deleted = await input.db
    .from("profile_assistant_work_routes")
    .delete()
    .eq("profile_id", PROFILE_ID)
    .eq("event_type", input.eventType)
    .is("connected_provider_account_id", null);
  if (deleted.error) throw deleted.error;
  const result = await input.db
    .from("profile_assistant_work_routes")
    .insert({
      profile_id: PROFILE_ID,
      event_type: input.eventType,
      config: {
        instructions: `Monday webhook E2E route ${input.marker}. Do not message the user.`,
        priority: 2,
      },
      managed_by: "profile",
    })
    .select()
    .single();
  return requireSupabaseData("Create Monday webhook work route", result.data, result.error);
}

async function loadRoute(
  db: SupabaseServiceClient,
  eventType: string,
): Promise<TableRow<"profile_assistant_work_routes"> | null> {
  const result = await db
    .from("profile_assistant_work_routes")
    .select()
    .eq("profile_id", PROFILE_ID)
    .eq("event_type", eventType)
    .is("connected_provider_account_id", null)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function createSubscription(input: {
  db: SupabaseServiceClient;
  marker: string;
  capabilityAccountLinkId: string;
  connectedProviderAccountId: string;
  providerConfigKey: string;
  nangoConnectionId: string;
  boardId: string;
  boardName: string | null;
  eventKind: MondayWebhookEventKind;
  backendPublicUrl: string;
}): Promise<TableRow<"provider_webhook_subscriptions">> {
  return upsertProviderWebhookSubscription(input.db, {
    profileId: PROFILE_ID,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    connectedProviderAccountId: input.connectedProviderAccountId,
    providerKey: MONDAY_WEBHOOK_PROVIDER_KEY,
    adapterKey: MONDAY_BOARD_WEBHOOK_ADAPTER_KEY,
    externalSubscriptionId: `monday-webhook-${input.eventKind}-${input.marker}`,
    resourceType: "monday.board",
    resourceId: input.boardId,
    eventScope: input.eventKind,
    status: "active",
    providerState: {
      nangoProviderConfigKey: input.providerConfigKey,
      nangoConnectionId: input.nangoConnectionId,
      providerBoardName: input.boardName,
      mondayEventKind: input.eventKind,
      webhookUrl: `${input.backendPublicUrl}/webhooks/monday`,
    },
  });
}

async function loadSubscription(input: {
  db: SupabaseServiceClient;
  connectedProviderAccountId: string;
  boardId: string;
  eventKind: MondayWebhookEventKind;
}): Promise<TableRow<"provider_webhook_subscriptions"> | null> {
  const result = await input.db
    .from("provider_webhook_subscriptions")
    .select()
    .eq("connected_provider_account_id", input.connectedProviderAccountId)
    .eq("adapter_key", MONDAY_BOARD_WEBHOOK_ADAPTER_KEY)
    .eq("resource_type", "monday.board")
    .eq("resource_id", input.boardId)
    .eq("event_scope", input.eventKind)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function restoreRoute(
  db: SupabaseServiceClient,
  original: TableRow<"profile_assistant_work_routes"> | null,
  eventType: string,
): Promise<void> {
  if (!original) {
    const deleted = await db
      .from("profile_assistant_work_routes")
      .delete()
      .eq("profile_id", PROFILE_ID)
      .eq("event_type", eventType)
      .is("connected_provider_account_id", null);
    if (deleted.error) throw deleted.error;
    return;
  }
  const deleted = await db
    .from("profile_assistant_work_routes")
    .delete()
    .eq("profile_id", PROFILE_ID)
    .eq("event_type", eventType)
    .is("connected_provider_account_id", null);
  if (deleted.error) throw deleted.error;
  const restored = await db.from("profile_assistant_work_routes").insert(original);
  if (restored.error) throw restored.error;
}

async function restoreSubscription(
  db: SupabaseServiceClient,
  original: TableRow<"provider_webhook_subscriptions"> | null,
  currentId: string,
): Promise<void> {
  if (!original) {
    const deleted = await db.from("provider_webhook_subscriptions").delete().eq("id", currentId);
    if (deleted.error) throw deleted.error;
    return;
  }
  const restored = await db
    .from("provider_webhook_subscriptions")
    .update({
      external_subscription_id: original.external_subscription_id,
      status: original.status,
      cursor: original.cursor,
      provider_state: original.provider_state,
      last_notification_at: original.last_notification_at,
      last_success_at: original.last_success_at,
      last_error_code: original.last_error_code,
      last_error_message: original.last_error_message,
    })
    .eq("id", original.id);
  if (restored.error) throw restored.error;
}

async function findLiveMondayItem(db: SupabaseServiceClient): Promise<{
  boardId: string;
  boardName: string | null;
  itemId: string;
}> {
  const boards = await mondayBoardList({ db, profileId: PROFILE_ID, limit: 50 });
  for (const board of boards.boards) {
    const page = await mondayItemList({
      db,
      profileId: PROFILE_ID,
      boardId: board.boardId,
      limit: 10,
    });
    const item = page.items.find((candidate) => candidate.itemId.trim().length > 0);
    if (item) {
      return { boardId: board.boardId, boardName: board.name, itemId: item.itemId };
    }
  }
  throw new Error("Monday webhook E2E requires at least one live testing Monday item.");
}

async function receiveMondayEvent(input: {
  backend: BackendServerHandle;
  subscriptionId: string;
  boardId: string;
  itemId: string;
  eventType: string;
  triggerUuid?: string;
  triggerTime?: string;
}): Promise<ProviderWebhookReceiveResult> {
  const response = await postJsonWebhook<ProviderWebhookReceiveResult>(
    input.backend,
    "/webhooks/monday",
    {
      event: {
        subscriptionId: input.subscriptionId,
        boardId: input.boardId,
        pulseId: input.itemId,
        itemId: input.itemId,
        type: input.eventType,
        triggerUuid: input.triggerUuid ?? randomUUID(),
        triggerTime: input.triggerTime ?? new Date().toISOString(),
      },
    },
    {
      authorization: mondayAuthorizationHeader({
        audience: mondayWebhookPublicUrl(),
        signingSecret: backendApiEnv().mondaySigningSecret,
      }),
      "x-e2e": "monday-webhook-events",
    },
  );
  assert.equal(response.status, 202);
  return response.body;
}

type QueuedMondayWebhookResult = ProviderWebhookReceiveResult & {
  backendJobId: string;
  joinedExistingJob?: boolean;
};

async function processWebhookResult(
  db: SupabaseServiceClient,
  result: QueuedMondayWebhookResult,
) {
  const workerResult = await runWorkerJobById({
    db,
    jobId: result.backendJobId,
    workerId: "e2e-monday-webhook-events",
  });
  assert.equal(workerResult.status, "succeeded");
  assert.ok("result" in workerResult, `Expected worker result, got ${JSON.stringify(workerResult)}`);
  return workerResult.result;
}

async function trackDeliveryAndJob(input: {
  db: SupabaseServiceClient;
  backendJobId: string;
  createdRows: {
    backendJobs: Set<string>;
    deliveries: Set<string>;
  };
}): Promise<void> {
  input.createdRows.backendJobs.add(input.backendJobId);
  const deliveryResult = await input.db
    .from("provider_webhook_deliveries")
    .select("id")
    .eq("backend_job_id", input.backendJobId);
  const deliveries = requireSupabaseData(
    "Load Monday webhook deliveries for cleanup",
    deliveryResult.data,
    deliveryResult.error,
  );
  for (const delivery of deliveries) input.createdRows.deliveries.add(delivery.id);
}

function requireQueuedWebhookResult(
  result: Awaited<ReturnType<typeof receiveMondayEvent>>,
): QueuedMondayWebhookResult {
  assert.ok(
    "backendJobId" in result && typeof result.backendJobId === "string",
    `Expected webhook backend job, got ${JSON.stringify(result)}`,
  );
  return result as QueuedMondayWebhookResult;
}

test("Monday webhooks enqueue raw item work and handle unsupported, duplicate, missing, and self-origin events.", async (t) => {
  const run = await createE2eRun(t, {
    id: "monday-webhook-events",
    requiredEnv: REQUIRED_ENV,
  });
  const backendPublicUrl = requireE2eBackendPublicUrl("Monday webhook E2E");
  assert.equal(mondayWebhookPublicUrl(), `${backendPublicUrl}/webhooks/monday`);
  const supabase = await attachE2eSupabase(run);
  const backend = await startBackend(run, { supabase });
  const db = await useE2eDb();
  const marker = createMarker("monday-webhook");
  const connection = await requireSingleTestingNangoConnection(db, CONNECTED.monday);
  const liveItem = await findLiveMondayItem(db);
  const originalRoute = await loadRoute(db, EVENT_UPDATED);
  const originalSubscription = await loadSubscription({
    db,
    connectedProviderAccountId: connection.connectedAccount.id,
    boardId: liveItem.boardId,
    eventKind: "change_column_value",
  });
  const createdRows = {
    backendJobs: new Set<string>(),
    deliveries: new Set<string>(),
    workItems: new Set<string>(),
    actions: new Set<string>(),
    receipts: new Set<string>(),
  };
  let subscription: TableRow<"provider_webhook_subscriptions"> | null = null;
  run.cleanup.add(async () => {
    for (const id of createdRows.receipts) await db.from("provider_write_receipts").delete().eq("id", id);
    for (const id of createdRows.actions) await db.from("profile_actions").delete().eq("id", id);
    for (const id of createdRows.workItems) await db.from("assistant_work_items").delete().eq("id", id);
    for (const id of createdRows.deliveries) await db.from("provider_webhook_deliveries").delete().eq("id", id);
    for (const id of createdRows.backendJobs) await db.from("backend_jobs").delete().eq("id", id);
    if (subscription) await restoreSubscription(db, originalSubscription, subscription.id);
    await restoreRoute(db, originalRoute, EVENT_UPDATED);
  });

  const route = await createRoute({ db, marker, eventType: EVENT_UPDATED });
  assert.ok(route.id);
  subscription = await createSubscription({
    db,
    marker,
    capabilityAccountLinkId: connection.capabilityAccountLink.id,
    connectedProviderAccountId: connection.connectedAccount.id,
    providerConfigKey: connection.connectedAccount.nango_provider_config_key!,
    nangoConnectionId: connection.connectedAccount.nango_connection_id!,
    boardId: liveItem.boardId,
    boardName: liveItem.boardName,
    eventKind: "change_column_value",
    backendPublicUrl,
  });
  const externalSubscriptionId = subscription.external_subscription_id!;

  const valid = await receiveMondayEvent({
    backend,
    subscriptionId: externalSubscriptionId,
    boardId: liveItem.boardId,
    itemId: liveItem.itemId,
    eventType: "change_column_value",
    triggerUuid: `valid-${marker}`,
  });
  const validQueued = requireQueuedWebhookResult(valid);
  await trackDeliveryAndJob({
    db,
    backendJobId: validQueued.backendJobId,
    createdRows,
  });
  assert.equal(validQueued.joinedExistingJob, false);
  const validProcessed = await processWebhookResult(db, validQueued);
  assert.equal(validProcessed.eventType, EVENT_UPDATED);
  assert.equal(validProcessed.enqueuedWorkItems, 1);

  const workItemsResult = await db
    .from("assistant_work_items")
    .select()
    .eq("profile_id", PROFILE_ID)
    .eq("kind", EVENT_UPDATED)
    .contains("payload", { providerItemId: liveItem.itemId });
  const workItems = requireSupabaseData("Load Monday webhook work items", workItemsResult.data, workItemsResult.error);
  for (const workItem of workItems) createdRows.workItems.add(workItem.id);
  assert.ok(
    workItems.some((workItem) => {
      const payload = mondayLiveWorkItemPayloadSchema.safeParse(workItem.payload);
      if (!payload.success) return false;
      return (
        payload.data.providerBoardId === liveItem.boardId &&
        payload.data.providerItemId === liveItem.itemId
      );
    }),
    "valid Monday webhook should enqueue a live raw item payload",
  );

  const duplicate = await receiveMondayEvent({
    backend,
    subscriptionId: externalSubscriptionId,
    boardId: liveItem.boardId,
    itemId: liveItem.itemId,
    eventType: "change_column_value",
    triggerUuid: `valid-${marker}`,
  });
  const duplicateQueued = requireQueuedWebhookResult(duplicate);
  await trackDeliveryAndJob({
    db,
    backendJobId: duplicateQueued.backendJobId,
    createdRows,
  });
  assert.equal(duplicateQueued.joinedExistingJob, true);

  const unsupported = await receiveMondayEvent({
    backend,
    subscriptionId: externalSubscriptionId,
    boardId: liveItem.boardId,
    itemId: liveItem.itemId,
    eventType: "unsupported_event",
    triggerUuid: `unsupported-${marker}`,
  });
  assert.ok("ignored" in unsupported && unsupported.ignored);
  assert.equal(unsupported.reason, "unsupported_payload_type");

  const missing = await receiveMondayEvent({
    backend,
    subscriptionId: externalSubscriptionId,
    boardId: liveItem.boardId,
    itemId: "999999999999",
    eventType: "change_column_value",
    triggerUuid: `missing-${marker}`,
  });
  const missingQueued = requireQueuedWebhookResult(missing);
  await trackDeliveryAndJob({
    db,
    backendJobId: missingQueued.backendJobId,
    createdRows,
  });
  const missingProcessed = await processWebhookResult(db, missingQueued);
  assert.equal(missingProcessed.enqueuedWorkItems, 1);
  const missingRowsResult = await db
    .from("assistant_work_items")
    .select()
    .eq("profile_id", PROFILE_ID)
    .eq("kind", EVENT_UPDATED)
    .contains("payload", { providerItemId: "999999999999", snapshotStatus: "missing" });
  const missingRows = requireSupabaseData("Load missing Monday item work item", missingRowsResult.data, missingRowsResult.error);
  for (const workItem of missingRows) createdRows.workItems.add(workItem.id);
  assert.ok(missingRows.length > 0, "missing item webhook should enqueue a missing snapshot payload");

  const actionResult = await db
    .from("profile_actions")
    .insert({
      profile_id: PROFILE_ID,
      tool_name: "monday_item_update",
      action_type: "monday.item.update",
      title: `Monday webhook self-origin ${marker}`,
      summary: `Monday webhook self-origin ${marker}`,
      idempotency_key: `monday-webhook-action-${marker}`,
      provider_idempotency_key: `monday-webhook-provider-${marker}`,
      request_hash: `monday-webhook-hash-${marker}`,
      execution_payload: {},
      review_payload: {},
      risk_level: "low",
      status: "executed",
      provider_execution_status: "completed",
    })
    .select()
    .single();
  const action = requireSupabaseData("Create Monday self-origin profile action", actionResult.data, actionResult.error);
  createdRows.actions.add(action.id);
  const now = new Date().toISOString();
  const receiptResult = await db
    .from("provider_write_receipts")
    .insert({
      profile_id: PROFILE_ID,
      capability_account_link_id: connection.capabilityAccountLink.id,
      connected_provider_account_id: connection.connectedAccount.id,
      provider_key: "monday",
      capability_slug: "monday",
      tool_name: "monday_item_update",
      profile_action_id: action.id,
      external_resource_type: "monday.item",
      external_resource_id: liveItem.itemId,
      operation: "update",
      started_at: now,
      finished_at: now,
      metadata: {},
    })
    .select()
    .single();
  const receipt = requireSupabaseData("Create Monday self-origin receipt", receiptResult.data, receiptResult.error);
  createdRows.receipts.add(receipt.id);
  const selfOrigin = await receiveMondayEvent({
    backend,
    subscriptionId: externalSubscriptionId,
    boardId: liveItem.boardId,
    itemId: liveItem.itemId,
    eventType: "change_column_value",
    triggerUuid: `self-origin-${marker}`,
    triggerTime: now,
  });
  const selfOriginQueued = requireQueuedWebhookResult(selfOrigin);
  await trackDeliveryAndJob({
    db,
    backendJobId: selfOriginQueued.backendJobId,
    createdRows,
  });
  const selfOriginProcessed = await processWebhookResult(db, selfOriginQueued);
  assert.equal(selfOriginProcessed.enqueuedWorkItems, 0);
});
