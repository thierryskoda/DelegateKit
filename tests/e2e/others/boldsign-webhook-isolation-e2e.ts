#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  registerProviderWebhookAdapter,
  upsertProviderWebhookSubscription,
  type ProviderWebhookReceiveResult,
} from "../../../apps/backend/src/test-support/provider-webhooks";
import { providerWebhookAdapters } from "../../../apps/backend/src/test-support/provider-webhooks";
import { runWorkerJobById } from "../../../apps/backend/src/test-support/worker";
import { backendApiEnv } from "../../../apps/backend/src/test-support/env";
import {
  BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY,
  BOLDSIGN_WEBHOOK_EVENT_SCOPE,
  BOLDSIGN_WEBHOOK_PROVIDER_KEY,
  BOLDSIGN_WEBHOOK_RESOURCE_TYPE,
} from "../../../apps/backend/src/test-support/capabilities/boldsign";
import { startBackend, type BackendServerHandle } from "../helpers/processes/start-backend";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { useE2eDb } from "../helpers/db/e2e-db";
import { enableTestingProviderSandboxBinding } from "../helpers/provider-runtime/testing-provider-runtime";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import { boldSignWebhookSignatureHeader, postRawWebhook } from "../helpers/webhooks/http-webhooks";

const PROFILE_ID = "testing";
const EVENT_TYPE = "boldsign.signature_request.changed";
const REQUIRED_ENV = ["BOLDSIGN_WEBHOOK_SIGNING_SECRET"] as const;

for (const adapter of providerWebhookAdapters) {
  registerProviderWebhookAdapter(adapter);
}

type QueuedBoldSignWebhookResult = ProviderWebhookReceiveResult & {
  backendJobId: string;
  joinedExistingJob?: boolean;
};

type IgnoredBoldSignWebhookResult = {
  ok: true;
  handled: false;
  ignored: true;
  reason: string;
};

async function deleteRoute(db: SupabaseServiceClient): Promise<void> {
  const deleted = await db
    .from("profile_assistant_work_routes")
    .delete()
    .eq("profile_id", PROFILE_ID)
    .eq("event_type", EVENT_TYPE)
    .is("connected_provider_account_id", null);
  if (deleted.error) throw deleted.error;
}

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

async function restoreRoute(
  db: SupabaseServiceClient,
  original: TableRow<"profile_assistant_work_routes"> | null,
): Promise<void> {
  await deleteRoute(db);
  if (!original) return;
  const restored = await db.from("profile_assistant_work_routes").insert(original);
  if (restored.error) throw restored.error;
}

async function createRoute(input: {
  db: SupabaseServiceClient;
  marker: string;
}): Promise<TableRow<"profile_assistant_work_routes">> {
  await deleteRoute(input.db);
  const result = await input.db
    .from("profile_assistant_work_routes")
    .insert({
      profile_id: PROFILE_ID,
      event_type: EVENT_TYPE,
      config: {
        instructions: `BoldSign webhook isolation route ${input.marker}. Do not message the user.`,
        priority: 2,
      },
      managed_by: "profile",
    })
    .select()
    .single();
  return requireSupabaseData("Create BoldSign webhook route", result.data, result.error);
}

async function countWorkItems(db: SupabaseServiceClient): Promise<number> {
  const result = await db
    .from("assistant_work_items")
    .select("id")
    .eq("profile_id", PROFILE_ID)
    .eq("kind", EVENT_TYPE);
  return requireSupabaseData("Count BoldSign work items", result.data, result.error).length;
}

async function postBoldSignWebhook(input: {
  backend: BackendServerHandle;
  signingSecret: string;
  body: unknown;
}): Promise<ProviderWebhookReceiveResult | IgnoredBoldSignWebhookResult> {
  const rawBody = JSON.stringify(input.body);
  const response = await postRawWebhook<
    ProviderWebhookReceiveResult | IgnoredBoldSignWebhookResult
  >(input.backend, "/webhooks/boldsign", rawBody, {
    "content-type": "application/json",
    "x-boldsign-signature": boldSignWebhookSignatureHeader({
      rawBody,
      signingSecret: input.signingSecret,
    }),
    "x-e2e": "boldsign-webhook-isolation",
  });
  assert.equal(response.status, 202);
  return response.body;
}

