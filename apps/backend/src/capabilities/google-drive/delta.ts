import type { BackendJob } from "@ai-assistants/backend-jobs";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError } from "@ai-assistants/errors";
import type { ProviderAssistantWorkEventType } from "@ai-assistants/tool-contracts";
import { z } from "zod";
import { loadProviderWebhookSubscriptionById, patchProviderWebhookSubscription } from "../../integrations/provider-webhooks/substrate";
import {
  loadProviderFileState,
  upsertProviderFileState,
  type ProviderFileState,
} from "../../product/provider-files/provider-file-states";
import {
  GOOGLE_DRIVE_PROVIDER_KEY,
  GOOGLE_DRIVE_RESOURCE_TYPE,
  googleDriveCursor,
  markGoogleDriveSubscriptionUnhealthy,
  requireGoogleDriveConnectionByConnectedProviderAccountId,
} from "./connection";
import { enqueueGoogleDriveSubscriptionReconcileJob } from "./jobs";
import { recordGoogleDriveFileEventAndEnqueueWorkItem } from "./file-events";
import { listGoogleDriveChanges, type GoogleDriveChange, type GoogleDriveFileStateSource } from "./nango-client";

const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

type GoogleDriveFileEventType = Extract<
  ProviderAssistantWorkEventType,
  "google_drive.file.created" | "google_drive.file.updated" | "google_drive.file.deleted"
>;

