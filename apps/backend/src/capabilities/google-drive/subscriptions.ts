import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  fetchGoogleDriveStartPageToken,
  listGoogleDriveFilesForState,
  stopGoogleDriveChannel,
  watchGoogleDriveChanges,
  type GoogleDriveFileStateSource,
} from "./nango-client";
import {
  deleteProviderWebhookSubscriptionAndDeliveries,
  loadProviderWebhookSubscriptionById,
  listProviderWebhookSubscriptionsByAdapter,
  patchProviderWebhookSubscription,
  upsertProviderWebhookSubscription,
  type ProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";
import { upsertProviderFileState } from "../../product/provider-files/provider-file-states";
import { backendApiEnv } from "../../shared/env";
import {
  GOOGLE_DRIVE_ADAPTER_KEY,
  GOOGLE_DRIVE_EVENT_SCOPE,
  GOOGLE_DRIVE_PROVIDER_KEY,
  GOOGLE_DRIVE_RESOURCE_TYPE,
  googleDriveCursor,
  googleDriveProviderState,
  listGoogleDriveSubscriptionsForConnectedAccount,
  requireGoogleDriveConnectionByConnectedProviderAccountId,
  type GoogleDriveConnectionContext,
} from "./connection";
import { enqueueGoogleDriveSubscriptionReconcileJob } from "./jobs";

const GOOGLE_DRIVE_WATCH_TTL_SECONDS = 6 * 24 * 60 * 60;
const GOOGLE_DRIVE_RENEW_BEFORE_EXPIRATION_MS = 24 * 60 * 60 * 1000;
const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function webhookUrl(): string {
  return `${backendApiEnv().backendPublicUrl}/webhooks/google-drive`;
}

function newChannelToken(): string {
  return randomBytes(32).toString("hex");
}

function channelExpiration(expiration: string | number | undefined): string | null {
  if (typeof expiration === "number" && Number.isFinite(expiration)) {
    return new Date(expiration).toISOString();
  }
  if (typeof expiration === "string" && expiration.trim()) {
    const numeric = Number(expiration);
    const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(expiration);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function nextRenewRunAfter(expiresAt: string | null): Date {
  if (!expiresAt) return new Date(Date.now() + 24 * 60 * 60 * 1000);
  const ms = new Date(expiresAt).getTime();
  if (!Number.isFinite(ms)) return new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Date(
    Math.max(Date.now() + 10 * 60 * 1000, ms - GOOGLE_DRIVE_RENEW_BEFORE_EXPIRATION_MS),
  );
}

function isFile(file: GoogleDriveFileStateSource): boolean {
  return file.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE;
}

function authFailureProjection(db: SupabaseServiceClient, connection: GoogleDriveConnectionContext) {
  return { db, account: connection.connectedProviderAccount };
}

async function deleteStoredSubscriptionIfPossible(input: {
  db: SupabaseServiceClient;
  connection: GoogleDriveConnectionContext;
  subscription: ProviderWebhookSubscription;
}): Promise<void> {
  const channelId = input.subscription.external_subscription_id?.trim();
  const providerState = googleDriveProviderState(input.subscription);
  if (channelId && providerState.resourceId) {
    try {
      await stopGoogleDriveChannel({
        providerConfigKey: input.connection.nangoProviderConfigKey,
        connectionId: input.connection.nangoConnectionId,
        authFailureProjection: authFailureProjection(input.db, input.connection),
        channelId,
        resourceId: providerState.resourceId,
      });
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== domainCodes.NOT_FOUND) throw error;
    }
  }
  await deleteProviderWebhookSubscriptionAndDeliveries(input.db, input.subscription.id);
}

export async function stopKnownGoogleDriveSubscriptionsBeforeDevReset(
  db: SupabaseServiceClient,
): Promise<{ stopped: number; deleted: number; skipped: number }> {
  const subscriptions = await listProviderWebhookSubscriptionsByAdapter({
    db,
    providerKey: GOOGLE_DRIVE_PROVIDER_KEY,
    adapterKey: GOOGLE_DRIVE_ADAPTER_KEY,
  });
  let stopped = 0;
  let deleted = 0;
  let skipped = 0;
  for (const subscription of subscriptions) {
    const channelId = subscription.external_subscription_id?.trim();
    const providerState = googleDriveProviderState(subscription);
    if (!channelId || !providerState.resourceId) {
      skipped += 1;
      continue;
    }
    const connection = await requireGoogleDriveConnectionByConnectedProviderAccountId(
      db,
      subscription.connected_provider_account_id,
    );
    await deleteStoredSubscriptionIfPossible({ db, connection, subscription });
    stopped += 1;
    deleted += 1;
  }
  return { stopped, deleted, skipped };
}

async function seedGoogleDriveFileStates(input: {
  db: SupabaseServiceClient;
  connection: GoogleDriveConnectionContext;
}): Promise<number> {
  let pageToken: string | undefined;
  let seeded = 0;
  do {
    const page = await listGoogleDriveFilesForState({
      providerConfigKey: input.connection.nangoProviderConfigKey,
      connectionId: input.connection.nangoConnectionId,
      authFailureProjection: authFailureProjection(input.db, input.connection),
      ...(pageToken ? { pageToken } : {}),
    });
    for (const file of page.files) {
      if (!isFile(file)) continue;
      await upsertProviderFileState(input.db, {
        profileId: input.connection.profileId,
        capabilityAccountLinkId: input.connection.capabilityAccountLinkId,
        connectedProviderAccountId: input.connection.connectedProviderAccount.id,
        providerKey: GOOGLE_DRIVE_PROVIDER_KEY,
        resourceType: GOOGLE_DRIVE_RESOURCE_TYPE,
        resourceId: input.connection.connectedProviderAccount.id,
        externalFileId: file.id,
        name: file.name ?? null,
        webUrl: file.webViewLink ?? null,
        mimeType: file.mimeType ?? null,
        etag: file.headRevisionId ?? null,
        ctag: null,
        parentReference: {
          parents: file.parents ?? [],
          driveId: file.driveId ?? null,
        },
        metadata: {
          fileFacet: true,
          driveId: file.driveId ?? null,
          createdTime: file.createdTime ?? null,
          modifiedTime: file.modifiedTime ?? null,
          trashed: file.trashed ?? false,
          starred: file.starred ?? null,
          description: file.description ?? null,
          size: file.size ?? null,
          md5Checksum: file.md5Checksum ?? null,
          headRevisionId: file.headRevisionId ?? null,
        },
        lastModifiedAt: file.modifiedTime ?? null,
        deletedAt: null,
      });
      seeded += 1;
    }
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken);
  return seeded;
}

export async function reconcileGoogleDriveSubscription(
  db: SupabaseServiceClient,
  input: { connectedProviderAccountId: string },
): Promise<Record<string, unknown>> {
  const connection = await requireGoogleDriveConnectionByConnectedProviderAccountId(
    db,
    input.connectedProviderAccountId,
  );
  const existingRows = await listGoogleDriveSubscriptionsForConnectedAccount(
    db,
    connection.connectedProviderAccount.id,
  );
  let deleted = 0;
  for (const row of existingRows) {
    await deleteStoredSubscriptionIfPossible({ db, connection, subscription: row });
    deleted += 1;
  }

  const pageToken = await fetchGoogleDriveStartPageToken({
    providerConfigKey: connection.nangoProviderConfigKey,
    connectionId: connection.nangoConnectionId,
    authFailureProjection: authFailureProjection(db, connection),
  });
  const channelId = randomUUID();
  const channelToken = newChannelToken();
  const address = webhookUrl();
  const watch = await watchGoogleDriveChanges({
    providerConfigKey: connection.nangoProviderConfigKey,
    connectionId: connection.nangoConnectionId,
    authFailureProjection: authFailureProjection(db, connection),
    pageToken,
    channelId,
    channelToken,
    address,
    ttlSeconds: GOOGLE_DRIVE_WATCH_TTL_SECONDS,
  });

  const expiresAt = channelExpiration(watch.expiration);
  const runAfter = nextRenewRunAfter(expiresAt);
  const subscription = await upsertProviderWebhookSubscription(db, {
    profileId: connection.profileId,
    capabilityAccountLinkId: connection.capabilityAccountLinkId,
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    providerKey: GOOGLE_DRIVE_PROVIDER_KEY,
    adapterKey: GOOGLE_DRIVE_ADAPTER_KEY,
    externalSubscriptionId: watch.id,
    resourceType: GOOGLE_DRIVE_RESOURCE_TYPE,
    resourceId: connection.connectedProviderAccount.id,
    eventScope: GOOGLE_DRIVE_EVENT_SCOPE,
    status: "active",
    expiresAt,
    nextReconcileAt: runAfter.toISOString(),
    cursor: { pageToken, initialized: false },
    providerState: {
      channelToken,
      resourceId: watch.resourceId,
      resourceUri: watch.resourceUri ?? null,
      accountEmail: connection.accountEmail,
      watchAddress: address,
    },
    lastErrorCode: null,
    lastErrorMessage: null,
  });

  let seeded = 0;
  try {
    seeded = await seedGoogleDriveFileStates({ db, connection });
  } catch (error) {
    await stopGoogleDriveChannel({
      providerConfigKey: connection.nangoProviderConfigKey,
      connectionId: connection.nangoConnectionId,
      authFailureProjection: authFailureProjection(db, connection),
      channelId: watch.id,
      resourceId: watch.resourceId,
    });
    await deleteProviderWebhookSubscriptionAndDeliveries(db, subscription.id);
    throw error;
  }

  const latestSubscription = await loadProviderWebhookSubscriptionById(db, subscription.id);
  const latestCursor = googleDriveCursor(latestSubscription);
  await patchProviderWebhookSubscription(db, subscription.id, {
    cursor: { pageToken: latestCursor.pageToken ?? pageToken, initialized: true },
    last_error_code: null,
    last_error_message: null,
  });
  const nextRun = await enqueueGoogleDriveSubscriptionReconcileJob(db, {
    profileId: connection.profileId,
    capabilityAccountLinkId: connection.capabilityAccountLinkId,
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    runAfter,
  });
  return {
    subscriptionId: subscription.id,
    deleted,
    seeded,
    ...(nextRun.enqueued
      ? {
          nextReconcileJobId: nextRun.jobId,
          joinedExistingNextReconcileJob: nextRun.joinedExistingJob,
        }
      : { nextReconcileSkippedReason: nextRun.reason }),
  };
}
