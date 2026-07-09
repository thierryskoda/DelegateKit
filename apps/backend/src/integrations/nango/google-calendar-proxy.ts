import { z } from "zod";
import {
  nangoProxyRequestJson,
  nangoProxyRequestVoid,
  type NangoProxySandboxContext,
  type ProviderOperation,
  type ProviderProxyRequest,
} from "./nango-proxy-client";

export type GoogleCalendarNangoKey = "ai-assistants-google";
export const googleCalendarNangoProxyRecordSchema = z.record(z.string(), z.unknown());

export type GoogleCalendarProxyOperation =
  | "create-event"
  | "delete-event"
  | "find-free-slots"
  | "get-calendar"
  | "get-event"
  | "list-calendars"
  | "list-events"
  | "patch-event"
  | "query-free-busy"
  | "search-events";

const stringField = z.string().trim().min(1);
const stringArray = z.array(stringField);
const googleCalendarBusyBlockSchema = z
  .object({
    start: stringField,
    end: stringField,
  })
  .passthrough();
const googleCalendarBusyCalendarSchema = z
  .object({
    busy: z.array(googleCalendarBusyBlockSchema).default([]),
  })
  .passthrough();
const googleCalendarNangoProxyListResponseSchema = z
  .object({
    items: z.array(googleCalendarNangoProxyRecordSchema).default([]),
    nextPageToken: z.string().nullable().optional(),
  })
  .passthrough();
const googleCalendarNangoProxyFreeBusyResponseSchema = z
  .object({
    calendars: z.record(z.string(), googleCalendarBusyCalendarSchema).default({}),
  })
  .passthrough();
const googleCalendarNangoProxyEmptyResponseSchema = z.object({}).passthrough();
export const googleCalendarNangoProxyResponseSchemas = {
  "create-event": googleCalendarNangoProxyRecordSchema,
  "delete-event": googleCalendarNangoProxyEmptyResponseSchema,
  "find-free-slots": googleCalendarNangoProxyFreeBusyResponseSchema,
  "get-calendar": googleCalendarNangoProxyRecordSchema,
  "get-event": googleCalendarNangoProxyRecordSchema,
  "list-calendars": googleCalendarNangoProxyListResponseSchema,
  "list-events": googleCalendarNangoProxyListResponseSchema,
  "patch-event": googleCalendarNangoProxyRecordSchema,
  "query-free-busy": googleCalendarNangoProxyFreeBusyResponseSchema,
  "search-events": googleCalendarNangoProxyListResponseSchema,
} as const;
const googleEventDateTimeSchema = z
  .object({
    date: stringField.optional(),
    dateTime: stringField.optional(),
    timeZone: stringField.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (!input.date && !input.dateTime) {
      ctx.addIssue({
        code: "custom",
        path: ["dateTime"],
        message: "Google Calendar event time requires date or dateTime.",
      });
    }
  });
const googleEventAttendeeSchema = z
  .object({
    email: stringField,
    displayName: stringField.optional(),
    optional: z.boolean().optional(),
    responseStatus: z
      .enum(["needsAction", "declined", "tentative", "accepted"])
      .optional(),
  })
  .strict();
const googleEventReminderOverrideSchema = z
  .object({
    method: z.enum(["email", "popup"]),
    minutes: z.number().int().min(0).max(40320),
  })
  .strict();
const googleEventRemindersSchema = z
  .object({
    useDefault: z.boolean().optional(),
    overrides: z.array(googleEventReminderOverrideSchema).optional(),
  })
  .strict();
