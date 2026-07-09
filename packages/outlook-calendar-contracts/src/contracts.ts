import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  toolOutputProperty,
  writeToolDescription,
  type ToolContract,
} from "@ai-assistants/tool-contracts";
import {
  outlookCalendarAccountsListInputSchema,
  outlookCalendarCalendarsListInputSchema,
  outlookCalendarEventCancelInputSchema,
  outlookCalendarEventCreateInputSchema,
  outlookCalendarEventGetInputSchema,
  outlookCalendarEventsListInputSchema,
  outlookCalendarEventUpdateInputSchema,
  outlookCalendarFreebusyQueryInputSchema,
  outlookCalendarFreeSlotsFindInputSchema,
  outlookCalendarAccountsListOutputSchema,
  outlookCalendarExternalWriteOutputSchema,
  outlookCalendarCalendarsListOutputSchema,
  outlookCalendarEventGetOutputSchema,
  outlookCalendarEventsListOutputSchema,
  outlookCalendarFreeSlotsFindOutputSchema,
  outlookCalendarFreebusyQueryOutputSchema,
} from "./schemas";

export const OUTLOOK_CALENDAR_PLUGIN_ID = "outlook-calendar-tools";

export const outlookCalendarToolContracts = [
  defineReadTool({
    name: "outlook_calendar_accounts_list",
    pluginId: OUTLOOK_CALENDAR_PLUGIN_ID,
    label: "List Calendar Accounts",
    description: readToolDescription({
      useWhen: "the agent needs configured calendar account choices for this profile",
      operation:
        "Lists enabled calendar capability instances, including labels, provider, and connection health, without calling the provider",
      returns: "calendar account metadata for choosing connectedAccountId",
      notes: ["Use this before calendar reads or writes when multiple calendar accounts may exist"],
    }),
    inputSchema: outlookCalendarAccountsListInputSchema,
    outputSchema: outlookCalendarAccountsListOutputSchema,
  }),
  defineReadTool({
    name: "outlook_calendar_calendars_list",
    pluginId: OUTLOOK_CALENDAR_PLUGIN_ID,
    label: "List Calendars",
    description: readToolDescription({
      useWhen: "the target provider calendar id is unknown",
      operation: "Lists calendars from the connected provider account",
      returns: "calendar ids, names, and provider calendar metadata",
      notes: [
        "Use before event reads or writes when the target calendar id must be chosen",
        "Pass connectedAccountId from outlook_calendar_accounts_list when multiple calendar accounts may exist",
      ],
    }),
    inputSchema: outlookCalendarCalendarsListInputSchema,
    outputSchema: outlookCalendarCalendarsListOutputSchema,
  }),
  defineReadTool({
    name: "outlook_calendar_events_list",
    pluginId: OUTLOOK_CALENDAR_PLUGIN_ID,
    label: "List Calendar Events",
    description: readToolDescription({
      useWhen: "the user needs Outlook schedule review or time-window event discovery",
      operation: "Lists events in a bounded time window from one Outlook calendar",
      returns: "calendar event summaries and pagination details",
      notes: [
        "calendarId is required on every call; omit it only when the default primary calendar is intended (schema default)",
        "Use calendarId primary for the user's default calendar when they did not name a specific calendar; call outlook_calendar_calendars_list when a non-default calendar id is needed",
        "Pass an IANA timeZone with timeMin and timeMax so the provider interprets the event window correctly",
      ],
    }),
    inputSchema: outlookCalendarEventsListInputSchema,
    outputSchema: outlookCalendarEventsListOutputSchema,
  }),
  defineReadTool({
    name: "outlook_calendar_event_get",
    pluginId: OUTLOOK_CALENDAR_PLUGIN_ID,
    label: "Get Calendar Event",
    description: readToolDescription({
      useWhen: "exact calendar event details are needed",
      operation: "Gets one calendar event by provider event id from a specific calendar",
      returns: "event details, timing, attendees, conferencing, and provider metadata",
      notes: [
        "Use after outlook_calendar_events_list when you have an event id but need full event details not present in summaries",
        "For Outlook reads, pass timeZone when returned event times should be normalized to a specific IANA timezone",
      ],
    }),
    inputSchema: outlookCalendarEventGetInputSchema,
    outputSchema: outlookCalendarEventGetOutputSchema,
  }),
  defineReadTool({
    name: "outlook_calendar_freebusy_query",
    pluginId: OUTLOOK_CALENDAR_PLUGIN_ID,
    label: "Query Calendar Availability",
    description: readToolDescription({
      useWhen: "raw occupied intervals are needed before suggesting availability",
      operation: "Queries busy blocks across selected calendars for a bounded time window",
      returns: "busy intervals grouped by calendar",
      notes: [
        "Pass an IANA timeZone with timeMin and timeMax so busy intervals are interpreted in the intended timezone",
      ],
    }),
    inputSchema: outlookCalendarFreebusyQueryInputSchema,
    outputSchema: outlookCalendarFreebusyQueryOutputSchema,
  }),
  defineReadTool({
    name: "outlook_calendar_free_slots_find",
    pluginId: OUTLOOK_CALENDAR_PLUGIN_ID,
    label: "Find Free Time Slots",
    description: readToolDescription({
      useWhen: "the user needs scheduling suggestions before proposing meeting times",
      operation:
        "Finds contiguous free slots meeting a minimum duration across selected calendars and a bounded time window",
      returns: "candidate free time slots that satisfy the requested duration",
      notes: [
        "Pass an IANA timeZone with timeMin and timeMax so slot calculation uses the intended timezone",
      ],
    }),
    inputSchema: outlookCalendarFreeSlotsFindInputSchema,
    outputSchema: outlookCalendarFreeSlotsFindOutputSchema,
  }),
  defineWriteTool({
    name: "outlook_calendar_event_create",
    pluginId: OUTLOOK_CALENDAR_PLUGIN_ID,
    label: "Create Calendar Event",
    description: writeToolDescription({
      useWhen: "the user wants to create a calendar event",
      operation:
        "Creates an event on a connected provider calendar, including attendees, location, description, and conferencing when supplied",
      returns: `the ${toolOutputProperty(outlookCalendarExternalWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      sideEffect:
        "may create a provider calendar event, email attendees depending on sendUpdates, request provider conferencing, or create an approval-governed calendar action",
      safety:
        "calendar, title, time range, attendees, notification intent, and conferencing intent must be clear",
    }),
    inputSchema: outlookCalendarEventCreateInputSchema,
    outputSchema: outlookCalendarExternalWriteOutputSchema,
    externalAction: "outlook_calendar.event.create",
  }),
  defineWriteTool({
    name: "outlook_calendar_event_update",
    pluginId: OUTLOOK_CALENDAR_PLUGIN_ID,
    label: "Update Calendar Event",
    description: writeToolDescription({
      useWhen: "the user wants to update an existing calendar event",
      operation:
        "Updates one provider calendar event with the supplied changed fields; sendUpdates only controls attendee notifications",
      returns: `the ${toolOutputProperty(outlookCalendarExternalWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      notes: [
        "When attendees is supplied, it replaces the entire attendee list; omit it to leave attendees unchanged",
      ],
      sideEffect:
        "may modify a provider calendar event, email attendees depending on sendUpdates, or create an approval-governed calendar action",
      safety:
        "the exact calendar event and at least one actual field change must be clear; sendUpdates alone is not a valid update",
    }),
    inputSchema: outlookCalendarEventUpdateInputSchema,
    outputSchema: outlookCalendarExternalWriteOutputSchema,
    externalAction: "outlook_calendar.event.modify",
  }),
  defineWriteTool({
    name: "outlook_calendar_event_cancel",
    pluginId: OUTLOOK_CALENDAR_PLUGIN_ID,
    label: "Cancel Calendar Event",
    description: writeToolDescription({
      useWhen: "the user wants to cancel or delete a calendar event",
      operation:
        "Cancels or deletes one calendar event using provider attendee notification semantics",
      returns: `the ${toolOutputProperty(outlookCalendarExternalWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      notes: ["sendUpdates controls whether attendees receive cancellation notices when supported"],
      sideEffect:
        "may remove or cancel a provider calendar event, notify attendees, or create an approval-governed calendar action",
      safety:
        "the exact event and attendee notification intent must be clear because this is destructive",
    }),
    inputSchema: outlookCalendarEventCancelInputSchema,
    outputSchema: outlookCalendarExternalWriteOutputSchema,
    externalAction: "outlook_calendar.event.cancel",
  }),
] as const satisfies readonly ToolContract[];

export type OutlookCalendarToolName = (typeof outlookCalendarToolContracts)[number]["name"];
