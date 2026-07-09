import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import {
  googleCalendarEventCancelInputSchema,
  googleCalendarEventCreateInputSchema,
  googleCalendarEventUpdateInputSchema,
} from "@ai-assistants/google-calendar-contracts/schemas";
import {
  markProviderExecutionStarted,
  providerIdempotencyKey,
} from "../../product/actions/execution/provider-runtime";
import {
  providerWriteRecordValue,
  recordProviderActionWriteReceipt,
} from "../../product/actions/execution/provider-write-receipts";
import type { ActionResult } from "../../product/actions/execution/types";
import {
  executeGoogleCalendarNangoProxyOperation,
  googleCalendarNangoProxyRecordSchema,
  type GoogleCalendarNangoKey,
} from "../../integrations/nango/google-calendar-proxy";
import { requireGoogleCalendarNango } from "./connection";

type GoogleCalendarCreateInput = ReturnType<typeof googleCalendarEventCreateInputSchema.parse>;
type GoogleCalendarUpdateInput = ReturnType<typeof googleCalendarEventUpdateInputSchema.parse>;
type GoogleCalendarCancelInput = ReturnType<typeof googleCalendarEventCancelInputSchema.parse>;

async function recordGoogleCalendarWriteReceipt(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  binding: Awaited<ReturnType<typeof requireGoogleCalendarNango>>,
  input: {
    toolName: string;
    externalResourceId: string;
    operation: string;
    startedAt: string;
    result: unknown;
  },
): Promise<void> {
  await recordProviderActionWriteReceipt(db, action, binding, {
    providerKey: "google-calendar",
    capabilitySlug: "google-calendar",
    externalResourceType: "event",
    ...input,
  });
}

export async function executeGoogleCalendarEventCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: GoogleCalendarCreateInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const b = await requireGoogleCalendarNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleCalendarNangoProxyOperation(
    b.nangoProviderConfigKey as GoogleCalendarNangoKey,
    b.nangoConnectionId,
    "create-event",
    googleCalendarNangoProxyRecordSchema,
    {
      calendarId: params.calendarId,
      summary: params.title,
      description: params.description,
      location: params.location,
      start: { dateTime: params.start.dateTime, timeZone: params.start.timeZone },
      end: { dateTime: params.end.dateTime, timeZone: params.end.timeZone },
      attendees: params.attendees.map((attendee) => ({
        email: attendee.email,
        ...(attendee.displayName ? { displayName: attendee.displayName } : {}),
      })),
    },
    sandbox,
  );
  await recordGoogleCalendarWriteReceipt(db, action, b, {
    toolName: "google_calendar_event_create",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.title,
    operation: "create",
    startedAt,
    result,
  });
  return {
    status: "executed",
    provider: "google-calendar",
    result: {
      ...result,
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  };
}

export async function executeGoogleCalendarEventUpdate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: GoogleCalendarUpdateInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const b = await requireGoogleCalendarNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const patch: {
    eventId: string;
    calendarId: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime: string; timeZone: string };
    end?: { dateTime: string; timeZone: string };
    attendees?: { email: string; displayName?: string }[];
  } = {
    eventId: params.eventId,
    calendarId: params.calendarId,
  };
  if (params.title !== undefined) patch.summary = params.title;
  if (params.description !== undefined) patch.description = params.description;
  if (params.location !== undefined) patch.location = params.location;
  if (params.start)
    patch.start = { dateTime: params.start.dateTime, timeZone: params.start.timeZone };
  if (params.end) patch.end = { dateTime: params.end.dateTime, timeZone: params.end.timeZone };
  if (params.attendees !== undefined) {
    patch.attendees = params.attendees.map((attendee) => ({
      email: attendee.email,
      ...(attendee.displayName ? { displayName: attendee.displayName } : {}),
    }));
  }
  const result = await executeGoogleCalendarNangoProxyOperation(
    b.nangoProviderConfigKey as GoogleCalendarNangoKey,
    b.nangoConnectionId,
    "patch-event",
    googleCalendarNangoProxyRecordSchema,
    patch,
    sandbox,
  );
  await recordGoogleCalendarWriteReceipt(db, action, b, {
    toolName: "google_calendar_event_update",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.eventId,
    operation: "update",
    startedAt,
    result,
  });
  return {
    status: "executed",
    provider: "google-calendar",
    result: {
      ...result,
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  };
}

export async function executeGoogleCalendarEventCancel(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: GoogleCalendarCancelInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const b = await requireGoogleCalendarNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleCalendarNangoProxyOperation(
    b.nangoProviderConfigKey as GoogleCalendarNangoKey,
    b.nangoConnectionId,
    "delete-event",
    googleCalendarNangoProxyRecordSchema,
    { calendarId: params.calendarId, eventId: params.eventId },
    sandbox,
  );
  await recordGoogleCalendarWriteReceipt(db, action, b, {
    toolName: "google_calendar_event_cancel",
    externalResourceId: params.eventId,
    operation: "cancel",
    startedAt,
    result,
  });
  return {
    status: "executed",
    provider: "google-calendar",
    result: {
      ...result,
      eventId: params.eventId,
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  };
}
