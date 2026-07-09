#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  GOOGLE_DRIVE_ADAPTER_KEY,
  GOOGLE_DRIVE_EVENT_SCOPE,
  GOOGLE_DRIVE_PROVIDER_KEY,
  GOOGLE_DRIVE_RESOURCE_TYPE,
} from "../../../apps/backend/src/test-support/capabilities/google-drive";
import { recordGoogleDriveFileEventAndEnqueueWorkItem } from "../../../apps/backend/src/test-support/capabilities/google-drive";
import {
  upsertProviderWebhookSubscription,
  type ProviderWebhookReceiveResult,
} from "../../../apps/backend/src/test-support/provider-webhooks";
import { enableTestingProviderSandboxBinding } from "../helpers/provider-runtime/testing-provider-runtime";
import { requireE2eBackendPublicUrl } from "../helpers/readiness/e2e-public-url-readiness";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { startBackend } from "../helpers/processes/start-backend";
import { useE2eDb } from "../helpers/db/e2e-db";
import { postRawWebhook } from "../helpers/webhooks/http-webhooks";

const PROFILE_ID = "testing";
const EVENT_TYPE = "google_drive.file.created";

async function loadRoute(
  db: SupabaseServiceClient,
): Promise<TableRow<"profile_assistant_work_routes"> | null> {
  const result = await db
    .from("profile_assistant_work_routes")
    .select()
    .eq("profile_id", PROFILE_ID)
    .eq("event_type", EVENT_TYPE)
    .is("connected_provider_account_id", null)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function deleteRoute(db: SupabaseServiceClient): Promise<void> {
  const deleted = await db
    .from("profile_assistant_work_routes")
    .delete()
    .eq("profile_id", PROFILE_ID)
    .eq("event_type", EVENT_TYPE)
    .is("connected_provider_account_id", null);
  if (deleted.error) throw deleted.error;
}

async function restoreRoute(
  db: SupabaseServiceClient,
  original: TableRow<"profile_assistant_work_routes"> | null,
): Promise<void> {
  if (!original) {
    await deleteRoute(db);
    return;
  }
  await deleteRoute(db);
  const restored = await db.from("profile_assistant_work_routes").insert(original);
  if (restored.error) throw restored.error;
}

async function createRoute(db: SupabaseServiceClient): Promise<void> {
  await deleteRoute(db);
  const result = await db.from("profile_assistant_work_routes").insert({
    profile_id: PROFILE_ID,
    event_type: EVENT_TYPE,
    config: {
      instructions:
        "Review the new mandate document and prepare a concise internal filing note. Do not message the client.",
      priority: 2,
    },
    managed_by: "profile",
  });
  if (result.error) throw result.error;
}

async function loadWorkItemsByDedupeKey(
  db: SupabaseServiceClient,
  dedupeKey: string,
): Promise<TableRow<"assistant_work_items">[]> {
  const result = await db.from("assistant_work_items").select().eq("dedupe_key", dedupeKey);
  return requireSupabaseData(
    "Load Google Drive webhook assistant work items",
    result.data,
    result.error,
  );
}

async function countDeliveriesForSubscription(
  db: SupabaseServiceClient,
  subscriptionId: string,
): Promise<number> {
  const result = await db
    .from("provider_webhook_deliveries")
    .select("id")
    .eq("subscription_id", subscriptionId);
  return requireSupabaseData("Load Google Drive webhook deliveries", result.data, result.error)
    .length;
}

async function deleteSubscriptionRows(
  db: SupabaseServiceClient,
  subscriptionId: string,
): Promise<void> {
  const deliveries = await db
    .from("provider_webhook_deliveries")
    .select("backend_job_id")
    .eq("subscription_id", subscriptionId);
  const deliveryRows = requireSupabaseData(
    "Load Google Drive webhook deliveries for cleanup",
    deliveries.data,
    deliveries.error,
  );
  const deletedDeliveries = await db
    .from("provider_webhook_deliveries")
    .delete()
    .eq("subscription_id", subscriptionId);
  if (deletedDeliveries.error) throw deletedDeliveries.error;
  for (const row of deliveryRows) {
    if (!row.backend_job_id) continue;
    const deletedJob = await db.from("backend_jobs").delete().eq("id", row.backend_job_id);
    if (deletedJob.error) throw deletedJob.error;
  }
  const deletedSubscription = await db
    .from("provider_webhook_subscriptions")
    .delete()
    .eq("id", subscriptionId);
  if (deletedSubscription.error) throw deletedSubscription.error;
}

test("Google Drive webhooks dedupe notifications and route work only when a matching file route exists.", async (t) => {
  const run = await createE2eRun(t, { id: "google-drive-webhook-events" });
  const backendPublicUrl = requireE2eBackendPublicUrl("Google Drive webhook E2E");
  const supabase = await attachE2eSupabase(run);
  const backend = await startBackend(run, { supabase });
  const db = await useE2eDb();
  const marker = createMarker("google-drive-webhook-events");
  const originalRoute = await loadRoute(db);
  const createdDedupeKey = `google-drive-webhook:${marker}:created`;
  let subscriptionId: string | null = null;

  await deleteRoute(db);
  run.cleanup.add(async () => {
    const deletedWorkItems = await db
      .from("assistant_work_items")
      .delete()
      .eq("dedupe_key", createdDedupeKey);
    if (deletedWorkItems.error) throw deletedWorkItems.error;
    if (subscriptionId) await deleteSubscriptionRows(db, subscriptionId);
    await restoreRoute(db, originalRoute);
  });

  const connection = await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: "google-drive",
    provider: "google-drive",
  });

  const payload = {
    provider: "google-drive",
    connectedProviderAccountId: connection.connectedAccount.id,
    accountEmail: connection.connectedAccount.account_email,
    fileId: `google-drive-file-${marker}`,
    name: "Jordan Rowan signed mandate.pdf",
    webUrl: "https://drive.google.com/file/d/jordan-rowan-signed-mandate/view",
    mimeType: "application/pdf",
    parents: [],
    modifiedTime: new Date().toISOString(),
  };

  const noRoute = await recordGoogleDriveFileEventAndEnqueueWorkItem(db, {
    profileId: PROFILE_ID,
    connectedProviderAccountId: connection.connectedAccount.id,
    eventType: EVENT_TYPE,
    dedupeKey: createdDedupeKey,
    payload,
  });
  assert.equal(noRoute.enqueuedWorkItem, false);
  assert.equal(noRoute.joinedExistingWorkItem, false);
  assert.equal((await loadWorkItemsByDedupeKey(db, createdDedupeKey)).length, 0);

  await createRoute(db);
  const firstRoute = await recordGoogleDriveFileEventAndEnqueueWorkItem(db, {
    profileId: PROFILE_ID,
    connectedProviderAccountId: connection.connectedAccount.id,
    eventType: EVENT_TYPE,
    dedupeKey: createdDedupeKey,
    payload,
  });
  const duplicateRoute = await recordGoogleDriveFileEventAndEnqueueWorkItem(db, {
    profileId: PROFILE_ID,
    connectedProviderAccountId: connection.connectedAccount.id,
    eventType: EVENT_TYPE,
    dedupeKey: createdDedupeKey,
    payload,
  });
  assert.equal(firstRoute.enqueuedWorkItem, true);
  assert.equal(duplicateRoute.joinedExistingWorkItem, true);
  const workItems = await loadWorkItemsByDedupeKey(db, createdDedupeKey);
  assert.equal(workItems.length, 1);
  assert.equal(workItems[0]!.kind, EVENT_TYPE);
  assert.equal(workItems[0]!.status, "pending");

  const subscription = await upsertProviderWebhookSubscription(db, {
    profileId: PROFILE_ID,
    capabilityAccountLinkId: connection.capabilityAccountLink.id,
    connectedProviderAccountId: connection.connectedAccount.id,
    providerKey: GOOGLE_DRIVE_PROVIDER_KEY,
    adapterKey: GOOGLE_DRIVE_ADAPTER_KEY,
    externalSubscriptionId: `google-drive-channel-${marker}`,
    resourceType: GOOGLE_DRIVE_RESOURCE_TYPE,
    resourceId: `google-drive-change-log-${marker}`,
    eventScope: GOOGLE_DRIVE_EVENT_SCOPE,
    status: "active",
    cursor: { pageToken: `drive-page-token-${marker}`, initialized: true },
    providerState: {
      channelToken: `google-drive-token-${marker}`,
      resourceId: `google-drive-resource-${marker}`,
      accountEmail: connection.connectedAccount.account_email,
      watchAddress: `${backendPublicUrl}/webhooks/google-drive`,
    },
  });
  subscriptionId = subscription.id;
  const headers = new Headers([
    ["x-goog-channel-id", subscription.external_subscription_id!],
    ["x-goog-channel-token", `google-drive-token-${marker}`],
    ["x-goog-resource-id", `google-drive-resource-${marker}`],
    ["x-goog-resource-state", "change"],
    ["x-goog-message-number", "17"],
  ]);

  const firstDelivery = await postRawWebhook<ProviderWebhookReceiveResult>(
    backend,
    "/webhooks/google-drive",
    "",
    headers,
  );
  const duplicateDelivery = await postRawWebhook<ProviderWebhookReceiveResult>(
    backend,
    "/webhooks/google-drive",
    "",
    headers,
  );
  assert.equal(firstDelivery.status, 202);
  assert.equal(duplicateDelivery.status, 202);
  assert.equal(firstDelivery.body.handled, true);
  assert.equal(duplicateDelivery.body.handled, true);
  assert.ok(
    "joinedExistingJob" in duplicateDelivery.body,
    `Expected duplicate Google Drive webhook job state, got ${JSON.stringify(duplicateDelivery.body)}`,
  );
  assert.equal(duplicateDelivery.body.joinedExistingJob, true);
  assert.equal(await countDeliveriesForSubscription(db, subscription.id), 1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        runId: run.runId,
        routedWorkItems: workItems.length,
        webhookDeliveries: 1,
      },
      null,
      2,
    ),
  );
});
