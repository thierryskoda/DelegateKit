import type { BackendJob } from "@ai-assistants/backend-jobs";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import { nangoProxyRequestJson } from "../../integrations/nango/nango-proxy-client";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { recordOutlookCalendarEventChangeAndMaybeEnqueueWorkItem } from "./calendar-event-events";
import {
  requireOutlookCalendarConnectionByProviderConnectionId,
  type OutlookCalendarConnectionContext,
} from "./connection";
import { outlookCalendarEventSchema } from "./schemas";

function providerHttpStatus(error: unknown): number | null {
  if (!(error instanceof DomainError)) return null;
  const details = z
    .object({ httpStatus: z.number().nullable().optional() })
    .passthrough()
    .safeParse(error.details);
  return details.success ? (details.data.httpStatus ?? null) : null;
}

async function getOutlookCalendarEvent(input: {
  connection: OutlookCalendarConnectionContext;
  eventId: string;
}) {
  return nangoProxyRequestJson({
    operation: "outlook_calendar.event.get",
    publicSummary: "Outlook Calendar event fetch failed",
    providerConfigKey: input.connection.nangoProviderConfigKey,
    connectionId: input.connection.nangoConnectionId,
    method: "get",
    endpoint: `/v1.0/me/events/${encodeURIComponent(input.eventId)}`,
    params: {
      $select:
        "id,iCalUId,subject,bodyPreview,sensitivity,showAs,isCancelled,isDraft,createdDateTime,lastModifiedDateTime,start,end,organizer",
    },
    responseSchema: outlookCalendarEventSchema,
    evidence: {
      connected_provider_account_id: input.connection.connectedProviderAccount.id,
      outlook_calendar_event_id: input.eventId,
    },
  });
}

function eventDateTime(value: { dateTime?: string | null | undefined } | undefined): string | null {
  return value?.dateTime ?? null;
}

function organizerText(event: z.infer<typeof outlookCalendarEventSchema>): string | null {
  const email = event.organizer?.emailAddress;
  const name = email?.name?.trim();
  const address = email?.address?.trim();
  if (name && address) return `${name} <${address}>`;
  return address || name || null;
}

function eventPayload(input: {
  connection: OutlookCalendarConnectionContext;
  graphSubscriptionId: string;
  changeType: string;
  event: z.infer<typeof outlookCalendarEventSchema>;
}): Record<string, unknown> {
  return {
    provider: "outlook-calendar",
    accountEmail: input.connection.accountEmail,
    capabilityAccountLinkId: input.connection.capabilityAccountLinkId,
    connectedProviderAccountId: input.connection.connectedProviderAccount.id,
    graphSubscriptionId: input.graphSubscriptionId,
    providerEventId: input.event.id,
    iCalUID: input.event.iCalUId ?? null,
    changeType: input.event.isCancelled ? "deleted" : input.changeType,
    providerStatus: input.event.isCancelled ? "cancelled" : null,
    title: input.event.subject ?? null,
    sensitivity: input.event.sensitivity ?? null,
    showAs: input.event.showAs ?? null,
    startsAt: eventDateTime(input.event.start),
    endsAt: eventDateTime(input.event.end),
    createdAt: input.event.createdDateTime ?? null,
    updatedAt: input.event.lastModifiedDateTime ?? null,
    organizer: organizerText(input.event),
    snippet: input.event.bodyPreview ?? null,
  };
}

function deletedPayload(input: {
  connection: OutlookCalendarConnectionContext;
  graphSubscriptionId: string;
  eventId: string;
  changeType: string;
}): Record<string, unknown> {
  return {
    provider: "outlook-calendar",
    accountEmail: input.connection.accountEmail,
    capabilityAccountLinkId: input.connection.capabilityAccountLinkId,
    connectedProviderAccountId: input.connection.connectedProviderAccount.id,
    graphSubscriptionId: input.graphSubscriptionId,
    providerEventId: input.eventId,
    changeType: "deleted",
    providerStatus: "deleted",
    title: null,
    startsAt: null,
    endsAt: null,
    originalChangeType: input.changeType,
  };
}

export async function processOutlookCalendarEventJob(
  db: SupabaseServiceClient,
  input: {
    job: BackendJob;
    connectedProviderAccountId: string;
    graphSubscriptionId: string;
    eventId: string;
    changeType: string;
  },
): Promise<Record<string, unknown>> {
  const connection = await requireOutlookCalendarConnectionByProviderConnectionId(
    db,
    input.connectedProviderAccountId,
  );
  let event: z.infer<typeof outlookCalendarEventSchema> | null = null;
  try {
    event = await getOutlookCalendarEvent({ connection, eventId: input.eventId });
  } catch (error) {
    const status = providerHttpStatus(error);
    if (status !== 404 && status !== 410) throw error;
  }

  const eventPayload = event
    ? eventPayloadFromFetched({
        connection,
        graphSubscriptionId: input.graphSubscriptionId,
        changeType: input.changeType,
        event,
      })
    : deletedPayload({
        connection,
        graphSubscriptionId: input.graphSubscriptionId,
        eventId: input.eventId,
        changeType: input.changeType,
      });
  const occurredAt = event?.lastModifiedDateTime ?? undefined;
  const recorded = await recordOutlookCalendarEventChangeAndMaybeEnqueueWorkItem(db, {
    profileId: connection.profileId,
    dedupeKey: `outlook_calendar.event.changed:outlook-calendar:${connection.connectedProviderAccount.id}:${input.eventId}:${event?.lastModifiedDateTime ?? input.changeType}`,
    payload: eventPayload,
    sourceId: input.eventId,
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    ...(occurredAt ? { occurredAt } : {}),
  });

  emitDiagnostic(backendDiagnosticLogger(), "outlook_calendar.event.processed", {
    ok: true,
    profile_id: connection.profileId,
    capability_account_link_id: connection.capabilityAccountLinkId,
    job_id: input.job.id,
    job_kind: input.job.kind,
    attrs: {
      connected_provider_account_id: input.connectedProviderAccountId,
      outlook_calendar_event_id: input.eventId,
      graph_subscription_id: input.graphSubscriptionId,
      found_event: Boolean(event),
      enqueued_work_item: recorded.enqueuedWorkItem,
    },
  });

  return {
    connectedProviderAccountId: input.connectedProviderAccountId,
    eventId: input.eventId,
    processedEvents: 1,
    createdEvents: 0,
    enqueuedWorkItems: recorded.enqueuedWorkItem ? 1 : 0,
  };
}

function eventPayloadFromFetched(input: {
  connection: OutlookCalendarConnectionContext;
  graphSubscriptionId: string;
  changeType: string;
  event: z.infer<typeof outlookCalendarEventSchema>;
}): Record<string, unknown> {
  return eventPayload(input);
}
