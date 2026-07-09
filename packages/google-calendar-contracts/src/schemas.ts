import { profileActionWriteToolDataSchema } from "@ai-assistants/actions-contracts/schemas";
import { providerAccountsListOutputSchema, stringField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

export const googleCalendarOptionalConnectedAccountIdSchema = z
  .string()
  .trim()
  .uuid()
  .describe(
    "Connected provider account id from google_calendar_accounts_list when multiple Google calendars match. Do not use profile_context_get capability instance ids for this field.",
  )
  .optional();

const isoDateTimeField = (description: string) =>
  z.string().trim().datetime({ offset: true }).describe(description);

const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .describe("IANA time zone, e.g. America/Toronto.");

export const googleCalendarIdSchema = stringField(
  "Provider calendar id, or primary for the account's default calendar.",
);

export const googleCalendarIdWithPrimaryDefaultSchema = googleCalendarIdSchema.default("primary");

const googleCalendarEventTimeSchema = z
  .object({
    dateTime: isoDateTimeField("ISO 8601 date-time with offset."),
    timeZone: timeZoneSchema,
  })
  .strict()
  .describe("Calendar event instant with explicit date-time and IANA time zone.");

const googleCalendarAttendeeSchema = z
  .object({
    email: z.string().trim().email().describe("Attendee email address."),
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe("Optional attendee display name."),
  })
  .strict()
  .describe("Calendar attendee to invite or preserve.");

export const googleCalendarSendUpdatesSchema = z
  .enum(["all", "external_only", "none"])
  .default("all")
  .describe("Provider attendee notification mode for create, update, or cancel.");
export const googleCalendarConferencePreferenceSchema = z
  .enum(["provider_default", "none"])
  .default("provider_default")
  .describe("Whether to request the provider's default conferencing link or no conference link.");

export const googleCalendarAccountsListInputSchema = z.object({}).strict();

export const googleCalendarCalendarsListInputSchema = z
  .object({
    connectedAccountId: googleCalendarOptionalConnectedAccountIdSchema,
    nextPageToken: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Provider pagination token from a prior google_calendar_calendars_list result."),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(250)
      .default(100)
      .describe("Maximum calendars to return."),
  })
  .strict();

export const googleCalendarEventsListInputSchema = z
  .object({
    connectedAccountId: googleCalendarOptionalConnectedAccountIdSchema,
    calendarId: googleCalendarIdWithPrimaryDefaultSchema,
    timeMin: isoDateTimeField("Inclusive ISO 8601 window start."),
    timeMax: isoDateTimeField("Exclusive ISO 8601 window end."),
    timeZone: timeZoneSchema,
    nextPageToken: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Google Calendar page token from a prior google_calendar_events_list result."),
    maxResults: z.number().int().min(1).max(250).default(50).describe("Maximum events to return."),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (Date.parse(val.timeMin) >= Date.parse(val.timeMax)) {
      ctx.addIssue({
        code: "custom",
        path: ["timeMax"],
        message: "timeMax must be after timeMin.",
      });
    }
  });

export const googleCalendarEventGetInputSchema = z
  .object({
    connectedAccountId: googleCalendarOptionalConnectedAccountIdSchema,
    calendarId: googleCalendarIdWithPrimaryDefaultSchema,
    eventId: stringField("Provider event id."),
    timeZone: timeZoneSchema
      .optional()
      .describe("Optional timezone for returned event times."),
  })
  .strict();

export const googleCalendarFreebusyQueryInputSchema = z
  .object({
    connectedAccountId: googleCalendarOptionalConnectedAccountIdSchema,
    calendarIds: z
      .array(googleCalendarIdSchema)
      .min(1)
      .max(20)
      .describe("Calendar ids to query for busy blocks."),
    timeMin: isoDateTimeField("Inclusive ISO 8601 availability window start."),
    timeMax: isoDateTimeField("Exclusive ISO 8601 availability window end."),
    timeZone: timeZoneSchema,
  })
  .strict()
  .superRefine((val, ctx) => {
    if (Date.parse(val.timeMin) >= Date.parse(val.timeMax)) {
      ctx.addIssue({
        code: "custom",
        path: ["timeMax"],
        message: "timeMax must be after timeMin.",
      });
    }
  });

export const googleCalendarEventsSearchInputSchema = z
  .object({
    connectedAccountId: googleCalendarOptionalConnectedAccountIdSchema,
    calendarId: googleCalendarIdWithPrimaryDefaultSchema,
    query: z.string().trim().min(1).max(500).describe("Free-text search query."),
    timeMin: isoDateTimeField("Optional lower bound for event start time (RFC3339).").optional(),
    timeMax: isoDateTimeField("Optional upper bound for event end time (RFC3339).").optional(),
    maxResults: z.number().int().min(1).max(250).default(50).describe("Maximum events to return."),
    nextPageToken: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Pagination token from a prior google_calendar_events_search result."),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.timeMin && val.timeMax && Date.parse(val.timeMin) >= Date.parse(val.timeMax)) {
      ctx.addIssue({
        code: "custom",
        path: ["timeMax"],
        message: "timeMax must be after timeMin.",
      });
    }
  });

