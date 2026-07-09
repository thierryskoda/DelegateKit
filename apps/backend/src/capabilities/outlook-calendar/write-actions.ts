import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import {
  outlookCalendarEventCancelInputSchema,
  outlookCalendarEventCreateInputSchema,
  outlookCalendarEventUpdateInputSchema,
} from "@ai-assistants/outlook-calendar-contracts/schemas";
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
  executeOutlookCalendarNangoProxyOperation,
  outlookCalendarNangoProxyRecordSchema,
  type OutlookCalendarNangoKey,
} from "../../integrations/nango/outlook-calendar-proxy";
import { requireOutlookCalendarNango } from "./connection";
import { outlookCalendarLimitations } from "./mapping";

type OutlookCalendarCreateInput = ReturnType<typeof outlookCalendarEventCreateInputSchema.parse>;
type OutlookCalendarUpdateInput = ReturnType<typeof outlookCalendarEventUpdateInputSchema.parse>;
type OutlookCalendarCancelInput = ReturnType<typeof outlookCalendarEventCancelInputSchema.parse>;

async function recordOutlookCalendarWriteReceipt(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  binding: Awaited<ReturnType<typeof requireOutlookCalendarNango>>,
  input: {
    toolName: string;
    externalResourceId: string;
    operation: string;
    startedAt: string;
    result: unknown;
  },
): Promise<void> {
  await recordProviderActionWriteReceipt(db, action, binding, {
    providerKey: "outlook-calendar",
    capabilitySlug: "outlook-calendar",
    externalResourceType: "event",
    ...input,
  });
}

export async function executeOutlookCalendarEventCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: OutlookCalendarCreateInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const b = await requireOutlookCalendarNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const limitations = outlookCalendarLimitations(params.conferencePreference);
  const result = await executeOutlookCalendarNangoProxyOperation(
    b.nangoProviderConfigKey as OutlookCalendarNangoKey,
    b.nangoConnectionId,
    "create-event",
    outlookCalendarNangoProxyRecordSchema,
    {
      ...(params.calendarId !== "primary" ? { calendarId: params.calendarId } : {}),
      subject: params.title,
      start: { dateTime: params.start.dateTime, timeZone: params.start.timeZone },
      end: { dateTime: params.end.dateTime, timeZone: params.end.timeZone },
      ...(params.description
        ? { body: { contentType: "text" as const, content: params.description } }
        : {}),
      ...(params.location ? { location: { displayName: params.location } } : {}),
      ...(params.attendees.length
        ? {
            attendees: params.attendees.map((attendee) => ({
              emailAddress: {
                address: attendee.email,
                ...(attendee.displayName ? { name: attendee.displayName } : {}),
              },
              type: "required" as const,
            })),
          }
        : {}),
      ...(params.conferencePreference === "provider_default" ? { isOnlineMeeting: true } : {}),
    },
    sandbox,
  );
  await recordOutlookCalendarWriteReceipt(db, action, b, {
    toolName: "outlook_calendar_event_create",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.title,
    operation: "create",
    startedAt,
    result,
  });
  return {
    status: "executed",
    provider: "outlook-calendar",
    result: {
      ...result,
      idempotencyKey: providerIdempotencyKey(executionAction),
      ...(limitations.length ? { limitations } : {}),
    },
  };
}

export async function executeOutlookCalendarEventUpdate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: OutlookCalendarUpdateInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const b = await requireOutlookCalendarNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const limitations = outlookCalendarLimitations(params.conferencePreference);
  const patch: {
    eventId: string;
    subject?: string;
    body?: { contentType: "text"; content: string };
    start?: { dateTime: string; timeZone: string };
    end?: { dateTime: string; timeZone: string };
    location?: { displayName: string };
    attendees?: {
      emailAddress: { address: string; name?: string };
      type: "required";
    }[];
  } = { eventId: params.eventId };
  if (params.title !== undefined) patch.subject = params.title;
  if (params.description !== undefined)
    patch.body = { contentType: "text", content: params.description };
  if (params.start)
    patch.start = { dateTime: params.start.dateTime, timeZone: params.start.timeZone };
  if (params.end) patch.end = { dateTime: params.end.dateTime, timeZone: params.end.timeZone };
  if (params.location !== undefined) patch.location = { displayName: params.location };
  if (params.attendees !== undefined) {
    patch.attendees = params.attendees.map((attendee) => ({
      emailAddress: {
        address: attendee.email,
        ...(attendee.displayName ? { name: attendee.displayName } : {}),
      },
      type: "required",
    }));
  }
  const result = await executeOutlookCalendarNangoProxyOperation(
    b.nangoProviderConfigKey as OutlookCalendarNangoKey,
    b.nangoConnectionId,
    "update-event",
    outlookCalendarNangoProxyRecordSchema,
    patch,
    sandbox,
  );
  await recordOutlookCalendarWriteReceipt(db, action, b, {
    toolName: "outlook_calendar_event_update",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.eventId,
    operation: "update",
    startedAt,
    result,
  });
  return {
    status: "executed",
    provider: "outlook-calendar",
    result: {
      ...result,
      idempotencyKey: providerIdempotencyKey(executionAction),
      ...(limitations.length ? { limitations } : {}),
    },
  };
}

export async function executeOutlookCalendarEventCancel(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: OutlookCalendarCancelInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const b = await requireOutlookCalendarNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result =
    params.sendUpdates !== "none"
      ? await executeOutlookCalendarNangoProxyOperation(
          b.nangoProviderConfigKey as OutlookCalendarNangoKey,
          b.nangoConnectionId,
          "cancel-event",
          outlookCalendarNangoProxyRecordSchema,
          { eventId: params.eventId, comment: params.cancellationMessage ?? "" },
          sandbox,
        )
      : await executeOutlookCalendarNangoProxyOperation(
          b.nangoProviderConfigKey as OutlookCalendarNangoKey,
          b.nangoConnectionId,
          "delete-event",
          outlookCalendarNangoProxyRecordSchema,
          {
            event_id: params.eventId,
            ...(params.calendarId !== "primary" ? { calendar_id: params.calendarId } : {}),
          },
          sandbox,
        );
  await recordOutlookCalendarWriteReceipt(db, action, b, {
    toolName: "outlook_calendar_event_cancel",
    externalResourceId: params.eventId,
    operation: "cancel",
    startedAt,
    result,
  });
  return {
    status: "executed",
    provider: "outlook-calendar",
    result: {
      ...result,
      eventId: params.eventId,
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  };
}
