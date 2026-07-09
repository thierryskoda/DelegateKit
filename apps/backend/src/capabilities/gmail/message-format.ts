import { createHash } from "node:crypto";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { GmailMessageSendPayload, GmailSendAttachment } from "./message-send-payload";

function cleanHeaderValue(value: string, label: string): string {
  if (/[\r\n]/.test(value))
    throw new DomainError(domainCodes.INTERNAL, `${label} must not contain line breaks.`);
  return value;
}

function encodeHeaderValue(value: string, label: string): string {
  const clean = cleanHeaderValue(value, label);
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function emailHeaders(
  payload: GmailMessageSendPayload,
  options: { messageId?: string } = {},
): string[] {
  const headers = [
    "MIME-Version: 1.0",
    `To: ${payload.to.map((address) => cleanHeaderValue(address, "Email recipient")).join(", ")}`,
  ];
  if (payload.cc.length)
    headers.push(
      `Cc: ${payload.cc.map((address) => cleanHeaderValue(address, "Email cc recipient")).join(", ")}`,
    );
  if (payload.bcc.length)
    headers.push(
      `Bcc: ${payload.bcc.map((address) => cleanHeaderValue(address, "Email bcc recipient")).join(", ")}`,
    );
  headers.push(`Subject: ${encodeHeaderValue(payload.subject, "Email subject")}`);
  if (options.messageId)
    headers.push(`Message-ID: ${cleanHeaderValue(options.messageId, "Email Message-ID")}`);
  return headers;
}

export function gmailMimePlain(
  input: {
    to: readonly string[];
    cc: readonly string[];
    bcc: readonly string[];
    subject: string;
    bodyText: string;
    headerLines?: readonly string[];
  },
  options: { messageId?: string } = {},
): string {
  const lines: string[] = ["MIME-Version: 1.0"];
  const toDisplay = input.to.length
    ? input.to.map((address) => cleanHeaderValue(address, "Email recipient")).join(", ")
    : "undisclosed-recipients:;";
  lines.push(`To: ${toDisplay}`);
  if (input.cc.length)
    lines.push(
      `Cc: ${input.cc.map((address) => cleanHeaderValue(address, "Email cc recipient")).join(", ")}`,
    );
  if (input.bcc.length)
    lines.push(
      `Bcc: ${input.bcc.map((address) => cleanHeaderValue(address, "Email bcc recipient")).join(", ")}`,
    );
  lines.push(`Subject: ${encodeHeaderValue(input.subject, "Email subject")}`);
  if (options.messageId)
    lines.push(`Message-ID: ${cleanHeaderValue(options.messageId, "Email Message-ID")}`);
  for (const h of input.headerLines ?? []) lines.push(h);
  lines.push(
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.bodyText,
  );
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export function gmailRawMessage(
  payload: GmailMessageSendPayload,
  attachments: readonly GmailSendAttachment[],
  options: { messageId?: string } = {},
): string {
  if (attachments.length === 0) {
    return gmailMimePlain(
      {
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        bodyText: payload.bodyText,
      },
      options,
    );
  }

  const boundarySeed = options.messageId ?? `${payload.subject}\0${Date.now()}`;
  const boundary = `ai-assistants-${createHash("sha256").update(boundarySeed).digest("hex").slice(0, 24)}`;
  const parts = [
    ...emailHeaders(payload, options),
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    payload.bodyText,
  ];
  for (const attachment of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${cleanHeaderValue(attachment.artifact.mime_type || "application/octet-stream", "Email attachment MIME type")}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${encodeHeaderValue(attachment.artifact.filename, "Email attachment filename")}"`,
      "",
      Buffer.from(attachment.bytes).toString("base64"),
    );
  }
  parts.push(`--${boundary}--`, "");
  return Buffer.from(parts.join("\r\n")).toString("base64url");
}