export const googleCalendarFreeSlotsFindInputSchema = z
  .object({
    connectedAccountId: googleCalendarOptionalConnectedAccountIdSchema,
    calendarIds: z
      .array(googleCalendarIdSchema)
      .min(1)
      .max(20)
      .describe("Calendar ids to consider when finding free slots."),
    timeMin: isoDateTimeField("Inclusive ISO 8601 window start."),
    timeMax: isoDateTimeField("Exclusive ISO 8601 window end."),
    timeZone: timeZoneSchema,
    durationMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .describe("Minimum contiguous free duration to return, in minutes."),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (Date.parse(val.timeMin) >= Date.parse(val.timeMax)) {
      ctx.addIssue({
        code: "custom",
        path: ["timeMax"],
        message: "timeMax must be after timeMin.",
      });
    }
  });

export const googleCalendarEventCreateInputSchema = z
  .object({
    connectedAccountId: googleCalendarOptionalConnectedAccountIdSchema,
    calendarId: googleCalendarIdSchema.default("primary"),
    title: stringField("Event title."),
    description: z
      .string()
      .trim()
      .max(10_000)
      .optional()
      .describe("Optional event body/description."),
    location: z.string().trim().max(500).optional().describe("Optional event location."),
    start: googleCalendarEventTimeSchema,
    end: googleCalendarEventTimeSchema,
    attendees: z
      .array(googleCalendarAttendeeSchema)
      .max(100)
      .default([])
      .describe("Attendees to invite."),
    conferencePreference: googleCalendarConferencePreferenceSchema,
    sendUpdates: googleCalendarSendUpdatesSchema,
  })
  .strict()
  .superRefine((val, ctx) => {
    if (Date.parse(val.start.dateTime) >= Date.parse(val.end.dateTime)) {
      ctx.addIssue({
        code: "custom",
        path: ["end", "dateTime"],
        message: "Event end must be after start.",
      });
    }
  });

