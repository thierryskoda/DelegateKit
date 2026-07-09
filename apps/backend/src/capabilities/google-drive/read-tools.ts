import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { googleDriveToolContracts } from "@ai-assistants/google-drive-contracts/contracts";
import { toolContractByName, toolData, toolDataForContract, type BackendToolResult } from "@ai-assistants/tool-contracts";
import {
  googleDriveFileOutputSchema,
  googleDriveFileGetInputSchema,
  googleDriveFileSaveInputSchema,
  googleDriveFilesOutputSchema,
  googleDriveFolderListInputSchema,
  googleDrivePermissionOutputSchema,
  googleDrivePermissionGetInputSchema,
  googleDrivePermissionsOutputSchema,
  googleDrivePermissionsListInputSchema,
  googleDriveSearchInputSchema,
  googleDriveSharedDrivesOutputSchema,
  googleDriveSharedDrivesListInputSchema,
  googleDriveAccountsListInputSchema,
} from "@ai-assistants/google-drive-contracts/schemas";
import { recordProviderBinaryArtifact } from "../../product/artifacts/provider-binary-artifact";
import { PROVIDER_BINARY_ARTIFACT_MAX_BYTES } from "../../product/artifacts/provider-binary-limits";
import { listProviderAccountChoices } from "../../product/connected-accounts/provider-account-choices";
import { requireGoogleDriveNango } from "./connection";
import {
  googleDriveNangoProxyRecordSchema,
  googleDriveNangoProxyGet,
  googleDriveNangoProxyGetBinary,
  executeGoogleDriveNangoProxyOperation,
} from "./nango-client";
import {
  normalizeGoogleDriveFileDetail,
  normalizeGoogleDriveFileSummary,
  normalizeGoogleDrivePermission,
  normalizeGoogleDriveSharedDrive,
} from "./normalization";

function driveContext(binding: { account: { account_email: string | null } }) {
  return {
    provider: "google-drive",
    accountEmail: binding.account.account_email,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function filesResult(
  binding: { account: { account_email: string | null } },
  data: unknown,
): Record<string, unknown> {
  const record = recordValue(data);
  return googleDriveFilesOutputSchema.parse({
    ...driveContext(binding),
    files: arrayValue(record.records ?? record.files ?? record.folders).map(
      normalizeGoogleDriveFileSummary,
    ),
    nextCursor: stringValue(record.nextPageToken) ?? stringValue(record.nextCursor),
  });
}

function escapeDriveQueryString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function plainTextDriveQuery(query: string): string {
  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}._-]+/gu, ""))
    .filter((term) => term.length > 0)
    .slice(0, 8);

  const clauses = terms.map((term) => {
    const escaped = escapeDriveQueryString(term);
    if (term.toLowerCase() === "pdf") {
      return `(mimeType = 'application/pdf' or name contains '${escaped}' or fullText contains '${escaped}')`;
    }
    return `(name contains '${escaped}' or fullText contains '${escaped}')`;
  });

  return ["trashed = false", ...clauses].join(" and ");
}

const GOOGLE_WORKSPACE_MIME_PREFIX = "application/vnd.google-apps.";

function isGoogleWorkspaceMimeType(mimeType: string | null): boolean {
  return mimeType?.startsWith(GOOGLE_WORKSPACE_MIME_PREFIX) ?? false;
}

function requireDriveFileName(fileName: string | null, fileId: string): string {
  if (fileName) return fileName;
  throw new DomainError(
    domainCodes.INTERNAL,
    `Google Drive metadata for file ${fileId} did not include a file name.`,
  );
}

function requireDriveMimeType(mimeType: string | null, fileId: string): string {
  if (mimeType) return mimeType;
  throw new DomainError(
    domainCodes.INTERNAL,
    `Google Drive metadata for file ${fileId} did not include a MIME type.`,
  );
}