function providerHttpStatus(error: unknown): number | null {
  if (!(error instanceof DomainError)) return null;
  const details = z
    .object({ httpStatus: z.number().nullable().optional() })
    .passthrough()
    .safeParse(error.details);
  return details.success ? (details.data.httpStatus ?? null) : null;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function existingWasFile(state: ProviderFileState): boolean {
  return recordValue(state.metadata).fileFacet === true;
}

function isFolder(file: GoogleDriveFileStateSource | undefined): boolean {
  return file?.mimeType === GOOGLE_DRIVE_FOLDER_MIME_TYPE;
}

function metadataChanged(input: {
  file: GoogleDriveFileStateSource;
  existing: ProviderFileState;
}): boolean {
  const existingParents = recordValue(input.existing.parent_reference).parents;
  return (
    (input.file.name ?? null) !== input.existing.name ||
    (input.file.webViewLink ?? null) !== input.existing.web_url ||
    (input.file.mimeType ?? null) !== input.existing.mime_type ||
    (input.file.headRevisionId ?? null) !== input.existing.etag ||
    (input.file.modifiedTime ?? null) !== input.existing.last_modified_at ||
    JSON.stringify(input.file.parents ?? []) !== JSON.stringify(Array.isArray(existingParents) ? existingParents : [])
  );
}

function eventPayload(input: {
  accountEmail: string | null;
  connectedProviderAccountId: string;
  fileId: string;
  change: GoogleDriveChange;
  file?: GoogleDriveFileStateSource;
  existing?: ProviderFileState | null;
}): Record<string, unknown> {
  const metadata = recordValue(input.existing?.metadata);
  return {
    provider: GOOGLE_DRIVE_PROVIDER_KEY,
    connectedProviderAccountId: input.connectedProviderAccountId,
    accountEmail: input.accountEmail,
    fileId: input.fileId,
    name: input.file?.name ?? input.existing?.name ?? null,
    webUrl: input.file?.webViewLink ?? input.existing?.web_url ?? null,
    mimeType: input.file?.mimeType ?? input.existing?.mime_type ?? null,
    parents: input.file?.parents ?? recordValue(input.existing?.parent_reference).parents ?? [],
    driveId: input.file?.driveId ?? metadata.driveId ?? null,
    createdTime: input.file?.createdTime ?? metadata.createdTime ?? null,
    modifiedTime: input.file?.modifiedTime ?? input.existing?.last_modified_at ?? null,
    trashed: input.file?.trashed ?? metadata.trashed ?? null,
    removed: input.change.removed ?? false,
    starred: input.file?.starred ?? metadata.starred ?? null,
    description: input.file?.description ?? metadata.description ?? null,
    size: input.file?.size ?? metadata.size ?? null,
    md5Checksum: input.file?.md5Checksum ?? metadata.md5Checksum ?? null,
    headRevisionId: input.file?.headRevisionId ?? input.existing?.etag ?? null,
    changeType: input.change.changeType ?? null,
    changeTime: input.change.time ?? null,
  };
}

async function processChange(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccountId: string;
  accountEmail: string | null;
  pageToken: string;
  initialized: boolean;
  change: GoogleDriveChange;
}): Promise<{ routed: number; eventType: GoogleDriveFileEventType | null }> {
  const file = input.change.file;
  const fileId = input.change.fileId ?? file?.id;
  if (!fileId) return { routed: 0, eventType: null };
  const existing = await loadProviderFileState({
    db: input.db,
    connectedProviderAccountId: input.connectedProviderAccountId,
    providerKey: GOOGLE_DRIVE_PROVIDER_KEY,
    resourceType: GOOGLE_DRIVE_RESOURCE_TYPE,
    resourceId: input.connectedProviderAccountId,
    externalFileId: fileId,
  });
  if (isFolder(file)) return { routed: 0, eventType: null };
  const isDeleted = input.change.removed === true || file?.trashed === true;
  const isFile = Boolean(file) || (isDeleted && existing ? existingWasFile(existing) : false);
  if (!isFile) return { routed: 0, eventType: null };

  const occurredAt = input.change.time ?? file?.modifiedTime ?? new Date().toISOString();
  const metadata = recordValue(existing?.metadata);
  await upsertProviderFileState(input.db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    connectedProviderAccountId: input.connectedProviderAccountId,
    providerKey: GOOGLE_DRIVE_PROVIDER_KEY,
    resourceType: GOOGLE_DRIVE_RESOURCE_TYPE,
    resourceId: input.connectedProviderAccountId,
    externalFileId: fileId,
    name: file?.name ?? existing?.name ?? null,
    webUrl: file?.webViewLink ?? existing?.web_url ?? null,
    mimeType: file?.mimeType ?? existing?.mime_type ?? null,
    etag: file?.headRevisionId ?? existing?.etag ?? null,
    ctag: null,
    parentReference: {
      parents: file?.parents ?? recordValue(existing?.parent_reference).parents ?? [],
      driveId: file?.driveId ?? metadata.driveId ?? null,
    },
    metadata: {
      fileFacet: true,
      driveId: file?.driveId ?? metadata.driveId ?? null,
      createdTime: file?.createdTime ?? metadata.createdTime ?? null,
      modifiedTime: file?.modifiedTime ?? metadata.modifiedTime ?? null,
      trashed: file?.trashed ?? (isDeleted ? true : metadata.trashed ?? false),
      starred: file?.starred ?? metadata.starred ?? null,
      description: file?.description ?? metadata.description ?? null,
      size: file?.size ?? metadata.size ?? null,
      md5Checksum: file?.md5Checksum ?? metadata.md5Checksum ?? null,
      headRevisionId: file?.headRevisionId ?? existing?.etag ?? null,
      removed: input.change.removed ?? false,
    },
    lastModifiedAt: file?.modifiedTime ?? existing?.last_modified_at ?? null,
    deletedAt: isDeleted ? new Date().toISOString() : null,
  });
  if (!input.initialized) return { routed: 0, eventType: null };

  if (!isDeleted && existing && !existing.deleted_at && file && !metadataChanged({ file, existing })) {
    return { routed: 0, eventType: null };
  }
  const eventType: GoogleDriveFileEventType = isDeleted
    ? "google_drive.file.deleted"
    : !existing || existing.deleted_at
      ? "google_drive.file.created"
      : "google_drive.file.updated";
  const routed = await recordGoogleDriveFileEventAndEnqueueWorkItem(input.db, {
    profileId: input.profileId,
    connectedProviderAccountId: input.connectedProviderAccountId,
    eventType,
    dedupeKey: `${eventType}:${input.connectedProviderAccountId}:${fileId}:${input.change.time ?? input.pageToken}`,
    payload: eventPayload({
      accountEmail: input.accountEmail,
      connectedProviderAccountId: input.connectedProviderAccountId,
      fileId,
      change: input.change,
      ...(file ? { file } : {}),
      existing,
    }),
    occurredAt,
  });
  return { routed: routed.enqueuedWorkItem ? 1 : 0, eventType };
}

