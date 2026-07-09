#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  GOOGLE_CALENDAR_ADAPTER_KEY,
  GOOGLE_CALENDAR_PROVIDER_KEY,
} from "../../../apps/backend/src/test-support/capabilities/google-calendar";
import {
  MICROSOFT_ONEDRIVE_ADAPTER_KEY,
  MICROSOFT_ONEDRIVE_PROVIDER_KEY,
  MICROSOFT_ONEDRIVE_RESOURCE_TYPE,
} from "../../../apps/backend/src/test-support/capabilities/microsoft-onedrive";
import {
  upsertProviderWebhookSubscription,
  type ProviderWebhookReceiveResult,
} from "../../../apps/backend/src/test-support/provider-webhooks";
import { mondayWebhookPublicUrl } from "../../../apps/backend/src/test-support/capabilities/monday";
import { backendApiEnv } from "../../../apps/backend/src/test-support/env";
import { startBackend, type BackendServerHandle } from "../helpers/processes/start-backend";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import {
  enableTestingProviderSandboxBinding,
  type TestingProviderSandboxBinding,
} from "../helpers/provider-runtime/testing-provider-runtime";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import { useE2eDb } from "../helpers/db/e2e-db";
import {
  mondayAuthorizationHeader,
  postJsonWebhook,
  postRawWebhook,
} from "../helpers/webhooks/http-webhooks";

const PROFILE_ID = "testing";
const REQUIRED_ENV = ["BACKEND_PUBLIC_URL", "MONDAY_SIGNING_SECRET"] as const;

type GoogleCalendarIgnoredResult = {
  ok: true;
  handled: false;
  ignored: true;
  reason: "unknown_channel";
};

type IgnoredNotificationResult = ProviderWebhookReceiveResult & {
  handled: false;
  ignoredNotifications: number;
};

type MondayIgnoredResult = {
  ok: true;
  handled: false;
  ignored: true;
  subscriptionId: string;
  reason: "unknown_subscription";
};

type TestingConnection = TestingProviderSandboxBinding;