export const googleCalendarEventUpdateInputSchema = z
  .object({
    connectedAccountId: googleCalendarOptionalConnectedAccountIdSchema,
    calendarId: googleCalendarIdSchema,
    eventId: stringField("Provider event id."),
    title: stringField("Event title.").optional(),
    description: z
      .string()
      .trim()
      .max(10_000)
      .optional()
      .describe("New event body/description; omit to leave unchanged."),
    location: z
      .string()
      .trim()
      .max(500)
      .optional()
      .describe("New event location; omit to leave unchanged."),
    start: googleCalendarEventTimeSchema.optional(),
    end: googleCalendarEventTimeSchema.optional(),
    attendees: z
      .array(googleCalendarAttendeeSchema)
      .max(100)
      .optional()
      .describe("Replacement attendee list; omit to leave attendees unchanged."),
    conferencePreference: googleCalendarConferencePreferenceSchema.optional(),
    sendUpdates: googleCalendarSendUpdatesSchema,
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.start && val.end && Date.parse(val.start.dateTime) >= Date.parse(val.end.dateTime)) {
      ctx.addIssue({
        code: "custom",
        path: ["end", "dateTime"],
        message: "Event end must be after start.",
      });
    }
    const hasPatchField =
      val.title !== undefined ||
      val.description !== undefined ||
      val.location !== undefined ||
      val.start !== undefined ||
      val.end !== undefined ||
      val.attendees !== undefined ||
      val.conferencePreference !== undefined;
    if (!hasPatchField) {
      ctx.addIssue({
        code: "custom",
        path: ["title"],
        message:
          "Provide at least one of title, description, location, start, end, attendees, or conferencePreference to update.",
      });
    }
  });

export const googleCalendarEventCancelInputSchema = z
  .object({
    connectedAccountId: googleCalendarOptionalConnectedAccountIdSchema,
    calendarId: googleCalendarIdSchema,
    eventId: stringField("Provider event id."),
    sendUpdates: googleCalendarSendUpdatesSchema,
    cancellationMessage: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .describe("Optional cancellation message sent through the provider when supported."),
  })
  .strict();

export type GoogleCalendarEventCreateInput = z.infer<typeof googleCalendarEventCreateInputSchema>;
export type GoogleCalendarEventUpdateInput = z.infer<typeof googleCalendarEventUpdateInputSchema>;
export type GoogleCalendarEventCancelInput = z.infer<typeof googleCalendarEventCancelInputSchema>;

export const googleCalendarAccountsListOutputSchema = providerAccountsListOutputSchema;

const googleCalendarProviderContextSchema = {
  provider: z.literal("google-calendar").describe("Calendar provider backing this result."),
  accountEmail: z
    .string()
    .email()
    .nullable()
    .describe("Calendar account email used for this result.")
    .meta({ examples: ["client@example.com"] }),
};

export const googleCalendarSummarySchema = z
  .object({
    id: z.string().trim().min(1).describe("Provider calendar id."),
    name: z.string().trim().min(1).nullable().describe("Calendar display name."),
    description: z.string().trim().min(1).nullable().describe("Calendar description."),
    timezone: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Calendar IANA timezone when provided by the provider.")
      .meta({ examples: ["America/Toronto"] }),
    primary: z.boolean().describe("Whether this is the account's primary calendar."),
  })
  .strict()
  .describe("Calendar available in the provider account.");

export const googleCalendarEventAttendeeSchema = z
  .object({
    name: z.string().trim().min(1).nullable().describe("Attendee display name."),
    email: z
      .string()
      .trim()
      .email()
      .describe("Attendee email address.")
      .meta({ examples: ["client@example.com"] }),
    responseStatus: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Provider attendee response status, when known."),
  })
  .strict()
  .describe("Calendar event attendee.");

