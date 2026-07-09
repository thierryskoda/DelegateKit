import {
  gmailMessageDetailSchema,
  gmailMessageListItemFields,
  gmailMessageListItemSchema,
  type GmailMessageDetail,
  type GmailMessageListItem,
} from "@ai-assistants/gmail-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import { pickFields } from "../../shared/pick-fields";

const rawRecordSchema = z.record(z.string(), z.unknown());
const MAX_BODY_CHARS = 12_000;

function recordValue(value: unknown): Record<string, unknown> {
  return rawRecordSchema.safeParse(value).success ? (value as Record<string, unknown>) : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown, fieldName: string): string {
  const text = stringValue(value);
  if (text) return text;
  throw new DomainError(domainCodes.INTERNAL, `Gmail provider response missing ${fieldName}.`);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function isoDate(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function gmailInternalDate(value: unknown): string | null {
  const n = numberValue(value);
  if (n === null) return null;
  const d = new Date(n);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function normalizeEmailAddress(value: unknown): { name: string | null; email: string } | null {
  if (!value) return null;
  if (typeof value === "string") {
    const text = value.trim();
    const bracket = /^(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>$/.exec(text);
    const email = (bracket?.[2] ?? text).trim();
    const name = bracket?.[1]?.trim() || null;
    return z.string().email().safeParse(email).success ? { name, email } : null;
  }
  const record = recordValue(value);
  const nested = recordValue(record.emailAddress);
  const email =
    stringValue(record.email) ??
    stringValue(record.address) ??
    stringValue(nested.address) ??
    stringValue(nested.email);
  if (!email || !z.string().email().safeParse(email).success) return null;
  return {
    name: stringValue(record.name) ?? stringValue(nested.name),
    email,
  };
}

function normalizeEmailAddressList(value: unknown): Array<{ name: string | null; email: string }> {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => normalizeEmailAddress(item))
      .filter((item): item is { name: string | null; email: string } => Boolean(item));
  }
  return arrayValue(value)
    .map((item) => normalizeEmailAddress(item))
    .filter((item): item is { name: string | null; email: string } => Boolean(item));
}

function gmailHeaders(payload: Record<string, unknown>): Map<string, string> {
  const headers = new Map<string, string>();
  for (const item of arrayValue(payload.headers)) {
    const record = recordValue(item);
    const name = stringValue(record.name)?.toLowerCase();
    const value = stringValue(record.value);
    if (name && value) headers.set(name, value);
  }
  return headers;
}

function decodeBase64Url(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  try {
    return Buffer.from(text, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimBody(body: string | null): { bodyText: string | null; bodyTruncated: boolean } {
  if (!body) return { bodyText: null, bodyTruncated: false };
  if (body.length <= MAX_BODY_CHARS) return { bodyText: body, bodyTruncated: false };
  return { bodyText: body.slice(0, MAX_BODY_CHARS), bodyTruncated: true };
}

function gmailBodyFromPart(part: Record<string, unknown>): string | null {
  const mimeType = stringValue(part.mimeType);
  const body = recordValue(part.body);
  if (mimeType === "text/plain") return decodeBase64Url(body.data);
  for (const child of arrayValue(part.parts)) {
    const found = gmailBodyFromPart(recordValue(child));
    if (found) return found;
  }
  if (mimeType === "text/html") {
    const decoded = decodeBase64Url(body.data);
    return decoded ? stripHtml(decoded) : null;
  }
  return null;
}

function gmailAttachments(part: Record<string, unknown>): GmailMessageDetail["attachments"] {
  const out: GmailMessageDetail["attachments"] = [];
  const filename = stringValue(part.filename);
  const body = recordValue(part.body);
  const attachmentId = stringValue(body.attachmentId);
  if (filename || attachmentId) {
    out.push({
      id: attachmentId ?? filename ?? "attachment",
      filename,
      mimeType: stringValue(part.mimeType),
      byteSize: numberValue(body.size),
    });
  }
  for (const child of arrayValue(part.parts)) {
    out.push(...gmailAttachments(recordValue(child)));
  }
  return out;
}

export function normalizeGmailMessage(raw: unknown): GmailMessageDetail {
  const record = recordValue(raw);
  const payload = recordValue(record.payload);
  const headers = gmailHeaders(payload);
  const body = trimBody(gmailBodyFromPart(payload));
  const message = {
    id: requiredString(stringValue(record.id) ?? stringValue(record.messageId), "message id"),
    threadId: stringValue(record.threadId),
    provider: "gmail",
    from: normalizeEmailAddress(headers.get("from") ?? record.from),
    to: normalizeEmailAddressList(headers.get("to") ?? record.to),
    cc: normalizeEmailAddressList(headers.get("cc") ?? record.cc),
    bcc: normalizeEmailAddressList(headers.get("bcc") ?? record.bcc),
    subject: stringValue(headers.get("subject") ?? record.subject),
    sentAt: isoDate(headers.get("date")) ?? gmailInternalDate(record.internalDate),
    sentAtProfileLocal: null,
    receivedAt: gmailInternalDate(record.internalDate) ?? isoDate(headers.get("date")),
    receivedAtProfileLocal: null,
    snippet: stringValue(record.snippet),
    bodyText: body.bodyText,
    bodyTruncated: body.bodyTruncated,
    attachments: gmailAttachments(payload),
    labels: arrayValue(record.labelIds)
      .map((item) => stringValue(item))
      .filter((item): item is string => Boolean(item)),
    canReply: Boolean(stringValue(headers.get("message-id"))),
  } satisfies GmailMessageDetail;
  return gmailMessageDetailSchema.parse(message);
}

export function normalizeGmailMessageListItem(raw: unknown): GmailMessageListItem {
  const message = normalizeGmailMessage(raw);
  const listItem = pickFields(message, gmailMessageListItemFields) satisfies GmailMessageListItem;
  return gmailMessageListItemSchema.parse(listItem);
}
