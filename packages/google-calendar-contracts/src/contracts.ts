import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  toolOutputProperty,
  writeToolDescription,
  type ToolContract,
} from "@ai-assistants/tool-contracts";
import {
  googleCalendarAccountsListInputSchema,
  googleCalendarCalendarsListInputSchema,
  googleCalendarEventCancelInputSchema,
  googleCalendarEventCreateInputSchema,
  googleCalendarEventGetInputSchema,
  googleCalendarEventsListInputSchema,
  googleCalendarEventsSearchInputSchema,
  googleCalendarEventUpdateInputSchema,
  googleCalendarFreebusyQueryInputSchema,
  googleCalendarFreeSlotsFindInputSchema,
  googleCalendarAccountsListOutputSchema,
  googleCalendarExternalWriteOutputSchema,
  googleCalendarCalendarsListOutputSchema,
  googleCalendarEventGetOutputSchema,
  googleCalendarEventsListOutputSchema,
  googleCalendarFreeSlotsFindOutputSchema,
  googleCalendarFreebusyQueryOutputSchema,
} from "./schemas";

export const GOOGLE_CALENDAR_PLUGIN_ID = "google-calendar-tools";

export const googleCalendarToolContracts = [
  defineReadTool({
    name: "google_calendar_accounts_list",
    pluginId: GOOGLE_CALENDAR_PLUGIN_ID,
    label: "List Google Calendar Accounts",
    description: readToolDescription({
      useWhen: "the agent needs configured Google Calendar account choices for this profile",
      operation:
        "Lists enabled Google Calendar capability instances, including labels, provider, and connection health, without calling the provider",
      returns: "calendar account metadata for choosing connectedAccountId",
      notes: ["Use this before calendar reads or writes when multiple calendar accounts may exist"],
    }),
    inputSchema: googleCalendarAccountsListInputSchema,
    outputSchema: googleCalendarAccountsListOutputSchema,
  }),
  defineReadTool({
    name: "google_calendar_calendars_list",
    pluginId: GOOGLE_CALENDAR_PLUGIN_ID,
    label: "List Google Calendars",
    description: readToolDescription({
      useWhen: "the target provider calendar id is unknown",
      operation: "Lists calendars from the connected Google Calendar account",
      returns: "calendar ids, names, and provider calendar metadata",
      notes: [
        "Use before event reads or writes when the target calendar id must be chosen",
        "Pass connectedAccountId from google_calendar_accounts_list when multiple calendar accounts may exist",
      ],
    }),
    inputSchema: googleCalendarCalendarsListInputSchema,
    outputSchema: googleCalendarCalendarsListOutputSchema,
  }),
  defineReadTool({
    name: "google_calendar_events_list",
    pluginId: GOOGLE_CALENDAR_PLUGIN_ID,
    label: "List Google Calendar Events",
    description: readToolDescription({
      useWhen: "the user needs Google Calendar schedule review or time-window event discovery",
      operation: "Lists events in a bounded time window from one Google calendar",
      returns: "calendar event summaries and pagination details",
      notes: [
        "calendarId is required on every call; omit it only when the default primary calendar is intended (schema default)",
        "Use calendarId primary for the user's default calendar when they did not name a specific calendar; call google_calendar_calendars_list when a non-default calendar id is needed",
        "Pass an IANA timeZone with timeMin and timeMax so the provider interprets the event window correctly",
        "When displaying returned event times to the user, convert UTC or offset timestamps to the requested/profile timezone before writing local clock times",
        "Do not use google_calendar_events_search for plain today/tomorrow schedule review on Google; use google_calendar_events_list with a bounded time window instead",
      ],
    }),
    inputSchema: googleCalendarEventsListInputSchema,
    outputSchema: googleCalendarEventsListOutputSchema,
  }),
  defineReadTool({
    name: "google_calendar_event_get",
    pluginId: GOOGLE_CALENDAR_PLUGIN_ID,
    label: "Get Google Calendar Event",
    description: readToolDescription({
      useWhen: "exact calendar event details are needed",
      operation: "Gets one calendar event by provider event id from a specific calendar",
      returns: "event details, timing, attendees, conferencing, and provider metadata",
      notes: [
        "Use after google_calendar_events_list or google_calendar_events_search when you have an event id but need full event details not present in summaries",
      ],
    }),
    inputSchema: googleCalendarEventGetInputSchema,
    outputSchema: googleCalendarEventGetOutputSchema,
  }),
  defineReadTool({
    name: "google_calendar_freebusy_query",
    pluginId: GOOGLE_CALENDAR_PLUGIN_ID,
    label: "Query Google Calendar Availability",
    description: readToolDescription({
      useWhen: "raw occupied intervals are needed before suggesting availability",
      operation: "Queries busy blocks across selected calendars for a bounded time window",
      returns: "busy intervals with calendarId on each block",
      notes: [
        "Pass an IANA timeZone with timeMin and timeMax so busy intervals are interpreted in the intended timezone",
      ],
    }),
    inputSchema: googleCalendarFreebusyQueryInputSchema,
    outputSchema: googleCalendarFreebusyQueryOutputSchema,
  }),
  defineReadTool({
    name: "google_calendar_events_search",
    pluginId: GOOGLE_CALENDAR_PLUGIN_ID,
    label: "Search Calendar Events",
    description: readToolDescription({
      useWhen: "Google Calendar text search is needed for event discovery",
      operation: "Searches Google Calendar events by text query",
      returns: "matching event summaries and pagination details",
      doNotUse:
        "the account is not Google Calendar, the user only needs a schedule window such as today or tomorrow, or google_calendar_events_list already covers the request",
      notes: [
        "calendarId is required; use primary for the default calendar unless a specific calendar id is known",
        "Requires a free-text query; for schedule review without text search, use google_calendar_events_list with timeMin and timeMax instead",
      ],
    }),
    inputSchema: googleCalendarEventsSearchInputSchema,
    outputSchema: googleCalendarEventsListOutputSchema,
  }),
  defineReadTool({
    name: "google_calendar_free_slots_find",
    pluginId: GOOGLE_CALENDAR_PLUGIN_ID,
    label: "Find Google Calendar Free Time Slots",
    description: readToolDescription({
      useWhen: "the user needs scheduling suggestions before proposing meeting times",
      operation:
        "Finds contiguous free slots meeting a minimum duration across selected calendars and a bounded time window",
      returns: "candidate free time slots that satisfy the requested duration",
      notes: [
        "Pass an IANA timeZone with timeMin and timeMax so slot calculation uses the intended timezone",
        "Finding and proposing slots is read-only. If an attendee email is missing, still return/propose candidate times and ask for the email before event creation.",
      ],
    }),
    inputSchema: googleCalendarFreeSlotsFindInputSchema,
    outputSchema: googleCalendarFreeSlotsFindOutputSchema,
  }),
  defineWriteTool({
    name: "google_calendar_event_create",
    pluginId: GOOGLE_CALENDAR_PLUGIN_ID,
    label: "Create Calendar Event",
    description: writeToolDescription({
      useWhen: "the user wants to create a calendar event",
      operation:
        "Creates an event on a connected provider calendar, including attendees, location, description, and conferencing when supplied",
      returns: `the ${toolOutputProperty(googleCalendarExternalWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      sideEffect:
        "may create a provider calendar event, email attendees depending on sendUpdates, request provider conferencing, or create an approval-governed calendar action",
      safety:
        "calendar, title, time range, attendees, notification intent, and conferencing intent must be clear. sendUpdates is an internal API option; in visible replies, describe notification behavior in plain language instead of naming sendUpdates.",
    }),
    inputSchema: googleCalendarEventCreateInputSchema,
    outputSchema: googleCalendarExternalWriteOutputSchema,
    externalAction: "google_calendar.event.create",
  }),
  defineWriteTool({
    name: "google_calendar_event_update",
    pluginId: GOOGLE_CALENDAR_PLUGIN_ID,
    label: "Update Calendar Event",
    description: writeToolDescription({
      useWhen: "the user wants to update an existing calendar event",
      operation:
        "Updates one provider calendar event with the supplied changed fields; sendUpdates only controls attendee notifications",
      returns: `the ${toolOutputProperty(googleCalendarExternalWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      notes: [
        "When attendees is supplied, it replaces the entire attendee list; omit it to leave attendees unchanged",
        "conferencePreference is an actual updatable field when conferencing behavior must change",
      ],
      sideEffect:
        "may modify a provider calendar event, email attendees depending on sendUpdates, or create an approval-governed calendar action",
      safety:
        "the exact calendar event and at least one actual field change must be clear; sendUpdates alone is not a valid update. sendUpdates is an internal API option; in visible replies, describe notification behavior in plain language instead of naming sendUpdates.",
    }),
    inputSchema: googleCalendarEventUpdateInputSchema,
    outputSchema: googleCalendarExternalWriteOutputSchema,
    externalAction: "google_calendar.event.modify",
  }),
  defineWriteTool({
    name: "google_calendar_event_cancel",
    pluginId: GOOGLE_CALENDAR_PLUGIN_ID,
    label: "Cancel Calendar Event",
    description: writeToolDescription({
      useWhen: "the user wants to cancel or delete a calendar event",
      operation:
        "Cancels or deletes one calendar event using provider attendee notification semantics",
      returns: `the ${toolOutputProperty(googleCalendarExternalWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      notes: [
        "sendUpdates controls whether attendees receive cancellation notices when supported, but visible replies should describe notification behavior in plain language instead of naming sendUpdates.",
      ],
      sideEffect:
        "may remove or cancel a provider calendar event, notify attendees, or create an approval-governed calendar action",
      safety:
        "the exact event and attendee notification intent must be clear because this is destructive",
    }),
    inputSchema: googleCalendarEventCancelInputSchema,
    outputSchema: googleCalendarExternalWriteOutputSchema,
    externalAction: "google_calendar.event.cancel",
  }),
] as const satisfies readonly ToolContract[];

export type GoogleCalendarToolName = (typeof googleCalendarToolContracts)[number]["name"];