async function countRows(
  db: SupabaseServiceClient,
  table: "backend_jobs" | "provider_webhook_deliveries",
): Promise<number> {
  const result = await db.from(table).select("id");
  return requireSupabaseData(`Count ${table}`, result.data, result.error).length;
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
    "Load stale webhook deliveries for cleanup",
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

async function postGoogleCalendarStale(input: {
  backend: BackendServerHandle;
  marker: string;
}): Promise<GoogleCalendarIgnoredResult> {
  const response = await postRawWebhook<GoogleCalendarIgnoredResult>(
    input.backend,
    "/webhooks/google-calendar",
    "",
    new Headers([
      ["x-goog-channel-id", `google-calendar-stale-channel-${input.marker}`],
      ["x-goog-channel-token", `google-calendar-stale-token-${input.marker}`],
      ["x-goog-resource-id", `google-calendar-stale-resource-${input.marker}`],
      ["x-goog-resource-state", "exists"],
      ["x-goog-message-number", "41"],
    ]),
  );
  assert.equal(response.status, 202);
  assert.equal(response.body.handled, false);
  assert.equal(response.body.ignored, true);
  assert.equal(response.body.reason, "unknown_channel");
  return response.body;
}

async function postMicrosoftGraphStale(input: {
  backend: BackendServerHandle;
  path: string;
  marker: string;
  provider: "outlook-mail" | "outlook-calendar" | "microsoft-onedrive" | "microsoft-sharepoint";
  resource: string;
}): Promise<IgnoredNotificationResult> {
  const response = await postJsonWebhook<IgnoredNotificationResult>(
    input.backend,
    input.path,
    {
      value: [
        {
          subscriptionId: `${input.provider}-stale-subscription-${input.marker}`,
          clientState: `${input.provider}-stale-client-state-${input.marker}`,
          changeType: "updated",
          resource: input.resource,
          resourceData: { id: `${input.provider}-resource-${input.marker}` },
        },
      ],
    },
    { "x-provider": input.provider },
  );
  assert.equal(response.status, 202);
  assert.equal(response.body.handled, false);
  assert.equal(response.body.ignoredNotifications, 1);
  assert.equal(response.body.enqueuedJobs, 0);
  return response.body;
}

async function postMondayStale(input: {
  backend: BackendServerHandle;
  marker: string;
}): Promise<MondayIgnoredResult> {
  const subscriptionId = `monday-stale-subscription-${input.marker}`;
  const response = await postJsonWebhook<MondayIgnoredResult>(
    input.backend,
    "/webhooks/monday",
    {
      event: {
        subscriptionId,
        boardId: "9213048756",
        pulseId: "9213048761",
        itemId: "9213048761",
        type: "change_column_value",
        triggerUuid: `monday-stale-trigger-${input.marker}`,
        triggerTime: new Date().toISOString(),
      },
    },
    {
      authorization: mondayAuthorizationHeader({
        audience: mondayWebhookPublicUrl(),
        signingSecret: backendApiEnv().mondaySigningSecret,
      }),
      "x-provider": "monday",
    },
  );
  assert.equal(response.status, 202);
  assert.equal(response.body.handled, false);
  assert.equal(response.body.ignored, true);
  assert.equal(response.body.subscriptionId, subscriptionId);
  assert.equal(response.body.reason, "unknown_subscription");
  return response.body;
}

async function createKnownOnedriveSubscription(input: {
  db: SupabaseServiceClient;
  connection: TestingConnection;
  marker: string;
}): Promise<TableRow<"provider_webhook_subscriptions">> {
  return upsertProviderWebhookSubscription(input.db, {
    profileId: PROFILE_ID,
    capabilityAccountLinkId: input.connection.capabilityAccountLink.id,
    connectedProviderAccountId: input.connection.connectedAccount.id,
    providerKey: MICROSOFT_ONEDRIVE_PROVIDER_KEY,
    adapterKey: MICROSOFT_ONEDRIVE_ADAPTER_KEY,
    externalSubscriptionId: `microsoft-onedrive-known-subscription-${input.marker}`,
    resourceType: MICROSOFT_ONEDRIVE_RESOURCE_TYPE,
    resourceId: `microsoft-onedrive-known-drive-${input.marker}`,
    eventScope: "driveItem.updated",
    status: "active",
    cursor: { deltaLink: `https://graph.microsoft.com/delta/${input.marker}`, initialized: true },
    providerState: {
      clientState: `microsoft-onedrive-known-client-state-${input.marker}`,
      resource: `/drives/microsoft-onedrive-known-drive-${input.marker}/root`,
      driveId: `microsoft-onedrive-known-drive-${input.marker}`,
      driveName: "Documents",
      driveWebUrl: "https://contoso-my.sharepoint.com/personal/testing/Documents",
      notificationUrl: "https://assistant.testing.local/webhooks/microsoft-onedrive",
    },
  });
}

async function createKnownGoogleCalendarSubscription(input: {
  db: SupabaseServiceClient;
  connection: TestingConnection;
  marker: string;
}): Promise<TableRow<"provider_webhook_subscriptions">> {
  return upsertProviderWebhookSubscription(input.db, {
    profileId: PROFILE_ID,
    capabilityAccountLinkId: input.connection.capabilityAccountLink.id,
    connectedProviderAccountId: input.connection.connectedAccount.id,
    providerKey: GOOGLE_CALENDAR_PROVIDER_KEY,
    adapterKey: GOOGLE_CALENDAR_ADAPTER_KEY,
    externalSubscriptionId: `google-calendar-known-channel-${input.marker}`,
    resourceType: "google.calendar",
    resourceId: `testing-calendar-${input.marker}`,
    eventScope: "events",
    status: "active",
    cursor: { syncToken: `google-calendar-sync-token-${input.marker}` },
    providerState: {
      nangoProviderConfigKey: input.connection.connectedAccount.nango_provider_config_key,
      nangoConnectionId: input.connection.connectedAccount.nango_connection_id,
      accountEmail: input.connection.connectedAccount.account_email,
      providerCalendarSummary: "Testing Calendar",
      channelToken: `google-calendar-known-token-${input.marker}`,
      resourceId: `google-calendar-known-resource-${input.marker}`,
      resourceUri: `https://www.googleapis.com/calendar/v3/calendars/testing-calendar-${input.marker}/events`,
    },
  });
}

test("provider webhooks acknowledge stale callbacks without creating deliveries or jobs.", async (t) => {
  const run = await createE2eRun(t, {
    id: "provider-webhook-stale-callbacks",
    requiredEnv: REQUIRED_ENV,
  });
  const supabase = await attachE2eSupabase(run);
  const backend = await startBackend(run, { supabase });
  const db = await useE2eDb();
  const marker = createMarker("provider-webhook-stale-callbacks");
  const subscriptionIds = new Set<string>();

  run.cleanup.add(async () => {
    for (const subscriptionId of subscriptionIds) {
      await deleteSubscriptionRows(db, subscriptionId);
    }
  });

  const deliveriesBefore = await countRows(db, "provider_webhook_deliveries");
  const jobsBefore = await countRows(db, "backend_jobs");

  await postGoogleCalendarStale({ backend, marker });
  await postMicrosoftGraphStale({
    backend,
    path: "/webhooks/outlook-mail",
    marker,
    provider: "outlook-mail",
    resource: "me/mailFolders('inbox')/messages/stale-message",
  });
  await postMicrosoftGraphStale({
    backend,
    path: "/webhooks/outlook-calendar",
    marker,
    provider: "outlook-calendar",
    resource: "me/events/stale-event",
  });
  await postMicrosoftGraphStale({
    backend,
    path: "/webhooks/microsoft-onedrive",
    marker,
    provider: "microsoft-onedrive",
    resource: "/drives/stale-onedrive/root",
  });
  await postMicrosoftGraphStale({
    backend,
    path: "/webhooks/microsoft-sharepoint",
    marker,
    provider: "microsoft-sharepoint",
    resource: "/sites/stale-sharepoint/drives/stale-drive/root",
  });
  await postMondayStale({ backend, marker });

  assert.equal(await countRows(db, "provider_webhook_deliveries"), deliveriesBefore);
  assert.equal(await countRows(db, "backend_jobs"), jobsBefore);

  const onedrive = await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: "microsoft-onedrive",
    provider: "microsoft-onedrive",
  });
  const onedriveSubscription = await createKnownOnedriveSubscription({
    db,
    connection: onedrive,
    marker,
  });
  subscriptionIds.add(onedriveSubscription.id);

  const badClientState = await fetch(`${backend.baseUrl}/webhooks/microsoft-onedrive`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-provider": "microsoft-onedrive" },
    body: JSON.stringify({
      value: [
        {
          subscriptionId: onedriveSubscription.external_subscription_id,
          clientState: `microsoft-onedrive-wrong-client-state-${marker}`,
          changeType: "updated",
          resource: `/drives/microsoft-onedrive-known-drive-${marker}/root`,
        },
      ],
    }),
  });
  assert.equal(badClientState.status, 401);
  assert.equal(await countRows(db, "provider_webhook_deliveries"), deliveriesBefore);
  assert.equal(await countRows(db, "backend_jobs"), jobsBefore);

  const googleCalendar = await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: "google-calendar",
    provider: "google-calendar",
  });
  const googleCalendarSubscription = await createKnownGoogleCalendarSubscription({
    db,
    connection: googleCalendar,
    marker,
  });
  subscriptionIds.add(googleCalendarSubscription.id);

  const badGoogleToken = await fetch(`${backend.baseUrl}/webhooks/google-calendar`, {
    method: "POST",
    headers: new Headers([
      ["x-goog-channel-id", googleCalendarSubscription.external_subscription_id ?? ""],
      ["x-goog-channel-token", `google-calendar-wrong-token-${marker}`],
      ["x-goog-resource-id", `google-calendar-known-resource-${marker}`],
      ["x-goog-resource-state", "exists"],
      ["x-goog-message-number", "42"],
    ]),
  });
  assert.equal(badGoogleToken.status, 401);
  assert.equal(await countRows(db, "provider_webhook_deliveries"), deliveriesBefore);
  assert.equal(await countRows(db, "backend_jobs"), jobsBefore);

  console.log(
    JSON.stringify(
      {
        ok: true,
        runId: run.runId,
        staleCallbacksIgnored: 6,
        authFailuresVerified: 2,
      },
      null,
      2,
    ),
  );
});
