import type { BackendJob } from "@ai-assistants/backend-jobs";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  fetchMicrosoftGraphDriveDelta,
  type MicrosoftGraphDriveItem,
} from "../../integrations/microsoft-graph/drive-webhooks";
import {
  loadProviderWebhookSubscriptionById,
  patchProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";
import {
  loadProviderFileState,
  upsertProviderFileState,
  type ProviderFileState,
} from "../../product/provider-files/provider-file-states";
import {
  MICROSOFT_ONEDRIVE_PROVIDER_KEY,
  MICROSOFT_ONEDRIVE_RESOURCE_TYPE,
  microsoftOnedriveCursor,
  microsoftOnedriveProviderState,
  requireMicrosoftOnedriveConnectionByConnectedProviderAccountId,
} from "./connection";
import { recordMicrosoftOnedriveFileEventAndEnqueueWorkItem } from "./file-events";

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function existingWasFile(state: ProviderFileState): boolean {
  return recordValue(state.metadata).fileFacet === true;
}

function itemMimeType(item: MicrosoftGraphDriveItem): string | null {
  const mimeType = item.file?.mimeType;
  return typeof mimeType === "string" && mimeType.trim() ? mimeType.trim() : null;
}

function eventPayload(input: {
  accountEmail: string | null;
  connectedProviderAccountId: string;
  driveId: string;
  driveName: string | null;
  item: MicrosoftGraphDriveItem;
  existing?: ProviderFileState | null;
}): Record<string, unknown> {
  return {
    provider: MICROSOFT_ONEDRIVE_PROVIDER_KEY,
    connectedProviderAccountId: input.connectedProviderAccountId,
    accountEmail: input.accountEmail,
    driveId: input.driveId,
    driveName: input.driveName,
    itemId: input.item.id,
    name: input.item.name ?? input.existing?.name ?? null,
    webUrl: input.item.webUrl ?? input.existing?.web_url ?? null,
    mimeType: itemMimeType(input.item) ?? input.existing?.mime_type ?? null,
    eTag: input.item.eTag ?? input.existing?.etag ?? null,
    cTag: input.item.cTag ?? input.existing?.ctag ?? null,
    lastModifiedDateTime: input.item.lastModifiedDateTime ?? input.existing?.last_modified_at ?? null,
    parentReference: input.item.parentReference ?? input.existing?.parent_reference ?? {},
    file: input.item.file ?? null,
    folder: input.item.folder ?? null,
  };
}

async function processDeltaItem(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccountId: string;
  accountEmail: string | null;
  driveId: string;
  driveName: string | null;
  initialized: boolean;
  item: MicrosoftGraphDriveItem;
}): Promise<{ routed: number; eventType: string | null }> {
  const existing = await loadProviderFileState({
    db: input.db,
    connectedProviderAccountId: input.connectedProviderAccountId,
    providerKey: MICROSOFT_ONEDRIVE_PROVIDER_KEY,
    resourceType: MICROSOFT_ONEDRIVE_RESOURCE_TYPE,
    resourceId: input.driveId,
    externalFileId: input.item.id,
  });
  const isDeleted = Boolean(input.item.deleted);
  const isFile = Boolean(input.item.file) || (isDeleted && existing ? existingWasFile(existing) : false);
  if (!isFile) return { routed: 0, eventType: null };

  const occurredAt = input.item.lastModifiedDateTime ?? new Date().toISOString();
  const deletedAt = isDeleted ? new Date().toISOString() : null;
  await upsertProviderFileState(input.db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    connectedProviderAccountId: input.connectedProviderAccountId,
    providerKey: MICROSOFT_ONEDRIVE_PROVIDER_KEY,
    resourceType: MICROSOFT_ONEDRIVE_RESOURCE_TYPE,
    resourceId: input.driveId,
    externalFileId: input.item.id,
    name: input.item.name ?? existing?.name ?? null,
    webUrl: input.item.webUrl ?? existing?.web_url ?? null,
    mimeType: itemMimeType(input.item) ?? existing?.mime_type ?? null,
    etag: input.item.eTag ?? existing?.etag ?? null,
    ctag: input.item.cTag ?? existing?.ctag ?? null,
    parentReference: input.item.parentReference ?? recordValue(existing?.parent_reference),
    metadata: {
      fileFacet: true,
      file: input.item.file ?? recordValue(existing?.metadata).file ?? null,
      deleted: input.item.deleted ?? null,
    },
    lastModifiedAt: input.item.lastModifiedDateTime ?? existing?.last_modified_at ?? null,
    deletedAt,
  });
  if (!input.initialized) return { routed: 0, eventType: null };

  const eventType = isDeleted
    ? "microsoft_onedrive.file.deleted"
    : !existing || existing.deleted_at
      ? "microsoft_onedrive.file.created"
      : "microsoft_onedrive.file.updated";
  const routed = await recordMicrosoftOnedriveFileEventAndEnqueueWorkItem(input.db, {
    profileId: input.profileId,
    connectedProviderAccountId: input.connectedProviderAccountId,
    eventType,
    dedupeKey: `${eventType}:${input.connectedProviderAccountId}:${input.driveId}:${input.item.id}:${occurredAt}`,
    payload: eventPayload({
      accountEmail: input.accountEmail,
      connectedProviderAccountId: input.connectedProviderAccountId,
      driveId: input.driveId,
      driveName: input.driveName,
      item: input.item,
      existing,
    }),
    occurredAt,
  });
  return {
    routed: routed.enqueuedWorkItem ? 1 : 0,
    eventType,
  };
}

