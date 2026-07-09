import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  gmailMessageDeleteInputSchema,
  gmailMessageForwardInputSchema,
  gmailMessageMarkReadInputSchema,
  gmailMessageMoveInputSchema,
  gmailMessageReplyInputSchema,
} from "@ai-assistants/gmail-contracts/schemas";
import {
  buildExternalWriteApprovalPlan,
  type ExternalWriteApprovalPlan,
} from "../../product/actions/external-write-contracts/approval-plan";
import { requireGmailMailboxNango } from "./connection";

export type GmailApprovalPack = ExternalWriteApprovalPlan;

const GMAIL_WRITE_TOOLS = new Set([
  "gmail_message_reply",
  "gmail_message_forward",
  "gmail_message_move",
  "gmail_message_mark_read",
  "gmail_message_delete",
]);

export async function preflightGmailNonSendWrite(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<GmailApprovalPack | null> {
  if (!GMAIL_WRITE_TOOLS.has(toolName)) return null;
  switch (toolName) {
    case "gmail_message_reply": {
      const p = gmailMessageReplyInputSchema.parse(params);
      await requireGmailMailboxNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Reply to message",
        `Reply to message ${p.replyToMessageId}.`,
        toolName,
        { replyToMessageId: p.replyToMessageId },
      );
    }
    case "gmail_message_forward": {
      const p = gmailMessageForwardInputSchema.parse(params);
      await requireGmailMailboxNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Forward message",
        `Forward message ${p.forwardMessageId} to ${p.to.join(", ")}.`,
        toolName,
        { forwardMessageId: p.forwardMessageId },
      );
    }
    case "gmail_message_move": {
      const p = gmailMessageMoveInputSchema.parse(params);
      await requireGmailMailboxNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Move message",
        `Move message ${p.messageId} to folder/label ${p.destinationMailboxId}.`,
        toolName,
        {},
      );
    }
    case "gmail_message_mark_read": {
      const p = gmailMessageMarkReadInputSchema.parse(params);
      await requireGmailMailboxNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        p.isRead ? "Mark message read" : "Mark message unread",
        `${p.isRead ? "Mark read" : "Mark unread"} message ${p.messageId}.`,
        toolName,
        {},
      );
    }
    case "gmail_message_delete": {
      const p = gmailMessageDeleteInputSchema.parse(params);
      await requireGmailMailboxNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Delete message",
        `Delete or trash message ${p.messageId}.`,
        toolName,
        {},
      );
    }
    default:
      return null;
  }
}
