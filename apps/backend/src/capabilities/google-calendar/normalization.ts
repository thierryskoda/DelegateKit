import {
  googleCalendarBusyBlockSchema,
  googleCalendarEventDetailSchema,
  googleCalendarEventListItemFields,
  googleCalendarEventListItemSchema,
  googleCalendarFreeSlotSchema,
  googleCalendarSummarySchema,
  type GoogleCalendarEventDetail,
  type GoogleCalendarEventListItem,
} from "@ai-assistants/google-calendar-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import { pickFields } from "../../shared/pick-fields";

const rawRecordSchema = z.record(z.string(), z.unknown());

type CalendarSummary = z.infer<typeof googleCalendarSummarySchema>;
type BusyBlock = z.infer<typeof googleCalendarBusyBlockSchema>;
type FreeSlot = z.infer<typeof googleCalendarFreeSlotSchema>;

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
  throw new DomainError(domainCodes.INTERNAL, `Google Calendar response missing ${fieldName}.`);
}

function boolValue(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function dateTimeValue(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? text : null;
}

function dateObjectValue(value: unknown): string | null {
  const record = recordValue(value);
  return dateTimeValue(record.dateTime) ?? dateTimeValue(record.date);
}

function attendee(value: unknown): GoogleCalendarEventDetail["organizer"] {
  const record = recordValue(value);
  const email = stringValue(record.email);
  if (!email || !z.string().email().safeParse(email).success) return null;
  return {
    name: stringValue(record.displayName),
    email,
    responseStatus: stringValue(record.responseStatus),
  };
}

export function normalizeGoogleCalendarSummary(raw: unknown): CalendarSummary {
  const record = recordValue(raw);
  const summary = {
    id: requiredString(record.id, "calendar id"),
    name: stringValue(record.summary),
    description: stringValue(record.description),
    timezone: stringValue(record.timeZone),
    primary: boolValue(record.primary) || stringValue(record.id) === "primary",
  } satisfies CalendarSummary;
  return googleCalendarSummarySchema.parse(summary);
}

export function normalizeGoogleCalendarEvent(raw: unknown, calendarId: string): GoogleCalendarEventDetail {
  const record = recordValue(raw);
  const start = recordValue(record.start);
  const end = recordValue(record.end);
  const organizer = attendee(record.organizer);
  const attendees = arrayValue(record.attendees)
    .map(attendee)
    .filter((item): item is NonNullable<GoogleCalendarEventDetail["organizer"]> => Boolean(item));
  const conferenceData = recordValue(record.conferenceData);
  const entryPoints = arrayValue(conferenceData.entryPoints).map(recordValue);
  const meetingUrl =
    stringValue(record.hangoutLink) ??
    entryPoints.map((entry) => stringValue(entry.uri)).find(Boolean) ??
    null;
  const event = {
    id: requiredString(stringValue(record.id) ?? stringValue(record.iCalUID), "event id"),
    calendarId,
    title: stringValue(record.summary),
    description: stringValue(record.description),
    location: stringValue(record.location),
    start: dateObjectValue(start),
    end: dateObjectValue(end),
    allDay: Boolean(stringValue(start.date)),
    status: stringValue(record.status),
    organizer,
    attendees,
    meetingUrl,
  } satisfies GoogleCalendarEventDetail;
  return googleCalendarEventDetailSchema.parse(event);
}

export function normalizeGoogleCalendarEventListItem(
  raw: unknown,
  calendarId: string,
): GoogleCalendarEventListItem {
  const event = normalizeGoogleCalendarEvent(raw, calendarId);
  const listItem = pickFields(event, googleCalendarEventListItemFields) satisfies GoogleCalendarEventListItem;
  return googleCalendarEventListItemSchema.parse(listItem);
}

export function normalizeGoogleCalendarBusyBlocks(
  raw: unknown,
  fallbackCalendarId: string,
): BusyBlock[] {
  const record = recordValue(raw);
  const calendarId = stringValue(record.calendarId) ?? fallbackCalendarId;
  const blocks = arrayValue(record.busy);
  return blocks
    .map((item) => {
      const busy = recordValue(item);
      const start = dateObjectValue(busy.start) ?? dateTimeValue(busy.start);
      const end = dateObjectValue(busy.end) ?? dateTimeValue(busy.end);
      if (!start || !end) return null;
      const block = { calendarId, start, end } satisfies BusyBlock;
      return googleCalendarBusyBlockSchema.parse(block);
    })
    .filter((item): item is BusyBlock => Boolean(item));
}

export function normalizeGoogleCalendarFreeSlot(raw: unknown): FreeSlot | null {
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
  return googleCalendarFreeSlotSchema.parse(slot);
}
