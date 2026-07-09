import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import { backendApiEnv } from "../../shared/env";
import { nangoProxyRequestJson } from "../../integrations/nango/nango-proxy-client";
import { deleteProviderWebhookSubscriptionAndDeliveries } from "../../integrations/provider-webhooks/substrate";
import {
  googleCalendarCursor,
  googleCalendarProviderState,
  listGoogleCalendarWatchesForConnectedAccount,
  requireGoogleCalendarConnectionByConnectedProviderAccountId,
  upsertGoogleCalendarWatchState,
  type GoogleCalendarConnectionContext,
} from "./connection";
import { enqueueGoogleCalendarWatchReconcileJob } from "./jobs";
import {
  googleCalendarEventsResponseSchema,
  googleCalendarListResponseSchema,
  googleCalendarWatchResponseSchema,
} from "./schemas";

const GOOGLE_CALENDAR_WATCH_TTL_SECONDS = 7 * 24 * 60 * 60;
const googleCalendarWatchBodySchema = z
  .object({
    id: z.string().trim().min(1),
    type: z.literal("web_hook"),
    address: z.string().trim().url(),
    token: z.string().trim().min(1),
    params: z.object({ ttl: z.string().trim().min(1) }).strict(),
  })
  .strict();
const googleCalendarChannelStopBodySchema = z
  .object({
    id: z.string().trim().min(1),
    resourceId: z.string().trim().min(1),
  })
  .strict();
const GOOGLE_CALENDAR_WATCH_RENEW_BEFORE_EXPIRATION_MS = 24 * 60 * 60 * 1000;
const GOOGLE_GROUP_FEED_CALENDAR_ID_SUFFIX = "@group.v.calendar.google.com";

function isGoogleGroupFeedCalendarId(providerCalendarId: string): boolean {
  return providerCalendarId.endsWith(GOOGLE_GROUP_FEED_CALENDAR_ID_SUFFIX);
}

function calendarWebhookPublicUrl(): string {
  const base = backendApiEnv().backendPublicUrl;
  return `${base}/webhooks/google-calendar`;
}

function expirationIso(value: string | number | undefined): string | null {
  if (value === undefined) return null;
  const ms = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(ms)) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Google Calendar watch expiration is invalid: ${JSON.stringify(value)}.`,
    );
  }
  return new Date(ms).toISOString();
}

function nextRenewRunAfter(expirationIsoValue: string | null): Date {
  if (!expirationIsoValue) return new Date(Date.now() + 24 * 60 * 60 * 1000);
  const expirationMs = Date.parse(expirationIsoValue);
  if (!Number.isFinite(expirationMs)) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Google Calendar watch expiration is invalid: ${JSON.stringify(expirationIsoValue)}.`,
    );
  }
  return new Date(
    Math.max(Date.now(), expirationMs - GOOGLE_CALENDAR_WATCH_RENEW_BEFORE_EXPIRATION_MS),
  );
}

function newChannelToken(): string {
  return randomBytes(32).toString("hex");
}

function providerHttpStatus(error: unknown): number | null {
  if (!(error instanceof DomainError)) return null;
  const details = z
    .object({ httpStatus: z.number().nullable().optional() })
    .passthrough()
    .safeParse(error.details);
  return details.success ? (details.data.httpStatus ?? null) : null;
}

function isAlreadyGoneProviderError(error: unknown): boolean {
  const status = providerHttpStatus(error);
  return status === 404 || status === 410;
}

async function listCalendarPage(input: {
  db: SupabaseServiceClient;
  connection: GoogleCalendarConnectionContext;
  pageToken?: string;
}) {
  return nangoProxyRequestJson({
    operation: "google_calendar.calendar_list.list",
    publicSummary: "Google Calendar calendar list failed",
    providerConfigKey: input.connection.nangoProviderConfigKey,
    connectionId: input.connection.nangoConnectionId,
    method: "get",
    endpoint: "/calendar/v3/users/me/calendarList",
    params: {
      minAccessRole: "reader",
      showDeleted: false,
      showHidden: false,
      ...(input.pageToken ? { pageToken: input.pageToken } : {}),
    },
    responseSchema: googleCalendarListResponseSchema,
    authFailureProjection: { db: input.db, account: input.connection.connectedProviderAccount },
    evidence: {
      connected_provider_account_id: input.connection.connectedProviderAccount.id,
      capability_account_link_id: input.connection.capabilityAccountLinkId,
    },
  });
}