const googleConferenceDataSchema = z
  .object({
    createRequest: z
      .object({
        requestId: stringField,
        conferenceSolutionKey: z.object({ type: z.literal("hangoutsMeet") }).strict().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const googleEventBodySchema = z
  .object({
    summary: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    start: googleEventDateTimeSchema.optional(),
    end: googleEventDateTimeSchema.optional(),
    attendees: z.array(googleEventAttendeeSchema).optional(),
    reminders: googleEventRemindersSchema.optional(),
    recurrence: z.array(stringField).optional(),
    conferenceData: googleConferenceDataSchema.optional(),
  })
  .strict();
const googleFreeBusyItemSchema = z.object({ id: stringField }).strict();
const googleFreeBusyBodySchema = z
  .object({
    timeMin: stringField,
    timeMax: stringField,
    timeZone: stringField.optional(),
    items: z.array(googleFreeBusyItemSchema),
  })
  .strict();

const googleListCalendarsInputSchema = z
  .object({ cursor: stringField.optional(), maxResults: z.number().int().positive().optional() })
  .strict();
const googleListEventsInputSchema = z
  .object({
    calendarId: stringField.optional(),
    query: stringField.optional(),
    timeMin: stringField.optional(),
    timeMax: stringField.optional(),
    maxResults: z.number().int().positive().optional(),
    cursor: stringField.optional(),
    singleEvents: z.boolean().optional(),
  })
  .strict();
const googleCalendarIdInputSchema = z.object({ calendarId: stringField.optional() }).strict();
const googleEventIdInputSchema = z
  .object({ calendarId: stringField.optional(), eventId: stringField })
  .strict();
const googleFreeBusyInputSchema = z
  .object({
    timeMin: stringField,
    timeMax: stringField,
    timeZone: stringField.optional(),
    items: z.array(googleFreeBusyItemSchema).optional(),
    calendarIds: stringArray.optional(),
    durationMinutes: z.number().int().positive().optional(),
  })
  .strict();
const googleCreateEventInputSchema = z
  .object({
    calendarId: stringField.optional(),
    summary: z.string().optional(),
    description: z.string().optional(),
    location: z.string().optional(),
    start: googleEventDateTimeSchema.optional(),
    end: googleEventDateTimeSchema.optional(),
    attendees: z.array(googleEventAttendeeSchema).optional(),
    reminders: googleEventRemindersSchema.optional(),
    recurrence: z.array(stringField).optional(),
    conferenceData: googleConferenceDataSchema.optional(),
  })
  .strict();
const googlePatchEventInputSchema = googleCreateEventInputSchema
  .extend({ eventId: stringField })
  .strict();

type GoogleCalendarOperationInputByName = {
  "create-event": z.infer<typeof googleCreateEventInputSchema>;
  "delete-event": z.infer<typeof googleEventIdInputSchema>;
  "find-free-slots": z.infer<typeof googleFreeBusyInputSchema>;
  "get-calendar": z.infer<typeof googleCalendarIdInputSchema>;
  "get-event": z.infer<typeof googleEventIdInputSchema>;
  "list-calendars": z.infer<typeof googleListCalendarsInputSchema>;
  "list-events": z.infer<typeof googleListEventsInputSchema>;
  "patch-event": z.infer<typeof googlePatchEventInputSchema>;
  "query-free-busy": z.infer<typeof googleFreeBusyInputSchema>;
  "search-events": z.infer<typeof googleListEventsInputSchema>;
};

type GoogleCalendarOperationMap = {
  [K in GoogleCalendarProxyOperation]: ProviderOperation<
    GoogleCalendarOperationInputByName[K],
    unknown
  >;
};

function requestWithOptionalParams(
  request: Omit<ProviderProxyRequest, "params">,
  params: ProviderProxyRequest["params"] | undefined,
): ProviderProxyRequest {
  return params === undefined ? request : { ...request, params };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function googleFreeSlots(
  input: GoogleCalendarOperationInputByName["find-free-slots"],
  raw: unknown,
): Record<string, unknown> {
  const parsedInput = recordValue(input);
  const calendars = recordValue(recordValue(raw).calendars);
  const busy: { start: string; end: string }[] = [];
  for (const id of Array.isArray(parsedInput.calendarIds) ? parsedInput.calendarIds : []) {
    for (const block of arrayValue(recordValue(calendars[String(id)]).busy)) {
      if (typeof block.start === "string" && typeof block.end === "string") {
        busy.push({ start: block.start, end: block.end });
      }
    }
  }
  busy.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const merged: { start: string; end: string }[] = [];
  for (const block of busy) {
    const last = merged.at(-1);
    if (!last || Date.parse(block.start) > Date.parse(last.end)) merged.push({ ...block });
    else if (Date.parse(block.end) > Date.parse(last.end)) last.end = block.end;
  }
  const timeMin = String(parsedInput.timeMin);
  const timeMax = String(parsedInput.timeMax);
  const durationMinutes =
    typeof parsedInput.durationMinutes === "number" ? parsedInput.durationMinutes : 30;
  const minMs = durationMinutes * 60_000;
  const rangeStart = Date.parse(timeMin);
  const rangeEnd = Date.parse(timeMax);
  const freeSlots: { start: string; end: string; durationMinutes: number }[] = [];
  let cursor = rangeStart;
  for (const block of merged) {
    const start = Date.parse(block.start);
    if (start - cursor >= minMs) {
      freeSlots.push({
        start: new Date(cursor).toISOString(),
        end: block.start,
        durationMinutes: Math.floor((start - cursor) / 60_000),
      });
    }
    cursor = Math.max(cursor, Date.parse(block.end));
  }
  if (rangeEnd - cursor >= minMs) {
    freeSlots.push({
      start: new Date(cursor).toISOString(),
      end: timeMax,
      durationMinutes: Math.floor((rangeEnd - cursor) / 60_000),
    });
  }
  return { freeSlots, calendarsChecked: Object.keys(calendars).length };
}

function normalizeGoogleCalendarOutput(
  operationName: GoogleCalendarProxyOperation,
  input: GoogleCalendarOperationInputByName[GoogleCalendarProxyOperation],
  raw: unknown,
): unknown {
  const parsedInput = recordValue(input);
  const record = recordValue(raw);
  switch (operationName) {
    case "list-calendars":
      return { calendars: arrayValue(record.items), nextPageToken: record.nextPageToken };
    case "list-events":
      return { events: arrayValue(record.items), nextPageToken: record.nextPageToken };
    case "search-events":
      return {
        events: arrayValue(record.items),
        nextPageToken: record.nextPageToken,
        totalItems: arrayValue(record.items).length,
      };
    case "find-free-slots":
      return googleFreeSlots(googleFreeBusyInputSchema.parse(input), raw);
    case "delete-event":
      return {
        success: true,
        message: `Event ${String(parsedInput.eventId)} successfully deleted from calendar ${String(parsedInput.calendarId)}`,
      };
    default:
      return raw;
  }
}

const googleCalendarOperations: GoogleCalendarOperationMap = {
  "list-calendars": {
    inputSchema: googleListCalendarsInputSchema,
    responseSchema: googleCalendarNangoProxyResponseSchemas["list-calendars"],
    toProxyRequest: (input) =>
      requestWithOptionalParams(
        { method: "get", endpoint: "/calendar/v3/users/me/calendarList" },
        {
          ...(input.cursor ? { pageToken: input.cursor } : {}),
          ...(typeof input.maxResults === "number" ? { maxResults: input.maxResults } : {}),
        },
      ),
    normalize: (raw, input) => normalizeGoogleCalendarOutput("list-calendars", input, raw),
  },
  "list-events": {
    inputSchema: googleListEventsInputSchema,
    responseSchema: googleCalendarNangoProxyResponseSchemas["list-events"],
    toProxyRequest: (input) => ({
      method: "get",
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId ?? "primary")}/events`,
      params: {
        ...(input.query ? { q: input.query } : {}),
        ...(input.timeMin ? { timeMin: input.timeMin } : {}),
        ...(input.timeMax ? { timeMax: input.timeMax } : {}),
        ...(typeof input.maxResults === "number" ? { maxResults: input.maxResults } : {}),
        ...(input.cursor ? { pageToken: input.cursor } : {}),
        singleEvents: typeof input.singleEvents === "boolean" ? input.singleEvents : true,
      },
    }),
    normalize: (raw, input) => normalizeGoogleCalendarOutput("list-events", input, raw),
  },
  "search-events": {
    inputSchema: googleListEventsInputSchema,
    responseSchema: googleCalendarNangoProxyResponseSchemas["search-events"],
    toProxyRequest: (input) => ({
      method: "get",
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId ?? "primary")}/events`,
      params: {
        ...(input.query ? { q: input.query } : {}),
        ...(input.timeMin ? { timeMin: input.timeMin } : {}),
        ...(input.timeMax ? { timeMax: input.timeMax } : {}),
        ...(typeof input.maxResults === "number" ? { maxResults: input.maxResults } : {}),
        ...(input.cursor ? { pageToken: input.cursor } : {}),
        singleEvents: typeof input.singleEvents === "boolean" ? input.singleEvents : true,
        orderBy: "startTime",
      },
    }),
    normalize: (raw, input) => normalizeGoogleCalendarOutput("search-events", input, raw),
  },
  "get-calendar": {
    inputSchema: googleCalendarIdInputSchema,
    responseSchema: googleCalendarNangoProxyResponseSchemas["get-calendar"],
    toProxyRequest: (input) => ({
      method: "get",
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId ?? "primary")}`,
    }),
    normalize: (raw, input) => normalizeGoogleCalendarOutput("get-calendar", input, raw),
  },
  "get-event": {
    inputSchema: googleEventIdInputSchema,
    responseSchema: googleCalendarNangoProxyResponseSchemas["get-event"],
    toProxyRequest: (input) => ({
      method: "get",
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId ?? "primary")}/events/${encodeURIComponent(input.eventId)}`,
    }),
    normalize: (raw, input) => normalizeGoogleCalendarOutput("get-event", input, raw),
  },
  "query-free-busy": {
    inputSchema: googleFreeBusyInputSchema,
    responseSchema: googleCalendarNangoProxyResponseSchemas["query-free-busy"],
    toProxyRequest: (input) => ({
      method: "post",
      endpoint: "/calendar/v3/freeBusy",
      data: {
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        ...(input.timeZone ? { timeZone: input.timeZone } : {}),
        items: input.items ?? input.calendarIds?.map((id) => ({ id })) ?? [],
      },
      bodySchema: googleFreeBusyBodySchema,
    }),
    normalize: (raw, input) => normalizeGoogleCalendarOutput("query-free-busy", input, raw),
  },
  "find-free-slots": {
    inputSchema: googleFreeBusyInputSchema,
    responseSchema: googleCalendarNangoProxyResponseSchemas["find-free-slots"],
    toProxyRequest: (input) => googleCalendarOperations["query-free-busy"].toProxyRequest(input),
    normalize: (raw, input) => normalizeGoogleCalendarOutput("find-free-slots", input, raw),
  },
  "create-event": {
    inputSchema: googleCreateEventInputSchema,
    responseSchema: googleCalendarNangoProxyResponseSchemas["create-event"],
    toProxyRequest: (input) => ({
      method: "post",
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId ?? "primary")}/events`,
      data: {
        summary: input.summary,
        description: input.description,
        location: input.location,
        start: input.start,
        end: input.end,
        attendees: input.attendees,
        reminders: input.reminders,
        recurrence: input.recurrence,
        conferenceData: input.conferenceData,
      },
      bodySchema: googleEventBodySchema,
    }),
    normalize: (raw, input) => normalizeGoogleCalendarOutput("create-event", input, raw),
  },
  "patch-event": {
    inputSchema: googlePatchEventInputSchema,
    responseSchema: googleCalendarNangoProxyResponseSchemas["patch-event"],
    toProxyRequest(input) {
      const data: Record<string, unknown> = {};
      for (const key of [
        "summary",
        "description",
        "location",
        "start",
        "end",
        "attendees",
        "reminders",
        "recurrence",
        "conferenceData",
      ] as const) {
        if (input[key] !== undefined) data[key] = input[key];
      }
      return {
        method: "patch",
        endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId ?? "primary")}/events/${encodeURIComponent(input.eventId)}`,
        data,
        bodySchema: googleEventBodySchema,
      };
    },
    normalize: (raw, input) => normalizeGoogleCalendarOutput("patch-event", input, raw),
  },
  "delete-event": {
    inputSchema: googleEventIdInputSchema,
    responseSchema: googleCalendarNangoProxyResponseSchemas["delete-event"],
    toProxyRequest: (input) => ({
      method: "delete",
      endpoint: `/calendar/v3/calendars/${encodeURIComponent(input.calendarId ?? "primary")}/events/${encodeURIComponent(input.eventId)}`,
      voidResponse: true,
    }),
    normalize: (raw, input) => normalizeGoogleCalendarOutput("delete-event", input, raw),
  },
};

