import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  gmailProviderWriteOutputSchema,
  gmailMessageDeleteInputSchema,
  gmailMessageForwardInputSchema,
  gmailMessageMarkReadInputSchema,
  gmailMessageMoveInputSchema,
  gmailMessageReplyInputSchema,
  gmailMessageSendInputSchema,
} from "@ai-assistants/gmail-contracts/schemas";
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
import { preflightGmailMessageSend } from "./message-send-payload";
import {
  executeGmailEmailSendPayload,
  executeGmailMessageDelete,
  executeGmailMessageForward,
  executeGmailMessageMarkRead,
  executeGmailMessageMove,
  executeGmailMessageReply,
} from "./write-actions";
import { preflightGmailNonSendWrite } from "./approval-preflight";

type GmailWriteToolName =
  | "gmail_message_reply"
  | "gmail_message_forward"
  | "gmail_message_move"
  | "gmail_message_mark_read"
  | "gmail_message_delete"
  | "gmail_message_send";

const gmailDetailKindByToolName = {
  gmail_message_reply: "gmail_email_reply",
  gmail_message_forward: "gmail_email_forward",
  gmail_message_move: "gmail_email_move",
  gmail_message_mark_read: "gmail_email_mark_read",
  gmail_message_delete: "gmail_email_delete",
  gmail_message_send: "gmail_email_send",
} as const satisfies Record<GmailWriteToolName, Parameters<typeof detail>[0]>;

function recipientList(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const recipients = value.map(textValue).filter((item): item is string => item !== null);
  return recipients.length > 0 ? recipients.join(", ") : null;
}

function gmailHeadline(toolName: GmailWriteToolName, payload: Record<string, unknown>) {
  if (toolName === "gmail_message_send") {
    const recipients = recipientList(payload.to);
    return recipients
      ? `Do you approve sending this email to ${recipients}?`
      : "Do you approve sending this email?";
  }
  if (toolName === "gmail_message_reply") {
    const recipients = recipientList(payload.to);
    return recipients
      ? `Do you approve sending this reply to ${recipients}?`
      : "Do you approve sending this reply?";
  }
  if (toolName === "gmail_message_forward") {
    const recipients = recipientList(payload.to);
    return recipients
      ? `Do you approve forwarding this email to ${recipients}?`
      : "Do you approve forwarding this email?";
  }
  if (toolName === "gmail_message_move") return "Do you approve moving this email?";
  if (toolName === "gmail_message_mark_read") {
    return payload.isRead === false
      ? "Do you approve marking this email as unread?"
      : "Do you approve marking this email as read?";
  }
  return "Do you approve deleting this email?";
}

