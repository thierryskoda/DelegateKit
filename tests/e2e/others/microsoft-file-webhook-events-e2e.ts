#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import type { ProviderAssistantWorkEventType } from "@ai-assistants/tool-contracts";
import {
  MICROSOFT_ONEDRIVE_ADAPTER_KEY,
  MICROSOFT_ONEDRIVE_PROVIDER_KEY,
  MICROSOFT_ONEDRIVE_RESOURCE_TYPE,
} from "../../../apps/backend/src/test-support/capabilities/microsoft-onedrive";
import { recordMicrosoftOnedriveFileEventAndEnqueueWorkItem } from "../../../apps/backend/src/test-support/capabilities/microsoft-onedrive";
import {
  MICROSOFT_SHAREPOINT_ADAPTER_KEY,
  MICROSOFT_SHAREPOINT_PROVIDER_KEY,
  MICROSOFT_SHAREPOINT_RESOURCE_TYPE,
} from "../../../apps/backend/src/test-support/capabilities/microsoft-sharepoint";
import { recordMicrosoftSharepointFileEventAndEnqueueWorkItem } from "../../../apps/backend/src/test-support/capabilities/microsoft-sharepoint";
import {
  upsertProviderWebhookSubscription,
  type ProviderWebhookReceiveResult,
} from "../../../apps/backend/src/test-support/provider-webhooks";
import {
  enableTestingProviderSandboxBinding,
  type TestingProviderSandboxBinding,
} from "../helpers/provider-runtime/testing-provider-runtime";
import { requireE2eBackendPublicUrl } from "../helpers/readiness/e2e-public-url-readiness";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { startBackend } from "../helpers/processes/start-backend";
import { useE2eDb } from "../helpers/db/e2e-db";
import { postJsonWebhook } from "../helpers/webhooks/http-webhooks";

const PROFILE_ID = "testing";
const ONEDRIVE_EVENT_TYPE = "microsoft_onedrive.file.created";
const SHAREPOINT_EVENT_TYPE = "microsoft_sharepoint.file.created";
const EVENT_TYPES = [
  ONEDRIVE_EVENT_TYPE,
  SHAREPOINT_EVENT_TYPE,
] as const satisfies readonly ProviderAssistantWorkEventType[];

type TestingConnection = TestingProviderSandboxBinding;

