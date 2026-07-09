import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { googleCalendarToolContracts } from "@ai-assistants/google-calendar-contracts/contracts";
import {
  googleCalendarAccountsListInputSchema,
  googleCalendarCalendarsListInputSchema,
  googleCalendarCalendarsListOutputSchema,
  googleCalendarEventGetInputSchema,
  googleCalendarEventGetOutputSchema,
  googleCalendarEventsListInputSchema,
  googleCalendarEventsListOutputSchema,
  googleCalendarEventsSearchInputSchema,
  googleCalendarFreebusyQueryInputSchema,
  googleCalendarFreebusyQueryOutputSchema,
  googleCalendarFreeSlotsFindInputSchema,
  googleCalendarFreeSlotsFindOutputSchema,
} from "@ai-assistants/google-calendar-contracts/schemas";
import {
  toolContractByName,
  toolData,
  toolDataForContract,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import {
  executeGoogleCalendarNangoProxyOperation,
  googleCalendarNangoProxyRecordSchema,
  type GoogleCalendarNangoKey,
} from "../../integrations/nango/google-calendar-proxy";
import { listProviderAccountChoices } from "../../product/connected-accounts/provider-account-choices";
import { requireGoogleCalendarNango } from "./connection";
import {
  normalizeGoogleCalendarBusyBlocks,
  normalizeGoogleCalendarEvent,
  normalizeGoogleCalendarEventListItem,
  normalizeGoogleCalendarFreeSlot,
  normalizeGoogleCalendarSummary,
} from "./normalization";

function readContext(binding: {
  link: { provider: string };
  account: { account_email: string | null };
}) {
  return {
    provider: binding.link.provider,
    accountEmail: binding.account.account_email,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function googleBusyCalendars(value: unknown): Record<string, unknown>[] {
  return Object.entries(recordValue(value)).map(([calendarId, calendar]) => ({
    calendarId,
    ...recordValue(calendar),
  }));
}

async function listGoogleCalendarAccounts(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<BackendToolResult> {
  return toolDataForContract(
    toolContractByName(googleCalendarToolContracts, "google_calendar_accounts_list"),
    {
      accounts: await listProviderAccountChoices(db, {
        profileId,
        capabilitySlug: "google-calendar",
        label: "List Google Calendar capability instances",
      }),
    },
  );
}

function mergeBusyPeriods(busy: { start: string; end: string }[]): { start: string; end: string }[] {
  const sorted = [...busy].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const merged: { start: string; end: string }[] = [];
  for (const period of sorted) {
    const last = merged.at(-1);
    if (!last) {
      merged.push({ ...period });
      continue;
    }
    const lastEnd = Date.parse(last.end);
    const curStart = Date.parse(period.start);
    if (curStart <= lastEnd) {
      const curEnd = Date.parse(period.end);
      if (curEnd > lastEnd) last.end = period.end;
    } else {
      merged.push({ ...period });
    }
  }
  return merged;
}

function freeSlotsFromBusy(params: {
  timeMin: string;
  timeMax: string;
  durationMinutes: number;
  busy: { start: string; end: string }[];
}): { start: string; end: string; durationMinutes: number }[] {
  const rangeStart = Date.parse(params.timeMin);
  const rangeEnd = Date.parse(params.timeMax);
  const minMs = params.durationMinutes * 60_000;
  const merged = mergeBusyPeriods(params.busy);
  const slots: { start: string; end: string; durationMinutes: number }[] = [];
  const boundaries = [params.timeMin, ...merged.flatMap((item) => [item.start, item.end]), params.timeMax];
  if (!merged.length) {
    const dur = rangeEnd - rangeStart;
    return dur >= minMs
      ? [{ start: params.timeMin, end: params.timeMax, durationMinutes: Math.floor(dur / 60_000) }]
      : [];
  }
  for (let i = 0; i < boundaries.length - 1; i += 2) {
    const start = boundaries[i];
    const end = boundaries[i + 1];
    if (!start || !end) continue;
    const dur = Date.parse(end) - Date.parse(start);
    if (dur >= minMs) slots.push({ start, end, durationMinutes: Math.floor(dur / 60_000) });
  }
  return slots;
}

export async function executeGoogleCalendarReadTool(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  switch (toolName) {
    case "google_calendar_accounts_list":
      googleCalendarAccountsListInputSchema.parse(params);
      return listGoogleCalendarAccounts(db, profileId);
    case "google_calendar_calendars_list": {
      const p = googleCalendarCalendarsListInputSchema.parse(params);
      const b = await requireGoogleCalendarNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeGoogleCalendarNangoProxyOperation(
        b.nangoProviderConfigKey as GoogleCalendarNangoKey,
        b.nangoConnectionId,
        "list-calendars",
        googleCalendarNangoProxyRecordSchema,
        { cursor: p.nextPageToken, maxResults: p.maxResults },
        sandbox,
      );
      return toolData(
        googleCalendarCalendarsListOutputSchema.parse({
          ...readContext(b),
          calendars: arrayValue(data.calendars).map(normalizeGoogleCalendarSummary),
          nextCursor: stringValue(data.nextPageToken),
        }),
      );
    }
    case "google_calendar_events_list": {
      const p = googleCalendarEventsListInputSchema.parse(params);
      const b = await requireGoogleCalendarNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeGoogleCalendarNangoProxyOperation(
        b.nangoProviderConfigKey as GoogleCalendarNangoKey,
        b.nangoConnectionId,
        "list-events",
        googleCalendarNangoProxyRecordSchema,
        {
          calendarId: p.calendarId,
          timeMin: p.timeMin,
          timeMax: p.timeMax,
          maxResults: p.maxResults,
          singleEvents: true,
          cursor: p.nextPageToken,
        },
        sandbox,
      );
      return toolData(
        googleCalendarEventsListOutputSchema.parse({
          ...readContext(b),
          calendarId: p.calendarId,
          events: arrayValue(data.events).map((event) =>
            normalizeGoogleCalendarEventListItem(event, p.calendarId),
          ),
          nextCursor: stringValue(data.nextPageToken),
        }),
      );
    }
    case "google_calendar_event_get": {
      const p = googleCalendarEventGetInputSchema.parse(params);
      const b = await requireGoogleCalendarNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const event = await executeGoogleCalendarNangoProxyOperation(
        b.nangoProviderConfigKey as GoogleCalendarNangoKey,
        b.nangoConnectionId,
        "get-event",
        googleCalendarNangoProxyRecordSchema,
        { calendarId: p.calendarId, eventId: p.eventId },
        sandbox,
      );
      return toolData(
        googleCalendarEventGetOutputSchema.parse({
          ...readContext(b),
          calendarId: p.calendarId,
          eventId: p.eventId,
          event: normalizeGoogleCalendarEvent(event, p.calendarId),
        }),
      );
    }
    case "google_calendar_freebusy_query": {
      const p = googleCalendarFreebusyQueryInputSchema.parse(params);
      const b = await requireGoogleCalendarNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeGoogleCalendarNangoProxyOperation(
        b.nangoProviderConfigKey as GoogleCalendarNangoKey,
        b.nangoConnectionId,
        "query-free-busy",
        googleCalendarNangoProxyRecordSchema,
        {
          timeMin: p.timeMin,
          timeMax: p.timeMax,
          timeZone: p.timeZone,
          items: p.calendarIds.map((id) => ({ id })),
        },
        sandbox,
      );
      return toolData(
        googleCalendarFreebusyQueryOutputSchema.parse({
          ...readContext(b),
          calendarIds: p.calendarIds,
          timeMin: p.timeMin,
          timeMax: p.timeMax,
          busy: googleBusyCalendars(recordValue(data).calendars).flatMap((busy) =>
            normalizeGoogleCalendarBusyBlocks(busy, p.calendarIds[0] ?? "primary"),
          ),
        }),
      );
    }
    case "google_calendar_events_search": {
      const p = googleCalendarEventsSearchInputSchema.parse(params);
      const b = await requireGoogleCalendarNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeGoogleCalendarNangoProxyOperation(
        b.nangoProviderConfigKey as GoogleCalendarNangoKey,
        b.nangoConnectionId,
        "search-events",
        googleCalendarNangoProxyRecordSchema,
        {
          query: p.query,
          calendarId: p.calendarId,
          timeMin: p.timeMin,
          timeMax: p.timeMax,
          maxResults: p.maxResults,
          cursor: p.nextPageToken,
        },
        sandbox,
      );
      return toolData(
        googleCalendarEventsListOutputSchema.parse({
          ...readContext(b),
          calendarId: p.calendarId,
          events: arrayValue(data.events).map((event) =>
            normalizeGoogleCalendarEventListItem(event, p.calendarId),
          ),
          nextCursor: stringValue(data.nextPageToken),
        }),
      );
    }
    case "google_calendar_free_slots_find": {
      const p = googleCalendarFreeSlotsFindInputSchema.parse(params);
      const b = await requireGoogleCalendarNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeGoogleCalendarNangoProxyOperation(
        b.nangoProviderConfigKey as GoogleCalendarNangoKey,
        b.nangoConnectionId,
        "find-free-slots",
        googleCalendarNangoProxyRecordSchema,
        {
          calendarIds: p.calendarIds,
          timeMin: p.timeMin,
          timeMax: p.timeMax,
          durationMinutes: p.durationMinutes,
        },
        sandbox,
      );
      const providerSlots = arrayValue(data.freeSlots)
        .map(normalizeGoogleCalendarFreeSlot)
        .filter((slot): slot is NonNullable<ReturnType<typeof normalizeGoogleCalendarFreeSlot>> =>
          Boolean(slot),
        );
      const freeSlots = providerSlots.length
        ? providerSlots
        : freeSlotsFromBusy({
            timeMin: p.timeMin,
            timeMax: p.timeMax,
            durationMinutes: p.durationMinutes,
            busy: [],
          });
      return toolData(
        googleCalendarFreeSlotsFindOutputSchema.parse({
          ...readContext(b),
          freeSlots,
          calendarsChecked: data.calendarsChecked ?? p.calendarIds.length,
        }),
      );
    }
    default:
      throw new DomainError(
        domainCodes.INTERNAL,
        `Google Calendar read handler missing for ${toolName}.`,
      );
  }
}
