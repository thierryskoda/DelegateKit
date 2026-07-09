import {
  gmailEmailReceivedEventSchema,
  type GmailEmailReceivedEvent,
  type GmailMessageDetail,
} from "@ai-assistants/gmail-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { GmailConnectionContext } from "./connection";

function assertInboundAttachmentIds(message: GmailMessageDetail): void {
  for (const attachment of message.attachments) {
    const id = attachment.id.trim();
    if (!id) {
      throw new DomainError(
        domainCodes.CONFLICT,
        "Gmail inbound email event attachment is missing a provider attachment id.",
        { details: { gmailMessageId: message.id, attachment } },
      );
    }
    if (id === "attachment") {
      throw new DomainError(
        domainCodes.CONFLICT,
        "Gmail inbound email event attachment is missing a provider attachment id.",
        { details: { gmailMessageId: message.id, attachment } },
      );
    }
  }
}

export function buildGmailEmailReceivedEventPayload(input: {
  connection: GmailConnectionContext;
  message: GmailMessageDetail;
  historyId: string;
}): GmailEmailReceivedEvent {
  assertInboundAttachmentIds(input.message);
  return gmailEmailReceivedEventSchema.parse({
    provider: "gmail",
    gmailMessageId: input.message.id,
    threadId: input.message.threadId,
    connectedProviderAccountId: input.connection.connectedProviderAccount.id,
    capabilityAccountLinkId: input.connection.capabilityAccountLinkId,
    accountEmail: input.connection.accountEmail,
    historyId: input.historyId,
    from: input.message.from,
    to: input.message.to,
    cc: input.message.cc,
    bcc: input.message.bcc,
    subject: input.message.subject,
    snippet: input.message.snippet,
    bodyText: input.message.bodyText,
    bodyTruncated: input.message.bodyTruncated,
    receivedAt: input.message.receivedAt,
    labels: input.message.labels,
    attachments: input.message.attachments,
  });
}
