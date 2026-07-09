import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import {
  googleDriveFileCopyInputSchema,
  googleDriveFileDeleteInputSchema,
  googleDriveFileMoveInputSchema,
  googleDriveFileRenameInputSchema,
  googleDriveFileRestoreInputSchema,
  googleDriveFileShareInputSchema,
  googleDriveFileTrashInputSchema,
  googleDriveFileUpdateDescriptionInputSchema,
  googleDriveFileUploadInputSchema,
  googleDriveFolderCreateInputSchema,
  googleDrivePermissionDeleteInputSchema,
  googleDrivePermissionUpdateInputSchema,
} from "@ai-assistants/google-drive-contracts/schemas";
import { markProviderExecutionStarted } from "../../product/actions/execution/provider-runtime";
import { recordProviderWriteReceipt } from "../../product/actions/execution/provider-write-receipts";
import type { ActionResult } from "../../product/actions/execution/types";
import { prepareArtifactProviderUploadSource } from "../../product/artifacts/provider-upload-source";
import { requireGoogleDriveNango } from "./connection";
import {
  googleDriveNangoProxyRecordSchema,
  googleDriveNangoProxyPostJson,
  executeGoogleDriveNangoProxyOperation,
} from "./nango-client";

function recordValue(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" && entry.trim() ? entry.trim() : null;
}

async function recordGoogleDriveWriteReceipt(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  binding: Awaited<ReturnType<typeof requireGoogleDriveNango>>,
  input: {
    toolName: string;
    externalResourceType: string;
    externalResourceId: string;
    operation: string;
    startedAt: string;
    result: unknown;
  },
): Promise<void> {
  await recordProviderWriteReceipt(db, {
    profileId: action.profile_id,
    capabilityAccountLinkId: binding.link.id,
    connectedProviderAccountId: binding.account.id,
    providerKey: "google-drive",
    capabilitySlug: "google-drive",
    toolName: input.toolName,
    profileActionId: action.id,
    externalResourceType: input.externalResourceType,
    externalResourceId: input.externalResourceId,
    operation: input.operation,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    metadata: {
      actionType: action.action_type,
      providerResultId: recordValue(input.result, "id"),
      providerResultName: recordValue(input.result, "name"),
    },
  });
}

export async function executeGoogleDriveFolderCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDriveFolderCreateInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "create-folder",
    googleDriveNangoProxyRecordSchema,
    {
      name: params.name,
      ...(params.parentId ? { parentId: params.parentId } : {}),
    },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_folder_create",
    externalResourceType: "folder",
    externalResourceId: recordValue(result, "id") ?? params.name,
    operation: "create",
    startedAt,
    result,
  });
  return { status: "executed", provider: "google-drive", result };
}

export async function executeGoogleDriveFileRename(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDriveFileRenameInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "update-file",
    googleDriveNangoProxyRecordSchema,
    { fileId: params.fileId, name: params.name },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_file_rename",
    externalResourceType: "file",
    externalResourceId: recordValue(result, "id") ?? params.fileId,
    operation: "rename",
    startedAt,
    result,
  });
  return { status: "executed", provider: "google-drive", result };
}

export async function executeGoogleDriveFileUpdateDescription(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDriveFileUpdateDescriptionInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "update-file",
    googleDriveNangoProxyRecordSchema,
    { fileId: params.fileId, description: params.description },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_file_update_description",
    externalResourceType: "file",
    externalResourceId: recordValue(result, "id") ?? params.fileId,
    operation: "update_description",
    startedAt,
    result,
  });
  return { status: "executed", provider: "google-drive", result };
}

export async function executeGoogleDriveFileMove(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDriveFileMoveInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "move-file",
    googleDriveNangoProxyRecordSchema,
    {
      fileId: params.fileId,
      fromFolderId: params.fromFolderId,
      toFolderId: params.toFolderId,
    },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_file_move",
    externalResourceType: "file",
    externalResourceId: recordValue(result, "id") ?? params.fileId,
    operation: "move",
    startedAt,
    result,
  });
  return { status: "executed", provider: "google-drive", result };
}

export async function executeGoogleDriveFileCopy(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDriveFileCopyInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "copy-file",
    googleDriveNangoProxyRecordSchema,
    {
      fileId: params.fileId,
      ...(params.name ? { name: params.name } : {}),
      ...(params.destinationFolderId ? { destinationFolderId: params.destinationFolderId } : {}),
    },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_file_copy",
    externalResourceType: "file",
    externalResourceId: recordValue(result, "id") ?? params.fileId,
    operation: "copy",
    startedAt,
    result,
  });
  return { status: "executed", provider: "google-drive", result };
}

