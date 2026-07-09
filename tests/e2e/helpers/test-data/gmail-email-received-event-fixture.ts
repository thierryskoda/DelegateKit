import {
  gmailEmailReceivedEventSchema,
  type GmailEmailReceivedEvent,
  type GmailMessageDetail,
} from "@ai-assistants/gmail-contracts/schemas";
import { buildGmailEmailReceivedEventPayload } from "../../../../apps/backend/src/test-support/capabilities/gmail";
import type { GmailConnectionContext } from "../../../../apps/backend/src/test-support/capabilities/gmail";

export function syntheticGmailEmailReceivedEvent(input: {
  connectedProviderAccountId: string;
  capabilityAccountLinkId: string;
  accountEmail: string;
  gmailMessageId: string;
  threadId: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  historyId?: string;
}): GmailEmailReceivedEvent {
  return gmailEmailReceivedEventSchema.parse({
    provider: "gmail",
    gmailMessageId: input.gmailMessageId,
    threadId: input.threadId,
    connectedProviderAccountId: input.connectedProviderAccountId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    accountEmail: input.accountEmail,
    historyId: input.historyId ?? `e2e-history-${input.gmailMessageId}`,
    from: { name: null, email: input.fromEmail },
    to: [{ name: null, email: input.accountEmail }],
    cc: [],
    bcc: [],
    subject: input.subject,
    snippet: input.snippet,
    bodyText: null,
    bodyTruncated: false,
    receivedAt: new Date().toISOString(),
    labels: ["INBOX"],
    attachments: [],
  });
}

export function buildGmailEmailReceivedEventFromTestingMessage(input: {
  connection: GmailConnectionContext;
  message: GmailMessageDetail;
  historyId?: string;
}): GmailEmailReceivedEvent {
  return buildGmailEmailReceivedEventPayload({
    connection: input.connection,
    message: input.message,
    historyId: input.historyId ?? `e2e-history-${input.message.id}`,
  });
}
