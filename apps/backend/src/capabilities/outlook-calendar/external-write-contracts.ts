import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  outlookCalendarExternalWriteOutputSchema,
  outlookCalendarEventCancelInputSchema,
  outlookCalendarEventCreateInputSchema,
  outlookCalendarEventUpdateInputSchema,
} from "@ai-assistants/outlook-calendar-contracts/schemas";
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
  executeOutlookCalendarEventCancel,
  executeOutlookCalendarEventCreate,
  executeOutlookCalendarEventUpdate,
} from "./write-actions";
import { preflightOutlookCalendarWrite } from "./approval-preflight";

type OutlookCalendarWriteToolName =
  | "outlook_calendar_event_create"
  | "outlook_calendar_event_update"
  | "outlook_calendar_event_cancel";

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

function buildOutlookCalendarConnectDetail(
  toolName: OutlookCalendarWriteToolName,
  payload: Record<string, unknown>,
) {
  const title = textValue(payload.title);
  const start = payload.start && typeof payload.start === "object" ? Reflect.get(payload.start, "dateTime") : null;
  const end = payload.end && typeof payload.end === "object" ? Reflect.get(payload.end, "dateTime") : null;
  const headline =
    toolName === "outlook_calendar_event_create"
      ? title
        ? `Do you approve adding "${title}" to Outlook Calendar?`
        : "Do you approve adding this event to Outlook Calendar?"
      : toolName === "outlook_calendar_event_update"
        ? "Do you approve updating this Outlook Calendar event?"
        : "Do you approve canceling this Outlook Calendar event?";
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

function outlookCalendarWriteDescription(
  toolName: OutlookCalendarWriteToolName,
  payload: Record<string, unknown>,
) {
  const title = eventTitle(payload);
  const label = title === "the calendar event" ? title : quote(title);
  if (toolName === "outlook_calendar_event_create") {
    return {
      completed: `Created ${label} on Outlook Calendar.`,
      needsReview: `Creating ${label} on Outlook Calendar is waiting for review.`,
      processing: `Creating ${label} on Outlook Calendar is processing.`,
      failed: `Could not create ${label} on Outlook Calendar.`,
      unknown: `Outlook Calendar event ${label} may or may not have been created.`,
    };
  }
  if (toolName === "outlook_calendar_event_update") {
    return {
      completed: `Updated Outlook Calendar event ${label}.`,
      needsReview: `Updating Outlook Calendar event ${label} is waiting for review.`,
      processing: `Updating Outlook Calendar event ${label} is processing.`,
      failed: `Could not update Outlook Calendar event ${label}.`,
      unknown: `Outlook Calendar event ${label} may or may not have been updated.`,
    };
  }
  return {
    completed: `Canceled Outlook Calendar event ${textField(payload.eventId) ?? label}.`,
    needsReview: `Canceling Outlook Calendar event ${textField(payload.eventId) ?? label} is waiting for review.`,
    processing: `Canceling Outlook Calendar event ${textField(payload.eventId) ?? label} is processing.`,
    failed: `Could not cancel Outlook Calendar event ${textField(payload.eventId) ?? label}.`,
    unknown: `Outlook Calendar event ${textField(payload.eventId) ?? label} may or may not have been canceled.`,
  };
}

function buildOutlookCalendarAgentResult(
  toolName: OutlookCalendarWriteToolName,
  input: Parameters<ExternalWriteActionContract["buildAgentResult"]>[0],
) {
  return buildExternalWriteAgentResult({
    action: input.action,
    payload: input.payload as Record<string, unknown>,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    message: ({ action, payload, status, providerError }) => {
      const description = outlookCalendarWriteDescription(toolName, payload);
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

function outlookCalendarWriteContract<S extends z.ZodTypeAny>(
  toolName: OutlookCalendarWriteToolName,
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
    outputSchema: outlookCalendarExternalWriteOutputSchema,
    buildWritePlan: async (ctx) => {
      const pack = await preflightOutlookCalendarWrite(ctx.db, ctx.profileId, toolName, ctx.params);
      if (!pack) {
        throw new DomainError(
          domainCodes.INTERNAL,
          `Expected Outlook Calendar approval preflight for ${toolName}.`,
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
      buildOutlookCalendarConnectDetail(toolName, payload as Record<string, unknown>),
    buildAgentResult: (input) => buildOutlookCalendarAgentResult(toolName, input),
    execute: executeImpl,
  });
}

export const outlookCalendarExternalWriteActionContracts: ExternalWriteActionContract[] = [
  outlookCalendarWriteContract(
    "outlook_calendar_event_create",
    outlookCalendarEventCreateInputSchema,
    executeOutlookCalendarEventCreate,
  ),
  outlookCalendarWriteContract(
    "outlook_calendar_event_update",
    outlookCalendarEventUpdateInputSchema,
    executeOutlookCalendarEventUpdate,
  ),
  outlookCalendarWriteContract(
    "outlook_calendar_event_cancel",
    outlookCalendarEventCancelInputSchema,
    executeOutlookCalendarEventCancel,
  ),
];
