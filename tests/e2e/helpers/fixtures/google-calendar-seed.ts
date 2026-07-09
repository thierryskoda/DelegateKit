import { randomUUID } from "node:crypto";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { ProviderSandboxBinding } from "../../../../apps/backend/src/test-support/provider-sandbox";
import { seedProviderSandboxOperationResponses } from "../provider-runtime/provider-sandbox-fixtures";
import { requireTestingProviderSandboxBinding } from "../provider-runtime/testing-provider-runtime";
import { TESTING_FIXTURE_CLIENT } from "../test-data/testing-realistic-data";

const GOOGLE_CALENDAR_CAPABILITY_ID = "google-calendar";
const GOOGLE_CALENDAR_PROVIDER = "google-calendar";
const GOOGLE_CALENDAR_PROVIDER_KEY = "ai-assistants-google";
const GOOGLE_CALENDAR_PRIMARY_ID = "primary";
const GOOGLE_CALENDAR_TIME_ZONE = "America/Toronto";

type GoogleCalendarSandboxEventInput = {
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  attendees?: Array<{ email: string; displayName?: string; responseStatus?: string }>;
  organizer?: { email: string; displayName?: string };
  meetingUrl?: string;
};

export type GoogleCalendarSandboxFixtureInput = {
  events?: readonly GoogleCalendarSandboxEventInput[];
  busy?: readonly { start: string; end: string }[];
};

async function requireGoogleCalendarSandboxBinding(db: SupabaseServiceClient): Promise<{
  binding: ProviderSandboxBinding;
  providerKey: typeof GOOGLE_CALENDAR_PROVIDER_KEY;
}> {
  const fixture = await requireTestingProviderSandboxBinding(db, {
    capabilitySlug: GOOGLE_CALENDAR_CAPABILITY_ID,
    provider: GOOGLE_CALENDAR_PROVIDER,
  });
  return {
    binding: {
      link: fixture.capabilityAccountLink,
      account: fixture.connectedAccount,
    },
    providerKey: GOOGLE_CALENDAR_PROVIDER_KEY,
  };
}

function googleCalendarEvent(input: GoogleCalendarSandboxEventInput): Record<string, unknown> {
  const id = `sandbox-calendar-${randomUUID()}`;
  return {
    id,
    iCalUID: `${id}@ai-assistants-e2e.local`,
    status: "confirmed",
    summary: input.title,
    ...(input.description ? { description: input.description } : {}),
    ...(input.location ? { location: input.location } : {}),
    htmlLink: `https://calendar.google.com/calendar/event?eid=${id}`,
    hangoutLink: input.meetingUrl ?? "https://meet.google.com/jrr-client-call",
    start: { dateTime: input.start, timeZone: GOOGLE_CALENDAR_TIME_ZONE },
    end: { dateTime: input.end, timeZone: GOOGLE_CALENDAR_TIME_ZONE },
    organizer: input.organizer ?? {
      email: "john.moreau@advisory.example",
      displayName: "John Moreau",
    },
    attendees: input.attendees ?? [
      {
        email: TESTING_FIXTURE_CLIENT.person.email,
        displayName: TESTING_FIXTURE_CLIENT.person.fullName,
        responseStatus: "accepted",
      },
    ],
    conferenceData: {
      entryPoints: [
        {
          entryPointType: "video",
          uri: input.meetingUrl ?? "https://meet.google.com/jrr-client-call",
        },
      ],
    },
  };
}

export async function seedGoogleCalendarSandboxForE2e(
  db: SupabaseServiceClient,
  input: GoogleCalendarSandboxFixtureInput,
): Promise<void> {
  const { binding, providerKey } = await requireGoogleCalendarSandboxBinding(db);
  const events = (input.events ?? []).map(googleCalendarEvent);
  const busy = [...(input.busy ?? [])];
  const calendarList = {
    items: [
      {
        id: GOOGLE_CALENDAR_PRIMARY_ID,
        summary: "John Moreau",
        primary: true,
        timeZone: GOOGLE_CALENDAR_TIME_ZONE,
      },
    ],
  };
  const eventList = { items: events, nextPageToken: null };
  const eventDetail = events[0] ?? {
    id: "sandbox-calendar-missing-event",
    status: "cancelled",
    summary: "No matching event",
  };
  const freeBusy = {
    calendars: {
      [GOOGLE_CALENDAR_PRIMARY_ID]: {
        busy,
      },
    },
  };
  await seedProviderSandboxOperationResponses({
    db,
    binding,
    fixtures: [
      {
        providerKey,
        operation: "nango.google_calendar.proxy.list-calendars",
        response: calendarList,
      },
      {
        providerKey,
        operation: "nango.google_calendar.proxy.list-events",
        response: eventList,
      },
      {
        providerKey,
        operation: "nango.google_calendar.proxy.list-calendar-events",
        response: eventList,
      },
      {
        providerKey,
        operation: "nango.google_calendar.proxy.search-events",
        response: eventList,
      },
      {
        providerKey,
        operation: "nango.google_calendar.proxy.get-event",
        response: eventDetail,
      },
      {
        providerKey,
        operation: "nango.google_calendar.proxy.query-free-busy",
        response: freeBusy,
      },
      {
        providerKey,
        operation: "nango.google_calendar.proxy.find-free-slots",
        response: freeBusy,
      },
    ],
  });
}

function torontoDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GOOGLE_CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => {
    const part = parts.find((item) => item.type === type)?.value;
    if (!part) throw new Error(`Missing ${type} part while formatting Toronto date.`);
    return Number(part);
  };
  return { year: value("year"), month: value("month"), day: value("day") };
}

function addDays(
  parts: { year: number; month: number; day: number },
  days: number,
): {
  year: number;
  month: number;
  day: number;
} {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return torontoDateParts(utc);
}

function isoLocal(parts: { year: number; month: number; day: number }, time: string): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${time}:00-04:00`;
}

export function testingCalendarRelativeFixtures(now = new Date()): {
  today: { year: number; month: number; day: number };
  tomorrow: { year: number; month: number; day: number };
  eventSummary: GoogleCalendarSandboxFixtureInput;
  tomorrowAfternoonBusy: GoogleCalendarSandboxFixtureInput;
} {
  const today = torontoDateParts(now);
  const tomorrow = addDays(today, 1);
  return {
    today,
    tomorrow,
    eventSummary: {
      events: [
        {
          title: "Jordan Rowan mandate review",
          start: isoLocal(today, "10:00"),
          end: isoLocal(today, "10:45"),
          location: "HV Advisory office",
          description: "Review final mandate details and open signature questions.",
        },
        {
          title: "Jordan Rowan financing follow-up",
          start: isoLocal(tomorrow, "14:30"),
          end: isoLocal(tomorrow, "15:00"),
          location: "Google Meet",
          description: "Confirm next documents and timeline.",
          meetingUrl: "https://meet.google.com/jrr-follow-up",
        },
      ],
    },
    tomorrowAfternoonBusy: {
      busy: [
        { start: isoLocal(tomorrow, "13:00"), end: isoLocal(tomorrow, "13:30") },
        { start: isoLocal(tomorrow, "15:00"), end: isoLocal(tomorrow, "15:30") },
      ],
    },
  };
}
