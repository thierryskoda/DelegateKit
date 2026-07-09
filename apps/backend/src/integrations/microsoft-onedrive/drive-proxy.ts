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
} from "../nango/nango-proxy-client";

export const microsoftOnedriveDriveNangoProxyRecordSchema = z.record(z.string(), z.unknown());

export type MicrosoftOnedriveDriveProxyOperation =
  | "copy-item"
  | "create-folder"
  | "create-sharing-link"
  | "delete-item"
  | "delete-permission"
  | "get-drive"
  | "get-item"
  | "get-permission"
  | "invite-recipients"
  | "list-children"
  | "list-drives"
  | "list-permissions"
  | "list-recent-items"
  | "list-shared-items"
  | "list-versions"
  | "move-item"
  | "search-items"
  | "update-item"
  | "upload-small-file";

type ProxyRequest = ProviderProxyRequest;

const stringField = z.string().trim().min(1);
const nangoParamsObjectSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.undefined()]),
);
const emptyInputSchema = z.object({}).strict();
const itemIdInputSchema = z.object({ itemId: stringField }).strict();
const permissionInputSchema = z.object({ itemId: stringField, permissionId: stringField }).strict();
const parentReferenceSchema = z
  .object({
    id: stringField.optional(),
    path: stringField.optional(),
    driveId: stringField.optional(),
  })
  .strict();
const fileSystemInfoSchema = z
  .object({
    createdDateTime: stringField.optional(),
    lastModifiedDateTime: stringField.optional(),
  })
  .strict();
const createFolderInputSchema = z
  .object({
    parentItemId: stringField,
    name: stringField,
    conflictBehavior: stringField.optional(),
  })
  .strict();
const updateItemInputSchema = z
  .object({
    itemId: stringField,
    name: stringField.optional(),
    description: z.string().nullable().optional(),
    fileSystemInfo: fileSystemInfoSchema.optional(),
    parentReference: parentReferenceSchema.optional(),
  })
  .strict();
const moveItemInputSchema = z
  .object({
    itemId: stringField,
    parentFolderId: stringField.optional(),
    name: stringField.optional(),
  })
  .strict();
const copyItemInputSchema = z
  .object({ itemId: stringField, targetParentId: stringField, newName: stringField.optional() })
  .strict();
const copyItemBodySchema = z
  .object({
    parentReference: z.object({ id: stringField }).strict(),
    name: stringField.optional(),
  })
  .strict();
const createFolderBodySchema = z
  .object({
    name: stringField,
    folder: z.object({}).strict(),
    "@microsoft.graph.conflictBehavior": stringField,
  })
  .strict();
const updateItemBodySchema = updateItemInputSchema.omit({ itemId: true });
const moveItemBodySchema = z
  .object({
    parentReference: z.object({ id: stringField }).strict().optional(),
    name: stringField.optional(),
  })
  .strict();
const uploadSmallFileInputSchema = z
  .object({
    parent_item_id: stringField,
    file_name: stringField,
    content: z.string(),
    content_type: stringField.optional(),
  })
  .strict();
const sharingLinkInputSchema = z
  .object({
    itemId: stringField,
    type: stringField,
    scope: stringField.optional(),
    password: stringField.optional(),
    expirationDateTime: stringField.optional(),
  })
  .strict();
const sharingLinkBodySchema = sharingLinkInputSchema.omit({ itemId: true });
const driveRecipientSchema = z
  .object({
    email: stringField.optional(),
    alias: stringField.optional(),
    objectId: stringField.optional(),
  })
  .strict();
const inviteRecipientsInputSchema = z
  .object({
    itemId: stringField,
    recipients: z.array(driveRecipientSchema),
    roles: z.array(stringField),
    requireSignIn: z.boolean().optional(),
    sendInvitation: z.boolean().optional(),
    message: z.string().optional(),
    password: stringField.optional(),
    expirationDateTime: stringField.optional(),
    retainInheritedPermissions: z.boolean().optional(),
  })
  .strict();
const inviteRecipientsBodySchema = inviteRecipientsInputSchema.omit({ itemId: true });
const getItemInputSchema = z
  .object({ itemId: stringField.optional(), path: stringField.optional() })
  .strict();