export async function executeGoogleCalendarNangoProxyOperation<
  T,
  TOperation extends GoogleCalendarProxyOperation,
>(
  providerConfigKey: GoogleCalendarNangoKey,
  connectionId: string,
  operationName: TOperation,
  responseSchema: z.ZodType<T>,
  input: GoogleCalendarOperationInputByName[TOperation],
  sandbox?: NangoProxySandboxContext,
): Promise<T> {
  const operation = googleCalendarOperations[operationName];
  const parsedInput = operation.inputSchema.parse(input);
  const request = operation.toProxyRequest(parsedInput as never);
  if (request.voidResponse) {
    await nangoProxyRequestVoid({
      operation: `nango.google_calendar.proxy.${operationName}`,
      publicSummary: `Nango Google Calendar proxy operation "${operationName}" failed`,
      providerConfigKey,
      connectionId,
      method: request.method,
      endpoint: request.endpoint,
      ...(request.data === undefined ? {} : { data: request.data }),
      ...(request.bodySchema === undefined ? {} : { bodySchema: request.bodySchema }),
      retries: 3,
      ...(sandbox === undefined ? {} : { sandbox }),
    });
    return responseSchema.parse(operation.normalize(undefined, parsedInput as never));
  }
  const raw = await nangoProxyRequestJson({
    operation: `nango.google_calendar.proxy.${operationName}`,
    publicSummary: `Nango Google Calendar proxy operation "${operationName}" failed`,
    providerConfigKey,
    connectionId,
    method: request.method,
    endpoint: request.endpoint,
    ...(request.params === undefined ? {} : { params: request.params }),
    ...(request.data === undefined ? {} : { data: request.data }),
    ...(request.bodySchema === undefined ? {} : { bodySchema: request.bodySchema }),
    responseSchema: operation.responseSchema,
    retries: 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
  return responseSchema.parse(operation.normalize(raw, parsedInput as never));
}