async function listCalendars(
  db: SupabaseServiceClient,
  connection: GoogleCalendarConnectionContext,
): Promise<{
  watchableCalendars: { id: string; summary: string | null }[];
  skippedGroupFeedCalendars: number;
}> {
  const watchableCalendars: { id: string; summary: string | null }[] = [];
  let skippedGroupFeedCalendars = 0;
  let pageToken: string | undefined;
  do {
    const page = await listCalendarPage({ db, connection, ...(pageToken ? { pageToken } : {}) });
    for (const item of page.items ?? []) {
      if (item.deleted || item.hidden) continue;
      if (isGoogleGroupFeedCalendarId(item.id)) {
        skippedGroupFeedCalendars += 1;
        continue;
      }
      watchableCalendars.push({ id: item.id, summary: item.summary ?? null });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return { watchableCalendars, skippedGroupFeedCalendars };
}

async function fetchInitialSyncToken(input: {
  db: SupabaseServiceClient;
  connection: GoogleCalendarConnectionContext;
  providerCalendarId: string;
}): Promise<string> {
  let pageToken: string | undefined;
  let syncToken: string | undefined;
  do {
    const page = await nangoProxyRequestJson({
      operation: "google_calendar.events.initial_sync",
      publicSummary: "Google Calendar initial event sync failed",
      providerConfigKey: input.connection.nangoProviderConfigKey,
      connectionId: input.connection.nangoConnectionId,
      method: "get",
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.providerCalendarId)}/events`,
      params: {
        showDeleted: true,
        maxResults: 2500,
        ...(pageToken ? { pageToken } : {}),
      },
      responseSchema: googleCalendarEventsResponseSchema,
      authFailureProjection: { db: input.db, account: input.connection.connectedProviderAccount },
      evidence: {
        connected_provider_account_id: input.connection.connectedProviderAccount.id,
        provider_calendar_id: input.providerCalendarId,
      },
    });
    syncToken = page.nextSyncToken ?? syncToken;
    pageToken = page.nextPageToken;
  } while (pageToken);
  if (!syncToken) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Google Calendar did not return an initial sync token for calendar ${input.providerCalendarId}.`,
    );
  }
  return syncToken;
}

async function createCalendarWatch(input: {
  db: SupabaseServiceClient;
  connection: GoogleCalendarConnectionContext;
  providerCalendarId: string;
  address: string;
  channelId: string;
  channelToken: string;
}) {
  return nangoProxyRequestJson({
    operation: "google_calendar.events.watch",
    publicSummary: "Google Calendar event watch creation failed",
    providerConfigKey: input.connection.nangoProviderConfigKey,
    connectionId: input.connection.nangoConnectionId,
    method: "post",
    endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.providerCalendarId)}/events/watch`,
    data: {
      id: input.channelId,
      type: "web_hook",
      address: input.address,
      token: input.channelToken,
      params: { ttl: String(GOOGLE_CALENDAR_WATCH_TTL_SECONDS) },
    },
    bodySchema: googleCalendarWatchBodySchema,
    responseSchema: googleCalendarWatchResponseSchema,
    authFailureProjection: { db: input.db, account: input.connection.connectedProviderAccount },
    evidence: {
      connected_provider_account_id: input.connection.connectedProviderAccount.id,
      provider_calendar_id: input.providerCalendarId,
    },
  });
}

async function stopCalendarChannel(input: {
  db: SupabaseServiceClient;
  connection: GoogleCalendarConnectionContext;
  channelId: string;
  resourceId: string;
}): Promise<void> {
  await nangoProxyRequestJson({
    operation: "google_calendar.channels.stop",
    publicSummary: "Google Calendar channel stop failed",
    providerConfigKey: input.connection.nangoProviderConfigKey,
    connectionId: input.connection.nangoConnectionId,
    method: "post",
    endpoint: "/calendar/v3/channels/stop",
    data: {
      id: input.channelId,
      resourceId: input.resourceId,
    },
    bodySchema: googleCalendarChannelStopBodySchema,
    responseSchema: z.unknown(),
    authFailureProjection: { db: input.db, account: input.connection.connectedProviderAccount },
    evidence: {
      connected_provider_account_id: input.connection.connectedProviderAccount.id,
      channel_id: input.channelId,
      resource_id: input.resourceId,
    },
  });
}

async function stopStoredCalendarWatchIfPossible(input: {
  db: SupabaseServiceClient;
  connection: GoogleCalendarConnectionContext;
  state: Awaited<ReturnType<typeof listGoogleCalendarWatchesForConnectedAccount>>[number];
}): Promise<boolean> {
  const channelId = input.state.external_subscription_id?.trim() || null;
  const resourceId = googleCalendarProviderState(input.state).resourceId?.trim() || null;
  if (!channelId || !resourceId) return false;
  try {
    await stopCalendarChannel({
      db: input.db,
      connection: input.connection,
      channelId,
      resourceId,
    });
    return true;
  } catch (error) {
    if (isAlreadyGoneProviderError(error)) return false;
    throw error;
  }
}

export async function reconcileGoogleCalendarWatches(
  db: SupabaseServiceClient,
  input: { connectedProviderAccountId: string },
): Promise<Record<string, unknown>> {
  const connection = await requireGoogleCalendarConnectionByConnectedProviderAccountId(
    db,
    input.connectedProviderAccountId,
  );
  const address = calendarWebhookPublicUrl();
  const { watchableCalendars, skippedGroupFeedCalendars } = await listCalendars(db, connection);
  const desiredCalendarIds = new Set(watchableCalendars.map((calendar) => calendar.id));
  const existingRows = await listGoogleCalendarWatchesForConnectedAccount(
    db,
    connection.connectedProviderAccount.id,
  );
  let deletedSubscriptions = 0;
  let stoppedChannels = 0;
  for (const row of existingRows) {
    if (desiredCalendarIds.has(row.resource_id)) continue;
    const stopped = await stopStoredCalendarWatchIfPossible({ db, connection, state: row });
    if (stopped) stoppedChannels += 1;
    await deleteProviderWebhookSubscriptionAndDeliveries(db, row.id);
    deletedSubscriptions += 1;
  }
  const existingByCalendarId = new Map(
    existingRows
      .filter((row) => desiredCalendarIds.has(row.resource_id))
      .map((row) => [row.resource_id, row]),
  );
  let reconciled = 0;
  let nextRunAfter: Date | null = null;
  for (const calendar of watchableCalendars) {
    const existing = existingByCalendarId.get(calendar.id) ?? null;
    const syncToken =
      (existing ? googleCalendarCursor(existing).syncToken : null) ??
      (await fetchInitialSyncToken({
        db,
        connection,
        providerCalendarId: calendar.id,
      }));
    if (existing) {
      const stopped = await stopStoredCalendarWatchIfPossible({ db, connection, state: existing });
      if (stopped) stoppedChannels += 1;
      await deleteProviderWebhookSubscriptionAndDeliveries(db, existing.id);
      deletedSubscriptions += 1;
    }
    const channelId = randomUUID();
    const channelToken = newChannelToken();
    const watch = await createCalendarWatch({
      db,
      connection,
      providerCalendarId: calendar.id,
      address,
      channelId,
      channelToken,
    });
    const watchExpirationAt = expirationIso(watch.expiration);
    await upsertGoogleCalendarWatchState(db, {
      ...connection,
      providerCalendarId: calendar.id,
      providerCalendarSummary: calendar.summary,
      channelId,
      channelToken,
      resourceId: watch.resourceId,
      resourceUri: watch.resourceUri ?? null,
      syncToken,
      watchExpirationAt,
    });
    const calendarNextRunAfter = nextRenewRunAfter(watchExpirationAt);
    nextRunAfter =
      nextRunAfter && nextRunAfter.getTime() < calendarNextRunAfter.getTime()
        ? nextRunAfter
        : calendarNextRunAfter;
    reconciled += 1;
  }
  const next = await enqueueGoogleCalendarWatchReconcileJob(db, {
    profileId: connection.profileId,
    capabilityAccountLinkId: connection.capabilityAccountLinkId,
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    runAfter: nextRunAfter ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  return {
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    calendars: watchableCalendars.length,
    skippedGroupFeedCalendars,
    reconciled,
    deletedSubscriptions,
    stoppedChannels,
    ...(next.enqueued
      ? {
          nextReconcileJobId: next.jobId,
          joinedExistingReconcileJob: next.joinedExistingJob,
        }
      : { nextReconcileSkippedReason: next.reason }),
  };
}
