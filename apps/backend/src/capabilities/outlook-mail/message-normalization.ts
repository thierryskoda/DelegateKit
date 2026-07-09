import {
  outlookMailMessageDetailSchema,
  outlookMailMessageListItemFields,
  outlookMailMessageListItemSchema,
  type OutlookMailMessageDetail,
  type OutlookMailMessageListItem,
} from "@ai-assistants/outlook-mail-contracts/schemas";
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
  throw new DomainError(domainCodes.INTERNAL, `Outlook Mail provider response missing ${fieldName}.`);
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

function outlookAttachments(raw: Record<string, unknown>): OutlookMailMessageDetail["attachments"] {
  return arrayValue(raw.attachments)
    .map((item) => {
      const record = recordValue(item);
      const id = stringValue(record.id);
      if (!id) return null;
      return {
        id,
        filename: stringValue(record.name),
        mimeType: stringValue(record.contentType),
        byteSize: numberValue(record.size),
      };
    })
    .filter((item): item is OutlookMailMessageDetail["attachments"][number] => Boolean(item));
}

export function normalizeOutlookMailMessage(raw: unknown): OutlookMailMessageDetail {
  const record = recordValue(raw);
  const body = recordValue(record.body);
  const bodyContent = stringValue(body.content) ?? stringValue(record.bodyText);
  const normalizedBody = trimBody(
    body.contentType === "html" || /<[^>]+>/.test(bodyContent ?? "")
      ? stripHtml(bodyContent ?? "")
      : bodyContent,
  );
  const message = {
    id: requiredString(stringValue(record.id) ?? stringValue(record.messageId), "message id"),
    threadId: stringValue(record.conversationId) ?? stringValue(record.threadId),
    provider: "outlook-mail",
    from: normalizeEmailAddress(record.from ?? record.sender),
    to: normalizeEmailAddressList(record.toRecipients ?? record.to),
    cc: normalizeEmailAddressList(record.ccRecipients ?? record.cc),
    bcc: normalizeEmailAddressList(record.bccRecipients ?? record.bcc),
    subject: stringValue(record.subject),
    sentAt: isoDate(record.sentDateTime ?? record.sentAt),
    receivedAt: isoDate(record.receivedDateTime ?? record.receivedAt),
    snippet: stringValue(record.bodyPreview ?? record.snippet),
    bodyText: normalizedBody.bodyText,
    bodyTruncated: normalizedBody.bodyTruncated,
    attachments: outlookAttachments(record),
    labels: stringValue(record.parentFolderId) ? [stringValue(record.parentFolderId)!] : [],
    canReply: Boolean(stringValue(record.id) ?? stringValue(record.messageId)),
  } satisfies OutlookMailMessageDetail;
  return outlookMailMessageDetailSchema.parse(message);
}

export function normalizeOutlookMailMessageListItem(raw: unknown): OutlookMailMessageListItem {
  const message = normalizeOutlookMailMessage(raw);
  const listItem = pickFields(message, outlookMailMessageListItemFields) satisfies OutlookMailMessageListItem;
  return outlookMailMessageListItemSchema.parse(listItem);
}