export async function processGoogleDriveDeltaJob(
  db: SupabaseServiceClient,
  input: { job: BackendJob; subscriptionId: string },
): Promise<Record<string, unknown>> {
  const subscription = await loadProviderWebhookSubscriptionById(db, input.subscriptionId);
  const connection = await requireGoogleDriveConnectionByConnectedProviderAccountId(
    db,
    subscription.connected_provider_account_id,
  );
  const cursor = googleDriveCursor(subscription);
  if (!cursor.pageToken) {
    await markGoogleDriveSubscriptionUnhealthy(db, {
      subscriptionId: subscription.id,
      error: "google_drive_missing_page_token",
    });
    await enqueueGoogleDriveSubscriptionReconcileJob(db, {
      profileId: connection.profileId,
      capabilityAccountLinkId: connection.capabilityAccountLinkId,
      connectedProviderAccountId: connection.connectedProviderAccount.id,
    });
    return { items: 0, status: "unhealthy", reason: "missing_page_token" };
  }

  let pageToken = cursor.pageToken;
  let finalPageToken: string | null = null;
  let items = 0;
  let routed = 0;
  let created = 0;
  let updated = 0;
  let deleted = 0;
  try {
    do {
      const page = await listGoogleDriveChanges({
        providerConfigKey: connection.nangoProviderConfigKey,
        connectionId: connection.nangoConnectionId,
        authFailureProjection: { db, account: connection.connectedProviderAccount },
        pageToken,
      });
      for (const change of page.changes) {
        items += 1;
        const result = await processChange({
          db,
          profileId: connection.profileId,
          capabilityAccountLinkId: connection.capabilityAccountLinkId,
          connectedProviderAccountId: connection.connectedProviderAccount.id,
          accountEmail: connection.accountEmail,
          pageToken,
          initialized: cursor.initialized,
          change,
        });
        routed += result.routed;
        if (result.eventType === "google_drive.file.created") created += 1;
        if (result.eventType === "google_drive.file.updated") updated += 1;
        if (result.eventType === "google_drive.file.deleted") deleted += 1;
      }
      pageToken = page.nextPageToken ?? "";
      finalPageToken = page.newStartPageToken ?? finalPageToken;
    } while (pageToken);
  } catch (error) {
    if (providerHttpStatus(error) === 410) {
      await markGoogleDriveSubscriptionUnhealthy(db, {
        subscriptionId: subscription.id,
        error: "google_drive_page_token_expired",
      });
      await enqueueGoogleDriveSubscriptionReconcileJob(db, {
        profileId: connection.profileId,
        capabilityAccountLinkId: connection.capabilityAccountLinkId,
        connectedProviderAccountId: connection.connectedProviderAccount.id,
      });
      return { items, status: "unhealthy", reason: "page_token_expired" };
    }
    throw error;
  }

  await patchProviderWebhookSubscription(db, subscription.id, {
    status: "active",
    cursor: { pageToken: finalPageToken ?? cursor.pageToken, initialized: true },
    last_success_at: new Date().toISOString(),
    last_error_code: null,
    last_error_message: null,
  });
  return { items, routed, created, updated, deleted, initialized: true };
}
