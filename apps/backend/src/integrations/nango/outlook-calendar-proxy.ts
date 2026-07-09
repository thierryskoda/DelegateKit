import { z } from "zod";
import {
  nangoProxyRequestJson,
  nangoProxyRequestVoid,
  type NangoProxySandboxContext,
  type ProviderOperation,
} from "./nango-proxy-client";

export type OutlookCalendarNangoKey = "ai-assistants-outlook";
export const outlookCalendarNangoProxyRecordSchema = z.record(z.string(), z.unknown());

const jsonRecordSchema = z.record(z.string(), z.unknown());
const odataCollectionSchema = z
  .object({ value: z.array(jsonRecordSchema).optional() })
  .passthrough();

export const outlookCalendarViewProxyResponseSchema = z
  .object({
    "@odata.nextLink": z.string().optional(),
    value: z.array(jsonRecordSchema).optional(),
  })
  .passthrough();

const outlookScheduleItemSchema = z
  .object({
    status: z.string().optional(),
    start: z.object({ dateTime: z.string() }).optional(),
    end: z.object({ dateTime: z.string() }).optional(),
  })
  .passthrough();

const outlookScheduleValueSchema = z
  .object({
    scheduleId: z.string().optional(),
    scheduleItems: z.array(outlookScheduleItemSchema).optional(),
  })
  .passthrough();

const outlookCalendarGetScheduleResponseSchema = z
  .object({
    value: z.array(outlookScheduleValueSchema).optional(),
  })
  .passthrough();

export type OutlookCalendarGetScheduleResponse = z.infer<
  typeof outlookCalendarGetScheduleResponseSchema
>;

export type OutlookCalendarProxyOperation =
  | "cancel-event"
  | "create-event"
  | "delete-event"
  | "get-calendar"
  | "get-event"
  | "list-calendar-events"
  | "list-calendars"
  | "update-event";

const stringField = z.string().trim().min(1);
const stringArray = z.array(stringField);
const nangoParamsObjectSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.undefined()]),
);

const outlookListCalendarsInputSchema = z
  .object({ cursor: stringField.optional(), limit: z.number().int().positive().optional() })
  .strict();
const outlookListCalendarEventsInputSchema = z
  .object({
    start_date_time: stringField,
    end_date_time: stringField,
    top: z.number().int().positive().optional(),
  })
  .strict();
const outlookCalendarIdInputSchema = z.object({ calendarId: stringField.optional() }).strict();
const outlookGetEventInputSchema = z
  .object({ eventId: stringField, timezone: stringField.optional() })
  .strict();
const outlookEventDateTimeSchema = z
  .object({ dateTime: stringField, timeZone: stringField })
  .strict();
const outlookEventBodySchema = z
  .object({ contentType: z.enum(["text", "html", "Text", "HTML"]), content: z.string() })
  .strict();
const outlookEventLocationSchema = z.object({ displayName: stringField }).strict();
const outlookEventAttendeeSchema = z
  .object({
    emailAddress: z
      .object({
        address: stringField,
        name: stringField.optional(),
      })
      .strict(),
    type: z.enum(["required", "optional", "resource"]).optional(),
  })
  .strict();
const outlookEventBodyFieldsSchema = z
  .object({
    subject: z.string().optional(),
    body: outlookEventBodySchema.optional(),
    start: outlookEventDateTimeSchema.optional(),
    end: outlookEventDateTimeSchema.optional(),
    location: outlookEventLocationSchema.optional(),
    attendees: z.array(outlookEventAttendeeSchema).optional(),
    isOnlineMeeting: z.boolean().optional(),
  })
  .strict();
const outlookCreateEventInputSchema = z
  .object({
    calendarId: stringField.optional(),
    subject: z.string(),
    body: outlookEventBodySchema.optional(),
    start: outlookEventDateTimeSchema,
    end: outlookEventDateTimeSchema,
    location: outlookEventLocationSchema.optional(),
    attendees: z.array(outlookEventAttendeeSchema).optional(),
    isOnlineMeeting: z.boolean().optional(),
  })
  .strict();
const outlookCreateEventBodySchema = outlookCreateEventInputSchema.omit({ calendarId: true });
const outlookUpdateEventInputSchema = z
  .object({
    eventId: stringField,
    subject: z.string().optional(),
    body: outlookEventBodySchema.optional(),
    start: outlookEventDateTimeSchema.optional(),
    end: outlookEventDateTimeSchema.optional(),
    location: outlookEventLocationSchema.optional(),
    attendees: z.array(outlookEventAttendeeSchema).optional(),
    isOnlineMeeting: z.boolean().optional(),
  })
  .strict();
const outlookUpdateEventBodySchema = outlookEventBodyFieldsSchema;
const outlookCancelEventInputSchema = z
  .object({ eventId: stringField, comment: z.string().optional() })
  .strict();