const searchItemsInputSchema = z.object({ query: stringField }).strict();
const microsoftOnedriveDriveBinaryGetInputSchema = z
  .object({
    endpoint: stringField,
    params: nangoParamsObjectSchema.optional(),
    retries: z.number().int().positive().optional(),
  })
  .strict();

type MicrosoftOnedriveDriveOperationInputByName = {
  "copy-item": z.infer<typeof copyItemInputSchema>;
  "create-folder": z.infer<typeof createFolderInputSchema>;
  "create-sharing-link": z.infer<typeof sharingLinkInputSchema>;
  "delete-item": z.infer<typeof itemIdInputSchema>;
  "delete-permission": z.infer<typeof permissionInputSchema>;
  "get-drive": z.infer<typeof emptyInputSchema>;
  "get-item": z.infer<typeof getItemInputSchema>;
  "get-permission": z.infer<typeof permissionInputSchema>;
  "invite-recipients": z.infer<typeof inviteRecipientsInputSchema>;
  "list-children": z.infer<typeof itemIdInputSchema>;
  "list-drives": z.infer<typeof emptyInputSchema>;
  "list-permissions": z.infer<typeof itemIdInputSchema>;
  "list-recent-items": z.infer<typeof emptyInputSchema>;
  "list-shared-items": z.infer<typeof emptyInputSchema>;
  "list-versions": z.infer<typeof itemIdInputSchema>;
  "move-item": z.infer<typeof moveItemInputSchema>;
  "search-items": z.infer<typeof searchItemsInputSchema>;
  "update-item": z.infer<typeof updateItemInputSchema>;
  "upload-small-file": z.infer<typeof uploadSmallFileInputSchema>;
};

type MicrosoftOnedriveDriveOperationMap = {
  [K in MicrosoftOnedriveDriveProxyOperation]: ProviderOperation<
    MicrosoftOnedriveDriveOperationInputByName[K],
    unknown
  >;
};
type MicrosoftOnedriveDriveNormalizedProxyOperation =
  | "create-sharing-link"
  | "delete-item"
  | "delete-permission"
  | "list-children"
  | "list-drives"
  | "list-permissions"
  | "list-recent-items"
  | "list-shared-items"
  | "list-versions"
  | "search-items"
  | "upload-small-file";

const monitorResponseSchema = z
  .object({
    id: z.string().optional(),
    status: z.string().optional(),
    error: z.object({ code: z.string(), message: z.string() }).optional(),
  })
  .passthrough();

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