function googleDriveSearchActionInput(input: {
  query?: string | undefined;
  driveQuery?: string | undefined;
  cursor?: string | undefined;
  pageSize?: number | undefined;
}): Record<string, unknown> {
  return {
    ...(input.driveQuery
      ? { query: input.driveQuery }
      : input.query
        ? { query: plainTextDriveQuery(input.query) }
        : {}),
    ...(input.cursor ? { cursor: input.cursor } : {}),
    ...(typeof input.pageSize === "number" ? { pageSize: input.pageSize } : {}),
  };
}

export async function executeGoogleDriveReadAndArtifactTool(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  switch (toolName) {
    case "google_drive_accounts_list": {
      googleDriveAccountsListInputSchema.parse(params);
      return toolDataForContract(
        toolContractByName(googleDriveToolContracts, "google_drive_accounts_list"),
        {
          accounts: await listProviderAccountChoices(db, {
            profileId,
            capabilitySlug: "google-drive",
            label: "List Google Drive capability instances",
          }),
        },
      );
    }
    case "google_drive_folder_list": {
      const p = googleDriveFolderListInputSchema.parse(params);
      const b = await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeGoogleDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "list-files",
        googleDriveNangoProxyRecordSchema,
        {
          ...(p.folderId ? { folderId: p.folderId } : {}),
          ...(p.cursor ? { cursor: p.cursor } : {}),
          ...(typeof p.limit === "number" ? { limit: p.limit } : {}),
          ...(p.includeSharedDrives !== undefined
            ? { includeSharedDrives: p.includeSharedDrives }
            : {}),
        },
        sandbox,
      );
      return toolData(filesResult(b, data));
    }
    case "google_drive_search": {
      const p = googleDriveSearchInputSchema.parse(params);
      const b = await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeGoogleDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "find-file",
        googleDriveNangoProxyRecordSchema,
        googleDriveSearchActionInput(p),
        sandbox,
      );
      return toolData(filesResult(b, data));
    }
    case "google_drive_file_get": {
      const p = googleDriveFileGetInputSchema.parse(params);
      const b = await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const { data } = await googleDriveNangoProxyGet(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        {
          endpoint: `/drive/v3/files/${encodeURIComponent(p.fileId)}`,
          params: {
            supportsAllDrives: "true",
            fields:
              "id,name,mimeType,parents,driveId,createdTime,modifiedTime,size,webViewLink,trashed,starred,description",
          },
        },
        sandbox,
      );
      return toolData(
        googleDriveFileOutputSchema.parse({
          ...driveContext(b),
          file: normalizeGoogleDriveFileDetail(data),
        }),
      );
    }
    case "google_drive_shared_drives_list": {
      const p = googleDriveSharedDrivesListInputSchema.parse(params);
      const b = await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeGoogleDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "list-drives",
        googleDriveNangoProxyRecordSchema,
        {
          ...(p.cursor ? { cursor: p.cursor } : {}),
          ...(typeof p.limit === "number" ? { limit: p.limit } : {}),
          ...(p.query ? { query: p.query } : {}),
        },
        sandbox,
      );
      const record = recordValue(data);
      return toolData(
        googleDriveSharedDrivesOutputSchema.parse({
          ...driveContext(b),
          drives: arrayValue(record.records ?? record.drives).map(normalizeGoogleDriveSharedDrive),
          nextCursor: stringValue(record.nextPageToken) ?? stringValue(record.nextCursor),
        }),
      );
    }
    case "google_drive_permissions_list": {
      const p = googleDrivePermissionsListInputSchema.parse(params);
      const b = await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeGoogleDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "list-permissions",
        googleDriveNangoProxyRecordSchema,
        {
          fileId: p.fileId,
          ...(p.cursor ? { cursor: p.cursor } : {}),
          ...(typeof p.pageSize === "number" ? { pageSize: p.pageSize } : {}),
        },
        sandbox,
      );
      const record = recordValue(data);
      return toolData(
        googleDrivePermissionsOutputSchema.parse({
          ...driveContext(b),
          permissions: arrayValue(record.records ?? record.permissions).map(
            normalizeGoogleDrivePermission,
          ),
          nextCursor: stringValue(record.nextPageToken) ?? stringValue(record.nextCursor),
        }),
      );
    }
    case "google_drive_permission_get": {
      const p = googleDrivePermissionGetInputSchema.parse(params);
      const b = await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeGoogleDriveNangoProxyOperation(
        b.nangoProviderConfigKey,
        b.nangoConnectionId,
        "get-permission",
        googleDriveNangoProxyRecordSchema,
        {
          fileId: p.fileId,
          permissionId: p.permissionId,
        },
        sandbox,
      );
      return toolData(
        googleDrivePermissionOutputSchema.parse({
          ...driveContext(b),
          permission: normalizeGoogleDrivePermission(data),
        }),
      );
    }
    case "google_drive_file_save": {
      const p = googleDriveFileSaveInputSchema.parse(params);
      const b = await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const key = b.nangoProviderConfigKey;
      const cid = b.nangoConnectionId;
      const { data: fileMetadata } = await googleDriveNangoProxyGet(key, cid, {
        endpoint: `/drive/v3/files/${encodeURIComponent(p.fileId)}`,
        params: {
          supportsAllDrives: "true",
          fields: "id,name,mimeType",
        },
      }, sandbox);
      const file = normalizeGoogleDriveFileSummary(fileMetadata);
      const fileName = requireDriveFileName(file.name, p.fileId);
      const fileMimeType = requireDriveMimeType(file.mimeType, p.fileId);
      const isGoogleWorkspaceFile = isGoogleWorkspaceMimeType(fileMimeType);
      if (p.mode === "export" && !isGoogleWorkspaceFile) {
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          `Google Drive file "${fileName}" has MIME type ${fileMimeType}; use mode=media for binary files and mode=export only for Google Docs, Sheets, or Slides.`,
        );
      }
      if (p.mode === "media" && isGoogleWorkspaceFile) {
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          `Google Drive file "${fileName}" is a Google Workspace file (${fileMimeType}); use mode=export with an exportMimeType.`,
        );
      }
      const { body, contentType } =
        p.mode === "export"
          ? await googleDriveNangoProxyGetBinary(key, cid, {
              endpoint: `/drive/v3/files/${encodeURIComponent(p.fileId)}/export`,
              params: {
                mimeType: p.exportMimeType!,
                supportsAllDrives: "true",
              },
            }, sandbox)
          : await googleDriveNangoProxyGetBinary(key, cid, {
              endpoint: `/drive/v3/files/${encodeURIComponent(p.fileId)}`,
              params: {
                alt: "media",
                supportsAllDrives: "true",
              },
            }, sandbox);
      if (body.byteLength > PROVIDER_BINARY_ARTIFACT_MAX_BYTES) {
        throw new DomainError(
          domainCodes.BAD_REQUEST,
          `Drive file is ${body.byteLength} bytes; max allowed is ${PROVIDER_BINARY_ARTIFACT_MAX_BYTES} bytes.`,
        );
      }
      if (body.byteLength === 0) {
        throw new DomainError(
          domainCodes.CONFLICT,
          "Google Drive download returned 0 bytes; refusing to store an empty artifact.",
        );
      }
      const baseName = p.filename?.trim() || fileName;
      const artifact = await recordProviderBinaryArtifact(db, {
        profileId,
        body,
        contentType: contentType ?? fileMimeType,
        filename: baseName,
        storagePrefix: "google-drive-files",
        artifactType: "google.drive.file",
        metadata: {
          source: "google_drive_file_save",
          fileId: p.fileId,
          sourceName: fileName,
          sourceMimeType: fileMimeType,
          mode: p.mode,
          exportMimeType: p.exportMimeType ?? null,
        },
        incompleteMetadataMessage: "Google Drive artifact metadata is incomplete after save.",
      });
      return toolDataForContract(toolContractByName(googleDriveToolContracts, "google_drive_file_save"), {
        provider: "google-drive",
        accountEmail: b.account.account_email,
        profileFileId: artifact.artifactId,
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        byteSize: artifact.byteSize,
        sha256: artifact.sha256,
      });
    }
    default:
      throw new DomainError(
        domainCodes.INTERNAL,
        `Google Drive read/artifact handler missing for ${toolName}.`,
      );
  }
}