async function loadRoute(
  db: SupabaseServiceClient,
  eventType: ProviderAssistantWorkEventType,
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

async function deleteRoute(
  db: SupabaseServiceClient,
  eventType: ProviderAssistantWorkEventType,
): Promise<void> {
  const deleted = await db
    .from("profile_assistant_work_routes")
    .delete()
    .eq("profile_id", PROFILE_ID)
    .eq("event_type", eventType)
    .is("connected_provider_account_id", null);
  if (deleted.error) throw deleted.error;
}

async function restoreRoute(
  db: SupabaseServiceClient,
  original: TableRow<"profile_assistant_work_routes"> | null,
  eventType: ProviderAssistantWorkEventType,
): Promise<void> {
  if (!original) {
    await deleteRoute(db, eventType);
    return;
  }
  await deleteRoute(db, eventType);
  const restored = await db.from("profile_assistant_work_routes").insert(original);
  if (restored.error) throw restored.error;
}

async function createRoute(
  db: SupabaseServiceClient,
  eventType: ProviderAssistantWorkEventType,
): Promise<void> {
  await deleteRoute(db, eventType);
  const result = await db.from("profile_assistant_work_routes").insert({
    profile_id: PROFILE_ID,
    event_type: eventType,
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
    "Load Microsoft file webhook assistant work items",
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
  return requireSupabaseData("Load Microsoft file webhook deliveries", result.data, result.error)
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
    "Load Microsoft file webhook deliveries for cleanup",
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

async function exerciseOnedriveRoute(input: {
  db: SupabaseServiceClient;
  connection: TestingConnection;
  marker: string;
}): Promise<string> {
  const dedupeKey = `microsoft-file-webhook:${input.marker}:onedrive:created`;
  const payload = {
    provider: "microsoft-onedrive",
    connectedProviderAccountId: input.connection.connectedAccount.id,
    accountEmail: input.connection.connectedAccount.account_email,
    driveId: `onedrive-drive-${input.marker}`,
    driveName: "Documents",
    itemId: `onedrive-item-${input.marker}`,
    name: "Jordan Rowan signed mandate.pdf",
    webUrl:
      "https://contoso-my.sharepoint.com/personal/testing/Documents/Jordan%20Rowan%20signed%20mandate.pdf",
    parentReference: { driveId: `onedrive-drive-${input.marker}` },
    lastModifiedDateTime: new Date().toISOString(),
  };

  const noRoute = await recordMicrosoftOnedriveFileEventAndEnqueueWorkItem(input.db, {
    profileId: PROFILE_ID,
    connectedProviderAccountId: input.connection.connectedAccount.id,
    eventType: ONEDRIVE_EVENT_TYPE,
    dedupeKey,
    payload,
  });
  assert.equal(noRoute.enqueuedWorkItem, false);
  assert.equal(noRoute.joinedExistingWorkItem, false);
  assert.equal((await loadWorkItemsByDedupeKey(input.db, dedupeKey)).length, 0);

  await createRoute(input.db, ONEDRIVE_EVENT_TYPE);
  const firstRoute = await recordMicrosoftOnedriveFileEventAndEnqueueWorkItem(input.db, {
    profileId: PROFILE_ID,
    connectedProviderAccountId: input.connection.connectedAccount.id,
    eventType: ONEDRIVE_EVENT_TYPE,
    dedupeKey,
    payload,
  });
  const duplicateRoute = await recordMicrosoftOnedriveFileEventAndEnqueueWorkItem(input.db, {
    profileId: PROFILE_ID,
    connectedProviderAccountId: input.connection.connectedAccount.id,
    eventType: ONEDRIVE_EVENT_TYPE,
    dedupeKey,
    payload,
  });
  assert.equal(firstRoute.enqueuedWorkItem, true);
  assert.equal(duplicateRoute.joinedExistingWorkItem, true);
  return dedupeKey;
}

async function exerciseSharepointRoute(input: {
  db: SupabaseServiceClient;
  connection: TestingConnection;
  marker: string;
}): Promise<string> {
  const dedupeKey = `microsoft-file-webhook:${input.marker}:sharepoint:created`;
  const payload = {
    provider: "microsoft-sharepoint",
    connectedProviderAccountId: input.connection.connectedAccount.id,
    accountEmail: input.connection.connectedAccount.account_email,
    siteId: `sharepoint-site-${input.marker}`,
    siteName: "Client Files",
    driveId: `sharepoint-drive-${input.marker}`,
    driveName: "Documents",
    itemId: `sharepoint-item-${input.marker}`,
    name: "Jordan Rowan signed mandate.pdf",
    webUrl:
      "https://contoso.sharepoint.com/sites/client-files/Shared%20Documents/Jordan%20Rowan%20signed%20mandate.pdf",
    parentReference: { driveId: `sharepoint-drive-${input.marker}` },
    lastModifiedDateTime: new Date().toISOString(),
  };

  const noRoute = await recordMicrosoftSharepointFileEventAndEnqueueWorkItem(input.db, {
    profileId: PROFILE_ID,
    connectedProviderAccountId: input.connection.connectedAccount.id,
    eventType: SHAREPOINT_EVENT_TYPE,
    dedupeKey,
    payload,
  });
  assert.equal(noRoute.enqueuedWorkItem, false);
  assert.equal(noRoute.joinedExistingWorkItem, false);
  assert.equal((await loadWorkItemsByDedupeKey(input.db, dedupeKey)).length, 0);

  await createRoute(input.db, SHAREPOINT_EVENT_TYPE);
  const firstRoute = await recordMicrosoftSharepointFileEventAndEnqueueWorkItem(input.db, {
    profileId: PROFILE_ID,
    connectedProviderAccountId: input.connection.connectedAccount.id,
    eventType: SHAREPOINT_EVENT_TYPE,
    dedupeKey,
    payload,
  });
  const duplicateRoute = await recordMicrosoftSharepointFileEventAndEnqueueWorkItem(input.db, {
    profileId: PROFILE_ID,
    connectedProviderAccountId: input.connection.connectedAccount.id,
    eventType: SHAREPOINT_EVENT_TYPE,
    dedupeKey,
    payload,
  });
  assert.equal(firstRoute.enqueuedWorkItem, true);
  assert.equal(duplicateRoute.joinedExistingWorkItem, true);
  return dedupeKey;
}

async function createOnedriveSubscription(input: {
  db: SupabaseServiceClient;
  connection: TestingConnection;
  marker: string;
  backendPublicUrl: string;
}): Promise<TableRow<"provider_webhook_subscriptions">> {
  return upsertProviderWebhookSubscription(input.db, {
    profileId: PROFILE_ID,
    capabilityAccountLinkId: input.connection.capabilityAccountLink.id,
    connectedProviderAccountId: input.connection.connectedAccount.id,
    providerKey: MICROSOFT_ONEDRIVE_PROVIDER_KEY,
    adapterKey: MICROSOFT_ONEDRIVE_ADAPTER_KEY,
    externalSubscriptionId: `microsoft-onedrive-subscription-${input.marker}`,
    resourceType: MICROSOFT_ONEDRIVE_RESOURCE_TYPE,
    resourceId: `microsoft-onedrive-drive-${input.marker}`,
    eventScope: "driveItem.updated",
    status: "active",
    cursor: { deltaLink: `https://graph.microsoft.com/delta/${input.marker}`, initialized: true },
    providerState: {
      clientState: `microsoft-onedrive-client-state-${input.marker}`,
      resource: `/drives/microsoft-onedrive-drive-${input.marker}/root`,
      driveId: `microsoft-onedrive-drive-${input.marker}`,
      driveName: "Documents",
      driveWebUrl: "https://contoso-my.sharepoint.com/personal/testing/Documents",
      notificationUrl: `${input.backendPublicUrl}/webhooks/microsoft-onedrive`,
    },
  });
}

async function createSharepointSubscription(input: {
  db: SupabaseServiceClient;
  connection: TestingConnection;
  marker: string;
  backendPublicUrl: string;
}): Promise<TableRow<"provider_webhook_subscriptions">> {
  return upsertProviderWebhookSubscription(input.db, {
    profileId: PROFILE_ID,
    capabilityAccountLinkId: input.connection.capabilityAccountLink.id,
    connectedProviderAccountId: input.connection.connectedAccount.id,
    providerKey: MICROSOFT_SHAREPOINT_PROVIDER_KEY,
    adapterKey: MICROSOFT_SHAREPOINT_ADAPTER_KEY,
    externalSubscriptionId: `microsoft-sharepoint-subscription-${input.marker}`,
    resourceType: MICROSOFT_SHAREPOINT_RESOURCE_TYPE,
    resourceId: `microsoft-sharepoint-drive-${input.marker}`,
    eventScope: "driveItem.updated",
    status: "active",
    cursor: { deltaLink: `https://graph.microsoft.com/delta/${input.marker}`, initialized: true },
    providerState: {
      clientState: `microsoft-sharepoint-client-state-${input.marker}`,
      resource: `/drives/microsoft-sharepoint-drive-${input.marker}/root`,
      driveId: `microsoft-sharepoint-drive-${input.marker}`,
      driveName: "Documents",
      driveWebUrl: "https://contoso.sharepoint.com/sites/client-files/Shared%20Documents",
      siteId: `microsoft-sharepoint-site-${input.marker}`,
      siteName: "Client Files",
      siteWebUrl: "https://contoso.sharepoint.com/sites/client-files",
      notificationUrl: `${input.backendPublicUrl}/webhooks/microsoft-sharepoint`,
    },
  });
}

test("Microsoft file webhooks dedupe notifications and route work only when matching file routes exist.", async (t) => {
  const run = await createE2eRun(t, { id: "microsoft-file-webhook-events" });
  const backendPublicUrl = requireE2eBackendPublicUrl("Microsoft file webhook E2E");
  const supabase = await attachE2eSupabase(run);
  const backend = await startBackend(run, { supabase });
  const db = await useE2eDb();
  const marker = createMarker("microsoft-file-webhook-events");
  const originalRoutes = new Map<
    ProviderAssistantWorkEventType,
    TableRow<"profile_assistant_work_routes"> | null
  >();
  const createdDedupeKeys = new Set<string>();
  const subscriptionIds = new Set<string>();

  for (const eventType of EVENT_TYPES) {
    originalRoutes.set(eventType, await loadRoute(db, eventType));
    await deleteRoute(db, eventType);
  }
  run.cleanup.add(async () => {
    for (const dedupeKey of createdDedupeKeys) {
      const deletedWorkItems = await db
        .from("assistant_work_items")
        .delete()
        .eq("dedupe_key", dedupeKey);
      if (deletedWorkItems.error) throw deletedWorkItems.error;
    }
    for (const subscriptionId of subscriptionIds) await deleteSubscriptionRows(db, subscriptionId);
    for (const eventType of EVENT_TYPES) {
      await restoreRoute(db, originalRoutes.get(eventType) ?? null, eventType);
    }
  });

  const onedrive = await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: "microsoft-onedrive",
    provider: "microsoft-onedrive",
  });
  const sharepoint = await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: "microsoft-sharepoint",
    provider: "microsoft-sharepoint",
  });

  const onedriveDedupeKey = await exerciseOnedriveRoute({ db, connection: onedrive, marker });
  const sharepointDedupeKey = await exerciseSharepointRoute({ db, connection: sharepoint, marker });
  createdDedupeKeys.add(onedriveDedupeKey);
  createdDedupeKeys.add(sharepointDedupeKey);
  for (const dedupeKey of createdDedupeKeys) {
    const workItems = await loadWorkItemsByDedupeKey(db, dedupeKey);
    assert.equal(workItems.length, 1);
    assert.equal(workItems[0]!.status, "pending");
  }

  const onedriveSubscription = await createOnedriveSubscription({
    db,
    connection: onedrive,
    marker,
    backendPublicUrl,
  });
  subscriptionIds.add(onedriveSubscription.id);
  const onedriveBody = {
    value: [
      {
        subscriptionId: onedriveSubscription.external_subscription_id,
        clientState: `microsoft-onedrive-client-state-${marker}`,
        changeType: "updated",
        resource: `/drives/microsoft-onedrive-drive-${marker}/root`,
      },
    ],
  };
  const firstOnedrive = await postJsonWebhook<ProviderWebhookReceiveResult>(
    backend,
    "/webhooks/microsoft-onedrive",
    onedriveBody,
    { "x-provider": "microsoft-onedrive" },
  );
  const duplicateOnedrive = await postJsonWebhook<ProviderWebhookReceiveResult>(
    backend,
    "/webhooks/microsoft-onedrive",
    onedriveBody,
    { "x-provider": "microsoft-onedrive" },
  );
  assert.equal(firstOnedrive.status, 202);
  assert.equal(duplicateOnedrive.status, 202);
  assert.equal(firstOnedrive.body.handled, true);
  assert.equal(duplicateOnedrive.body.handled, true);
  assert.equal(await countDeliveriesForSubscription(db, onedriveSubscription.id), 1);

  const sharepointSubscription = await createSharepointSubscription({
    db,
    connection: sharepoint,
    marker,
    backendPublicUrl,
  });
  subscriptionIds.add(sharepointSubscription.id);
  const sharepointBody = {
    value: [
      {
        subscriptionId: sharepointSubscription.external_subscription_id,
        clientState: `microsoft-sharepoint-client-state-${marker}`,
        changeType: "updated",
        resource: `/drives/microsoft-sharepoint-drive-${marker}/root`,
      },
    ],
  };
  const firstSharepoint = await postJsonWebhook<ProviderWebhookReceiveResult>(
    backend,
    "/webhooks/microsoft-sharepoint",
    sharepointBody,
    { "x-provider": "microsoft-sharepoint" },
  );
  const duplicateSharepoint = await postJsonWebhook<ProviderWebhookReceiveResult>(
    backend,
    "/webhooks/microsoft-sharepoint",
    sharepointBody,
    { "x-provider": "microsoft-sharepoint" },
  );
  assert.equal(firstSharepoint.status, 202);
  assert.equal(duplicateSharepoint.status, 202);
  assert.equal(firstSharepoint.body.handled, true);
  assert.equal(duplicateSharepoint.body.handled, true);
  assert.equal(await countDeliveriesForSubscription(db, sharepointSubscription.id), 1);

  console.log(
    JSON.stringify(
      {
        ok: true,
        runId: run.runId,
        routedWorkItems: createdDedupeKeys.size,
        webhookSubscriptions: subscriptionIds.size,
      },
      null,
      2,
    ),
  );
});
