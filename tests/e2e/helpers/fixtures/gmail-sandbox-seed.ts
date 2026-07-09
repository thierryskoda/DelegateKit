import { randomUUID } from "node:crypto";
import {
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  gmailMessageDetailSchema,
  type GmailMessageDetail,
} from "@ai-assistants/gmail-contracts/schemas";
import { gmailNangoProxyRecordSchema } from "../../../../apps/backend/src/test-support/capabilities/gmail";
import type { ProviderSandboxBinding } from "../../../../apps/backend/src/test-support/provider-sandbox";
import { seedProviderSandboxOperationResponses } from "../provider-runtime/provider-sandbox-fixtures";
import { requireTestingProviderSandboxBinding } from "../provider-runtime/testing-provider-runtime";
import { TESTING_FIXTURE_CLIENT } from "../test-data/testing-realistic-data";

const GMAIL_CAPABILITY_ID = "gmail";
const GMAIL_PROVIDER = "gmail";
const GMAIL_PROVIDER_KEY = "ai-assistants-google";
const GMAIL_SEND_OPERATION = "nango.gmail.proxy.send-message";

function gmailMessage(input: {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  bodyText: string;
}): Record<string, unknown> {
  return gmailNangoProxyRecordSchema.parse({
    id: input.id,
    threadId: input.threadId,
    labelIds: ["INBOX"],
    internalDate: String(Date.parse(input.date)),
    snippet: input.bodyText.slice(0, 120),
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "Subject", value: input.subject },
        { name: "From", value: input.from },
        { name: "To", value: input.to },
        { name: "Date", value: input.date },
        { name: "Message-ID", value: `<${input.id}@mail.jeanmenard.ca>` },
      ],
      body: { data: Buffer.from(input.bodyText, "utf8").toString("base64url") },
    },
  });
}

function gmailMessageWithPdfAttachment(input: {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  bodyText: string;
  attachmentId: string;
  attachmentFilename: string;
  attachmentBytes: Buffer;
}): Record<string, unknown> {
  return gmailNangoProxyRecordSchema.parse({
    id: input.id,
    threadId: input.threadId,
    labelIds: ["INBOX"],
    internalDate: String(Date.parse(input.date)),
    snippet: input.bodyText.slice(0, 120),
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "Subject", value: input.subject },
        { name: "From", value: input.from },
        { name: "To", value: input.to },
        { name: "Date", value: input.date },
        { name: "Message-ID", value: `<${input.id}@mail.jeanmenard.ca>` },
      ],
      parts: [
        {
          mimeType: "text/plain",
          filename: "",
          body: { data: Buffer.from(input.bodyText, "utf8").toString("base64url") },
        },
        {
          mimeType: "application/pdf",
          filename: input.attachmentFilename,
          body: {
            attachmentId: input.attachmentId,
            size: input.attachmentBytes.byteLength,
          },
        },
      ],
    },
  });
}

function gmailMessageDetailWithPdfAttachment(input: {
  id: string;
  threadId: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  date: string;
  bodyText: string;
  attachmentId: string;
  attachmentFilename: string;
  attachmentBytes: Buffer;
}): GmailMessageDetail {
  return gmailMessageDetailSchema.parse({
    id: input.id,
    threadId: input.threadId,
    provider: "gmail",
    from: { name: TESTING_FIXTURE_CLIENT.person.fullName, email: input.fromEmail },
    to: [{ name: "John Tremblay", email: input.toEmail }],
    cc: [],
    bcc: [],
    subject: input.subject,
    sentAt: new Date(input.date).toISOString(),
    sentAtProfileLocal: null,
    receivedAt: new Date(input.date).toISOString(),
    receivedAtProfileLocal: null,
    snippet: input.bodyText.slice(0, 120),
    bodyText: input.bodyText,
    bodyTruncated: false,
    attachments: [
      {
        id: input.attachmentId,
        filename: input.attachmentFilename,
        mimeType: "application/pdf",
        byteSize: input.attachmentBytes.byteLength,
      },
    ],
    labels: ["INBOX"],
    canReply: true,
  });
}