const outlookCancelEventBodySchema = z.object({ Comment: z.string() }).strict();
const outlookDeleteEventInputSchema = z
  .object({ event_id: stringField, calendar_id: stringField.optional() })
  .strict();
const outlookFreeBusyDataSchema = z
  .object({
    schedules: stringArray,
    startTime: z.object({ dateTime: stringField, timeZone: stringField }).strict(),
    endTime: z.object({ dateTime: stringField, timeZone: stringField }).strict(),
    availabilityViewInterval: z.number().int().positive(),
  })
  .strict();
const outlookCalendarViewGetInputSchema = z
  .object({
    providerConfigKey: stringField,
    connectionId: stringField,
    endpoint: stringField,
    params: nangoParamsObjectSchema,
  })
  .strict();
const outlookFreeBusyPostInputSchema = z
  .object({
    providerConfigKey: stringField,
    connectionId: stringField,
    data: outlookFreeBusyDataSchema,
  })
  .strict();

type OutlookCalendarOperationInputByName = {
  "cancel-event": z.infer<typeof outlookCancelEventInputSchema>;
  "create-event": z.infer<typeof outlookCreateEventInputSchema>;
  "delete-event": z.infer<typeof outlookDeleteEventInputSchema>;
  "get-calendar": z.infer<typeof outlookCalendarIdInputSchema>;
  "get-event": z.infer<typeof outlookGetEventInputSchema>;
  "list-calendar-events": z.infer<typeof outlookListCalendarEventsInputSchema>;
  "list-calendars": z.infer<typeof outlookListCalendarsInputSchema>;
  "update-event": z.infer<typeof outlookUpdateEventInputSchema>;
};

