import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  googleCalendarEventCancelInputSchema,
  googleCalendarEventCreateInputSchema,
  googleCalendarEventUpdateInputSchema,
} from "@ai-assistants/google-calendar-contracts/schemas";
import {
  buildExternalWriteApprovalPlan,
  type ExternalWriteApprovalPlan,
} from "../../product/actions/external-write-contracts/approval-plan";
import { requireGoogleCalendarNango } from "./connection";

export type GoogleCalendarApprovalPack = ExternalWriteApprovalPlan;

const GOOGLE_CALENDAR_WRITE_TOOLS = new Set([
  "google_calendar_event_create",
  "google_calendar_event_update",
  "google_calendar_event_cancel",
]);

export async function preflightGoogleCalendarWrite(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<GoogleCalendarApprovalPack | null> {
  if (!GOOGLE_CALENDAR_WRITE_TOOLS.has(toolName)) return null;
  switch (toolName) {
    case "google_calendar_event_create": {
      const p = googleCalendarEventCreateInputSchema.parse(params);
      await requireGoogleCalendarNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Create calendar event",
        `Create "${p.title}" from ${p.start.dateTime} to ${p.end.dateTime}.`,
        toolName,
        { calendarId: p.calendarId, limitations: [] },
      );
    }
    case "google_calendar_event_update": {
      const p = googleCalendarEventUpdateInputSchema.parse(params);
      await requireGoogleCalendarNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Update calendar event",
        `Update event ${p.eventId} on calendar ${p.calendarId}.`,
        toolName,
        { calendarId: p.calendarId, eventId: p.eventId, limitations: [] },
      );
    }
    case "google_calendar_event_cancel": {
      const p = googleCalendarEventCancelInputSchema.parse(params);
      await requireGoogleCalendarNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Cancel calendar event",
        `Cancel event ${p.eventId} on calendar ${p.calendarId}.`,
        toolName,
        { calendarId: p.calendarId, eventId: p.eventId },
      );
    }
    default:
      return null;
  }
}
