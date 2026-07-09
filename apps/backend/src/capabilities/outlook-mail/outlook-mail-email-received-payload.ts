import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  outlookMailEmailReceivedEventSchema,
  type OutlookMailEmailReceivedEvent,
  type OutlookMailMessageDetail,
} from "@ai-assistants/outlook-mail-contracts/schemas";
import type { OutlookConnectionContext } from "./connection";

function assertInboundAttachmentIds(message: OutlookMailMessageDetail): void {
  for (const attachment of message.attachments) {
    const id = attachment.id.trim();
    if (!id) {
      throw new DomainError(
        domainCodes.CONFLICT,
        "Outlook Mail inbound email event attachment is missing a provider attachment id.",
        { details: { outlookMessageId: message.id, attachment } },
      );
    }
  }
}

export function buildOutlookMailEmailReceivedEventPayload(input: {
  connection: OutlookConnectionContext;
  message: OutlookMailMessageDetail;
  graphSubscriptionId: string;
  messageIdHeader: string | null;
}): OutlookMailEmailReceivedEvent {
  assertInboundAttachmentIds(input.message);
  return outlookMailEmailReceivedEventSchema.parse({
    provider: "outlook-mail",
    outlookMessageId: input.message.id,
    conversationId: input.message.threadId,
    connectedProviderAccountId: input.connection.connectedProviderAccount.id,
    capabilityAccountLinkId: input.connection.capabilityAccountLinkId,
    accountEmail: input.connection.accountEmail,
    graphSubscriptionId: input.graphSubscriptionId,
    from: input.message.from,
    to: input.message.to,
    cc: input.message.cc,
    bcc: input.message.bcc,
    subject: input.message.subject,
    snippet: input.message.snippet,
    bodyText: input.message.bodyText,
    bodyTruncated: input.message.bodyTruncated,
    receivedAt: input.message.receivedAt,
    messageIdHeader: input.messageIdHeader,
    attachments: input.message.attachments,
  });
}
