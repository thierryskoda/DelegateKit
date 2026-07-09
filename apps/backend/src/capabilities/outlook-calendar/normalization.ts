import {
  outlookCalendarBusyBlockSchema,
  outlookCalendarEventDetailSchema,
  outlookCalendarEventListItemFields,
  outlookCalendarEventListItemSchema,
  outlookCalendarFreeSlotSchema,
  outlookCalendarSummarySchema,
  type OutlookCalendarEventDetail,
  type OutlookCalendarEventListItem,
} from "@ai-assistants/outlook-calendar-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import { pickFields } from "../../shared/pick-fields";

const rawRecordSchema = z.record(z.string(), z.unknown());

type CalendarSummary = z.infer<typeof outlookCalendarSummarySchema>;
type BusyBlock = z.infer<typeof outlookCalendarBusyBlockSchema>;
type FreeSlot = z.infer<typeof outlookCalendarFreeSlotSchema>;

function recordValue(value: unknown): Record<string, unknown> {
  return rawRecordSchema.safeParse(value).success ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown, fieldName: string): string {
  const text = stringValue(value);
  if (text) return text;
  throw new DomainError(domainCodes.INTERNAL, `Outlook Calendar response missing ${fieldName}.`);
}

function boolValue(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function dateTimeValue(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function dateObjectValue(value: unknown): string | null {
  const record = recordValue(value);
  return dateTimeValue(record.dateTime) ?? dateTimeValue(record.date);
}

function attendee(value: unknown): OutlookCalendarEventDetail["organizer"] {
  const record = recordValue(value);
  const nested = recordValue(record.emailAddress);
  const email = stringValue(nested.address);
  if (!email || !z.string().email().safeParse(email).success) return null;
  return {
    name: stringValue(nested.name),
    email,
    responseStatus: stringValue(record.status),
  };
}

export function normalizeOutlookCalendarSummary(raw: unknown): CalendarSummary {
  const record = recordValue(raw);
  const summary = {
    id: requiredString(record.id, "calendar id"),
    name: stringValue(record.name),
    description: null,
    timezone: stringValue(record.timeZone),
    primary: boolValue(record.isDefaultCalendar) || stringValue(record.id) === "primary",
  } satisfies CalendarSummary;
  return outlookCalendarSummarySchema.parse(summary);
}

export function normalizeOutlookCalendarEvent(raw: unknown, calendarId: string): OutlookCalendarEventDetail {
  const record = recordValue(raw);
  const start = recordValue(record.start);
  const end = recordValue(record.end);
  const organizer = attendee(record.organizer);
  const attendees = arrayValue(record.attendees)
    .map(attendee)
    .filter((item): item is NonNullable<OutlookCalendarEventDetail["organizer"]> => Boolean(item));
  const onlineMeeting = recordValue(record.onlineMeeting);
  const meetingUrl =
    stringValue(onlineMeeting.joinUrl) ??
    stringValue(record.onlineMeetingUrl) ??
    null;
  const event = {
    id: requiredString(record.id, "event id"),
    calendarId,
    title: stringValue(record.subject),
    description: stringValue(record.bodyPreview),
    location: stringValue(recordValue(record.location).displayName),
    start: dateObjectValue(start),
    end: dateObjectValue(end),
    allDay: boolValue(record.isAllDay),
    status: stringValue(record.showAs),
    organizer,
    attendees,
    meetingUrl,
  } satisfies OutlookCalendarEventDetail;
  return outlookCalendarEventDetailSchema.parse(event);
}

export function normalizeOutlookCalendarEventListItem(
  raw: unknown,
  calendarId: string,
): OutlookCalendarEventListItem {
  const event = normalizeOutlookCalendarEvent(raw, calendarId);
  const listItem = pickFields(event, outlookCalendarEventListItemFields) satisfies OutlookCalendarEventListItem;
  return outlookCalendarEventListItemSchema.parse(listItem);
}

export function normalizeOutlookCalendarBusyBlocks(
  raw: unknown,
  fallbackCalendarId: string,
): BusyBlock[] {
  const record = recordValue(raw);
  const calendarId = stringValue(record.scheduleId) ?? fallbackCalendarId;
  const blocks = arrayValue(record.scheduleItems);
  return blocks
    .map((item) => {
      const busy = recordValue(item);
      const start = dateObjectValue(busy.start) ?? dateTimeValue(busy.start);
      const end = dateObjectValue(busy.end) ?? dateTimeValue(busy.end);
      if (!start || !end) return null;
      const block = { calendarId, start, end } satisfies BusyBlock;
      return outlookCalendarBusyBlockSchema.parse(block);
    })
    .filter((item): item is BusyBlock => Boolean(item));
}

export function normalizeOutlookCalendarFreeSlot(raw: unknown): FreeSlot | null {
  const record = recordValue(raw);
  const start = dateTimeValue(record.start);
  const end = dateTimeValue(record.end);
  const durationMinutes =
    typeof record.durationMinutes === "number"
      ? record.durationMinutes
      : start && end
        ? Math.floor((Date.parse(end) - Date.parse(start)) / 60_000)
        : null;
  if (!start || !end || !durationMinutes || durationMinutes <= 0) return null;
  const slot = { start, end, durationMinutes } satisfies FreeSlot;
  return outlookCalendarFreeSlotSchema.parse(slot);
}
