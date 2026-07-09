import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes, formatUnknownError } from "@ai-assistants/errors";
import {
  createMicrosoftGraphDriveRootSubscription,
  deleteMicrosoftGraphSubscription,
  listMicrosoftGraphSiteDrives,
  listMicrosoftGraphSites,
  microsoftGraphSubscriptionExpiration,
  microsoftGraphSubscriptionRenewAfter,
  newMicrosoftGraphClientState,
  renewMicrosoftGraphSubscription,
  type MicrosoftGraphDrive,
  type MicrosoftGraphSite,
} from "../../integrations/microsoft-graph/drive-webhooks";
import {
  deleteProviderWebhookSubscriptionAndDeliveries,
  patchProviderWebhookSubscription,
  upsertProviderWebhookSubscription,
  type ProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";
import { backendApiEnv } from "../../shared/env";
import {
  MICROSOFT_SHAREPOINT_ADAPTER_KEY,
  MICROSOFT_SHAREPOINT_PROVIDER_KEY,
  MICROSOFT_SHAREPOINT_RESOURCE_TYPE,
  listMicrosoftSharepointSubscriptionsForConnectedAccount,
  microsoftSharepointProviderState,
  requireMicrosoftSharepointConnectionByConnectedProviderAccountId,
} from "./connection";
import { enqueueMicrosoftSharepointSubscriptionReconcileJob } from "./jobs";

const EVENT_SCOPE = "driveItem.updated";

function webhookUrl(): string {
  return `${backendApiEnv().backendPublicUrl}/webhooks/microsoft-sharepoint`;
}

async function deleteStoredSubscriptionIfPossible(input: {
  db: SupabaseServiceClient;
  connection: Awaited<ReturnType<typeof requireMicrosoftSharepointConnectionByConnectedProviderAccountId>>;
  subscription: ProviderWebhookSubscription;
}): Promise<void> {
  const externalSubscriptionId = input.subscription.external_subscription_id?.trim();
  if (externalSubscriptionId) {
    try {
      await deleteMicrosoftGraphSubscription({
        providerConfigKey: input.connection.nangoProviderConfigKey,
        connectionId: input.connection.nangoConnectionId,
        externalSubscriptionId,
      });
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== domainCodes.NOT_FOUND) throw error;
    }
  }
  await deleteProviderWebhookSubscriptionAndDeliveries(input.db, input.subscription.id);
}

