import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { outlookCalendarToolContracts } from "@ai-assistants/outlook-calendar-contracts/contracts";
import {
  outlookCalendarAccountsListInputSchema,
  outlookCalendarCalendarsListInputSchema,
  outlookCalendarCalendarsListOutputSchema,
  outlookCalendarEventGetInputSchema,
  outlookCalendarEventGetOutputSchema,
  outlookCalendarEventsListInputSchema,
  outlookCalendarEventsListOutputSchema,
  outlookCalendarFreebusyQueryInputSchema,
  outlookCalendarFreebusyQueryOutputSchema,
  outlookCalendarFreeSlotsFindInputSchema,
  outlookCalendarFreeSlotsFindOutputSchema,
} from "@ai-assistants/outlook-calendar-contracts/schemas";
import {
  toolContractByName,
  toolData,
  toolDataForContract,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import {
  executeOutlookCalendarNangoProxyOperation,
  outlookCalendarFreeBusyPost,
  outlookCalendarNangoProxyRecordSchema,
  outlookCalendarViewGet,
  type OutlookCalendarNangoKey,
} from "../../integrations/nango/outlook-calendar-proxy";
import { listProviderAccountChoices } from "../../product/connected-accounts/provider-account-choices";
import { requireOutlookCalendarNango } from "./connection";
import {
  normalizeOutlookCalendarBusyBlocks,
  normalizeOutlookCalendarEvent,
  normalizeOutlookCalendarEventListItem,
  normalizeOutlookCalendarFreeSlot,
  normalizeOutlookCalendarSummary,
} from "./normalization";

function outlookCalendarPath(calendarId: string, suffix = ""): string {
  const encoded = encodeURIComponent(calendarId);
  return calendarId === "primary"
    ? `/v1.0/me/calendar${suffix}`
    : `/v1.0/me/calendars/${encoded}${suffix}`;
}

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
  let cursor = rangeStart;
  for (const busy of merged) {
    const busyStart = Date.parse(busy.start);
    const busyEnd = Date.parse(busy.end);
    if (busyStart - cursor >= minMs) {
      slots.push({
        start: new Date(cursor).toISOString(),
        end: busy.start,
        durationMinutes: Math.floor((busyStart - cursor) / 60_000),
      });
    }
    cursor = Math.max(cursor, busyEnd);
  }
  if (rangeEnd - cursor >= minMs) {
    slots.push({
      start: new Date(cursor).toISOString(),
      end: params.timeMax,
      durationMinutes: Math.floor((rangeEnd - cursor) / 60_000),
    });
  }
  return slots;
}