function onedriveRequest<TOperation extends MicrosoftOnedriveDriveProxyOperation>(
  operationName: TOperation,
  input: MicrosoftOnedriveDriveOperationInputByName[TOperation],
): ProxyRequest {
  const p = recordValue(input);
  switch (operationName) {
    case "list-drives":
      return { method: "get", endpoint: "/v1.0/me/drives" };
    case "get-drive":
      return { method: "get", endpoint: "/v1.0/me/drive" };
    case "list-children":
      return {
        method: "get",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId ?? "root"))}/children`,
      };
    case "list-recent-items":
      return { method: "get", endpoint: "/v1.0/me/drive/recent" };
    case "search-items":
      return {
        method: "get",
        endpoint: `/v1.0/me/drive/root/search(q='${encodeURIComponent(String(p.query))}')`,
      };
    case "list-shared-items":
      return { method: "get", endpoint: "/v1.0/me/drive/sharedWithMe" };
    case "get-item":
      if (typeof p.path === "string" && p.path.trim()) {
        const path = p.path.trim().replace(/^\/+/, "");
        return { method: "get", endpoint: `/v1.0/me/drive/root:/${encodeURI(path)}` };
      }
      return {
        method: "get",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId ?? "root"))}`,
      };
    case "list-versions":
      return {
        method: "get",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId))}/versions`,
      };
    case "list-permissions":
      return {
        method: "get",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId))}/permissions`,
      };
    case "get-permission":
      return {
        method: "get",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId))}/permissions/${encodeURIComponent(String(p.permissionId))}`,
      };
    case "create-folder":
      return {
        method: "post",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.parentItemId))}/children`,
        data: {
          name: p.name,
          folder: {},
          "@microsoft.graph.conflictBehavior":
            typeof p.conflictBehavior === "string" ? p.conflictBehavior : "rename",
        },
        bodySchema: createFolderBodySchema,
      };
    case "update-item": {
      const data: Record<string, unknown> = {};
      for (const key of ["name", "description", "fileSystemInfo", "parentReference"] as const) {
        if (p[key] !== undefined) data[key] = p[key];
      }
      return {
        method: "patch",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId))}`,
        data,
        bodySchema: updateItemBodySchema,
      };
    }
    case "move-item":
      return {
        method: "patch",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId))}`,
        data: {
          ...(typeof p.parentFolderId === "string"
            ? { parentReference: { id: p.parentFolderId } }
            : {}),
          ...(typeof p.name === "string" ? { name: p.name } : {}),
        },
        bodySchema: moveItemBodySchema,
      };
    case "copy-item":
      return {
        method: "post",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId))}/copy`,
        data: {
          parentReference: { id: p.targetParentId },
          ...(typeof p.newName === "string" ? { name: p.newName } : {}),
        },
      };
    case "delete-item":
      return {
        method: "delete",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId))}`,
        voidResponse: true,
      };
    case "upload-small-file":
      return {
        method: "put",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.parent_item_id))}:/${encodeURIComponent(String(p.file_name))}:/content`,
        headers: {
          "Content-Type":
            typeof p.content_type === "string" ? p.content_type : "application/octet-stream",
        },
        data: Buffer.from(String(p.content), "base64"),
      };
    case "create-sharing-link":
      return {
        method: "post",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId))}/createLink`,
        data: {
          type: p.type,
          ...(typeof p.scope === "string" ? { scope: p.scope } : {}),
          ...(typeof p.password === "string" ? { password: p.password } : {}),
          ...(typeof p.expirationDateTime === "string"
            ? { expirationDateTime: p.expirationDateTime }
            : {}),
        },
        bodySchema: sharingLinkBodySchema,
      };
    case "invite-recipients":
      return {
        method: "post",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId))}/invite`,
        data: {
          recipients: p.recipients,
          roles: p.roles,
          ...(p.requireSignIn !== undefined ? { requireSignIn: p.requireSignIn } : {}),
          ...(p.sendInvitation !== undefined ? { sendInvitation: p.sendInvitation } : {}),
          ...(typeof p.message === "string" ? { message: p.message } : {}),
          ...(typeof p.password === "string" ? { password: p.password } : {}),
          ...(typeof p.expirationDateTime === "string"
            ? { expirationDateTime: p.expirationDateTime }
            : {}),
          ...(p.retainInheritedPermissions !== undefined
            ? { retainInheritedPermissions: p.retainInheritedPermissions }
            : {}),
        },
        bodySchema: inviteRecipientsBodySchema,
      };
    case "delete-permission":
      return {
        method: "delete",
        endpoint: `/v1.0/me/drive/items/${encodeURIComponent(String(p.itemId))}/permissions/${encodeURIComponent(String(p.permissionId))}`,
        voidResponse: true,
      };
    default: {
      const _exhaustive: never = operationName;
      throw new DomainError(
        domainCodes.INTERNAL,
        `Unhandled OneDrive proxy operation ${String(_exhaustive)}.`,
      );
    }
  }
}

function normalizeMicrosoftOutput(
  operationName: MicrosoftOnedriveDriveNormalizedProxyOperation,
  input: MicrosoftOnedriveDriveOperationInputByName[MicrosoftOnedriveDriveNormalizedProxyOperation],
  raw: unknown,
) {
  const p = recordValue(input);
  const r = recordValue(raw);
  switch (operationName) {
    case "list-drives":
      return { drives: arrayValue(r.value) };
    case "list-children":
    case "list-recent-items":
    case "search-items":
    case "list-shared-items":
      return { items: arrayValue(r.value), nextLink: r["@odata.nextLink"] };
    case "list-versions":
      return { versions: arrayValue(r.value) };
    case "list-permissions":
      return { permissions: arrayValue(r.value), nextLink: r["@odata.nextLink"] };
    case "create-sharing-link": {
      const link = recordValue(r.link);
      return {
        id: r.id,
        shareId: r.shareId,
        webUrl: link.webUrl,
        type: link.type,
        scope: link.scope,
        roles: r.roles,
      };
    }
    case "delete-item":
      return { success: true, itemId: p.itemId, message: "Item deleted successfully" };
    case "delete-permission":
      return { success: true };
    case "upload-small-file":
      return {
        id: r.id,
        name: r.name,
        size: r.size,
        web_url: r.webUrl,
        created_date_time: r.createdDateTime,
        last_modified_date_time: r.lastModifiedDateTime,
        download_url: r["@microsoft.graph.downloadUrl"],
      };
    default: {
      const _exhaustive: never = operationName;
      throw new DomainError(
        domainCodes.INTERNAL,
        `Unhandled OneDrive normalization operation ${String(_exhaustive)}.`,
      );
    }
  }
}

const microsoftOnedriveDriveOperations: MicrosoftOnedriveDriveOperationMap = {
  "copy-item": microsoftOnedriveDriveOperation("copy-item", copyItemInputSchema, identityNormalize),
  "create-folder": microsoftOnedriveDriveOperation(
    "create-folder",
    createFolderInputSchema,
    identityNormalize,
  ),
  "create-sharing-link": microsoftOnedriveDriveOperation(
    "create-sharing-link",
    sharingLinkInputSchema,
    (raw, input) => normalizeMicrosoftOutput("create-sharing-link", input, raw),
  ),
  "delete-item": microsoftOnedriveDriveOperation("delete-item", itemIdInputSchema, (raw, input) =>
    normalizeMicrosoftOutput("delete-item", input, raw),
  ),
  "delete-permission": microsoftOnedriveDriveOperation(
    "delete-permission",
    permissionInputSchema,
    (raw, input) => normalizeMicrosoftOutput("delete-permission", input, raw),
  ),
  "get-drive": microsoftOnedriveDriveOperation("get-drive", emptyInputSchema, identityNormalize),
  "get-item": microsoftOnedriveDriveOperation("get-item", getItemInputSchema, identityNormalize),
  "get-permission": microsoftOnedriveDriveOperation(
    "get-permission",
    permissionInputSchema,
    identityNormalize,
  ),
  "invite-recipients": microsoftOnedriveDriveOperation(
    "invite-recipients",
    inviteRecipientsInputSchema,
    identityNormalize,
  ),
  "list-children": microsoftOnedriveDriveOperation("list-children", itemIdInputSchema, (raw, input) =>
    normalizeMicrosoftOutput("list-children", input, raw),
  ),
  "list-drives": microsoftOnedriveDriveOperation("list-drives", emptyInputSchema, (raw, input) =>
    normalizeMicrosoftOutput("list-drives", input, raw),
  ),
  "list-permissions": microsoftOnedriveDriveOperation("list-permissions", itemIdInputSchema, (raw, input) =>
    normalizeMicrosoftOutput("list-permissions", input, raw),
  ),
  "list-recent-items": microsoftOnedriveDriveOperation(
    "list-recent-items",
    emptyInputSchema,
    (raw, input) => normalizeMicrosoftOutput("list-recent-items", input, raw),
  ),
  "list-shared-items": microsoftOnedriveDriveOperation(
    "list-shared-items",
    emptyInputSchema,
    (raw, input) => normalizeMicrosoftOutput("list-shared-items", input, raw),
  ),
  "list-versions": microsoftOnedriveDriveOperation("list-versions", itemIdInputSchema, (raw, input) =>
    normalizeMicrosoftOutput("list-versions", input, raw),
  ),
  "move-item": microsoftOnedriveDriveOperation("move-item", moveItemInputSchema, identityNormalize),
  "search-items": microsoftOnedriveDriveOperation("search-items", searchItemsInputSchema, (raw, input) =>
    normalizeMicrosoftOutput("search-items", input, raw),
  ),
  "update-item": microsoftOnedriveDriveOperation("update-item", updateItemInputSchema, identityNormalize),
  "upload-small-file": microsoftOnedriveDriveOperation(
    "upload-small-file",
    uploadSmallFileInputSchema,
    (raw, input) => normalizeMicrosoftOutput("upload-small-file", input, raw),
  ),
};

function microsoftOnedriveDriveOperation<TOperation extends MicrosoftOnedriveDriveProxyOperation>(
  operationName: TOperation,
  inputSchema: z.ZodType<MicrosoftOnedriveDriveOperationInputByName[TOperation]>,
  normalize: ProviderOperation<
    MicrosoftOnedriveDriveOperationInputByName[TOperation],
    unknown
  >["normalize"],
): ProviderOperation<MicrosoftOnedriveDriveOperationInputByName[TOperation], unknown> {
  return {
    inputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => onedriveRequest(operationName, input),
    normalize,
  };
}

async function executeCopyItem(
  providerConfigKey: string,
  connectionId: string,
  request: ProxyRequest,
  sandbox?: NangoProxySandboxContext,
): Promise<unknown> {
  const copy = await nangoProxyRequestJsonWithHeaders({
    operation: "nango.microsoft_onedrive_drive.proxy.copy_item",
    publicSummary: "Nango OneDrive copy item failed",
    providerConfigKey,
    connectionId,
    method: "post",
    endpoint: request.endpoint,
    data: request.data,
    bodySchema: copyItemBodySchema,
    responseSchema: z.unknown(),
    retries: 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
  const location = copy.headers.location ?? copy.headers.Location;
  if (!location) return { success: true, status: "accepted" };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const monitor = await nangoProxyRequestJson({
      operation: "nango.microsoft_onedrive_drive.proxy.copy_item.monitor",
      publicSummary: "Nango OneDrive copy item monitor failed",
      providerConfigKey,
      connectionId,
      method: "get",
      endpoint: location,
      baseUrlOverride: "https://graph.microsoft.com",
      responseSchema: monitorResponseSchema,
      retries: 3,
      ...(sandbox === undefined ? {} : { sandbox }),
    });
    if (monitor.status === "completed") {
      return { success: true, itemId: monitor.id, status: "completed" };
    }
    if (monitor.status === "failed") {
      throw new DomainError(
        domainCodes.CONFLICT,
        monitor.error?.message ?? "OneDrive copy operation failed.",
      );
    }
    if (monitor.status === "cancelled") {
      throw new DomainError(domainCodes.CONFLICT, "OneDrive copy operation was cancelled.");
    }
  }
  return { success: true, status: "inProgress" };
}

export async function executeMicrosoftOnedriveDriveNangoProxyOperation<
  T,
  TOperation extends MicrosoftOnedriveDriveProxyOperation,
>(
  providerConfigKey: string,
  connectionId: string,
  operationName: TOperation,
  responseSchema: z.ZodType<T>,
  input: MicrosoftOnedriveDriveOperationInputByName[TOperation],
  sandbox?: NangoProxySandboxContext,
): Promise<T> {
  const operation = microsoftOnedriveDriveOperations[operationName];
  const parsedInput = operation.inputSchema.parse(input);
  const request = operation.toProxyRequest(parsedInput as never);
  if (operationName === "copy-item") {
    return responseSchema.parse(
      await executeCopyItem(providerConfigKey, connectionId, request, sandbox),
    );
  }
  if (request.voidResponse) {
    await nangoProxyRequestVoid({
      operation: `nango.microsoft_onedrive_drive.proxy.${operationName}`,
      publicSummary: `Nango OneDrive proxy operation "${operationName}" failed`,
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
    operation: `nango.microsoft_onedrive_drive.proxy.${operationName}`,
    publicSummary: `Nango OneDrive proxy operation "${operationName}" failed`,
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

export async function microsoftOnedriveDriveNangoProxyGetBinary(
  providerConfigKey: string,
  connectionId: string,
  input: z.infer<typeof microsoftOnedriveDriveBinaryGetInputSchema>,
  sandbox?: NangoProxySandboxContext,
): Promise<{ body: Uint8Array; contentType: string | undefined }> {
  const parsedInput = microsoftOnedriveDriveBinaryGetInputSchema.parse(input);
  return nangoProxyRequestBinary({
    operation: "nango.microsoft_onedrive_drive.proxy.get.binary",
    publicSummary: "Nango OneDrive binary download failed",
    providerConfigKey,
    connectionId,
    endpoint: parsedInput.endpoint,
    ...(parsedInput.params === undefined ? {} : { params: parsedInput.params }),
    retries: parsedInput.retries ?? 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
}
