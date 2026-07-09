import { profileActionWriteToolDataSchema } from "@ai-assistants/actions-contracts/schemas";
import { providerAccountsListOutputSchema, stringField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

export const outlookCalendarOptionalConnectedAccountIdSchema = z
  .string()
  .trim()
  .uuid()
  .describe(
    "Connected provider account id from outlook_calendar_accounts_list when multiple Outlook calendars match. Do not use profile_context_get capability instance ids for this field.",
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

export const outlookCalendarIdSchema = stringField(
  "Provider calendar id, or primary for the account's default calendar.",
);

export const outlookCalendarIdWithPrimaryDefaultSchema = outlookCalendarIdSchema.default("primary");

const outlookCalendarEventTimeSchema = z
  .object({
    dateTime: isoDateTimeField("ISO 8601 date-time with offset."),
    timeZone: timeZoneSchema,
  })
  .strict()
  .describe("Calendar event instant with explicit date-time and IANA time zone.");

const outlookCalendarAttendeeSchema = z
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

export const outlookCalendarSendUpdatesSchema = z
  .enum(["all", "external_only", "none"])
  .default("all")
  .describe("Provider attendee notification mode for create, update, or cancel.");
export const outlookCalendarConferencePreferenceSchema = z
  .enum(["provider_default", "none"])
  .default("provider_default")
  .describe("Whether to request the provider's default conferencing link or no conference link.");

export const outlookCalendarAccountsListInputSchema = z.object({}).strict();

export const outlookCalendarCalendarsListInputSchema = z
  .object({
    connectedAccountId: outlookCalendarOptionalConnectedAccountIdSchema,
    nextPageToken: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Provider pagination token from a prior outlook_calendar_calendars_list result."),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(250)
      .default(100)
      .describe("Maximum calendars to return."),
  })
  .strict();

export const outlookCalendarEventsListInputSchema = z
  .object({
    connectedAccountId: outlookCalendarOptionalConnectedAccountIdSchema,
    calendarId: outlookCalendarIdWithPrimaryDefaultSchema,
    timeMin: isoDateTimeField("Inclusive ISO 8601 window start."),
    timeMax: isoDateTimeField("Exclusive ISO 8601 window end."),
    timeZone: timeZoneSchema,
    nextPageToken: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Outlook pagination token from a prior outlook_calendar_events_list result."),
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

export const outlookCalendarEventGetInputSchema = z
  .object({
    connectedAccountId: outlookCalendarOptionalConnectedAccountIdSchema,
    calendarId: outlookCalendarIdWithPrimaryDefaultSchema,
    eventId: stringField("Provider event id."),
    timeZone: timeZoneSchema
      .optional()
      .describe("Optional for Outlook reads (Prefer outlook.timezone header on Graph)."),
  })
  .strict();

export const outlookCalendarFreebusyQueryInputSchema = z
  .object({
    connectedAccountId: outlookCalendarOptionalConnectedAccountIdSchema,
    calendarIds: z
      .array(outlookCalendarIdSchema)
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

export const outlookCalendarFreeSlotsFindInputSchema = z
  .object({
    connectedAccountId: outlookCalendarOptionalConnectedAccountIdSchema,
    calendarIds: z
      .array(outlookCalendarIdSchema)
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

export const outlookCalendarEventCreateInputSchema = z
  .object({
    connectedAccountId: outlookCalendarOptionalConnectedAccountIdSchema,
    calendarId: outlookCalendarIdSchema.default("primary"),
    title: stringField("Event title."),
    description: z
      .string()
      .trim()
      .max(10_000)
      .optional()
      .describe("Optional event body/description."),
    location: z.string().trim().max(500).optional().describe("Optional event location."),
    start: outlookCalendarEventTimeSchema,
    end: outlookCalendarEventTimeSchema,
    attendees: z
      .array(outlookCalendarAttendeeSchema)
      .max(100)
      .default([])
      .describe("Attendees to invite."),
    conferencePreference: outlookCalendarConferencePreferenceSchema,
    sendUpdates: outlookCalendarSendUpdatesSchema,
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

export const outlookCalendarEventUpdateInputSchema = z
  .object({
    connectedAccountId: outlookCalendarOptionalConnectedAccountIdSchema,
    calendarId: outlookCalendarIdSchema,
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
    start: outlookCalendarEventTimeSchema.optional(),
    end: outlookCalendarEventTimeSchema.optional(),
    attendees: z
      .array(outlookCalendarAttendeeSchema)
      .max(100)
      .optional()
      .describe("Replacement attendee list; omit to leave attendees unchanged."),
    conferencePreference: outlookCalendarConferencePreferenceSchema.optional(),
    sendUpdates: outlookCalendarSendUpdatesSchema,
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

export const outlookCalendarEventCancelInputSchema = z
  .object({
    connectedAccountId: outlookCalendarOptionalConnectedAccountIdSchema,
    calendarId: outlookCalendarIdSchema,
    eventId: stringField("Provider event id."),
    sendUpdates: outlookCalendarSendUpdatesSchema,
    cancellationMessage: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .describe("Optional cancellation message sent through the provider when supported."),
  })
  .strict();

export type OutlookCalendarEventCreateInput = z.infer<typeof outlookCalendarEventCreateInputSchema>;
export type OutlookCalendarEventUpdateInput = z.infer<typeof outlookCalendarEventUpdateInputSchema>;
export type OutlookCalendarEventCancelInput = z.infer<typeof outlookCalendarEventCancelInputSchema>;

export const outlookCalendarAccountsListOutputSchema = providerAccountsListOutputSchema;

const outlookCalendarProviderContextSchema = {
  provider: z.literal("outlook-calendar").describe("Calendar provider backing this result."),
  accountEmail: z
    .string()
    .email()
    .nullable()
    .describe("Calendar account email used for this result.")
    .meta({ examples: ["client@example.com"] }),
};

export const outlookCalendarSummarySchema = z
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

export const outlookCalendarEventAttendeeSchema = z
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

export const outlookCalendarEventDetailSchema = z
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
    organizer: outlookCalendarEventAttendeeSchema.nullable().describe("Event organizer, when known."),
    attendees: z.array(outlookCalendarEventAttendeeSchema).describe("Event attendees."),
    meetingUrl: z
      .string()
      .url()
      .nullable()
      .describe("Online meeting URL, when the event has one.")
      .meta({ examples: ["https://meet.google.com/abc-defg-hij"] }),
  })
  .strict()
  .describe("Calendar event details normalized for assistant use.");

export type OutlookCalendarEventDetail = z.infer<typeof outlookCalendarEventDetailSchema>;

export const outlookCalendarEventListItemFields = {
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
} as const satisfies Partial<Record<keyof OutlookCalendarEventDetail, true>>;

export const outlookCalendarEventListItemSchema = outlookCalendarEventDetailSchema
  .pick(outlookCalendarEventListItemFields)
  .strict();

export type OutlookCalendarEventListItem = z.infer<typeof outlookCalendarEventListItemSchema>;

export const outlookCalendarBusyBlockSchema = z
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

export const outlookCalendarFreeSlotSchema = z
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

export const outlookCalendarCalendarsListOutputSchema = z
  .object({
    ...outlookCalendarProviderContextSchema,
    calendars: z.array(outlookCalendarSummarySchema).describe("Calendars returned by the provider."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const outlookCalendarEventsListOutputSchema = z
  .object({
    ...outlookCalendarProviderContextSchema,
    calendarId: z.string().min(1).describe("Calendar id searched or listed."),
    events: z.array(outlookCalendarEventListItemSchema).describe("Calendar events returned."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const outlookCalendarEventGetOutputSchema = z
  .object({
    ...outlookCalendarProviderContextSchema,
    calendarId: z.string().min(1).describe("Calendar id containing the event."),
    eventId: z.string().min(1).describe("Provider event id requested."),
    event: outlookCalendarEventDetailSchema.describe("Requested calendar event."),
  })
  .strict();

export const outlookCalendarFreebusyQueryOutputSchema = z
  .object({
    ...outlookCalendarProviderContextSchema,
    calendarIds: z.array(z.string().min(1)).describe("Calendar ids included in the query."),
    timeMin: z.string().min(1).describe("Inclusive availability window start."),
    timeMax: z.string().min(1).describe("Exclusive availability window end."),
    busy: z.array(outlookCalendarBusyBlockSchema).describe("Busy blocks returned by the provider."),
  })
  .strict();

export const outlookCalendarFreeSlotsFindOutputSchema = z
  .object({
    ...outlookCalendarProviderContextSchema,
    freeSlots: z.array(outlookCalendarFreeSlotSchema).describe("Available slots found."),
    calendarsChecked: z
      .number()
      .int()
      .nonnegative()
      .describe("Number of calendars checked for availability."),
  })
  .strict();

export const outlookCalendarExternalWriteOutputSchema = profileActionWriteToolDataSchema;
