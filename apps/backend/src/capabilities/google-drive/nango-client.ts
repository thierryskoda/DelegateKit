import { Buffer } from "node:buffer";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import {
  nangoProxyRequestBinary,
  nangoProxyRequestJson,
  nangoProxyRequestJsonWithHeaders,
  nangoProxyRequestVoid,
  type NangoProxySandboxContext,
  type ProviderOperation,
  type ProviderProxyRequest,
} from "../../integrations/nango/nango-proxy-client";
import type { NangoAuthFailureProjection } from "../../integrations/nango/nango-admin-client-error";

export const googleDriveNangoProxyRecordSchema = z.record(z.string(), z.unknown());

export type GoogleDriveProxyOperation =
  | "copy-file"
  | "create-folder"
  | "delete-file"
  | "delete-permission"
  | "find-file"
  | "get-permission"
  | "list-drives"
  | "list-files"
  | "list-permissions"
  | "move-file"
  | "update-file"
  | "update-permission"
  | "upload-document";

type ProxyRequest = ProviderProxyRequest;
type GoogleDriveStandardProxyOperation = Exclude<GoogleDriveProxyOperation, "upload-document">;

const stringField = z.string().trim().min(1);
const stringArray = z.array(stringField);
const stringMapSchema = z.record(z.string(), z.union([z.string(), z.null()]));
const nangoParamsObjectSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.undefined()]),
);
const listFilesInputSchema = z
  .object({
    folderId: stringField.optional(),
    limit: z.number().int().positive().optional(),
    cursor: stringField.optional(),
    includeSharedDrives: z.boolean().optional(),
  })
  .strict();
const findFileInputSchema = z
  .object({
    query: stringField.optional(),
    pageSize: z.number().int().positive().optional(),
    cursor: stringField.optional(),
  })
  .strict();
const listDrivesInputSchema = z
  .object({
    cursor: stringField.optional(),
    limit: z.number().int().positive().optional(),
    query: stringField.optional(),
  })
  .strict();
const fileIdInputSchema = z.object({ fileId: stringField }).strict();
const permissionInputSchema = z.object({ fileId: stringField, permissionId: stringField }).strict();
const listPermissionsInputSchema = z
  .object({
    fileId: stringField,
    pageSize: z.number().int().positive().optional(),
    cursor: stringField.optional(),
  })
  .strict();
const createFolderInputSchema = z
  .object({ name: stringField, parentId: stringField.optional() })
  .strict();
const copyFileInputSchema = z
  .object({
    fileId: stringField,
    name: stringField.optional(),
    destinationFolderId: stringField.optional(),
  })
  .strict();
const moveFileInputSchema = z
  .object({ fileId: stringField, toFolderId: stringField, fromFolderId: stringField })
  .strict();
const updateFileInputSchema = z
  .object({
    fileId: stringField,
    name: stringField.optional(),
    description: z.string().optional(),
    mimeType: stringField.optional(),
    starred: z.boolean().optional(),
    trashed: z.boolean().optional(),
    parents: stringArray.optional(),
    appProperties: stringMapSchema.optional(),
    properties: stringMapSchema.optional(),
  })
  .strict();
const updatePermissionInputSchema = permissionInputSchema.extend({ role: stringField }).strict();
const uploadDocumentInputSchema = z
  .object({
    name: stringField,
    content: z.string(),
    mimeType: stringField,
    isBase64: z.boolean().optional(),
    folderId: stringField.optional(),
    description: z.string().optional(),
  })
  .strict();
const googleDriveProxyGetInputSchema = z
  .object({
    endpoint: stringField,
    params: nangoParamsObjectSchema.optional(),
    retries: z.number().int().positive().optional(),
  })
  .strict();
const googleDrivePermissionCreateBodySchema = z
  .object({
    type: stringField,
    role: stringField,
    emailAddress: stringField.optional(),
    domain: stringField.optional(),
    allowFileDiscovery: z.boolean().optional(),
  })
  .strict();
