import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSupabaseServiceClient,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  outlookCalendarToolContracts,
  type OutlookCalendarToolName,
} from "@ai-assistants/outlook-calendar-contracts/contracts";
import { E2E_TEST_CHANNEL_DEFAULT_PEER_ID } from "../helpers/run/e2e-run";
import { approveAndExecuteProfileAction } from "../helpers/capability/approve-profile-action";
import { createCapabilityToolCoverage } from "../helpers/capability/capability-tool-coverage";
import { seedTestingTrustedE2eChannel } from "../helpers/fixtures/testing-trusted-channel-fixture";
import { TESTING_OUTLOOK_CALENDAR_CAPABILITY } from "../helpers/readiness/testing-capability-readiness";
import { requireSingleTestingNangoConnection } from "../helpers/readiness/testing-provider-readiness";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import {
  buildCapabilityToolRequest,
  withTrustedChannel,
  executeCapabilityTool,
  parseCapabilityToolOutput,
} from "../helpers/run/execute-capability-backend-tool";
import { requireTestingE2eAgent } from "../helpers/run/testing-launch-support";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { asRecord } from "../helpers/utils/as-record";
import { requireTestingProvidersLive } from "../helpers/provider-runtime/testing-provider-runtime";

const CAPABILITY_ID = "outlook-calendar";
const CALENDAR_TIME_ZONE = "America/Toronto";
const EVENT_DAYS_FROM_NOW = 10;
const PRIMARY_CALENDAR_ID = "primary";

const outlookCalendarCoverage = createCapabilityToolCoverage(
  CAPABILITY_ID,
  outlookCalendarToolContracts,
);

type CalendarEventWindow = {
  startIso: string;
  endIso: string;
  timeMin: string;
  timeMax: string;
};

function formatWallClockInTimeZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    hour12: false,
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) {
      throw new Error(`Missing ${type} while formatting ${timeZone} wall clock.`);
    }
    return value;
  };
  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}:${pick("second")}`;
}

function timeZoneOffsetForInstant(instant: Date, timeZone: string): string {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  const match = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) {
    throw new Error(`Unable to resolve offset for ${timeZone}: ${name}`);
  }
  return `${match[1]}${match[2].padStart(2, "0")}:${(match[3] ?? "00").padStart(2, "0")}`;
}

function isoDateTimeInTimeZone(instant: Date, timeZone: string): string {
  return `${formatWallClockInTimeZone(instant, timeZone)}${timeZoneOffsetForInstant(instant, timeZone)}`;
}

function resolveLocalDateTimeInTimeZone(localDateTime: string, timeZone: string): Date {
  let guessMs = Date.parse(`${localDateTime}Z`);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const guess = new Date(guessMs);
    const formatted = formatWallClockInTimeZone(guess, timeZone);
    if (formatted === localDateTime) return guess;
    guessMs += Date.parse(`${localDateTime}Z`) - Date.parse(`${formatted}Z`);
  }
  throw new Error(`Failed to resolve ${localDateTime} in ${timeZone}`);
}

function calendarEventWindow(daysFromNow: number): CalendarEventWindow {
  const anchor = new Date(Date.now() + daysFromNow * 86_400_000);
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(anchor);
  const year = dateParts.find((part) => part.type === "year")!.value;
  const month = dateParts.find((part) => part.type === "month")!.value;
  const day = dateParts.find((part) => part.type === "day")!.value;

  const nextDayAnchor = new Date(anchor.getTime() + 86_400_000);
  const nextDayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(nextDayAnchor);
  const nextYear = nextDayParts.find((part) => part.type === "year")!.value;
  const nextMonth = nextDayParts.find((part) => part.type === "month")!.value;
  const nextDay = nextDayParts.find((part) => part.type === "day")!.value;

  const startInstant = resolveLocalDateTimeInTimeZone(
    `${year}-${month}-${day}T14:00:00`,
    CALENDAR_TIME_ZONE,
  );
  const endInstant = resolveLocalDateTimeInTimeZone(
    `${year}-${month}-${day}T15:00:00`,
    CALENDAR_TIME_ZONE,
  );
  const dayStartInstant = resolveLocalDateTimeInTimeZone(
    `${year}-${month}-${day}T00:00:00`,
    CALENDAR_TIME_ZONE,
  );
  const nextDayStartInstant = resolveLocalDateTimeInTimeZone(
    `${nextYear}-${nextMonth}-${nextDay}T00:00:00`,
    CALENDAR_TIME_ZONE,
  );

  return {
    startIso: isoDateTimeInTimeZone(startInstant, CALENDAR_TIME_ZONE),
    endIso: isoDateTimeInTimeZone(endInstant, CALENDAR_TIME_ZONE),
    timeMin: isoDateTimeInTimeZone(dayStartInstant, CALENDAR_TIME_ZONE),
    timeMax: isoDateTimeInTimeZone(nextDayStartInstant, CALENDAR_TIME_ZONE),
  };
}

function recordIdFromProviderResult(toolName: string, value: unknown): string {
  const result = asRecord(value, `${toolName} provider result`);
  const id = result.id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(
      `${toolName} provider result.id must be a non-empty string; got ${JSON.stringify(result)}`,
    );
  }
  return id;
}

function providerResultFromExecutedAction(
  action: TableRow<"profile_actions">,
  label: string,
  expectedProvider: string,
): Record<string, unknown> {
  const payload = asRecord(action.result_payload, `${label} result_payload`);
  assert.equal(payload.provider, expectedProvider);
  return asRecord(payload.result, `${label} provider result`);
}

function executedProviderEventId(
  action: TableRow<"profile_actions">,
  label: string,
  expectedProvider: string,
): string {
  return recordIdFromProviderResult(
    label,
    providerResultFromExecutedAction(action, label, expectedProvider),
  );
}

async function typedOutlookCalendarTool<const T extends OutlookCalendarToolName>(
  db: SupabaseServiceClient,
  toolName: T,
  params: Record<string, unknown>,
  options?: { trusted?: boolean },
) {
  outlookCalendarCoverage.exercise(toolName);
  let request = buildCapabilityToolRequest({
    capabilityId: CAPABILITY_ID,
    toolName,
    params,
  });
  if (options?.trusted !== false) {
    request = withTrustedChannel(request, CAPABILITY_ID);
  }
  const result = await executeCapabilityTool(db, request);
  return parseCapabilityToolOutput(result, outlookCalendarToolContracts, toolName);
}

async function approveCalendarWrite(input: {
  db: SupabaseServiceClient;
  write: { actionId: string };
  decisionUserId: string;
}): Promise<TableRow<"profile_actions">> {
  const actionResult = await input.db
    .from("profile_actions")
    .select()
    .eq("id", input.write.actionId)
    .single();
  const action = requireSupabaseData(
    `Load calendar write action ${input.write.actionId}`,
    actionResult.data,
    actionResult.error,
  );
  return approveAndExecuteProfileAction({
    db: input.db,
    action,
    decisionUserId: input.decisionUserId,
  });
}

function isIgnorableCalendarCleanupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found|404|already deleted|resource has been deleted/i.test(message);
}

async function cancelOutlookCalendarEventIfNeeded(input: {
  db: SupabaseServiceClient;
  connectedAccountId: string;
  calendarId: string;
  eventId: string | null;
  decisionUserId: string;
  cancelled: boolean;
}): Promise<boolean> {
  if (input.cancelled || !input.eventId) return input.cancelled;
  try {
    const params = {
      connectedAccountId: input.connectedAccountId,
      calendarId: input.calendarId,
      eventId: input.eventId,
      sendUpdates: "none",
    };
    const cancelWrite = await typedOutlookCalendarTool(
      input.db,
      "outlook_calendar_event_cancel",
      params,
      {
        trusted: true,
      },
    );
    await approveCalendarWrite({
      db: input.db,
      write: cancelWrite.write,
      decisionUserId: input.decisionUserId,
    });
    return true;
  } catch (error) {
    if (isIgnorableCalendarCleanupError(error)) return true;
    throw error;
  }
}

test("Testing client: Outlook Calendar capability lifecycle works end-to-end.", async (t) => {
  const expectedProvider = "outlook-calendar";
  requireTestingE2eAgent();
  const run = await createE2eRun(t, { id: CAPABILITY_ID });
  await attachE2eSupabase(run);
  const db = createSupabaseServiceClient();
  await requireTestingProvidersLive(db, [CAPABILITY_ID]);
  const marker = createMarker("testing-outlook-calendar");
  const fixture = await requireSingleTestingNangoConnection(
    db,
    TESTING_OUTLOOK_CALENDAR_CAPABILITY,
  );
  assert.equal(fixture.capabilityAccountLink.profile_id, "testing");
  const profileResult = await db.from("profiles").select("user_id").eq("id", "testing").single();
  const testingProfile = requireSupabaseData(
    "Load testing profile user for approval decisions",
    profileResult.data,
    profileResult.error,
  );
  assert.ok(
    testingProfile.user_id,
    "testing profile must have a portal user_id for approval decisions",
  );
  const decisionUserId = testingProfile.user_id;
  const connectedAccountId = fixture.connectedAccount.id;
  const { cleanup: trustedChannelCleanup } = await seedTestingTrustedE2eChannel({
    db,
    profileId: "testing",
    peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
    marker,
    purpose: "calendar-outlook-e2e",
  });

  const eventWindow = calendarEventWindow(EVENT_DAYS_FROM_NOW);
  const initialTitle = `${marker} Jordan Rowan planning session`;
  const updatedTitle = `${marker} Jordan Rowan planning session updated`;
  let eventId: string | null = null;
  let eventCancelled = false;

  try {
    const accounts = await typedOutlookCalendarTool(db, "outlook_calendar_accounts_list", {});
    assert.ok(
      accounts.accounts.some((account) => account.connectedAccountId === connectedAccountId),
      `outlook_calendar_accounts_list must include connected Outlook Calendar account ${connectedAccountId}`,
    );

    const calendars = await typedOutlookCalendarTool(db, "outlook_calendar_calendars_list", {
      connectedAccountId,
    });
    assert.equal(calendars.provider, expectedProvider);
    assert.ok(calendars.calendars.length > 0, "calendar_calendars_list must return calendars");

    const createWrite = await typedOutlookCalendarTool(
      db,
      "outlook_calendar_event_create",
      {
        connectedAccountId,
        calendarId: PRIMARY_CALENDAR_ID,
        title: initialTitle,
        start: { dateTime: eventWindow.startIso, timeZone: CALENDAR_TIME_ZONE },
        end: { dateTime: eventWindow.endIso, timeZone: CALENDAR_TIME_ZONE },
        attendees: [],
        conferencePreference: "none",
        sendUpdates: "none",
      },
      { trusted: true },
    );
    const createExecuted = await approveCalendarWrite({
      db,
      write: createWrite.write,
      decisionUserId,
    });
    eventId = executedProviderEventId(
      createExecuted,
      "outlook_calendar_event_create",
      expectedProvider,
    );

    const eventGet = await typedOutlookCalendarTool(db, "outlook_calendar_event_get", {
      connectedAccountId,
      calendarId: PRIMARY_CALENDAR_ID,
      eventId,
      timeZone: CALENDAR_TIME_ZONE,
    });
    assert.equal(eventGet.eventId, eventId);
    assert.equal(eventGet.event.title, initialTitle);

    const updateWrite = await typedOutlookCalendarTool(
      db,
      "outlook_calendar_event_update",
      {
        connectedAccountId,
        calendarId: PRIMARY_CALENDAR_ID,
        eventId,
        title: updatedTitle,
        sendUpdates: "none",
      },
      { trusted: true },
    );
    await approveCalendarWrite({
      db,
      write: updateWrite.write,
      decisionUserId,
    });

    const updatedEvent = await typedOutlookCalendarTool(db, "outlook_calendar_event_get", {
      connectedAccountId,
      calendarId: PRIMARY_CALENDAR_ID,
      eventId,
      timeZone: CALENDAR_TIME_ZONE,
    });
    assert.equal(updatedEvent.event.title, updatedTitle);

    const eventsList = await typedOutlookCalendarTool(db, "outlook_calendar_events_list", {
      connectedAccountId,
      calendarId: PRIMARY_CALENDAR_ID,
      timeMin: eventWindow.timeMin,
      timeMax: eventWindow.timeMax,
      timeZone: CALENDAR_TIME_ZONE,
    });
    assert.ok(
      eventsList.events.some((event) => event.id === eventId),
      `outlook_calendar_events_list must include created event ${eventId}`,
    );

    const freebusy = await typedOutlookCalendarTool(db, "outlook_calendar_freebusy_query", {
      connectedAccountId,
      calendarIds: [PRIMARY_CALENDAR_ID],
      timeMin: eventWindow.timeMin,
      timeMax: eventWindow.timeMax,
      timeZone: CALENDAR_TIME_ZONE,
    });
    assert.equal(freebusy.provider, expectedProvider);
    assert.ok(Array.isArray(freebusy.busy));

    const freeSlots = await typedOutlookCalendarTool(db, "outlook_calendar_free_slots_find", {
      connectedAccountId,
      calendarIds: [PRIMARY_CALENDAR_ID],
      timeMin: eventWindow.timeMin,
      timeMax: eventWindow.timeMax,
      timeZone: CALENDAR_TIME_ZONE,
      durationMinutes: 30,
    });
    assert.equal(freeSlots.provider, expectedProvider);
    assert.ok(
      freeSlots.freeSlots.some((slot) => slot.durationMinutes >= 30),
      "outlook_calendar_free_slots_find must return at least one slot of 30 minutes or longer",
    );

    const cancelWrite = await typedOutlookCalendarTool(
      db,
      "outlook_calendar_event_cancel",
      {
        connectedAccountId,
        calendarId: PRIMARY_CALENDAR_ID,
        eventId,
        sendUpdates: "none",
      },
      { trusted: true },
    );
    await approveCalendarWrite({
      db,
      write: cancelWrite.write,
      decisionUserId,
    });
    eventCancelled = true;
    outlookCalendarCoverage.assertComplete();

    console.log(
      JSON.stringify(
        {
          ok: true,
          marker,
          provider: expectedProvider,
          connectedAccountId,
          eventId,
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      eventCancelled = await cancelOutlookCalendarEventIfNeeded({
        db,
        connectedAccountId,
        calendarId: PRIMARY_CALENDAR_ID,
        eventId,
        decisionUserId,
        cancelled: eventCancelled,
      });
    } finally {
      await trustedChannelCleanup();
    }
  }
});
