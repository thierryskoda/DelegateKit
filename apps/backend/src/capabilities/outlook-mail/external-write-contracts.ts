import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  outlookMailProviderWriteOutputSchema,
  outlookMailMessageDeleteInputSchema,
  outlookMailMessageForwardInputSchema,
  outlookMailMessageMarkReadInputSchema,
  outlookMailMessageMoveInputSchema,
  outlookMailMessageReplyInputSchema,
  outlookMailMessageSendInputSchema,
} from "@ai-assistants/outlook-mail-contracts/schemas";
import type { z } from "zod";
import type { ActionResult } from "../../product/actions/execution/types";
import {
  body,
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
  stringArraySummary,
  textField,
} from "../../product/actions/external-write-contracts/agent-result";
import {
  defineExternalWriteActionContract,
  type ExternalWriteActionContract,
} from "../../product/actions/external-write-contracts/types";
import { preflightOutlookMailMessageSend } from "./message-send-payload";
import {
  executeOutlookMailEmailSendPayload,
  executeOutlookMailMessageDelete,
  executeOutlookMailMessageForward,
  executeOutlookMailMessageMarkRead,
  executeOutlookMailMessageMove,
  executeOutlookMailMessageReply,
} from "./write-actions";
import { preflightOutlookMailNonSendWrite } from "./approval-preflight";

type OutlookMailWriteToolName =
  | "outlook_mail_message_reply"
  | "outlook_mail_message_forward"
  | "outlook_mail_message_move"
  | "outlook_mail_message_mark_read"
  | "outlook_mail_message_delete"
  | "outlook_mail_message_send";

const outlookMailDetailKindByToolName = {
  outlook_mail_message_reply: "outlook_mail_email_reply",
  outlook_mail_message_forward: "outlook_mail_email_forward",
  outlook_mail_message_move: "outlook_mail_email_move",
  outlook_mail_message_mark_read: "outlook_mail_email_mark_read",
  outlook_mail_message_delete: "outlook_mail_email_delete",
  outlook_mail_message_send: "outlook_mail_email_send",
} as const satisfies Record<OutlookMailWriteToolName, Parameters<typeof detail>[0]>;

function recipientList(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const recipients = value.map(textValue).filter((item): item is string => item !== null);
  return recipients.length > 0 ? recipients.join(", ") : null;
}

function outlookMailHeadline(toolName: OutlookMailWriteToolName, payload: Record<string, unknown>) {
  if (toolName === "outlook_mail_message_send") {
    const recipients = recipientList(payload.to);
    return recipients
      ? `Do you approve sending this email to ${recipients}?`
      : "Do you approve sending this email?";
  }
  if (toolName === "outlook_mail_message_reply") {
    const recipients = recipientList(payload.to);
    return recipients
      ? `Do you approve sending this reply to ${recipients}?`
      : "Do you approve sending this reply?";
  }
  if (toolName === "outlook_mail_message_forward") {
    const recipients = recipientList(payload.to);
    return recipients
      ? `Do you approve forwarding this email to ${recipients}?`
      : "Do you approve forwarding this email?";
  }
  if (toolName === "outlook_mail_message_move") return "Do you approve moving this email?";
  if (toolName === "outlook_mail_message_mark_read") {
    return payload.isRead === false
      ? "Do you approve marking this email as unread?"
      : "Do you approve marking this email as read?";
  }
  return "Do you approve deleting this email?";
}

function buildOutlookMailConnectDetail(
  toolName: OutlookMailWriteToolName,
  payload: Record<string, unknown>,
) {
  const note =
    toolName === "outlook_mail_message_send"
      ? body("Message", payload.bodyText)
      : toolName === "outlook_mail_message_forward"
        ? body("Comment", payload.additionalComment)
        : toolName === "outlook_mail_message_reply"
          ? body("Reply", payload.bodyText)
          : null;
  return detail(
    outlookMailDetailKindByToolName[toolName],
    outlookMailHeadline(toolName, payload),
    preview("View details", [
      section({
        title: toolName === "outlook_mail_message_send" ? "Email" : "Details",
        fields: fields([
          field("To", payload.to),
          field("Cc", payload.cc),
          field("Bcc", payload.bcc),
          field("Subject", payload.subject),
          field("Destination", payload.destinationMailboxId),
          field(
            "Attachments",
            Array.isArray(payload.profileFileIds) && payload.profileFileIds.length > 0
              ? payload.profileFileIds.length
              : null,
          ),
        ]),
        body: note,
      }),
    ]),
  );
}