const googleDriveUploadMetadataBodySchema = z
  .object({
    name: stringField,
    mimeType: stringField,
    description: z.string().optional(),
    parents: stringArray.optional(),
  })
  .strict();
const googleDriveCreateFolderBodySchema = z
  .object({
    name: stringField,
    mimeType: z.literal("application/vnd.google-apps.folder"),
    parents: stringArray.optional(),
  })
  .strict();
const googleDriveCopyFileBodySchema = z
  .object({
    name: stringField.optional(),
    parents: stringArray.optional(),
  })
  .strict();
const googleDriveUpdateFileBodySchema = updateFileInputSchema.omit({ fileId: true });
const googleDriveUpdatePermissionBodySchema = z.object({ role: stringField }).strict();
const googleDrivePermissionCreateInputSchema = googleDriveProxyGetInputSchema
  .extend({ data: googleDrivePermissionCreateBodySchema })
  .strict();
const googleDriveChannelBodySchema = z
  .object({
    id: stringField,
    type: z.literal("web_hook"),
    address: z.string().trim().url(),
    token: stringField,
    expiration: stringField.optional(),
    params: z.object({ ttl: z.string().trim().min(1) }).strict().optional(),
  })
  .strict();
const googleDriveChannelStopBodySchema = z
  .object({
    id: stringField,
    resourceId: stringField,
  })
  .strict();

const googleDriveStartPageTokenResponseSchema = z
  .object({ startPageToken: stringField })
  .passthrough();