async function listOutlookCalendarAccounts(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<BackendToolResult> {
  return toolDataForContract(
    toolContractByName(outlookCalendarToolContracts, "outlook_calendar_accounts_list"),
    {
      accounts: await listProviderAccountChoices(db, {
        profileId,
        capabilitySlug: "outlook-calendar",
        label: "List Outlook Calendar capability instances",
      }),
    },
  );
}

export async function executeOutlookCalendarReadTool(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  switch (toolName) {
    case "outlook_calendar_accounts_list":
      outlookCalendarAccountsListInputSchema.parse(params);
      return listOutlookCalendarAccounts(db, profileId);
    case "outlook_calendar_calendars_list": {
      const p = outlookCalendarCalendarsListInputSchema.parse(params);
      const b = await requireOutlookCalendarNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeOutlookCalendarNangoProxyOperation(
        b.nangoProviderConfigKey as OutlookCalendarNangoKey,
        b.nangoConnectionId,
        "list-calendars",
        outlookCalendarNangoProxyRecordSchema,
        { cursor: p.nextPageToken, limit: p.maxResults },
        sandbox,
      );
      return toolData(
        outlookCalendarCalendarsListOutputSchema.parse({
          ...readContext(b),
          calendars: arrayValue(data.calendars).map(normalizeOutlookCalendarSummary),
          nextCursor: stringValue(data.next_cursor),
        }),
      );
    }
    case "outlook_calendar_events_list": {
      const p = outlookCalendarEventsListInputSchema.parse(params);
      const b = await requireOutlookCalendarNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      if (p.calendarId !== "primary") {
        const raw = await outlookCalendarViewGet({
          providerConfigKey: b.nangoProviderConfigKey,
          connectionId: b.nangoConnectionId,
          endpoint: outlookCalendarPath(p.calendarId, "/calendarView"),
          params: {
            startDateTime: p.timeMin,
            endDateTime: p.timeMax,
            $top: Math.min(p.maxResults, 50),
          },
          sandbox,
        });
        const record = recordValue(raw);
        return toolData(
          outlookCalendarEventsListOutputSchema.parse({
            ...readContext(b),
            calendarId: p.calendarId,
            events: arrayValue(record.value).map((event) =>
              normalizeOutlookCalendarEventListItem(event, p.calendarId),
            ),
            nextCursor: stringValue(record["@odata.nextLink"]),
          }),
        );
      }
      const data = await executeOutlookCalendarNangoProxyOperation(
        b.nangoProviderConfigKey as OutlookCalendarNangoKey,
        b.nangoConnectionId,
        "list-calendar-events",
        outlookCalendarNangoProxyRecordSchema,
        {
          start_date_time: p.timeMin,
          end_date_time: p.timeMax,
          top: Math.min(p.maxResults, 50),
        },
        sandbox,
      );
      return toolData(
        outlookCalendarEventsListOutputSchema.parse({
          ...readContext(b),
          calendarId: p.calendarId,
          events: arrayValue(data.events).map((event) =>
            normalizeOutlookCalendarEventListItem(event, p.calendarId),
          ),
          nextCursor: stringValue(data.next_link),
        }),
      );
    }
    case "outlook_calendar_event_get": {
      const p = outlookCalendarEventGetInputSchema.parse(params);
      const b = await requireOutlookCalendarNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const event = await executeOutlookCalendarNangoProxyOperation(
        b.nangoProviderConfigKey as OutlookCalendarNangoKey,
        b.nangoConnectionId,
        "get-event",
        outlookCalendarNangoProxyRecordSchema,
        { eventId: p.eventId, ...(p.timeZone ? { timezone: p.timeZone } : {}) },
        sandbox,
      );
      return toolData(
        outlookCalendarEventGetOutputSchema.parse({
          ...readContext(b),
          calendarId: p.calendarId,
          eventId: p.eventId,
          event: normalizeOutlookCalendarEvent(event, p.calendarId),
        }),
      );
    }
    case "outlook_calendar_freebusy_query": {
      const p = outlookCalendarFreebusyQueryInputSchema.parse(params);
      const b = await requireOutlookCalendarNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await outlookCalendarFreeBusyPost({
        providerConfigKey: b.nangoProviderConfigKey,
        connectionId: b.nangoConnectionId,
        data: {
          schedules: p.calendarIds,
          startTime: { dateTime: p.timeMin, timeZone: p.timeZone },
          endTime: { dateTime: p.timeMax, timeZone: p.timeZone },
          availabilityViewInterval: 30,
        },
        sandbox,
      });
      return toolData(
        outlookCalendarFreebusyQueryOutputSchema.parse({
          ...readContext(b),
          calendarIds: p.calendarIds,
          timeMin: p.timeMin,
          timeMax: p.timeMax,
          busy: arrayValue(recordValue(data).value).flatMap((busy) =>
            normalizeOutlookCalendarBusyBlocks(busy, p.calendarIds[0] ?? "primary"),
          ),
        }),
      );
    }
    case "outlook_calendar_free_slots_find": {
      const p = outlookCalendarFreeSlotsFindInputSchema.parse(params);
      const b = await requireOutlookCalendarNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await outlookCalendarFreeBusyPost({
        providerConfigKey: b.nangoProviderConfigKey,
        connectionId: b.nangoConnectionId,
        data: {
          schedules: p.calendarIds,
          startTime: { dateTime: p.timeMin, timeZone: p.timeZone },
          endTime: { dateTime: p.timeMax, timeZone: p.timeZone },
          availabilityViewInterval: 30,
        },
        sandbox,
      });
      const busy: { start: string; end: string }[] = [];
      for (const schedule of data.value ?? []) {
        for (const item of schedule.scheduleItems ?? []) {
          if (item.status === "busy" || item.status === "tentative" || item.status === "oof") {
            const start = item.start?.dateTime;
            const end = item.end?.dateTime;
            if (start && end) busy.push({ start, end });
          }
        }
      }
      return toolData(
        outlookCalendarFreeSlotsFindOutputSchema.parse({
          ...readContext(b),
          freeSlots: freeSlotsFromBusy({
            timeMin: p.timeMin,
            timeMax: p.timeMax,
            durationMinutes: p.durationMinutes,
            busy,
          })
            .map(normalizeOutlookCalendarFreeSlot)
            .filter((slot): slot is NonNullable<ReturnType<typeof normalizeOutlookCalendarFreeSlot>> =>
              Boolean(slot),
            ),
          calendarsChecked: p.calendarIds.length,
        }),
      );
    }
    default:
      throw new DomainError(
        domainCodes.INTERNAL,
        `Outlook Calendar read handler missing for ${toolName}.`,
      );
  }
}