export async function executeGoogleDriveFileUpload(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDriveFileUploadInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const artifactSource =
    params.source.kind === "profile_file"
      ? await prepareArtifactProviderUploadSource(db, {
          profileId: action.profile_id,
          artifactId: params.source.profileFileId,
          expectedSha256: params.source.expectedSha256 ?? null,
          filename: params.name,
          mimeType: params.source.mimeType ?? null,
          providerLabel: "Google Drive",
        })
      : null;
  const source =
    params.source.kind === "direct_content"
      ? {
          content: params.source.content,
          mimeType: params.source.mimeType,
          ...(params.source.isBase64 !== undefined ? { isBase64: params.source.isBase64 } : {}),
        }
      : {
          content: Buffer.from(artifactSource!.bytes).toString("base64"),
          mimeType: artifactSource!.mimeType,
          isBase64: true,
        };
  const result = await executeGoogleDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "upload-document",
    googleDriveNangoProxyRecordSchema,
    {
      name: params.name,
      ...source,
      ...(params.folderId ? { folderId: params.folderId } : {}),
      ...(params.description ? { description: params.description } : {}),
    },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_file_upload",
    externalResourceType: "file",
    externalResourceId: recordValue(result, "id") ?? params.name,
    operation: "upload",
    startedAt,
    result,
  });
  return { status: "executed", provider: "google-drive", result };
}

export async function executeGoogleDriveFileTrash(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDriveFileTrashInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "update-file",
    googleDriveNangoProxyRecordSchema,
    {
      fileId: params.fileId,
      trashed: true,
    },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_file_trash",
    externalResourceType: "file",
    externalResourceId: recordValue(result, "id") ?? params.fileId,
    operation: "trash",
    startedAt,
    result,
  });
  return { status: "executed", provider: "google-drive", result };
}

export async function executeGoogleDriveFileRestore(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDriveFileRestoreInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "update-file",
    googleDriveNangoProxyRecordSchema,
    {
      fileId: params.fileId,
      trashed: false,
    },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_file_restore",
    externalResourceType: "file",
    externalResourceId: recordValue(result, "id") ?? params.fileId,
    operation: "restore",
    startedAt,
    result,
  });
  return { status: "executed", provider: "google-drive", result };
}

export async function executeGoogleDriveFileDelete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDriveFileDeleteInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "delete-file",
    googleDriveNangoProxyRecordSchema,
    {
      fileId: params.fileId,
    },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_file_delete",
    externalResourceType: "file",
    externalResourceId: params.fileId,
    operation: "delete",
    startedAt,
    result,
  });
  return { status: "executed", provider: "google-drive", result };
}

export async function executeGoogleDriveFileShare(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDriveFileShareInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const body: {
    type: string;
    role: string;
    emailAddress?: string;
    domain?: string;
    allowFileDiscovery?: boolean;
  } = {
    type: params.type,
    role: params.role,
  };
  if (params.emailAddress) body.emailAddress = params.emailAddress;
  if (params.domain) body.domain = params.domain;
  if (params.allowFileDiscovery !== undefined) body.allowFileDiscovery = params.allowFileDiscovery;
  const data = await googleDriveNangoProxyPostJson(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    {
      endpoint: `/drive/v3/files/${encodeURIComponent(params.fileId)}/permissions`,
      params: {
        supportsAllDrives: "true",
        ...(params.sendNotificationEmail !== undefined
          ? { sendNotificationEmail: params.sendNotificationEmail ? "true" : "false" }
          : {}),
      },
      data: body,
    },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_file_share",
    externalResourceType: "permission",
    externalResourceId: recordValue(data, "id") ?? params.fileId,
    operation: "share",
    startedAt,
    result: data,
  });
  return { status: "executed", provider: "google-drive", result: data };
}

export async function executeGoogleDrivePermissionUpdate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDrivePermissionUpdateInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "update-permission",
    googleDriveNangoProxyRecordSchema,
    {
      fileId: params.fileId,
      permissionId: params.permissionId,
      role: params.role,
    },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_permission_update",
    externalResourceType: "permission",
    externalResourceId: recordValue(result, "id") ?? params.permissionId,
    operation: "update_permission",
    startedAt,
    result,
  });
  return { status: "executed", provider: "google-drive", result };
}

export async function executeGoogleDrivePermissionDelete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof googleDrivePermissionDeleteInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireGoogleDriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeGoogleDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "delete-permission",
    googleDriveNangoProxyRecordSchema,
    {
      fileId: params.fileId,
      permissionId: params.permissionId,
    },
    sandbox,
  );
  await recordGoogleDriveWriteReceipt(db, action, b, {
    toolName: "google_drive_permission_delete",
    externalResourceType: "permission",
    externalResourceId: params.permissionId,
    operation: "delete_permission",
    startedAt,
    result,
  });
  return { status: "executed", provider: "google-drive", result };
}