function requireQueuedWebhookResult(
  result: ProviderWebhookReceiveResult | IgnoredBoldSignWebhookResult,
): QueuedBoldSignWebhookResult {
  assert.ok(
    "backendJobId" in result && typeof result.backendJobId === "string",
    `Expected BoldSign webhook backend job, got ${JSON.stringify(result)}`,
  );
  return result as QueuedBoldSignWebhookResult;
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
    "Load BoldSign webhook deliveries for cleanup",
    deliveryResult.data,
    deliveryResult.error,
  );
  for (const delivery of deliveries) input.createdRows.deliveries.add(delivery.id);
}

async function loadWorkItemsByDocumentId(input: {
  db: SupabaseServiceClient;
  documentId: string;
}): Promise<TableRow<"assistant_work_items">[]> {
  const result = await input.db
    .from("assistant_work_items")
    .select()
    .eq("profile_id", PROFILE_ID)
    .eq("kind", EVENT_TYPE)
    .contains("payload", { documentId: input.documentId });
  return requireSupabaseData("Load BoldSign webhook work items", result.data, result.error);
}

function boldSignWebhookBody(input: {
  eventId: string;
  documentId: string;
  title: string;
  status: string;
  signerEmail: string;
}): Record<string, unknown> {
  return {
    event: {
      id: input.eventId,
      eventType: "Completed",
      created: Math.floor(Date.now() / 1000),
      environment: "Sandbox",
      clientId: "ai-assistants-e2e",
    },
    data: {
      documentId: input.documentId,
      documentTitle: input.title,
      status: input.status,
      senderDetail: { emailAddress: "operations@northstar-residential.example" },
      signerDetails: [
        {
          id: "signer-1",
          signerName: "Jordan Rowan",
          signerEmail: input.signerEmail,
          status: "Completed",
          isDeliveryFailed: false,
          isViewed: true,
        },
      ],
    },
    context: {
      source: "boldsign-signature-request-webhook",
    },
  };
}

