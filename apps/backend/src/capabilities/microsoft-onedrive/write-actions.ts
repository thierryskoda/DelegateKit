import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import {
  microsoftOnedriveFolderCreateInputSchema,
  microsoftOnedriveInviteRecipientsInputSchema,
  microsoftOnedriveItemCopyInputSchema,
  microsoftOnedriveItemDeleteInputSchema,
  microsoftOnedriveItemMoveInputSchema,
  microsoftOnedriveItemUpdateInputSchema,
  microsoftOnedrivePermissionDeleteInputSchema,
  microsoftOnedriveSharingLinkCreateInputSchema,
  microsoftOnedriveSmallFileUploadInputSchema,
} from "@ai-assistants/microsoft-onedrive-contracts/schemas";
import { markProviderExecutionStarted } from "../../product/actions/execution/provider-runtime";
import {
  providerWriteRecordValue,
  recordProviderActionWriteReceipt,
} from "../../product/actions/execution/provider-write-receipts";
import type { ActionResult } from "../../product/actions/execution/types";
import { prepareArtifactProviderUploadSource } from "../../product/artifacts/provider-upload-source";
import { requireMicrosoftOnedriveNango } from "./connection";
import {
  executeMicrosoftOnedriveDriveNangoProxyOperation,
  microsoftOnedriveDriveNangoProxyRecordSchema,
} from "../../integrations/microsoft-onedrive/drive-proxy";

async function recordOnedriveWriteReceipt(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  binding: Awaited<ReturnType<typeof requireMicrosoftOnedriveNango>>,
  input: {
    toolName: string;
    externalResourceType: string;
    externalResourceId: string;
    operation: string;
    startedAt: string;
    result: unknown;
  },
): Promise<void> {
  await recordProviderActionWriteReceipt(db, action, binding, {
    providerKey: "microsoft-onedrive",
    capabilitySlug: "microsoft-onedrive",
    ...input,
  });
}

export async function executeOnedriveFolderCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof microsoftOnedriveFolderCreateInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftOnedriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeMicrosoftOnedriveDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "create-folder",
    microsoftOnedriveDriveNangoProxyRecordSchema,
    {
      parentItemId: params.parentItemId,
      name: params.name,
      ...(params.conflictBehavior ? { conflictBehavior: params.conflictBehavior } : {}),
    },
    sandbox,
  );
  await recordOnedriveWriteReceipt(db, action, b, {
    toolName: "microsoft_onedrive_folder_create",
    externalResourceType: "folder",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.name,
    operation: "create",
    startedAt,
    result,
  });
  return { status: "executed", provider: "microsoft-onedrive", result };
}

export async function executeOnedriveItemUpdate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof microsoftOnedriveItemUpdateInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftOnedriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const payload: {
    itemId: string;
    name?: string;
    description?: string | null;
    fileSystemInfo?: {
      createdDateTime?: string | undefined;
      lastModifiedDateTime?: string | undefined;
    };
    parentReference?: {
      id?: string | undefined;
      driveId?: string | undefined;
      path?: string | undefined;
    };
  } = { itemId: params.itemId };
  if (params.name !== undefined) payload.name = params.name;
  if (params.description !== undefined) payload.description = params.description;
  if (params.fileSystemInfo !== undefined) payload.fileSystemInfo = params.fileSystemInfo;
  if (params.parentReference !== undefined) payload.parentReference = params.parentReference;
  const result = await executeMicrosoftOnedriveDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "update-item",
    microsoftOnedriveDriveNangoProxyRecordSchema,
    payload,
    sandbox,
  );
  await recordOnedriveWriteReceipt(db, action, b, {
    toolName: "microsoft_onedrive_item_update",
    externalResourceType: "item",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.itemId,
    operation: "update",
    startedAt,
    result,
  });
  return { status: "executed", provider: "microsoft-onedrive", result };
}

export async function executeOnedriveItemMove(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof microsoftOnedriveItemMoveInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftOnedriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeMicrosoftOnedriveDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "move-item",
    microsoftOnedriveDriveNangoProxyRecordSchema,
    {
      itemId: params.itemId,
      ...(params.parentFolderId ? { parentFolderId: params.parentFolderId } : {}),
      ...(params.name ? { name: params.name } : {}),
    },
    sandbox,
  );
  await recordOnedriveWriteReceipt(db, action, b, {
    toolName: "microsoft_onedrive_item_move",
    externalResourceType: "item",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.itemId,
    operation: "move",
    startedAt,
    result,
  });
  return { status: "executed", provider: "microsoft-onedrive", result };
}

export async function executeOnedriveItemCopy(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof microsoftOnedriveItemCopyInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftOnedriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeMicrosoftOnedriveDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "copy-item",
    microsoftOnedriveDriveNangoProxyRecordSchema,
    {
      itemId: params.itemId,
      targetParentId: params.targetParentId,
      ...(params.newName ? { newName: params.newName } : {}),
    },
    sandbox,
  );
  await recordOnedriveWriteReceipt(db, action, b, {
    toolName: "microsoft_onedrive_item_copy",
    externalResourceType: "item",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.itemId,
    operation: "copy",
    startedAt,
    result,
  });
  return { status: "executed", provider: "microsoft-onedrive", result };
}

