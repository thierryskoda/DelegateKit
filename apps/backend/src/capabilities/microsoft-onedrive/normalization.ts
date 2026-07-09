import {
  microsoftOnedriveDriveItemDetailSchema,
  microsoftOnedriveDriveItemSummarySchema,
  microsoftOnedrivePermissionSchema,
} from "@ai-assistants/microsoft-onedrive-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";

const rawRecordSchema = z.record(z.string(), z.unknown());

type MicrosoftOnedriveDriveItemSummary = z.infer<typeof microsoftOnedriveDriveItemSummarySchema>;
type MicrosoftOnedriveDriveItemDetail = z.infer<typeof microsoftOnedriveDriveItemDetailSchema>;
type MicrosoftOnedrivePermission = z.infer<typeof microsoftOnedrivePermissionSchema>;

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
    `OneDrive provider response missing ${fieldName}.`,
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

function itemType(record: Record<string, unknown>): MicrosoftOnedriveDriveItemSummary["type"] {
  if (record.file) return "file";
  if (record.folder) return "folder";
  if (record.driveType || record.owner) return "drive";
  return "unknown";
}

export function normalizeMicrosoftOnedriveDriveItemSummary(
  raw: unknown,
): MicrosoftOnedriveDriveItemSummary {
  const record = recordValue(raw);
  const summary = {
    id: requiredString(record.id, "item id"),
    name: stringValue(record.name) ?? stringValue(record.displayName),
    type: itemType(record),
    webUrl: stringValue(record.webUrl) ?? stringValue(record.web_url),
    createdAt: isoDate(record.createdDateTime ?? record.createdAt),
    modifiedAt: isoDate(record.lastModifiedDateTime ?? record.modifiedAt),
    sizeBytes: numberValue(record.size),
  } satisfies MicrosoftOnedriveDriveItemSummary;
  return microsoftOnedriveDriveItemSummarySchema.parse(summary);
}

export function normalizeMicrosoftOnedriveDriveItemDetail(
  raw: unknown,
): MicrosoftOnedriveDriveItemDetail {
  const record = recordValue(raw);
  const parent = recordValue(record.parentReference);
  const file = recordValue(record.file);
  const detail = {
    ...normalizeMicrosoftOnedriveDriveItemSummary(record),
    parentId: stringValue(parent.id),
    driveId: stringValue(parent.driveId),
    description: stringValue(record.description),
    mimeType: stringValue(file.mimeType),
  } satisfies MicrosoftOnedriveDriveItemDetail;
  return microsoftOnedriveDriveItemDetailSchema.parse(detail);
}

export function normalizeMicrosoftOnedrivePermission(raw: unknown): MicrosoftOnedrivePermission {
  const record = recordValue(raw);
  const link = recordValue(record.link);
  const grantedTo = recordValue(record.grantedTo ?? record.grantedToV2);
  const user = recordValue(grantedTo.user);
  const permission = {
    id: requiredString(record.id, "permission id"),
    roles: arrayValue(record.roles)
      .map(stringValue)
      .filter((item): item is string => Boolean(item)),
    linkType: stringValue(link.type),
    grantedTo: stringValue(user.email) ?? stringValue(user.displayName),
  } satisfies MicrosoftOnedrivePermission;
  return microsoftOnedrivePermissionSchema.parse(permission);
}