type OutlookCalendarOperationMap = {
  [K in OutlookCalendarProxyOperation]: ProviderOperation<
    OutlookCalendarOperationInputByName[K],
    unknown
  >;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function outlookCalendarPath(calendarId: string | undefined, suffix = ""): string {
  const value = calendarId?.trim() || "primary";
  return value === "primary"
    ? `/v1.0/me/calendar${suffix}`
    : `/v1.0/me/calendars/${encodeURIComponent(value)}${suffix}`;
}

function normalizeOutlookCalendarOutput(
  operationName: OutlookCalendarProxyOperation,
  input: OutlookCalendarOperationInputByName[OutlookCalendarProxyOperation],
  raw: unknown,
): unknown {
  const parsedInput = recordValue(input);
  const record = recordValue(raw);
  switch (operationName) {
    case "list-calendars":
      return { calendars: arrayValue(record.value), next_cursor: record["@odata.nextLink"] };
    case "list-calendar-events":
      return { events: arrayValue(record.value), next_link: record["@odata.nextLink"] };
    case "cancel-event":
      return { success: true };
    case "delete-event":
      return { success: true, eventId: parsedInput.event_id };
    default:
      return raw;
  }
}

const outlookCalendarOperations: OutlookCalendarOperationMap = {
  "list-calendars": {
    inputSchema: outlookListCalendarsInputSchema,
    responseSchema: odataCollectionSchema,
    toProxyRequest(input) {
      if (input.cursor) return { method: "get", endpoint: input.cursor };
      return {
        method: "get",
        endpoint: "/v1.0/me/calendars",
        params: { $top: typeof input.limit === "number" ? Math.min(input.limit, 50) : 10 },
      };
    },
    normalize: (raw, input) => normalizeOutlookCalendarOutput("list-calendars", input, raw),
  },
  "list-calendar-events": {
    inputSchema: outlookListCalendarEventsInputSchema,
    responseSchema: odataCollectionSchema,
    toProxyRequest: (input) => ({
      method: "get",
      endpoint: "/v1.0/me/calendarView",
      params: {
        startDateTime: input.start_date_time,
        endDateTime: input.end_date_time,
        $top: input.top ?? 50,
      },
    }),
    normalize: (raw, input) => normalizeOutlookCalendarOutput("list-calendar-events", input, raw),
  },
  "get-calendar": {
    inputSchema: outlookCalendarIdInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({ method: "get", endpoint: outlookCalendarPath(input.calendarId) }),
    normalize: (raw, input) => normalizeOutlookCalendarOutput("get-calendar", input, raw),
  },
  "get-event": {
    inputSchema: outlookGetEventInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({
      method: "get",
      endpoint: `/v1.0/me/events/${encodeURIComponent(input.eventId)}`,
    }),
    normalize: (raw, input) => normalizeOutlookCalendarOutput("get-event", input, raw),
  },
  "create-event": {
    inputSchema: outlookCreateEventInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest(input) {
      const { calendarId: _calendarId, ...data } = input;
      return {
        method: "post",
        endpoint: outlookCalendarPath(input.calendarId, "/events"),
        data,
        bodySchema: outlookCreateEventBodySchema,
      };
    },
    normalize: (raw, input) => normalizeOutlookCalendarOutput("create-event", input, raw),
  },
  "update-event": {
    inputSchema: outlookUpdateEventInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest(input) {
      const data: Record<string, unknown> = {};
      for (const key of ["subject", "body", "start", "end", "location", "attendees"] as const) {
        if (input[key] !== undefined) data[key] = input[key];
      }
      if (input.isOnlineMeeting !== undefined) data.isOnlineMeeting = input.isOnlineMeeting;
      return {
        method: "patch",
        endpoint: `/v1.0/me/events/${encodeURIComponent(input.eventId)}`,
        data,
        bodySchema: outlookUpdateEventBodySchema,
      };
    },
    normalize: (raw, input) => normalizeOutlookCalendarOutput("update-event", input, raw),
  },
  "cancel-event": {
    inputSchema: outlookCancelEventInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({
      method: "post",
      endpoint: `/v1.0/me/events/${encodeURIComponent(input.eventId)}/cancel`,
      data: { Comment: input.comment ?? "" },
      bodySchema: outlookCancelEventBodySchema,
      voidResponse: true,
    }),
    normalize: (raw, input) => normalizeOutlookCalendarOutput("cancel-event", input, raw),
  },
  "delete-event": {
    inputSchema: outlookDeleteEventInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({
      method: "delete",
      endpoint:
        input.calendar_id && input.calendar_id !== "primary"
          ? `/v1.0/me/calendars/${encodeURIComponent(input.calendar_id)}/events/${encodeURIComponent(input.event_id)}`
          : `/v1.0/me/events/${encodeURIComponent(input.event_id)}`,
      voidResponse: true,
    }),
    normalize: (raw, input) => normalizeOutlookCalendarOutput("delete-event", input, raw),
  },
};

export async function outlookCalendarViewGet(input: {
  providerConfigKey: string;
  connectionId: string;
  endpoint: string;
  params: Record<string, string | number | boolean | undefined>;
  sandbox?: NangoProxySandboxContext;
}): Promise<z.infer<typeof outlookCalendarViewProxyResponseSchema>> {
  const parsedInput = outlookCalendarViewGetInputSchema.parse({
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    endpoint: input.endpoint,
    params: input.params,
  });
  return nangoProxyRequestJson({
    operation: "nango.outlook_calendar.proxy.get.calendar_view",
    publicSummary: `Nango Outlook Calendar GET "${input.endpoint}" failed`,
    providerConfigKey: parsedInput.providerConfigKey,
    connectionId: parsedInput.connectionId,
    method: "get",
    endpoint: parsedInput.endpoint,
    params: parsedInput.params,
    responseSchema: outlookCalendarViewProxyResponseSchema,
    retries: 3,
    ...(input.sandbox === undefined ? {} : { sandbox: input.sandbox }),
  });
}

export async function outlookCalendarFreeBusyPost(input: {
  providerConfigKey: string;
  connectionId: string;
  data: z.infer<typeof outlookFreeBusyPostInputSchema>["data"];
  sandbox?: NangoProxySandboxContext;
}): Promise<OutlookCalendarGetScheduleResponse> {
  const parsedInput = outlookFreeBusyPostInputSchema.parse({
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    data: input.data,
  });
  return nangoProxyRequestJson({
    operation: "nango.outlook_calendar.proxy.post.get_schedule",
    publicSummary: 'Nango Outlook Calendar POST "/v1.0/me/calendar/getSchedule" failed',
    providerConfigKey: parsedInput.providerConfigKey,
    connectionId: parsedInput.connectionId,
    method: "post",
    endpoint: "/v1.0/me/calendar/getSchedule",
    data: parsedInput.data,
    bodySchema: outlookFreeBusyDataSchema,
    responseSchema: outlookCalendarGetScheduleResponseSchema,
    retries: 3,
    ...(input.sandbox === undefined ? {} : { sandbox: input.sandbox }),
  });
}

export async function executeOutlookCalendarNangoProxyOperation<
  T,
  TOperation extends OutlookCalendarProxyOperation,
>(
  providerConfigKey: OutlookCalendarNangoKey,
  connectionId: string,
  operationName: TOperation,
  responseSchema: z.ZodType<T>,
  input: OutlookCalendarOperationInputByName[TOperation],
  sandbox?: NangoProxySandboxContext,
): Promise<T> {
  const operation = outlookCalendarOperations[operationName];
  const parsedInput = operation.inputSchema.parse(input);
  const request = operation.toProxyRequest(parsedInput as never);
  if (request.voidResponse) {
    await nangoProxyRequestVoid({
      operation: `nango.outlook_calendar.proxy.${operationName}`,
      publicSummary: `Nango Outlook Calendar proxy operation "${operationName}" failed`,
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
    operation: `nango.outlook_calendar.proxy.${operationName}`,
    publicSummary: `Nango Outlook Calendar proxy operation "${operationName}" failed`,
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
