import {
  googleDriveFileDetailSchema,
  googleDriveFileSummarySchema,
  googleDrivePermissionSchema,
  googleDriveSharedDriveSchema,
} from "@ai-assistants/google-drive-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";

const rawRecordSchema = z.record(z.string(), z.unknown());

type GoogleDriveFileSummary = z.infer<typeof googleDriveFileSummarySchema>;
type GoogleDriveFileDetail = z.infer<typeof googleDriveFileDetailSchema>;
type GoogleDriveSharedDrive = z.infer<typeof googleDriveSharedDriveSchema>;
type GoogleDrivePermission = z.infer<typeof googleDrivePermissionSchema>;

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
  throw new DomainError(
    domainCodes.INTERNAL,
    `Google Drive provider response missing ${fieldName}.`,
  );
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function boolValue(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function isoDate(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function normalizeGoogleDriveFileSummary(raw: unknown): GoogleDriveFileSummary {
  const record = recordValue(raw);
  const summary = {
    id: requiredString(record.id, "file id"),
    name: stringValue(record.name),
    mimeType: stringValue(record.mimeType),
    webUrl: stringValue(record.webViewLink) ?? stringValue(record.webUrl),
    createdAt: isoDate(record.createdTime ?? record.createdAt),
    modifiedAt: isoDate(record.modifiedTime ?? record.modifiedAt),
    sizeBytes: numberValue(record.size),
    trashed: boolValue(record.trashed),
  } satisfies GoogleDriveFileSummary;
  return googleDriveFileSummarySchema.parse(summary);
}

export function normalizeGoogleDriveFileDetail(raw: unknown): GoogleDriveFileDetail {
  const record = recordValue(raw);
  const detail = {
    ...normalizeGoogleDriveFileSummary(record),
    parents: arrayValue(record.parents)
      .map(stringValue)
      .filter((item): item is string => Boolean(item)),
    driveId: stringValue(record.driveId),
    description: stringValue(record.description),
    starred: boolValue(record.starred),
  } satisfies GoogleDriveFileDetail;
  return googleDriveFileDetailSchema.parse(detail);
}

export function normalizeGoogleDriveSharedDrive(raw: unknown): GoogleDriveSharedDrive {
  const record = recordValue(raw);
  const drive = {
    id: requiredString(record.id, "shared drive id"),
    name: stringValue(record.name),
  } satisfies GoogleDriveSharedDrive;
  return googleDriveSharedDriveSchema.parse(drive);
}

export function normalizeGoogleDrivePermission(raw: unknown): GoogleDrivePermission {
  const record = recordValue(raw);
  const permission = {
    id: requiredString(record.id, "permission id"),
    type: stringValue(record.type),
    role: stringValue(record.role),
    emailAddress: stringValue(record.emailAddress),
    displayName: stringValue(record.displayName),
    deleted: boolValue(record.deleted),
  } satisfies GoogleDrivePermission;
  return googleDrivePermissionSchema.parse(permission);
}