function outlookMailWriteDescription(
  toolName: OutlookMailWriteToolName,
  payload: Record<string, unknown>,
) {
  const to = stringArraySummary(payload.to) ?? "the selected recipient";
  const subject = textField(payload.subject);
  const subjectText = subject ? ` with subject ${quote(subject)}` : "";
  if (toolName === "outlook_mail_message_send") {
    return {
      completed: `The email was queued to ${to}${subjectText}.`,
      needsReview: `This email to ${to}${subjectText} is waiting for review.`,
      processing: `The email to ${to}${subjectText} is processing.`,
      failed: "The email could not be sent.",
      unknown: `The email to ${to}${subjectText} may or may not have been sent.`,
    };
  }
  if (toolName === "outlook_mail_message_reply") {
    return {
      completed: `The reply was queued to ${to}.`,
      needsReview: `This email reply to ${to} is waiting for review.`,
      processing: `The email reply to ${to} is processing.`,
      failed: "The reply could not be sent.",
      unknown: `The email reply to ${to} may or may not have been sent.`,
    };
  }
  if (toolName === "outlook_mail_message_forward") {
    return {
      completed: `The email was forwarded to ${to}${subjectText}.`,
      needsReview: `This email forward to ${to}${subjectText} is waiting for review.`,
      processing: `The email forward to ${to}${subjectText} is processing.`,
      failed: "The email could not be forwarded.",
      unknown: `The email forward to ${to}${subjectText} may or may not have been sent.`,
    };
  }
  if (toolName === "outlook_mail_message_move") {
    const destination = textField(payload.destinationMailboxId) ?? "the target mailbox";
    return {
      completed: `Moved email message ${textField(payload.messageId) ?? "the selected message"} to mailbox ${destination}.`,
      needsReview: `Moving this email to mailbox ${destination} is waiting for review.`,
      processing: `Moving this email to mailbox ${destination} is processing.`,
      failed: "The email could not be moved.",
      unknown: "The email move may or may not have completed.",
    };
  }
  if (toolName === "outlook_mail_message_mark_read") {
    const state = payload.isRead === false ? "unread" : "read";
    return {
      completed: `Marked email message ${textField(payload.messageId) ?? "the selected message"} as ${state}.`,
      needsReview: `Marking this email as ${state} is waiting for review.`,
      processing: `Marking this email as ${state} is processing.`,
      failed: `The email could not be marked as ${state}.`,
      unknown: `The email may or may not have been marked as ${state}.`,
    };
  }
  return {
    completed: `Deleted email message ${textField(payload.messageId) ?? "the selected message"}.`,
    needsReview: "Deleting this email is waiting for review.",
    processing: "Deleting this email is processing.",
    failed: "The email could not be deleted.",
    unknown: "The email may or may not have been deleted.",
  };
}

function buildOutlookMailAgentResult(
  toolName: OutlookMailWriteToolName,
  input: Parameters<ExternalWriteActionContract["buildAgentResult"]>[0],
) {
  return buildExternalWriteAgentResult({
    action: input.action,
    payload: input.payload as Record<string, unknown>,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    message: ({ action, payload, status, providerError }) => {
      const description = outlookMailWriteDescription(toolName, payload);
      const failure = providerErrorMessage(providerError);
      return lifecycleResultSentence({
        status,
        actionId: action.id,
        ...description,
        failed: failure ? `${description.failed} ${failure}` : description.failed,
        unknown: failure ? `${description.unknown} ${failure}` : description.unknown,
      });
    },
    recovery: ({ failure }) => (failure.kind === "not_found" ? "search_again" : null),
  });
}

function outlookMailNonSendContract<S extends z.ZodTypeAny>(
  toolName: Exclude<OutlookMailWriteToolName, "outlook_mail_message_send">,
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
    outputSchema: outlookMailProviderWriteOutputSchema,
    buildWritePlan: async (ctx) => {
      const pack = await preflightOutlookMailNonSendWrite(
        ctx.db,
        ctx.profileId,
        toolName,
        ctx.params,
      );
      if (!pack) {
        throw new DomainError(
          domainCodes.INTERNAL,
          `Expected Outlook Mail approval preflight for ${toolName}.`,
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
      buildOutlookMailConnectDetail(toolName, payload as Record<string, unknown>),
    buildAgentResult: (input) => buildOutlookMailAgentResult(toolName, input),
    execute: executeImpl,
  });
}

function outlookMailMessageSendContract() {
  return defineExternalWriteActionContract({
    toolName: "outlook_mail_message_send",
    actionPayloadSchema: outlookMailMessageSendInputSchema,
    outputSchema: outlookMailProviderWriteOutputSchema,
    buildWritePlan: async (ctx) => {
      const p = await preflightOutlookMailMessageSend(ctx.db, ctx.profileId, ctx.params);
      return {
        actionPayload: p.payload,
        requestHash: p.requestHash,
        reviewTitle: p.approvalTitle,
        reviewSummary: p.approvalSummary,
        reviewPayload: {
          ...p.reviewPayload,
          kind: "outlook_mail_message_send",
        },
      };
    },
    buildReviewDetail: ({ payload }) =>
      buildOutlookMailConnectDetail(
        "outlook_mail_message_send",
        payload as Record<string, unknown>,
      ),
    buildAgentResult: (input) => buildOutlookMailAgentResult("outlook_mail_message_send", input),
    execute: async (db, action, payload) => {
      return executeOutlookMailEmailSendPayload(
        db,
        action,
        outlookMailMessageSendInputSchema.parse(payload),
      );
    },
  });
}

export const outlookMailExternalWriteActionContracts: ExternalWriteActionContract[] = [
  outlookMailNonSendContract(
    "outlook_mail_message_reply",
    outlookMailMessageReplyInputSchema,
    executeOutlookMailMessageReply,
  ),
  outlookMailNonSendContract(
    "outlook_mail_message_forward",
    outlookMailMessageForwardInputSchema,
    executeOutlookMailMessageForward,
  ),
  outlookMailNonSendContract(
    "outlook_mail_message_move",
    outlookMailMessageMoveInputSchema,
    executeOutlookMailMessageMove,
  ),
  outlookMailNonSendContract(
    "outlook_mail_message_mark_read",
    outlookMailMessageMarkReadInputSchema,
    executeOutlookMailMessageMarkRead,
  ),
  outlookMailNonSendContract(
    "outlook_mail_message_delete",
    outlookMailMessageDeleteInputSchema,
    executeOutlookMailMessageDelete,
  ),
  outlookMailMessageSendContract(),
];
