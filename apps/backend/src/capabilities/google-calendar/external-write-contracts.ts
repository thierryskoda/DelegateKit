import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  googleCalendarExternalWriteOutputSchema,
  googleCalendarEventCancelInputSchema,
  googleCalendarEventCreateInputSchema,
  googleCalendarEventUpdateInputSchema,
} from "@ai-assistants/google-calendar-contracts/schemas";
import type { z } from "zod";
import type { ActionResult } from "../../product/actions/execution/types";
import {
  detail,
  field,
  fields,
  preview,
  section,
  textValue,
} from "../../product/actions/external-write-contracts/connect-detail";
import {
  buildExternalWriteAgentResult,
  lifecycleResultSentence,
  providerErrorMessage,
  quote,
  textField,
} from "../../product/actions/external-write-contracts/agent-result";
import {
  defineExternalWriteActionContract,
  type ExternalWriteActionContract,
} from "../../product/actions/external-write-contracts/types";
import {
  executeGoogleCalendarEventCancel,
  executeGoogleCalendarEventCreate,
  executeGoogleCalendarEventUpdate,
} from "./write-actions";
import { preflightGoogleCalendarWrite } from "./approval-preflight";

type GoogleCalendarWriteToolName =
  | "google_calendar_event_create"
  | "google_calendar_event_update"
  | "google_calendar_event_cancel";

function dateTimeLabel(value: unknown): string | null {
  const text = textValue(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildGoogleCalendarConnectDetail(
  toolName: GoogleCalendarWriteToolName,
  payload: Record<string, unknown>,
) {
  const title = textValue(payload.title);
  const start = payload.start && typeof payload.start === "object" ? Reflect.get(payload.start, "dateTime") : null;
  const end = payload.end && typeof payload.end === "object" ? Reflect.get(payload.end, "dateTime") : null;
  const headline =
    toolName === "google_calendar_event_create"
      ? title
        ? `Do you approve adding "${title}" to your Google Calendar?`
        : "Do you approve adding this event to your Google Calendar?"
      : toolName === "google_calendar_event_update"
        ? "Do you approve updating this Google Calendar event?"
        : "Do you approve canceling this Google Calendar event?";
  return detail(
    toolName,
    headline,
    preview("View event", [
      section({
        title: "Event",
        fields: fields([
          field("Title", title),
          field("Starts", dateTimeLabel(start)),
          field("Ends", dateTimeLabel(end)),
          field("Calendar", payload.calendarId),
          field("Location", payload.location),
          field("Conference", payload.conferencePreference),
        ]),
      }),
    ]),
  );
}

function eventTitle(payload: Record<string, unknown>): string {
  return textField(payload.title) ?? textField(payload.eventId) ?? "the calendar event";
}

function googleCalendarWriteDescription(
  toolName: GoogleCalendarWriteToolName,
  payload: Record<string, unknown>,
) {
  const title = eventTitle(payload);
  const label = title === "the calendar event" ? title : quote(title);
  if (toolName === "google_calendar_event_create") {
    return {
      completed: `Created ${label} on Google Calendar.`,
      needsReview: `Creating ${label} on Google Calendar is waiting for review.`,
      processing: `Creating ${label} on Google Calendar is processing.`,
      failed: `Could not create ${label} on Google Calendar.`,
      unknown: `Google Calendar event ${label} may or may not have been created.`,
    };
  }
  if (toolName === "google_calendar_event_update") {
    return {
      completed: `Updated Google Calendar event ${label}.`,
      needsReview: `Updating Google Calendar event ${label} is waiting for review.`,
      processing: `Updating Google Calendar event ${label} is processing.`,
      failed: `Could not update Google Calendar event ${label}.`,
      unknown: `Google Calendar event ${label} may or may not have been updated.`,
    };
  }
  return {
    completed: `Canceled Google Calendar event ${textField(payload.eventId) ?? label}.`,
    needsReview: `Canceling Google Calendar event ${textField(payload.eventId) ?? label} is waiting for review.`,
    processing: `Canceling Google Calendar event ${textField(payload.eventId) ?? label} is processing.`,
    failed: `Could not cancel Google Calendar event ${textField(payload.eventId) ?? label}.`,
    unknown: `Google Calendar event ${textField(payload.eventId) ?? label} may or may not have been canceled.`,
  };
}

function buildGoogleCalendarAgentResult(
  toolName: GoogleCalendarWriteToolName,
  input: Parameters<ExternalWriteActionContract["buildAgentResult"]>[0],
) {
  return buildExternalWriteAgentResult({
    action: input.action,
    payload: input.payload as Record<string, unknown>,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    message: ({ action, payload, status, providerError }) => {
      const description = googleCalendarWriteDescription(toolName, payload);
      const failure = providerErrorMessage(providerError);
      return lifecycleResultSentence({
        status,
        actionId: action.id,
        ...description,
        failed: failure ? `${description.failed} ${failure}` : description.failed,
        unknown: failure ? `${description.unknown} ${failure}` : description.unknown,
      });
    },
  });
}

function googleCalendarWriteContract<S extends z.ZodTypeAny>(
  toolName: GoogleCalendarWriteToolName,
  actionPayloadSchema: S,
  executeImpl: (
    db: SupabaseServiceClient,
    action: TableRow<"profile_actions">,
    payload: z.infer<S>,
  ) => Promise<ActionResult>,
): ExternalWriteActionContract<S> {
  return defineExternalWriteActionContract({
    toolName,
    actionPayloadSchema,
    outputSchema: googleCalendarExternalWriteOutputSchema,
    buildWritePlan: async (ctx) => {
      const pack = await preflightGoogleCalendarWrite(ctx.db, ctx.profileId, toolName, ctx.params);
      if (!pack) {
        throw new DomainError(
          domainCodes.INTERNAL,
          `Expected Google Calendar approval preflight for ${toolName}.`,
        );
      }
      return {
        actionPayload: pack.payload,
        requestHash: pack.requestHash,
        reviewTitle: pack.approvalTitle,
        reviewSummary: pack.approvalSummary,
        reviewPayload: pack.reviewPayload,
      };
    },
    buildReviewDetail: ({ payload }) =>
      buildGoogleCalendarConnectDetail(toolName, payload as Record<string, unknown>),
    buildAgentResult: (input) => buildGoogleCalendarAgentResult(toolName, input),
    execute: executeImpl,
  });
}

export const googleCalendarExternalWriteActionContracts: ExternalWriteActionContract[] = [
  googleCalendarWriteContract(
    "google_calendar_event_create",
    googleCalendarEventCreateInputSchema,
    executeGoogleCalendarEventCreate,
  ),
  googleCalendarWriteContract(
    "google_calendar_event_update",
    googleCalendarEventUpdateInputSchema,
    executeGoogleCalendarEventUpdate,
  ),
  googleCalendarWriteContract(
    "google_calendar_event_cancel",
    googleCalendarEventCancelInputSchema,
    executeGoogleCalendarEventCancel,
  ),
];