async function requireGmailSandboxBinding(db: SupabaseServiceClient): Promise<{
  binding: ProviderSandboxBinding;
  providerKey: typeof GMAIL_PROVIDER_KEY;
}> {
  const fixture = await requireTestingProviderSandboxBinding(db, {
    capabilitySlug: GMAIL_CAPABILITY_ID,
    provider: GMAIL_PROVIDER,
  });
  return {
    binding: {
      link: fixture.capabilityAccountLink,
      account: fixture.connectedAccount,
    },
    providerKey: GMAIL_PROVIDER_KEY,
  };
}

export async function seedGmailSendSandboxForE2e(db: SupabaseServiceClient): Promise<{
  binding: ProviderSandboxBinding;
  providerKey: typeof GMAIL_PROVIDER_KEY;
}> {
  const { binding, providerKey } = await requireGmailSandboxBinding(db);
  await seedProviderSandboxOperationResponses({
    db,
    binding,
    fixtures: [
      {
        providerKey,
        operation: GMAIL_SEND_OPERATION,
        response: {
          id: `sandbox-gmail-${randomUUID()}`,
          threadId: `sandbox-thread-${randomUUID()}`,
          labelIds: ["SENT"],
        },
      },
    ],
  });
  return { binding, providerKey };
}

export async function seedGmailEmptySearchSandboxForE2e(db: SupabaseServiceClient): Promise<void> {
  const { binding, providerKey } = await requireGmailSandboxBinding(db);
  await seedProviderSandboxOperationResponses({
    db,
    binding,
    fixtures: [
      {
        providerKey,
        operation: "nango.gmail.proxy.list-messages",
        response: {
          messages: [],
          resultSizeEstimate: 0,
        },
      },
    ],
  });
}

export async function seedGmailJordanRowanThreadSandboxForE2e(input: {
  db: SupabaseServiceClient;
  marker: string;
  idSuffix: string;
}): Promise<void> {
  const { binding, providerKey } = await requireGmailSandboxBinding(input.db);
  const latestMessage = gmailMessage({
    id: `gmail-jordan-rowan-latest-${input.idSuffix}`,
    threadId: `gmail-thread-jordan-rowan-${input.idSuffix}`,
    from: `Jordan Rowan <${TESTING_FIXTURE_CLIENT.person.email}>`,
    to: "John <john@advisory.example>",
    subject: "Mandate follow-up and next steps",
    date: "2026-05-28T14:12:00.000Z",
    bodyText:
      "Hi John, thanks for sending the draft mandate. Please confirm whether the updated fee schedule is included, send the final PDF for signature, and let me know if anything else is needed before Friday. Jordan",
  });
  await seedProviderSandboxOperationResponses({
    db: input.db,
    binding,
    fixtures: [
      {
        providerKey,
        operation: "nango.gmail.proxy.list-messages",
        response: { messages: [latestMessage] },
        marker: input.marker,
      },
      {
        providerKey,
        operation: "nango.gmail.proxy.get-message",
        response: latestMessage,
        marker: input.marker,
      },
    ],
  });
}

