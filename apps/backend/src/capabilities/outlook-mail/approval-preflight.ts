import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  outlookMailMessageDeleteInputSchema,
  outlookMailMessageForwardInputSchema,
  outlookMailMessageMarkReadInputSchema,
  outlookMailMessageMoveInputSchema,
  outlookMailMessageReplyInputSchema,
} from "@ai-assistants/outlook-mail-contracts/schemas";
import {
  buildExternalWriteApprovalPlan,
  type ExternalWriteApprovalPlan,
} from "../../product/actions/external-write-contracts/approval-plan";
import { requireOutlookMailMailboxNango } from "./connection";

export type OutlookMailApprovalPack = ExternalWriteApprovalPlan;

const OUTLOOK_MAIL_WRITE_TOOLS = new Set([
  "outlook_mail_message_reply",
  "outlook_mail_message_forward",
  "outlook_mail_message_move",
  "outlook_mail_message_mark_read",
  "outlook_mail_message_delete",
]);

export async function preflightOutlookMailNonSendWrite(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<OutlookMailApprovalPack | null> {
  if (!OUTLOOK_MAIL_WRITE_TOOLS.has(toolName)) return null;
  switch (toolName) {
    case "outlook_mail_message_reply": {
      const p = outlookMailMessageReplyInputSchema.parse(params);
      await requireOutlookMailMailboxNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Reply to message",
        `Reply to message ${p.replyToMessageId}.`,
        toolName,
        { replyToMessageId: p.replyToMessageId },
      );
    }
    case "outlook_mail_message_forward": {
      const p = outlookMailMessageForwardInputSchema.parse(params);
      await requireOutlookMailMailboxNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Forward message",
        `Forward message ${p.forwardMessageId} to ${p.to.join(", ")}.`,
        toolName,
        { forwardMessageId: p.forwardMessageId },
      );
    }
    case "outlook_mail_message_move": {
      const p = outlookMailMessageMoveInputSchema.parse(params);
      await requireOutlookMailMailboxNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Move message",
        `Move message ${p.messageId} to folder/label ${p.destinationMailboxId}.`,
        toolName,
        {},
      );
    }
    case "outlook_mail_message_mark_read": {
      const p = outlookMailMessageMarkReadInputSchema.parse(params);
      await requireOutlookMailMailboxNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        p.isRead ? "Mark message read" : "Mark message unread",
        `${p.isRead ? "Mark read" : "Mark unread"} message ${p.messageId}.`,
        toolName,
        {},
      );
    }
    case "outlook_mail_message_delete": {
      const p = outlookMailMessageDeleteInputSchema.parse(params);
      await requireOutlookMailMailboxNango(db, profileId, p.connectedAccountId);
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
