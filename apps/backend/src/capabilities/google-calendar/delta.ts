import type { BackendJob } from "@ai-assistants/backend-jobs";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import { nangoProxyRequestJson } from "../../integrations/nango/nango-proxy-client";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { recordGoogleCalendarEventChangeAndMaybeEnqueueWorkItem } from "./calendar-event-events";
import {
  googleCalendarCursor,
  googleCalendarProviderState,
  loadGoogleCalendarWatchById,
  markGoogleCalendarWatchStateUnhealthy,
  requireGoogleCalendarConnectionByConnectedProviderAccountId,
  upsertGoogleCalendarWatchState,
  type GoogleCalendarConnectionContext,
} from "./connection";
import { googleCalendarEventsResponseSchema } from "./schemas";

type GoogleCalendarEvent = z.infer<typeof googleCalendarEventsResponseSchema>["items"] extends
  | (infer T)[]
  | undefined
  ? T
  : never;

function providerHttpStatus(error: unknown): number | null {
  if (!(error instanceof DomainError)) return null;
  const details = z
    .object({ httpStatus: z.number().nullable().optional() })
    .passthrough()
    .safeParse(error.details);
  return details.success ? (details.data.httpStatus ?? null) : null;
}

async function listDeltaPage(input: {
  db: SupabaseServiceClient;
  connection: GoogleCalendarConnectionContext;
  providerCalendarId: string;
  syncToken: string;
  pageToken?: string;
}) {
  return nangoProxyRequestJson({
    operation: "google_calendar.events.delta",
    publicSummary: "Google Calendar event delta failed",
    providerConfigKey: input.connection.nangoProviderConfigKey,
    connectionId: input.connection.nangoConnectionId,
    method: "get",
    endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.providerCalendarId)}/events`,
    params: {
      showDeleted: true,
      syncToken: input.syncToken,
      ...(input.pageToken ? { pageToken: input.pageToken } : {}),
    },
    responseSchema: googleCalendarEventsResponseSchema,
    authFailureProjection: { db: input.db, account: input.connection.connectedProviderAccount },
    evidence: {
      connected_provider_account_id: input.connection.connectedProviderAccount.id,
      provider_calendar_id: input.providerCalendarId,
    },
  });
}

async function collectDeltaEvents(input: {
  db: SupabaseServiceClient;
  connection: GoogleCalendarConnectionContext;
  providerCalendarId: string;
  syncToken: string;
}): Promise<{ events: GoogleCalendarEvent[]; nextSyncToken: string | null }> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  do {
    const page = await listDeltaPage({
      db: input.db,
      connection: input.connection,
      providerCalendarId: input.providerCalendarId,
      syncToken: input.syncToken,
      ...(pageToken ? { pageToken } : {}),
    });
    events.push(...(page.items ?? []));
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
    pageToken = page.nextPageToken;
  } while (pageToken);
  return { events, nextSyncToken };
}

function eventTime(value: GoogleCalendarEvent["start"]): string | null {
  return value?.dateTime ?? value?.date ?? null;
}

function calendarEventPayload(input: {
  connection: GoogleCalendarConnectionContext;
  providerCalendarId: string;
  providerCalendarSummary: string | null;
  event: GoogleCalendarEvent;
}): Record<string, unknown> {
  return {
    provider: "google-calendar",
    accountEmail: input.connection.accountEmail,
    capabilityAccountLinkId: input.connection.capabilityAccountLinkId,
    connectedProviderAccountId: input.connection.connectedProviderAccount.id,
    providerCalendarId: input.providerCalendarId,
    providerCalendarSummary: input.providerCalendarSummary,
    providerEventId: input.event.id,
    iCalUID: input.event.iCalUID ?? null,
    etag: input.event.etag ?? null,
    changeType: input.event.status === "cancelled" ? "deleted" : "changed",
    providerStatus: input.event.status ?? null,
    title: input.event.summary ?? null,
    visibility: input.event.visibility ?? null,
    startsAt: eventTime(input.event.start),
    endsAt: eventTime(input.event.end),
    updatedAt: input.event.updated ?? null,
    createdAt: input.event.created ?? null,
    recurringEventId: input.event.recurringEventId ?? null,
  };
}

export async function processGoogleCalendarDeltaJob(
  db: SupabaseServiceClient,
  input: { job: BackendJob; subscriptionId: string },
): Promise<Record<string, unknown>> {
  const state = await loadGoogleCalendarWatchById(db, input.subscriptionId);
  const connection = await requireGoogleCalendarConnectionByConnectedProviderAccountId(
    db,
    state.connected_provider_account_id,
  );
  const cursor = googleCalendarCursor(state);
  const providerState = googleCalendarProviderState(state);
  if (!cursor.syncToken) {
    await markGoogleCalendarWatchStateUnhealthy(db, {
      stateId: state.id,
      error: "google_calendar_missing_sync_token",
    });
    return {
      connectedProviderAccountId: state.connected_provider_account_id,
      providerCalendarId: state.resource_id,
      processedEvents: 0,
      status: "unhealthy",
      reason: "missing_sync_token",
    };
  }

  let delta: { events: GoogleCalendarEvent[]; nextSyncToken: string | null };
  try {
    delta = await collectDeltaEvents({
      db,
      connection,
      providerCalendarId: state.resource_id,
      syncToken: cursor.syncToken,
    });
  } catch (error) {
    if (providerHttpStatus(error) === 410) {
      await markGoogleCalendarWatchStateUnhealthy(db, {
        stateId: state.id,
        error: "google_calendar_sync_token_expired",
      });
      return {
        connectedProviderAccountId: state.connected_provider_account_id,
        providerCalendarId: state.resource_id,
        processedEvents: 0,
        status: "unhealthy",
        reason: "sync_token_expired",
      };
    }
    throw error;
  }

  const createdEvents = 0;
  let enqueuedWorkItems = 0;
  for (const event of delta.events) {
    const eventPayload = calendarEventPayload({
      connection,
      providerCalendarId: state.resource_id,
      providerCalendarSummary: providerState.providerCalendarSummary,
      event,
    });
    const recorded = await recordGoogleCalendarEventChangeAndMaybeEnqueueWorkItem(db, {
      profileId: connection.profileId,
      dedupeKey: `google_calendar.event.changed:google-calendar:${connection.connectedProviderAccount.id}:${state.resource_id}:${event.id}:${event.etag ?? event.updated ?? event.status ?? "change"}`,
      payload: eventPayload,
      sourceId: event.id,
      connectedProviderAccountId: connection.connectedProviderAccount.id,
      ...(event.updated ? { occurredAt: event.updated } : {}),
    });
    if (recorded.enqueuedWorkItem) enqueuedWorkItems += 1;
  }

  if (delta.nextSyncToken) {
    await upsertGoogleCalendarWatchState(db, {
      ...connection,
      providerCalendarId: state.resource_id,
      providerCalendarSummary: providerState.providerCalendarSummary,
      syncToken: delta.nextSyncToken,
    });
  }

  emitDiagnostic(backendDiagnosticLogger(), "google_calendar.delta.processed", {
    ok: true,
    profile_id: connection.profileId,
    capability_account_link_id: connection.capabilityAccountLinkId,
    job_id: input.job.id,
    job_kind: input.job.kind,
    attrs: {
      connected_provider_account_id: state.connected_provider_account_id,
      provider_calendar_id: state.resource_id,
      processed_events: delta.events.length,
      created_events: createdEvents,
      enqueued_work_items: enqueuedWorkItems,
      sync_token_updated: Boolean(delta.nextSyncToken),
    },
  });

  return {
    connectedProviderAccountId: state.connected_provider_account_id,
    providerCalendarId: state.resource_id,
    processedEvents: delta.events.length,
    createdEvents,
    enqueuedWorkItems,
  };
}
