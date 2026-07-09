import {
  microsoftSharepointDriveItemDetailSchema,
  microsoftSharepointDriveItemSummarySchema,
  microsoftSharepointSiteSummarySchema,
} from "@ai-assistants/microsoft-sharepoint-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";

const rawRecordSchema = z.record(z.string(), z.unknown());

type MicrosoftSharepointDriveItemSummary = z.infer<
  typeof microsoftSharepointDriveItemSummarySchema
>;
type MicrosoftSharepointDriveItemDetail = z.infer<
  typeof microsoftSharepointDriveItemDetailSchema
>;
type MicrosoftSharepointSiteSummary = z.infer<typeof microsoftSharepointSiteSummarySchema>;

function recordValue(value: unknown): Record<string, unknown> {
  return rawRecordSchema.safeParse(value).success ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown, fieldName: string): string {
  const text = stringValue(value);
  if (text) return text;
  throw new DomainError(
    domainCodes.INTERNAL,
    `SharePoint provider response missing ${fieldName}.`,
  );
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isoDate(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function itemType(record: Record<string, unknown>): MicrosoftSharepointDriveItemSummary["type"] {
  if (record.file) return "file";
  if (record.folder) return "folder";
  if (record.driveType || record.owner) return "drive";
  if (record.siteCollection || record.sharepointIds) return "site";
  return "unknown";
}

function normalizeMicrosoftSharepointDriveItemSummary(
  raw: unknown,
): MicrosoftSharepointDriveItemSummary {
  const record = recordValue(raw);
  const summary = {
    id: requiredString(record.id, "item id"),
    name: stringValue(record.name) ?? stringValue(record.displayName),
    type: itemType(record),
    webUrl: stringValue(record.webUrl) ?? stringValue(record.web_url),
    createdAt: isoDate(record.createdDateTime ?? record.createdAt),
    modifiedAt: isoDate(record.lastModifiedDateTime ?? record.modifiedAt),
    sizeBytes: numberValue(record.size),
  } satisfies MicrosoftSharepointDriveItemSummary;
  return microsoftSharepointDriveItemSummarySchema.parse(summary);
}

export function normalizeMicrosoftSharepointSiteSummary(
  raw: unknown,
): MicrosoftSharepointSiteSummary {
  const record = recordValue(raw);
  const summary = {
    siteId: requiredString(record.id, "site id"),
    name: stringValue(record.name) ?? stringValue(record.displayName),
    webUrl: stringValue(record.webUrl) ?? stringValue(record.web_url),
    modifiedAt: isoDate(record.lastModifiedDateTime ?? record.modifiedAt),
  } satisfies MicrosoftSharepointSiteSummary;
  return microsoftSharepointSiteSummarySchema.parse(summary);
}

export function normalizeMicrosoftSharepointDriveItemDetail(
  raw: unknown,
): MicrosoftSharepointDriveItemDetail {
  const record = recordValue(raw);
  const parent = recordValue(record.parentReference);
  const file = recordValue(record.file);
  const detail = {
    ...normalizeMicrosoftSharepointDriveItemSummary(record),
    parentId: stringValue(parent.id),
    driveId: stringValue(parent.driveId),
    description: stringValue(record.description),
    mimeType: stringValue(file.mimeType),
  } satisfies MicrosoftSharepointDriveItemDetail;
  return microsoftSharepointDriveItemDetailSchema.parse(detail);
}
