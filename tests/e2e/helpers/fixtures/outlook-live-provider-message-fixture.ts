import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  executeOutlookMailNangoProxyOperation,
  outlookMailNangoProxyRecordSchema,
} from "../../../../apps/backend/src/test-support/capabilities/outlook-mail";
import {
  requireTestingNangoConnectionIds,
  type TestingLiveNangoConnection,
} from "../readiness/testing-provider-readiness";
import { asRecord } from "../utils/as-record";

const OUTLOOK_SENT_FOLDER_ID = "sentitems";
const OUTLOOK_SENT_FOLDER_CONSISTENCY_TIMEOUT_MS = 30_000;
const OUTLOOK_SENT_FOLDER_CONSISTENCY_POLL_MS = 2_000;

function outlookMessageId(message: Record<string, unknown>): string {
  const id = message.id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(`Outlook message is missing id: ${JSON.stringify(message)}`);
  }
  return id;
}

function outlookMessageSubject(message: Record<string, unknown>): string | null {
  const subject = message.subject;
  return typeof subject === "string" ? subject : null;
}

export function outlookMessageAttachments(
  message: Record<string, unknown>,
): Record<string, unknown>[] {
  const attachments = message.attachments;
  return Array.isArray(attachments)
    ? attachments.map((attachment) => asRecord(attachment, "Outlook message attachment"))
    : [];
}

function outlookMessageSenderEmail(message: Record<string, unknown>): string | null {
  const from = message.from;
  if (!from || typeof from !== "object") return null;
  const emailAddress = (from as Record<string, unknown>).emailAddress;
  if (!emailAddress || typeof emailAddress !== "object") return null;
  const address = (emailAddress as Record<string, unknown>).address;
  return typeof address === "string" ? address : null;
}

async function listOutlookFolderMessages(input: {
  fixture: TestingLiveNangoConnection;
  folderId: string;
  filter?: string;
  maxResults?: number;
}): Promise<Record<string, unknown>[]> {
  const ids = requireTestingNangoConnectionIds(input.fixture, "Outlook folder message list");
  const providerData = await executeOutlookMailNangoProxyOperation(
    ids.providerConfigKey,
    ids.connectionId,
    "list-messages",
    outlookMailNangoProxyRecordSchema,
    {
      folderId: input.folderId,
      ...(input.filter ? { filter: input.filter } : {}),
      limit: input.maxResults ?? 25,
    },
  );
  const record = asRecord(providerData, "Outlook list-messages result");
  const messages = record.messages;
  return Array.isArray(messages) ? messages.map((message) => asRecord(message, "Outlook message")) : [];
}

export async function findLiveOutlookInboxMessageFromSender(input: {
  fixture: TestingLiveNangoConnection;
  senderEmail: string;
}): Promise<Record<string, unknown> | null> {
  const messages = await listOutlookFolderMessages({
    fixture: input.fixture,
    folderId: "inbox",
    maxResults: 50,
  });
  const expected = input.senderEmail.toLowerCase();
  return (
    messages.find((message) => outlookMessageSenderEmail(message)?.toLowerCase() === expected) ??
    null
  );
}

export async function assertLiveProviderHasSentOutlookMessage(input: {
  fixture: TestingLiveNangoConnection;
  subject: string;
  recipientEmail: string;
}): Promise<string> {
  const deadline = Date.now() + OUTLOOK_SENT_FOLDER_CONSISTENCY_TIMEOUT_MS;
  let match: Record<string, unknown> | undefined;
  let lastMessageCount = 0;
  while (Date.now() < deadline) {
    const messages = await listOutlookFolderMessages({
      fixture: input.fixture,
      folderId: OUTLOOK_SENT_FOLDER_ID,
      maxResults: 50,
    });
    lastMessageCount = messages.length;
    match = messages.find((message) => outlookMessageSubject(message) === input.subject);
    if (match) break;
    await delay(OUTLOOK_SENT_FOLDER_CONSISTENCY_POLL_MS);
  }
  assert.ok(
    match,
    `Outlook sent folder must include message with subject ${JSON.stringify(input.subject)}; last message count=${lastMessageCount}`,
  );
  const messageId = outlookMessageId(match);
  const ids = requireTestingNangoConnectionIds(input.fixture, "Outlook sent message get");
  const detail = await executeOutlookMailNangoProxyOperation(
    ids.providerConfigKey,
    ids.connectionId,
    "get-message",
    outlookMailNangoProxyRecordSchema,
    { messageId },
  );
  const record = asRecord(detail, "Outlook sent message detail");
  const toRecipients = Array.isArray(record.toRecipients) ? record.toRecipients : [];
  const recipientFound = toRecipients.some((recipient) => {
    const row = asRecord(recipient, "Outlook recipient");
    const emailAddress = asRecord(row.emailAddress, "Outlook recipient emailAddress");
    const address = emailAddress.address;
    return typeof address === "string" && address.toLowerCase() === input.recipientEmail.toLowerCase();
  });
  assert.ok(
    recipientFound,
    `Outlook sent message ${messageId} must include recipient ${input.recipientEmail}`,
  );
  return messageId;
}

export async function getLiveOutlookMessage(input: {
  fixture: TestingLiveNangoConnection;
  messageId: string;
}): Promise<Record<string, unknown>> {
  const ids = requireTestingNangoConnectionIds(input.fixture, "Outlook message get");
  return asRecord(
    await executeOutlookMailNangoProxyOperation(
      ids.providerConfigKey,
      ids.connectionId,
      "get-message",
      outlookMailNangoProxyRecordSchema,
      { messageId: input.messageId },
    ),
    "Outlook message detail",
  );
}

export async function cleanupSentLiveOutlookMessage(input: {
  fixture: TestingLiveNangoConnection;
  providerMessageId: string | null;
}): Promise<void> {
  if (!input.providerMessageId) return;
  const ids = requireTestingNangoConnectionIds(input.fixture, "Outlook sent message cleanup");
  try {
    await executeOutlookMailNangoProxyOperation(
      ids.providerConfigKey,
      ids.connectionId,
      "delete-message",
      outlookMailNangoProxyRecordSchema,
      { messageId: input.providerMessageId },
    );
  } catch {
    /* message may already be deleted */
  }
}