async function upsertDriveSubscription(input: {
  db: SupabaseServiceClient;
  connection: Awaited<ReturnType<typeof requireMicrosoftSharepointConnectionByConnectedProviderAccountId>>;
  site: MicrosoftGraphSite;
  drive: MicrosoftGraphDrive;
  existing?: ProviderWebhookSubscription | null;
}): Promise<ProviderWebhookSubscription> {
  const resource = `/drives/${input.drive.id}/root`;
  const providerState = input.existing ? microsoftSharepointProviderState(input.existing) : null;
  const clientState = providerState?.clientState ?? newMicrosoftGraphClientState();
  const notificationUrl = webhookUrl();
  const expirationDateTime = microsoftGraphSubscriptionExpiration();
  const graphSubscription = input.existing?.external_subscription_id
    ? await renewMicrosoftGraphSubscription({
        providerConfigKey: input.connection.nangoProviderConfigKey,
        connectionId: input.connection.nangoConnectionId,
        externalSubscriptionId: input.existing.external_subscription_id,
        expirationDateTime,
      })
    : await createMicrosoftGraphDriveRootSubscription({
        providerConfigKey: input.connection.nangoProviderConfigKey,
        connectionId: input.connection.nangoConnectionId,
        notificationUrl,
        resource,
        clientState,
        expirationDateTime,
      });
  return upsertProviderWebhookSubscription(input.db, {
    profileId: input.connection.profileId,
    capabilityAccountLinkId: input.connection.capabilityAccountLinkId,
    connectedProviderAccountId: input.connection.connectedProviderAccount.id,
    providerKey: MICROSOFT_SHAREPOINT_PROVIDER_KEY,
    adapterKey: MICROSOFT_SHAREPOINT_ADAPTER_KEY,
    externalSubscriptionId: graphSubscription.id,
    resourceType: MICROSOFT_SHAREPOINT_RESOURCE_TYPE,
    resourceId: input.drive.id,
    eventScope: EVENT_SCOPE,
    status: "active",
    expiresAt: graphSubscription.expirationDateTime,
    nextReconcileAt: microsoftGraphSubscriptionRenewAfter(
      graphSubscription.expirationDateTime,
    ).toISOString(),
    ...(input.existing ? { cursor: input.existing.cursor as Record<string, unknown> } : {}),
    providerState: {
      clientState,
      resource,
      driveId: input.drive.id,
      driveName: input.drive.name ?? null,
      driveWebUrl: input.drive.webUrl ?? null,
      siteId: input.site.id,
      siteName: input.site.displayName ?? input.site.name ?? null,
      siteWebUrl: input.site.webUrl ?? null,
      notificationUrl,
    },
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

export async function reconcileMicrosoftSharepointSubscriptions(
  db: SupabaseServiceClient,
  input: { connectedProviderAccountId: string },
): Promise<Record<string, unknown>> {
  const connection = await requireMicrosoftSharepointConnectionByConnectedProviderAccountId(
    db,
    input.connectedProviderAccountId,
  );
  const sites = await listMicrosoftGraphSites({
    providerConfigKey: connection.nangoProviderConfigKey,
    connectionId: connection.nangoConnectionId,
  });
  const targets: { site: MicrosoftGraphSite; drive: MicrosoftGraphDrive }[] = [];
  for (const site of sites) {
    const drives = await listMicrosoftGraphSiteDrives({
      providerConfigKey: connection.nangoProviderConfigKey,
      connectionId: connection.nangoConnectionId,
      siteId: site.id,
    });
    targets.push(...drives.map((drive) => ({ site, drive })));
  }
  const desiredIds = new Set(targets.map((target) => target.drive.id));
  const existingRows = await listMicrosoftSharepointSubscriptionsForConnectedAccount(
    db,
    connection.connectedProviderAccount.id,
  );
  let deleted = 0;
  for (const row of existingRows) {
    if (desiredIds.has(row.resource_id)) continue;
    await deleteStoredSubscriptionIfPossible({ db, connection, subscription: row });
    deleted += 1;
  }
  const existingByDriveId = new Map(existingRows.map((row) => [row.resource_id, row]));
  let active = 0;
  let failed = 0;
  for (const target of targets) {
    try {
      await upsertDriveSubscription({
        db,
        connection,
        site: target.site,
        drive: target.drive,
        existing: existingByDriveId.get(target.drive.id) ?? null,
      });
      active += 1;
    } catch (error) {
      const existing = existingByDriveId.get(target.drive.id);
      if (existing) {
        await patchProviderWebhookSubscription(db, existing.id, {
          status: "unhealthy",
          last_error_code:
            error instanceof DomainError ? error.code : domainCodes.INTERNAL,
          last_error_message: formatUnknownError(error),
        });
      }
      failed += 1;
    }
  }
  const nextRun = await enqueueMicrosoftSharepointSubscriptionReconcileJob(db, {
    profileId: connection.profileId,
    capabilityAccountLinkId: connection.capabilityAccountLinkId,
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    runAfter: new Date(Date.now() + 45 * 60 * 1000),
  });
  return {
    sites: sites.length,
    drives: targets.length,
    active,
    deleted,
    failed,
    ...(nextRun.enqueued
      ? {
          nextReconcileJobId: nextRun.jobId,
          joinedExistingNextReconcileJob: nextRun.joinedExistingJob,
        }
      : { nextReconcileSkippedReason: nextRun.reason }),
  };
}