export async function seedGmailJordanRowanInboundAttachmentSandboxForE2e(input: {
  db: SupabaseServiceClient;
  marker: string;
  idSuffix: string;
  attachmentBytes: Buffer;
  attachmentFilename?: string;
}): Promise<{
  binding: ProviderSandboxBinding;
  providerKey: typeof GMAIL_PROVIDER_KEY;
  message: GmailMessageDetail;
}> {
  const { binding, providerKey } = await requireGmailSandboxBinding(input.db);
  const messageId = `gmail-jordan-rowan-attachment-${input.idSuffix}`;
  const threadId = `gmail-thread-jordan-rowan-attachment-${input.idSuffix}`;
  const attachmentId = `attachment-jordan-rowan-contract-${input.idSuffix}`;
  const attachmentFilename = input.attachmentFilename ?? "jordan-rowan-signed-contract-mandate.pdf";
  const date = "2026-05-28T15:16:00.000Z";
  const subject = "Signed Jordan Rowan mandate with contract PDF";
  const bodyText =
    "Hi John, I signed the Jordan Rowan mandate and attached the contract PDF. Please save it to Drive and update the Monday client record so the file is linked for the Growth Mandate follow-up.";
  const rawMessage = gmailMessageWithPdfAttachment({
    id: messageId,
    threadId,
    from: `${TESTING_FIXTURE_CLIENT.person.fullName} <${TESTING_FIXTURE_CLIENT.person.email}>`,
    to: `John Tremblay <${TESTING_FIXTURE_CLIENT.assistantInboxEmail}>`,
    subject,
    date,
    bodyText,
    attachmentId,
    attachmentFilename,
    attachmentBytes: input.attachmentBytes,
  });
  const message = gmailMessageDetailWithPdfAttachment({
    id: messageId,
    threadId,
    fromEmail: TESTING_FIXTURE_CLIENT.person.email,
    toEmail: TESTING_FIXTURE_CLIENT.assistantInboxEmail,
    subject,
    date,
    bodyText,
    attachmentId,
    attachmentFilename,
    attachmentBytes: input.attachmentBytes,
  });
  await seedProviderSandboxOperationResponses({
    db: input.db,
    binding,
    fixtures: [
      {
        providerKey,
        operation: "nango.gmail.proxy.list-messages",
        response: { messages: [rawMessage], resultSizeEstimate: 1 },
        marker: input.marker,
      },
      {
        providerKey,
        operation: "nango.gmail.proxy.get-message",
        response: rawMessage,
        marker: input.marker,
      },
      {
        providerKey,
        operation: "nango.gmail.proxy.get-attachment",
        response: {
          size: input.attachmentBytes.byteLength,
          data: input.attachmentBytes.toString("base64url"),
        },
        marker: input.marker,
      },
    ],
  });
  return { binding, providerKey, message };
}