export const googleDriveWatchResponseSchema = z
  .object({
    id: stringField,
    resourceId: stringField,
    resourceUri: z.string().trim().min(1).optional(),
    token: z.string().trim().min(1).optional(),
    expiration: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export const googleDriveFileStateSourceSchema = z
  .object({
    id: stringField,
    name: z.string().nullable().optional(),
    mimeType: z.string().nullable().optional(),
    parents: z.array(z.string()).optional(),
    driveId: z.string().nullable().optional(),
    createdTime: z.string().nullable().optional(),
    modifiedTime: z.string().nullable().optional(),
    webViewLink: z.string().nullable().optional(),
    trashed: z.boolean().optional(),
    starred: z.boolean().optional(),
    description: z.string().nullable().optional(),
    size: z.union([z.string(), z.number()]).nullable().optional(),
    md5Checksum: z.string().nullable().optional(),
    headRevisionId: z.string().nullable().optional(),
  })
  .passthrough();

export type GoogleDriveFileStateSource = z.infer<typeof googleDriveFileStateSourceSchema>;

export const googleDriveFilesStateListResponseSchema = z
  .object({
    files: z.array(googleDriveFileStateSourceSchema).default([]),
    nextPageToken: z.string().nullable().optional(),
  })
  .passthrough();

const googleDriveChangeSchema = z
  .object({
    changeType: z.string().optional(),
    fileId: z.string().optional(),
    file: googleDriveFileStateSourceSchema.optional(),
    removed: z.boolean().optional(),
    time: z.string().optional(),
  })
  .passthrough();

export type GoogleDriveChange = z.infer<typeof googleDriveChangeSchema>;

export const googleDriveChangesListResponseSchema = z
  .object({
    changes: z.array(googleDriveChangeSchema).default([]),
    nextPageToken: z.string().optional(),
    newStartPageToken: z.string().optional(),
  })
  .passthrough();

const googleDriveNangoProxyEmptyResponseSchema = z.object({}).passthrough();
const googleDriveNangoProxyFileListResponseSchema = googleDriveFilesStateListResponseSchema;
const googleDriveNangoProxyDrivesListResponseSchema = z
  .object({
    drives: z.array(googleDriveNangoProxyRecordSchema).default([]),
    nextPageToken: z.string().optional(),
  })
  .passthrough();
const googleDriveNangoProxyPermissionsListResponseSchema = z
  .object({
    permissions: z.array(googleDriveNangoProxyRecordSchema).default([]),
    nextPageToken: z.string().optional(),
  })
  .passthrough();
export const googleDriveNangoProxyIdResponseSchema = z
  .object({
    id: stringField,
  })
  .passthrough();
export const googleDriveNangoProxyResponseSchemas = {
  "copy-file": googleDriveFileStateSourceSchema,
  "create-folder": googleDriveFileStateSourceSchema,
  "delete-file": googleDriveNangoProxyEmptyResponseSchema,
  "delete-permission": googleDriveNangoProxyEmptyResponseSchema,
  "find-file": googleDriveNangoProxyFileListResponseSchema,
  "get-permission": googleDriveNangoProxyRecordSchema,
  "list-drives": googleDriveNangoProxyDrivesListResponseSchema,
  "list-files": googleDriveNangoProxyFileListResponseSchema,
  "list-permissions": googleDriveNangoProxyPermissionsListResponseSchema,
  "move-file": googleDriveFileStateSourceSchema,
  "update-file": googleDriveFileStateSourceSchema,
  "update-permission": googleDriveNangoProxyRecordSchema,
  "upload-document": googleDriveNangoProxyIdResponseSchema,
} as const;

type GoogleDriveOperationInputByName = {
  "copy-file": z.infer<typeof copyFileInputSchema>;
  "create-folder": z.infer<typeof createFolderInputSchema>;
  "delete-file": z.infer<typeof fileIdInputSchema>;
  "delete-permission": z.infer<typeof permissionInputSchema>;
  "find-file": z.infer<typeof findFileInputSchema>;
  "get-permission": z.infer<typeof permissionInputSchema>;
  "list-drives": z.infer<typeof listDrivesInputSchema>;
  "list-files": z.infer<typeof listFilesInputSchema>;
  "list-permissions": z.infer<typeof listPermissionsInputSchema>;
  "move-file": z.infer<typeof moveFileInputSchema>;
  "update-file": z.infer<typeof updateFileInputSchema>;
  "update-permission": z.infer<typeof updatePermissionInputSchema>;
  "upload-document": z.infer<typeof uploadDocumentInputSchema>;
};

type GoogleDriveOperationMap = {
  [K in GoogleDriveStandardProxyOperation]: ProviderOperation<
    GoogleDriveOperationInputByName[K],
    unknown
  >;
};
type GoogleDriveNormalizedProxyOperation =
  | "create-folder"
  | "delete-file"
  | "delete-permission"
  | "find-file"
  | "list-drives"
  | "list-files"
  | "list-permissions";

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function identityNormalize(raw: unknown): unknown {
  return raw;
}

function driveQueryParent(parentId: string): string {
  return `'${parentId.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' in parents and trashed = false`;
}

function googleDriveRequest<TOperation extends GoogleDriveStandardProxyOperation>(
  operationName: TOperation,
  input: GoogleDriveOperationInputByName[TOperation],
): ProxyRequest {
  const p = recordValue(input);
  switch (operationName) {
    case "list-files": {
      const parentId = typeof p.folderId === "string" && p.folderId.trim() ? p.folderId : "root";
      return {
        method: "get",
        endpoint: "/drive/v3/files",
        params: {
          q: driveQueryParent(parentId),
          fields:
            "files(id,name,mimeType,parents,createdTime,modifiedTime,size,webViewLink,thumbnailLink),nextPageToken",
          pageSize: typeof p.limit === "number" ? p.limit : 100,
          ...(typeof p.cursor === "string" ? { pageToken: p.cursor } : {}),
          ...(p.includeSharedDrives === true
            ? { includeItemsFromAllDrives: true, supportsAllDrives: true }
            : {}),
        },
      };
    }
    case "find-file":
      return {
        method: "get",
        endpoint: "/drive/v3/files",
        params: {
          fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink)",
          orderBy: "modifiedTime desc",
          pageSize: typeof p.pageSize === "number" ? p.pageSize : 100,
          ...(typeof p.query === "string" ? { q: p.query } : {}),
          ...(typeof p.cursor === "string" ? { pageToken: p.cursor } : {}),
        },
      };
    case "list-drives":
      return {
        method: "get",
        endpoint: "/drive/v3/drives",
        params: {
          ...(typeof p.cursor === "string" ? { pageToken: p.cursor } : {}),
          ...(typeof p.limit === "number" ? { pageSize: p.limit } : {}),
          ...(typeof p.query === "string" ? { q: p.query } : {}),
        },
      };
    case "list-permissions":
      return {
        method: "get",
        endpoint: `/drive/v3/files/${encodeURIComponent(String(p.fileId))}/permissions`,
        params: {
          supportsAllDrives: true,
          ...(typeof p.pageSize === "number" ? { pageSize: p.pageSize } : {}),
          ...(typeof p.cursor === "string" ? { pageToken: p.cursor } : {}),
        },
      };
    case "get-permission":
      return {
        method: "get",
        endpoint: `/drive/v3/files/${encodeURIComponent(String(p.fileId))}/permissions/${encodeURIComponent(String(p.permissionId))}`,
        params: { supportsAllDrives: true },
      };
    case "create-folder":
      return {
        method: "post",
        endpoint: "/drive/v3/files",
        params: { fields: "id,name,mimeType,createdTime,parents" },
        data: {
          name: p.name,
          mimeType: "application/vnd.google-apps.folder",
          ...(typeof p.parentId === "string" ? { parents: [p.parentId] } : {}),
        },
        bodySchema: googleDriveCreateFolderBodySchema,
      };
    case "copy-file":
      return {
        method: "post",
        endpoint: `/drive/v3/files/${encodeURIComponent(String(p.fileId))}/copy`,
        data: {
          ...(typeof p.name === "string" ? { name: p.name } : {}),
          ...(typeof p.destinationFolderId === "string"
            ? { parents: [p.destinationFolderId] }
            : {}),
        },
        bodySchema: googleDriveCopyFileBodySchema,
      };
    case "move-file":
      return {
        method: "patch",
        endpoint: `/drive/v3/files/${encodeURIComponent(String(p.fileId))}`,
        params: {
          addParents: String(p.toFolderId),
          removeParents: String(p.fromFolderId),
          fields: "id,name,mimeType,parents",
        },
      };
    case "update-file": {
      const data: Record<string, unknown> = {};
      for (const key of [
        "name",
        "description",
        "mimeType",
        "starred",
        "trashed",
        "parents",
        "appProperties",
        "properties",
      ] as const) {
        if (p[key] !== undefined) data[key] = p[key];
      }
      return {
        method: "patch",
        endpoint: `/drive/v3/files/${encodeURIComponent(String(p.fileId))}`,
        params: {
          supportsAllDrives: true,
          fields:
            "id,name,mimeType,description,starred,trashed,parents,createdTime,modifiedTime,size,webViewLink",
        },
        data,
        bodySchema: googleDriveUpdateFileBodySchema,
      };
    }
    case "delete-file":
      return {
        method: "delete",
        endpoint: `/drive/v3/files/${encodeURIComponent(String(p.fileId))}`,
        voidResponse: true,
      };
    case "update-permission":
      return {
        method: "patch",
        endpoint: `/drive/v3/files/${encodeURIComponent(String(p.fileId))}/permissions/${encodeURIComponent(String(p.permissionId))}`,
        data: { role: p.role },
        bodySchema: googleDriveUpdatePermissionBodySchema,
      };
    case "delete-permission":
      return {
        method: "delete",
        endpoint: `/drive/v3/files/${encodeURIComponent(String(p.fileId))}/permissions/${encodeURIComponent(String(p.permissionId))}`,
        voidResponse: true,
      };
    default: {
      const _exhaustive: never = operationName;
      throw new DomainError(
        domainCodes.INTERNAL,
        `Unhandled Google Drive proxy operation ${String(_exhaustive)}.`,
      );
    }
  }
}

function normalizeGoogleDriveOutput(
  operationName: GoogleDriveNormalizedProxyOperation,
  input: GoogleDriveOperationInputByName[GoogleDriveNormalizedProxyOperation],
  raw: unknown,
) {
  const p = recordValue(input);
  const r = recordValue(raw);
  switch (operationName) {
    case "list-files": {
      const files = arrayValue(r.files).map((file) => ({
        ...file,
        isFolder: file.mimeType === "application/vnd.google-apps.folder",
        parentId: Array.isArray(file.parents) ? file.parents[0] : undefined,
        size: typeof file.size === "string" ? Number.parseInt(file.size, 10) : file.size,
      }));
      return { files, nextPageToken: r.nextPageToken, totalCount: files.length };
    }
    case "find-file":
      return {
        files: arrayValue(r.files),
        nextPageToken: r.nextPageToken,
        totalResults: arrayValue(r.files).length,
      };
    case "list-drives":
      return { drives: arrayValue(r.drives), nextPageToken: r.nextPageToken };
    case "list-permissions":
      return { permissions: arrayValue(r.permissions), nextPageToken: r.nextPageToken };
    case "create-folder":
      return { ...r, parentIds: Array.isArray(r.parents) ? r.parents : [] };
    case "delete-file":
      return { success: true, fileId: p.fileId };
    case "delete-permission":
      return { success: true, fileId: p.fileId, permissionId: p.permissionId };
    default: {
      const _exhaustive: never = operationName;
      throw new DomainError(
        domainCodes.INTERNAL,
        `Unhandled Google Drive normalization operation ${String(_exhaustive)}.`,
      );
    }
  }
}

const googleDriveOperations: GoogleDriveOperationMap = {
  "copy-file": googleDriveOperation("copy-file", copyFileInputSchema, identityNormalize),
  "create-folder": googleDriveOperation("create-folder", createFolderInputSchema, (raw, input) =>
    normalizeGoogleDriveOutput("create-folder", input, raw),
  ),
  "delete-file": googleDriveOperation("delete-file", fileIdInputSchema, (raw, input) =>
    normalizeGoogleDriveOutput("delete-file", input, raw),
  ),
  "delete-permission": googleDriveOperation(
    "delete-permission",
    permissionInputSchema,
    (raw, input) => normalizeGoogleDriveOutput("delete-permission", input, raw),
  ),
  "find-file": googleDriveOperation("find-file", findFileInputSchema, (raw, input) =>
    normalizeGoogleDriveOutput("find-file", input, raw),
  ),
  "get-permission": googleDriveOperation(
    "get-permission",
    permissionInputSchema,
    identityNormalize,
  ),
  "list-drives": googleDriveOperation("list-drives", listDrivesInputSchema, (raw, input) =>
    normalizeGoogleDriveOutput("list-drives", input, raw),
  ),
  "list-files": googleDriveOperation(
    "list-files",
    listFilesInputSchema,
    (raw, input) => normalizeGoogleDriveOutput("list-files", input, raw),
  ),
  "list-permissions": googleDriveOperation(
    "list-permissions",
    listPermissionsInputSchema,
    (raw, input) => normalizeGoogleDriveOutput("list-permissions", input, raw),
  ),
  "move-file": googleDriveOperation("move-file", moveFileInputSchema, identityNormalize),
  "update-file": googleDriveOperation("update-file", updateFileInputSchema, identityNormalize),
  "update-permission": googleDriveOperation(
    "update-permission",
    updatePermissionInputSchema,
    identityNormalize,
  ),
};

function googleDriveOperation<TOperation extends GoogleDriveStandardProxyOperation>(
  operationName: TOperation,
  inputSchema: z.ZodType<GoogleDriveOperationInputByName[TOperation]>,
  normalize: ProviderOperation<GoogleDriveOperationInputByName[TOperation], unknown>["normalize"],
): ProviderOperation<GoogleDriveOperationInputByName[TOperation], unknown> {
  return {
    inputSchema,
    responseSchema: googleDriveNangoProxyResponseSchemas[operationName],
    toProxyRequest: (input) => googleDriveRequest(operationName, input),
    normalize,
  };
}

async function executeGoogleDriveUploadDocument(
  providerConfigKey: string,
  connectionId: string,
  input: z.infer<typeof uploadDocumentInputSchema>,
  sandbox?: NangoProxySandboxContext,
): Promise<unknown> {
  const metadata = await nangoProxyRequestJson({
    operation: "nango.google_drive.proxy.upload_document.create_metadata",
    publicSummary: "Nango Google Drive file metadata create failed",
    providerConfigKey,
    connectionId,
    method: "post",
    endpoint: "/drive/v3/files",
    params: { fields: "id,name,mimeType,webViewLink,webContentLink" },
    data: {
      name: input.name,
      mimeType: input.mimeType,
      ...(input.description ? { description: input.description } : {}),
      ...(input.folderId ? { parents: [input.folderId] } : {}),
    },
    bodySchema: googleDriveUploadMetadataBodySchema,
    responseSchema: googleDriveNangoProxyIdResponseSchema,
    retries: 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
  const content = input.isBase64 === true ? Buffer.from(input.content, "base64") : input.content;
  return nangoProxyRequestJson({
    operation: "nango.google_drive.proxy.upload_document.media",
    publicSummary: "Nango Google Drive file upload failed",
    providerConfigKey,
    connectionId,
    method: "patch",
    endpoint: `/upload/drive/v3/files/${encodeURIComponent(metadata.id)}`,
    params: {
      uploadType: "media",
      fields: "id,name,mimeType,webViewLink,webContentLink",
    },
    headers: { "Content-Type": input.mimeType },
    data: content,
    responseSchema: googleDriveNangoProxyIdResponseSchema,
    retries: 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
}

export async function executeGoogleDriveNangoProxyOperation<
  T,
  TOperation extends GoogleDriveProxyOperation,
>(
  providerConfigKey: string,
  connectionId: string,
  operationName: TOperation,
  responseSchema: z.ZodType<T>,
  input: GoogleDriveOperationInputByName[TOperation],
  sandbox?: NangoProxySandboxContext,
): Promise<T> {
  if (operationName === "upload-document") {
    return responseSchema.parse(
      await executeGoogleDriveUploadDocument(
        providerConfigKey,
        connectionId,
        uploadDocumentInputSchema.parse(input),
        sandbox,
      ),
    );
  }
  const operation = googleDriveOperations[operationName as GoogleDriveStandardProxyOperation];
  const parsedInput = operation.inputSchema.parse(input);
  const request = operation.toProxyRequest(parsedInput as never);
  if (request.voidResponse) {
    await nangoProxyRequestVoid({
      operation: `nango.google_drive.proxy.${operationName}`,
      publicSummary: `Nango Google Drive proxy operation "${operationName}" failed`,
      providerConfigKey,
      connectionId,
      method: request.method,
      endpoint: request.endpoint,
      ...(request.bodySchema === undefined ? {} : { bodySchema: request.bodySchema }),
      retries: 3,
      ...(sandbox === undefined ? {} : { sandbox }),
    });
    return responseSchema.parse(operation.normalize(undefined, parsedInput as never));
  }
  const raw = await nangoProxyRequestJson({
    operation: `nango.google_drive.proxy.${operationName}`,
    publicSummary: `Nango Google Drive proxy operation "${operationName}" failed`,
    providerConfigKey,
    connectionId,
    method: request.method,
    endpoint: request.endpoint,
    ...(request.params === undefined ? {} : { params: request.params }),
    ...(request.data === undefined ? {} : { data: request.data }),
    ...(request.headers === undefined ? {} : { headers: request.headers }),
    ...(request.bodySchema === undefined ? {} : { bodySchema: request.bodySchema }),
    responseSchema: operation.responseSchema,
    retries: 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
  return responseSchema.parse(operation.normalize(raw, parsedInput as never));
}

/** Drive v3 files.get metadata subset; full payload passthrough for tool envelope. */
export const googleDriveFileMetadataProxyResponseSchema = z
  .object({ id: z.string() })
  .passthrough();

/** Drive v3 permissions.create response subset. */
export const googleDrivePermissionCreateProxyResponseSchema = z
  .object({ id: z.string() })
  .passthrough();

export async function googleDriveNangoProxyGet(
  providerConfigKey: string,
  connectionId: string,
  input: z.infer<typeof googleDriveProxyGetInputSchema>,
  sandbox?: NangoProxySandboxContext,
): Promise<{
  data: z.infer<typeof googleDriveFileMetadataProxyResponseSchema>;
  headers: Record<string, string | undefined>;
}> {
  const parsedInput = googleDriveProxyGetInputSchema.parse(input);
  return nangoProxyRequestJsonWithHeaders({
    operation: "nango.google_drive.proxy.get",
    publicSummary: "Nango Google Drive proxy GET failed",
    providerConfigKey,
    connectionId,
    method: "get",
    endpoint: parsedInput.endpoint,
    ...(parsedInput.params === undefined ? {} : { params: parsedInput.params }),
    retries: parsedInput.retries ?? 3,
    responseSchema: googleDriveFileMetadataProxyResponseSchema,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
}

export async function googleDriveNangoProxyGetBinary(
  providerConfigKey: string,
  connectionId: string,
  input: z.infer<typeof googleDriveProxyGetInputSchema>,
  sandbox?: NangoProxySandboxContext,
): Promise<{ body: Uint8Array; contentType: string | undefined }> {
  const parsedInput = googleDriveProxyGetInputSchema.parse(input);
  return nangoProxyRequestBinary({
    operation: "nango.google_drive.proxy.get.binary",
    publicSummary: "Nango Google Drive binary download failed",
    providerConfigKey,
    connectionId,
    endpoint: parsedInput.endpoint,
    ...(parsedInput.params === undefined ? {} : { params: parsedInput.params }),
    retries: parsedInput.retries ?? 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
}

export async function googleDriveNangoProxyPostJson(
  providerConfigKey: string,
  connectionId: string,
  input: z.infer<typeof googleDrivePermissionCreateInputSchema>,
  sandbox?: NangoProxySandboxContext,
): Promise<z.infer<typeof googleDrivePermissionCreateProxyResponseSchema>> {
  const parsedInput = googleDrivePermissionCreateInputSchema.parse(input);
  return nangoProxyRequestJson({
    operation: "nango.google_drive.proxy.post",
    publicSummary: "Nango Google Drive proxy POST failed",
    providerConfigKey,
    connectionId,
    method: "post",
    endpoint: parsedInput.endpoint,
    ...(parsedInput.params === undefined ? {} : { params: parsedInput.params }),
    data: parsedInput.data,
    bodySchema: googleDrivePermissionCreateBodySchema,
    responseSchema: googleDrivePermissionCreateProxyResponseSchema,
    retries: input.retries ?? 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
}

export async function fetchGoogleDriveStartPageToken(input: {
  providerConfigKey: string;
  connectionId: string;
  authFailureProjection?: NangoAuthFailureProjection;
}): Promise<string> {
  const response = await nangoProxyRequestJson({
    operation: "google_drive.changes.get_start_page_token",
    publicSummary: "Google Drive start page token fetch failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "get",
    endpoint: "/drive/v3/changes/startPageToken",
    params: { supportsAllDrives: true },
    responseSchema: googleDriveStartPageTokenResponseSchema,
    retries: 3,
    ...(input.authFailureProjection === undefined
      ? {}
      : { authFailureProjection: input.authFailureProjection }),
  });
  return response.startPageToken;
}

export async function watchGoogleDriveChanges(input: {
  providerConfigKey: string;
  connectionId: string;
  authFailureProjection?: NangoAuthFailureProjection;
  pageToken: string;
  channelId: string;
  channelToken: string;
  address: string;
  ttlSeconds: number;
}): Promise<z.infer<typeof googleDriveWatchResponseSchema>> {
  return nangoProxyRequestJson({
    operation: "google_drive.changes.watch",
    publicSummary: "Google Drive changes watch creation failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "post",
    endpoint: "/drive/v3/changes/watch",
    params: {
      pageToken: input.pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    },
    data: {
      id: input.channelId,
      type: "web_hook",
      address: input.address,
      token: input.channelToken,
      expiration: String(Date.now() + input.ttlSeconds * 1000),
    },
    bodySchema: googleDriveChannelBodySchema,
    responseSchema: googleDriveWatchResponseSchema,
    retries: 3,
    ...(input.authFailureProjection === undefined
      ? {}
      : { authFailureProjection: input.authFailureProjection }),
  });
}

export async function stopGoogleDriveChannel(input: {
  providerConfigKey: string;
  connectionId: string;
  authFailureProjection?: NangoAuthFailureProjection;
  channelId: string;
  resourceId: string;
}): Promise<void> {
  await nangoProxyRequestVoid({
    operation: "google_drive.channels.stop",
    publicSummary: "Google Drive channel stop failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "post",
    endpoint: "/drive/v3/channels/stop",
    data: { id: input.channelId, resourceId: input.resourceId },
    bodySchema: googleDriveChannelStopBodySchema,
    retries: 3,
    ...(input.authFailureProjection === undefined
      ? {}
      : { authFailureProjection: input.authFailureProjection }),
  });
}

export async function listGoogleDriveFilesForState(input: {
  providerConfigKey: string;
  connectionId: string;
  authFailureProjection?: NangoAuthFailureProjection;
  pageToken?: string;
}): Promise<z.infer<typeof googleDriveFilesStateListResponseSchema>> {
  return nangoProxyRequestJson({
    operation: "google_drive.files.seed_state",
    publicSummary: "Google Drive file state seed listing failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "get",
    endpoint: "/drive/v3/files",
    params: {
      fields:
        "nextPageToken,files(id,name,mimeType,parents,driveId,createdTime,modifiedTime,webViewLink,trashed,starred,description,size,md5Checksum,headRevisionId)",
      pageSize: 1000,
      q: "trashed = false",
      spaces: "drive",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      ...(input.pageToken ? { pageToken: input.pageToken } : {}),
    },
    responseSchema: googleDriveFilesStateListResponseSchema,
    retries: 3,
    ...(input.authFailureProjection === undefined
      ? {}
      : { authFailureProjection: input.authFailureProjection }),
  });
}

export async function listGoogleDriveChanges(input: {
  providerConfigKey: string;
  connectionId: string;
  authFailureProjection?: NangoAuthFailureProjection;
  pageToken: string;
}): Promise<z.infer<typeof googleDriveChangesListResponseSchema>> {
  return nangoProxyRequestJson({
    operation: "google_drive.changes.list",
    publicSummary: "Google Drive changes listing failed",
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "get",
    endpoint: "/drive/v3/changes",
    params: {
      pageToken: input.pageToken,
      pageSize: 1000,
      fields:
        "nextPageToken,newStartPageToken,changes(changeType,fileId,removed,time,file(id,name,mimeType,parents,driveId,createdTime,modifiedTime,webViewLink,trashed,starred,description,size,md5Checksum,headRevisionId))",
      spaces: "drive",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    },
    responseSchema: googleDriveChangesListResponseSchema,
    retries: 3,
    ...(input.authFailureProjection === undefined
      ? {}
      : { authFailureProjection: input.authFailureProjection }),
  });
}