function buildGmailConnectDetail(toolName: GmailWriteToolName, payload: Record<string, unknown>) {
  const note =
    toolName === "gmail_message_send"
      ? body("Message", payload.bodyText)
      : toolName === "gmail_message_forward"
        ? body("Comment", payload.additionalComment)
        : toolName === "gmail_message_reply"
          ? body("Reply", payload.bodyText)
          : null;
  return detail(
    gmailDetailKindByToolName[toolName],
    gmailHeadline(toolName, payload),
    preview("View details", [
      section({
        title: toolName === "gmail_message_send" ? "Email" : "Details",
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

function gmailWriteDescription(toolName: GmailWriteToolName, payload: Record<string, unknown>) {
  const to = stringArraySummary(payload.to) ?? "the selected recipient";
  const subject = textField(payload.subject);
  const subjectText = subject ? ` with subject ${quote(subject)}` : "";
  if (toolName === "gmail_message_send") {
    return {
      completed: `The email was queued to ${to}${subjectText}.`,
      needsReview: `This email to ${to}${subjectText} is waiting for review.`,
      processing: `The email to ${to}${subjectText} is processing.`,
      failed: "The email could not be sent.",
      unknown: `The email to ${to}${subjectText} may or may not have been sent.`,
    };
  }
  if (toolName === "gmail_message_reply") {
    return {
      completed: `The reply was queued to ${to}.`,
      needsReview: `This email reply to ${to} is waiting for review.`,
      processing: `The email reply to ${to} is processing.`,
      failed: "The reply could not be sent.",
      unknown: `The email reply to ${to} may or may not have been sent.`,
    };
  }
  if (toolName === "gmail_message_forward") {
    return {
      completed: `The email was forwarded to ${to}${subjectText}.`,
      needsReview: `This email forward to ${to}${subjectText} is waiting for review.`,
      processing: `The email forward to ${to}${subjectText} is processing.`,
      failed: "The email could not be forwarded.",
      unknown: `The email forward to ${to}${subjectText} may or may not have been sent.`,
    };
  }
  if (toolName === "gmail_message_move") {
    const destination = textField(payload.destinationMailboxId) ?? "the target mailbox";
    return {
      completed: `Moved email message ${textField(payload.messageId) ?? "the selected message"} to mailbox ${destination}.`,
      needsReview: `Moving this email to mailbox ${destination} is waiting for review.`,
      processing: `Moving this email to mailbox ${destination} is processing.`,
      failed: "The email could not be moved.",
      unknown: "The email move may or may not have completed.",
    };
  }
  if (toolName === "gmail_message_mark_read") {
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

function buildGmailAgentResult(
  toolName: GmailWriteToolName,
  input: Parameters<ExternalWriteActionContract["buildAgentResult"]>[0],
) {
  return buildExternalWriteAgentResult({
    action: input.action,
    payload: input.payload as Record<string, unknown>,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    message: ({ action, payload, status, providerError }) => {
      const description = gmailWriteDescription(toolName, payload);
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

function gmailNonSendContract<S extends z.ZodTypeAny>(
  toolName: Exclude<GmailWriteToolName, "gmail_message_send">,
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
    outputSchema: gmailProviderWriteOutputSchema,
    buildWritePlan: async (ctx) => {
      const pack = await preflightGmailNonSendWrite(ctx.db, ctx.profileId, toolName, ctx.params);
      if (!pack) {
        throw new DomainError(
          domainCodes.INTERNAL,
          `Expected Gmail approval preflight for ${toolName}.`,
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
      buildGmailConnectDetail(toolName, payload as Record<string, unknown>),
    buildAgentResult: (input) => buildGmailAgentResult(toolName, input),
    execute: executeImpl,
  });
}

function gmailMessageSendContract() {
  return defineExternalWriteActionContract({
    toolName: "gmail_message_send",
    actionPayloadSchema: gmailMessageSendInputSchema,
    outputSchema: gmailProviderWriteOutputSchema,
    buildWritePlan: async (ctx) => {
      const p = await preflightGmailMessageSend(ctx.db, ctx.profileId, ctx.params);
      return {
        actionPayload: p.payload,
        requestHash: p.requestHash,
        reviewTitle: p.approvalTitle,
        reviewSummary: p.approvalSummary,
        reviewPayload: {
          ...p.reviewPayload,
          kind: "gmail_message_send",
        },
      };
    },
    buildReviewDetail: ({ payload }) =>
      buildGmailConnectDetail("gmail_message_send", payload as Record<string, unknown>),
    buildAgentResult: (input) => buildGmailAgentResult("gmail_message_send", input),
    execute: async (db, action, payload) => {
      return executeGmailEmailSendPayload(db, action, gmailMessageSendInputSchema.parse(payload));
    },
  });
}

export const gmailExternalWriteActionContracts: ExternalWriteActionContract[] = [
  gmailNonSendContract("gmail_message_reply", gmailMessageReplyInputSchema, executeGmailMessageReply),
  gmailNonSendContract(
    "gmail_message_forward",
    gmailMessageForwardInputSchema,
    executeGmailMessageForward,
  ),
  gmailNonSendContract("gmail_message_move", gmailMessageMoveInputSchema, executeGmailMessageMove),
  gmailNonSendContract(
    "gmail_message_mark_read",
    gmailMessageMarkReadInputSchema,
    executeGmailMessageMarkRead,
  ),
  gmailNonSendContract(
    "gmail_message_delete",
    gmailMessageDeleteInputSchema,
    executeGmailMessageDelete,
  ),
  gmailMessageSendContract(),
];