export const googleCalendarEventDetailSchema = z
  .object({
    id: z.string().trim().min(1).describe("Provider event id."),
    calendarId: z.string().trim().min(1).describe("Provider calendar id containing the event."),
    title: z.string().trim().min(1).nullable().describe("Event title."),
    description: z.string().nullable().describe("Event body or description."),
    location: z.string().trim().min(1).nullable().describe("Event location."),
    start: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe("Event start timestamp, or null when unavailable.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    end: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe("Event end timestamp, or null when unavailable.")
      .meta({ examples: ["2026-05-21T15:00:00.000Z"] }),
    allDay: z.boolean().describe("Whether this is an all-day event."),
    status: z.string().trim().min(1).nullable().describe("Provider event status."),
    organizer: googleCalendarEventAttendeeSchema.nullable().describe("Event organizer, when known."),
    attendees: z.array(googleCalendarEventAttendeeSchema).describe("Event attendees."),
    meetingUrl: z
      .string()
      .url()
      .nullable()
      .describe("Online meeting URL, when the event has one.")
      .meta({ examples: ["https://meet.google.com/abc-defg-hij"] }),
  })
  .strict()
  .describe("Calendar event details normalized for assistant use.");

export type GoogleCalendarEventDetail = z.infer<typeof googleCalendarEventDetailSchema>;

export const googleCalendarEventListItemFields = {
  id: true,
  calendarId: true,
  title: true,
  location: true,
  start: true,
  end: true,
  allDay: true,
  status: true,
  organizer: true,
  meetingUrl: true,
} as const satisfies Partial<Record<keyof GoogleCalendarEventDetail, true>>;

export const googleCalendarEventListItemSchema = googleCalendarEventDetailSchema
  .pick(googleCalendarEventListItemFields)
  .strict();

export type GoogleCalendarEventListItem = z.infer<typeof googleCalendarEventListItemSchema>;

export const googleCalendarBusyBlockSchema = z
  .object({
    calendarId: z.string().trim().min(1).describe("Calendar id that has this busy block."),
    start: z
      .string()
      .datetime({ offset: true })
      .describe("Busy block start timestamp.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    end: z
      .string()
      .datetime({ offset: true })
      .describe("Busy block end timestamp.")
      .meta({ examples: ["2026-05-21T15:00:00.000Z"] }),
  })
  .strict()
  .describe("Calendar busy time block.");

export const googleCalendarFreeSlotSchema = z
  .object({
    start: z
      .string()
      .datetime({ offset: true })
      .describe("Free slot start timestamp.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    end: z
      .string()
      .datetime({ offset: true })
      .describe("Free slot end timestamp.")
      .meta({ examples: ["2026-05-21T15:00:00.000Z"] }),
    durationMinutes: z.number().int().positive().describe("Free slot duration in minutes."),
  })
  .strict()
  .describe("Available calendar time slot.");

export const googleCalendarCalendarsListOutputSchema = z
  .object({
    ...googleCalendarProviderContextSchema,
    calendars: z.array(googleCalendarSummarySchema).describe("Calendars returned by the provider."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const googleCalendarEventsListOutputSchema = z
  .object({
    ...googleCalendarProviderContextSchema,
    calendarId: z.string().min(1).describe("Calendar id searched or listed."),
    events: z.array(googleCalendarEventListItemSchema).describe("Calendar events returned."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const googleCalendarEventGetOutputSchema = z
  .object({
    ...googleCalendarProviderContextSchema,
    calendarId: z.string().min(1).describe("Calendar id containing the event."),
    eventId: z.string().min(1).describe("Provider event id requested."),
    event: googleCalendarEventDetailSchema.describe("Requested calendar event."),
  })
  .strict();

export const googleCalendarFreebusyQueryOutputSchema = z
  .object({
    ...googleCalendarProviderContextSchema,
    calendarIds: z.array(z.string().min(1)).describe("Calendar ids included in the query."),
    timeMin: z.string().min(1).describe("Inclusive availability window start."),
    timeMax: z.string().min(1).describe("Exclusive availability window end."),
    busy: z.array(googleCalendarBusyBlockSchema).describe("Busy blocks returned by the provider."),
  })
  .strict();

export const googleCalendarFreeSlotsFindOutputSchema = z
  .object({
    ...googleCalendarProviderContextSchema,
    freeSlots: z.array(googleCalendarFreeSlotSchema).describe("Available slots found."),
    calendarsChecked: z
      .number()
      .int()
      .nonnegative()
      .describe("Number of calendars checked for availability."),
  })
  .strict();

export const googleCalendarExternalWriteOutputSchema = profileActionWriteToolDataSchema;