test("BoldSign webhooks route only assigned document ownership and ignore unknown documents.", async (t) => {
  const run = await createE2eRun(t, {
    id: "boldsign-webhook-isolation",
    requiredEnv: REQUIRED_ENV,
  });
  const supabase = await attachE2eSupabase(run);
  const backend = await startBackend(run, { supabase });
  const db = await useE2eDb();
  const marker = createMarker("boldsign-webhook");
  const originalRoute = await loadRoute(db);
  const createdRows = {
    backendJobs: new Set<string>(),
    deliveries: new Set<string>(),
    workItems: new Set<string>(),
    ownershipRows: new Set<string>(),
    subscriptions: new Set<string>(),
  };

  run.cleanup.add(async () => {
    for (const id of createdRows.workItems)
      await db.from("assistant_work_items").delete().eq("id", id);
    for (const id of createdRows.deliveries)
      await db.from("provider_webhook_deliveries").delete().eq("id", id);
    for (const id of createdRows.backendJobs) await db.from("backend_jobs").delete().eq("id", id);
    for (const id of createdRows.ownershipRows)
      await db.from("boldsign_documents").delete().eq("id", id);
    for (const id of createdRows.subscriptions)
      await db.from("provider_webhook_subscriptions").delete().eq("id", id);
    await restoreRoute(db, originalRoute);
  });

  await createRoute({ db, marker });
  const connection = await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: "boldsign",
    provider: "boldsign",
  });
  const subscription = await upsertProviderWebhookSubscription(db, {
    profileId: PROFILE_ID,
    capabilityAccountLinkId: connection.capabilityAccountLink.id,
    connectedProviderAccountId: connection.connectedAccount.id,
    providerKey: BOLDSIGN_WEBHOOK_PROVIDER_KEY,
    adapterKey: BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY,
    externalSubscriptionId: `boldsign-subscription-${marker}`,
    resourceType: BOLDSIGN_WEBHOOK_RESOURCE_TYPE,
    resourceId: connection.connectedAccount.id,
    eventScope: BOLDSIGN_WEBHOOK_EVENT_SCOPE,
    status: "active",
    providerState: {
      accountEmail: connection.connectedAccount.account_email,
      credentialKind: "backend_secret",
      managedCredential: "BOLDSIGN_API_KEY",
      webhookUrl: `${backend.baseUrl}/webhooks/boldsign`,
    },
  });
  createdRows.subscriptions.add(subscription.id);

  const ownedDocumentId = `bs-owned-${marker}`;
  const unknownDocumentId = `bs-unknown-${marker}`;
  const ownershipResult = await db
    .from("boldsign_documents")
    .insert({
      profile_id: PROFILE_ID,
      capability_account_link_id: connection.capabilityAccountLink.id,
      connected_provider_account_id: connection.connectedAccount.id,
      provider_account_id: connection.connectedAccount.provider_account_id,
      document_id: ownedDocumentId,
      source: "maintainer_import",
      ownership_status: "assigned",
      provider_status: "InProgress",
      title: `Jordan Rowan mandate ${marker}`,
      signer_email: "jordan.rowan@northstar-residential.example",
      provider_metadata: { e2e: "boldsign-webhook-isolation", marker },
    })
    .select()
    .single();
  const ownership = requireSupabaseData(
    "Create BoldSign webhook ownership row",
    ownershipResult.data,
    ownershipResult.error,
  );
  createdRows.ownershipRows.add(ownership.id);

  const workItemsBefore = await countWorkItems(db);
  const ownedResult = await postBoldSignWebhook({
    backend,
    signingSecret: backendApiEnv().boldSignWebhookSigningSecret,
    body: boldSignWebhookBody({
      eventId: `owned-${marker}`,
      documentId: ownedDocumentId,
      title: `Jordan Rowan mandate ${marker}`,
      status: "Completed",
      signerEmail: "jordan.rowan@northstar-residential.example",
    }),
  });
  const ownedQueued = requireQueuedWebhookResult(ownedResult);
  await trackDeliveryAndJob({ db, backendJobId: ownedQueued.backendJobId, createdRows });
  const ownedProcessed = await runWorkerJobById({
    db,
    jobId: ownedQueued.backendJobId,
    workerId: "e2e-boldsign-webhook-isolation",
  });
  assert.equal(ownedProcessed.status, "succeeded");
  assert.ok(
    "result" in ownedProcessed,
    `Expected worker result, got ${JSON.stringify(ownedProcessed)}`,
  );
  assert.equal(ownedProcessed.result.enqueuedWorkItems, 1);

  const ownedWorkItems = await loadWorkItemsByDocumentId({ db, documentId: ownedDocumentId });
  for (const workItem of ownedWorkItems) createdRows.workItems.add(workItem.id);
  assert.equal(ownedWorkItems.length, 1);
  assert.equal(ownedWorkItems[0]!.profile_id, PROFILE_ID);
  assert.deepEqual(ownedWorkItems[0]!.payload, {
    ...(ownedWorkItems[0]!.payload as Record<string, unknown>),
    connectedProviderAccountId: connection.connectedAccount.id,
  });

  const updatedOwnershipResult = await db
    .from("boldsign_documents")
    .select()
    .eq("id", ownership.id)
    .single();
  const updatedOwnership = requireSupabaseData(
    "Load updated BoldSign ownership row",
    updatedOwnershipResult.data,
    updatedOwnershipResult.error,
  );
  assert.equal(updatedOwnership.provider_status, "Completed");
  assert.equal(updatedOwnership.ownership_status, "assigned");
  assert.ok(updatedOwnership.completed_at);

  const unknownResult = await postBoldSignWebhook({
    backend,
    signingSecret: backendApiEnv().boldSignWebhookSigningSecret,
    body: boldSignWebhookBody({
      eventId: `unknown-${marker}`,
      documentId: unknownDocumentId,
      title: `Unassigned Ridgeway renewal ${marker}`,
      status: "Completed",
      signerEmail: "amelia.chen@ridgeway-capital.example",
    }),
  });
  assert.ok("ignored" in unknownResult && unknownResult.ignored);
  assert.equal(unknownResult.reason, "no_assigned_boldsign_document_ownership");
  assert.equal(await countWorkItems(db), workItemsBefore + 1);
  assert.equal((await loadWorkItemsByDocumentId({ db, documentId: unknownDocumentId })).length, 0);
});