export async function seedGmailReceiptReconciliationSandboxForE2e(input: {
  db: SupabaseServiceClient;
  marker: string;
  idSuffix: string;
}): Promise<void> {
  const { binding, providerKey } = await requireGmailSandboxBinding(input.db);
  const to = `John Tremblay <${TESTING_FIXTURE_CLIENT.assistantInboxEmail}>`;
  const receipts = [
    {
      merchant: "Papeterie Saint-Laurent",
      email: "receipts@papeteriesaintlaurent.ca",
      subject: "Receipt CAD 184.32 - Papeterie Saint-Laurent",
      date: "2026-05-02T14:18:00.000Z",
      amount: "CAD 184.32",
      description: "Client document courier supplies and printing",
    },
    {
      merchant: "VIA Rail Canada",
      email: "reservations@viarail.ca",
      subject: "Your VIA Rail receipt for CAD 96.70",
      date: "2026-05-03T11:42:00.000Z",
      amount: "CAD 96.70",
      description: "Toronto to Ottawa client meeting travel",
    },
    {
      merchant: "Slack Technologies",
      email: "receipts@slack.com",
      subject: "Slack invoice paid - USD 88.00",
      date: "2026-05-06T09:04:00.000Z",
      amount: "USD 88.00",
      description: "May workspace subscription",
    },
    {
      merchant: "Figma",
      email: "receipts@figma.com",
      subject: "Figma receipt USD 144.00",
      date: "2026-05-08T13:20:00.000Z",
      amount: "USD 144.00",
      description: "Professional design subscription",
    },
    {
      merchant: "Adobe",
      email: "message@adobe.com",
      subject: "Your Adobe invoice for CAD 84.73",
      date: "2026-05-10T08:32:00.000Z",
      amount: "CAD 84.73",
      description: "Creative Cloud subscription",
    },
    {
      merchant: "Air Canada",
      email: "receipts@aircanada.ca",
      subject: "Air Canada receipt CAD 612.45",
      date: "2026-05-12T18:09:00.000Z",
      amount: "CAD 612.45",
      description: "Montreal client trip airfare",
    },
    {
      merchant: "Hotel Monville",
      email: "billing@hotelmonville.com",
      subject: "Hotel Monville folio CAD 438.22",
      date: "2026-05-13T12:15:00.000Z",
      amount: "CAD 438.22",
      description: "Two-night stay for Montreal client meetings",
    },
    {
      merchant: "Notion Labs",
      email: "team@makenotion.com",
      subject: "Your Notion receipt USD 48.00",
      date: "2026-05-15T07:26:00.000Z",
      amount: "USD 48.00",
      description: "Team workspace subscription",
    },
    {
      merchant: "Dropbox",
      email: "no-reply@dropbox.com",
      subject: "Dropbox receipt CAD 32.19",
      date: "2026-05-18T16:44:00.000Z",
      amount: "CAD 32.19",
      description: "Shared client files storage",
    },
    {
      merchant: "Zoom",
      email: "receipts@zoom.us",
      subject: "Zoom receipt USD 21.49",
      date: "2026-05-20T10:02:00.000Z",
      amount: "USD 21.49",
      description: "Monthly meetings plan",
    },
    {
      merchant: "Uber",
      email: "receipts@uber.com",
      subject: "Your Friday trip receipt - CAD 27.80",
      date: "2026-05-24T23:10:00.000Z",
      amount: "CAD 27.80",
      description: "Ride from Union Station after client dinner",
    },
    {
      merchant: "Staples Canada",
      email: "orders@staples.ca",
      subject: "Staples order receipt CAD 152.64",
      date: "2026-05-27T15:38:00.000Z",
      amount: "CAD 152.64",
      description: "Office paper, envelopes, and printer toner",
    },
    {
      merchant: "Intercom",
      email: "receipts@intercom.com",
      subject: "Intercom receipt USD 39.00",
      date: "2026-05-29T06:17:00.000Z",
      amount: "USD 39.00",
      description: "Customer support inbox subscription",
    },
  ] as const;

  const messages = receipts.map((receipt, index) =>
    gmailMessage({
      id: `gmail-receipt-${input.idSuffix}-${index + 1}`,
      threadId: `gmail-receipt-thread-${input.idSuffix}-${index + 1}`,
      from: `${receipt.merchant} <${receipt.email}>`,
      to,
      subject: receipt.subject,
      date: receipt.date,
      bodyText: [
        `Receipt from ${receipt.merchant}`,
        `Amount paid: ${receipt.amount}`,
        `Date: ${receipt.date.slice(0, 10)}`,
        `Description: ${receipt.description}.`,
        "Payment method: Wise Business card.",
      ].join("\n"),
    }),
  );

  await seedProviderSandboxOperationResponses({
    db: input.db,
    binding,
    fixtures: [
      {
        providerKey,
        operation: "nango.gmail.proxy.list-messages",
        response: { messages, resultSizeEstimate: messages.length },
        marker: input.marker,
      },
      {
        providerKey,
        operation: "nango.gmail.proxy.get-message",
        response: messages[0] ?? {},
        marker: input.marker,
      },
    ],
  });
}

export async function loadGmailSendSandboxRequests(
  db: SupabaseServiceClient,
  options?: { createdAfterMs?: number },
): Promise<TableRow<"provider_sandbox_requests">[]> {
  let query = db
    .from("provider_sandbox_requests")
    .select()
    .eq("profile_id", "testing")
    .eq("provider_key", GMAIL_PROVIDER_KEY)
    .eq("operation", GMAIL_SEND_OPERATION)
    .order("created_at", { ascending: true });
  if (options?.createdAfterMs) {
    query = query.gte("created_at", new Date(options.createdAfterMs - 1_000).toISOString());
  }
  const result = await query;
  return requireSupabaseRows("Load Gmail send sandbox requests", result.data, result.error);
}