export async function executeOnedriveItemDelete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof microsoftOnedriveItemDeleteInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftOnedriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeMicrosoftOnedriveDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "delete-item",
    microsoftOnedriveDriveNangoProxyRecordSchema,
    {
      itemId: params.itemId,
    },
    sandbox,
  );
  await recordOnedriveWriteReceipt(db, action, b, {
    toolName: "microsoft_onedrive_item_delete",
    externalResourceType: "item",
    externalResourceId: params.itemId,
    operation: "delete",
    startedAt,
    result,
  });
  return { status: "executed", provider: "microsoft-onedrive", result };
}

export async function executeOnedriveSmallFileUpload(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof microsoftOnedriveSmallFileUploadInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftOnedriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const artifactSource =
    params.source.kind === "profile_file"
      ? await prepareArtifactProviderUploadSource(db, {
          profileId: action.profile_id,
          artifactId: params.source.profileFileId,
          expectedSha256: params.source.expectedSha256 ?? null,
          filename: params.fileName,
          mimeType: params.contentType ?? null,
          providerLabel: "OneDrive",
        })
      : null;
  const result = await executeMicrosoftOnedriveDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "upload-small-file",
    microsoftOnedriveDriveNangoProxyRecordSchema,
    {
      parent_item_id: params.parentItemId,
      file_name: params.fileName,
      content:
        params.source.kind === "direct_content"
          ? params.source.content
          : Buffer.from(artifactSource!.bytes).toString("base64"),
      ...(params.source.kind === "direct_content" && params.contentType
        ? { content_type: params.contentType }
        : {}),
      ...(artifactSource ? { content_type: artifactSource.mimeType } : {}),
    },
    sandbox,
  );
  await recordOnedriveWriteReceipt(db, action, b, {
    toolName: "microsoft_onedrive_small_file_upload",
    externalResourceType: "file",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.fileName,
    operation: "upload",
    startedAt,
    result,
  });
  return { status: "executed", provider: "microsoft-onedrive", result };
}

export async function executeOnedriveSharingLinkCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof microsoftOnedriveSharingLinkCreateInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftOnedriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeMicrosoftOnedriveDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "create-sharing-link",
    microsoftOnedriveDriveNangoProxyRecordSchema,
    {
      itemId: params.itemId,
      type: params.type,
      ...(params.scope ? { scope: params.scope } : {}),
      ...(params.password ? { password: params.password } : {}),
      ...(params.expirationDateTime ? { expirationDateTime: params.expirationDateTime } : {}),
    },
    sandbox,
  );
  await recordOnedriveWriteReceipt(db, action, b, {
    toolName: "microsoft_onedrive_sharing_link_create",
    externalResourceType: "sharing_link",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.itemId,
    operation: "create_sharing_link",
    startedAt,
    result,
  });
  return { status: "executed", provider: "microsoft-onedrive", result };
}

export async function executeOnedriveInviteRecipients(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof microsoftOnedriveInviteRecipientsInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftOnedriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeMicrosoftOnedriveDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "invite-recipients",
    microsoftOnedriveDriveNangoProxyRecordSchema,
    {
      itemId: params.itemId,
      recipients: params.recipients,
      roles: params.roles,
      ...(params.requireSignIn !== undefined ? { requireSignIn: params.requireSignIn } : {}),
      ...(params.sendInvitation !== undefined ? { sendInvitation: params.sendInvitation } : {}),
      ...(params.message ? { message: params.message } : {}),
      ...(params.password ? { password: params.password } : {}),
      ...(params.expirationDateTime ? { expirationDateTime: params.expirationDateTime } : {}),
      ...(params.retainInheritedPermissions !== undefined
        ? { retainInheritedPermissions: params.retainInheritedPermissions }
        : {}),
    },
    sandbox,
  );
  await recordOnedriveWriteReceipt(db, action, b, {
    toolName: "microsoft_onedrive_invite_recipients",
    externalResourceType: "permission",
    externalResourceId: providerWriteRecordValue(result, "id") ?? params.itemId,
    operation: "invite_recipients",
    startedAt,
    result,
  });
  return { status: "executed", provider: "microsoft-onedrive", result };
}

export async function executeOnedrivePermissionDelete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: ReturnType<typeof microsoftOnedrivePermissionDeleteInputSchema.parse>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftOnedriveNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeMicrosoftOnedriveDriveNangoProxyOperation(
    b.nangoProviderConfigKey,
    b.nangoConnectionId,
    "delete-permission",
    microsoftOnedriveDriveNangoProxyRecordSchema,
    {
      itemId: params.itemId,
      permissionId: params.permissionId,
    },
    sandbox,
  );
  await recordOnedriveWriteReceipt(db, action, b, {
    toolName: "microsoft_onedrive_permission_delete",
    externalResourceType: "permission",
    externalResourceId: params.permissionId,
    operation: "delete_permission",
    startedAt,
    result,
  });
  return { status: "executed", provider: "microsoft-onedrive", result };
}