export async function processMicrosoftOnedriveDeltaJob(
  db: SupabaseServiceClient,
  input: { job: BackendJob; subscriptionId: string },
): Promise<Record<string, unknown>> {
  const subscription = await loadProviderWebhookSubscriptionById(db, input.subscriptionId);
  const connection = await requireMicrosoftOnedriveConnectionByConnectedProviderAccountId(
    db,
    subscription.connected_provider_account_id,
  );
  const providerState = microsoftOnedriveProviderState(subscription);
  const initialCursor = microsoftOnedriveCursor(subscription);
  let link: string | null = initialCursor.deltaLink;
  let initialized = initialCursor.initialized;
  let finalDeltaLink: string | null = null;
  let items = 0;
  let routed = 0;
  let created = 0;
  let updated = 0;
  let deleted = 0;
  do {
    const page = await fetchMicrosoftGraphDriveDelta({
      providerConfigKey: connection.nangoProviderConfigKey,
      connectionId: connection.nangoConnectionId,
      driveId: providerState.driveId,
      deltaLink: link,
    });
    for (const item of page.items) {
      items += 1;
      const result = await processDeltaItem({
        db,
        profileId: connection.profileId,
        capabilityAccountLinkId: connection.capabilityAccountLinkId,
        connectedProviderAccountId: connection.connectedProviderAccount.id,
        accountEmail: connection.accountEmail,
        driveId: providerState.driveId,
        driveName: providerState.driveName,
        initialized,
        item,
      });
      routed += result.routed;
      if (result.eventType === "microsoft_onedrive.file.created") created += 1;
      if (result.eventType === "microsoft_onedrive.file.updated") updated += 1;
      if (result.eventType === "microsoft_onedrive.file.deleted") deleted += 1;
    }
    link = page.nextLink;
    finalDeltaLink = page.deltaLink ?? finalDeltaLink;
  } while (link);
  if (finalDeltaLink) initialized = true;
  await patchProviderWebhookSubscription(db, subscription.id, {
    status: "active",
    cursor: { deltaLink: finalDeltaLink ?? initialCursor.deltaLink, initialized },
    last_success_at: new Date().toISOString(),
    last_error_code: null,
    last_error_message: null,
  });
  return { items, routed, created, updated, deleted, initialized };
}
