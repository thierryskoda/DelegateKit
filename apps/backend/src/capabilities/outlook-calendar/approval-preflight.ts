import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  outlookCalendarEventCancelInputSchema,
  outlookCalendarEventCreateInputSchema,
  outlookCalendarEventUpdateInputSchema,
} from "@ai-assistants/outlook-calendar-contracts/schemas";
import {
  buildExternalWriteApprovalPlan,
  type ExternalWriteApprovalPlan,
} from "../../product/actions/external-write-contracts/approval-plan";
import { requireOutlookCalendarNango } from "./connection";
import { outlookCalendarLimitations } from "./mapping";

export type OutlookCalendarApprovalPack = ExternalWriteApprovalPlan;

const OUTLOOK_CALENDAR_WRITE_TOOLS = new Set([
  "outlook_calendar_event_create",
  "outlook_calendar_event_update",
  "outlook_calendar_event_cancel",
]);

export async function preflightOutlookCalendarWrite(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<OutlookCalendarApprovalPack | null> {
  if (!OUTLOOK_CALENDAR_WRITE_TOOLS.has(toolName)) return null;
  switch (toolName) {
    case "outlook_calendar_event_create": {
      const p = outlookCalendarEventCreateInputSchema.parse(params);
      await requireOutlookCalendarNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Create calendar event",
        `Create "${p.title}" from ${p.start.dateTime} to ${p.end.dateTime}.`,
        toolName,
        {
          calendarId: p.calendarId,
          limitations: outlookCalendarLimitations(p.conferencePreference),
        },
      );
    }
    case "outlook_calendar_event_update": {
      const p = outlookCalendarEventUpdateInputSchema.parse(params);
      await requireOutlookCalendarNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Update calendar event",
        `Update event ${p.eventId} on calendar ${p.calendarId}.`,
        toolName,
        {
          calendarId: p.calendarId,
          eventId: p.eventId,
          limitations: outlookCalendarLimitations(p.conferencePreference),
        },
      );
    }
    case "outlook_calendar_event_cancel": {
      const p = outlookCalendarEventCancelInputSchema.parse(params);
      await requireOutlookCalendarNango(db, profileId, p.connectedAccountId);
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
