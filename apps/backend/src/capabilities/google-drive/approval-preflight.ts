import type { SupabaseServiceClient } from "@ai-assistants/control-db";
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
import {
  buildExternalWriteApprovalPlan,
  type ExternalWriteApprovalPlan,
} from "../../product/actions/external-write-contracts/approval-plan";
import { requireGoogleDriveNango } from "./connection";

export type GoogleDriveApprovalPack = ExternalWriteApprovalPlan;

const GOOGLE_DRIVE_WRITE_TOOLS = new Set([
  "google_drive_folder_create",
  "google_drive_file_rename",
  "google_drive_file_update_description",
  "google_drive_file_move",
  "google_drive_file_copy",
  "google_drive_file_upload",
  "google_drive_file_trash",
  "google_drive_file_restore",
  "google_drive_file_delete",
  "google_drive_file_share",
  "google_drive_permission_update",
  "google_drive_permission_delete",
]);

export async function preflightGoogleDriveWrite(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<GoogleDriveApprovalPack | null> {
  if (!GOOGLE_DRIVE_WRITE_TOOLS.has(toolName)) return null;
  switch (toolName) {
    case "google_drive_folder_create": {
      const p = googleDriveFolderCreateInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Create Drive folder",
        `Create folder "${p.name}".`,
        "google_drive_folder_create",
      );
    }
    case "google_drive_file_rename": {
      const p = googleDriveFileRenameInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Rename Drive file",
        `Rename file ${p.fileId} to "${p.name}".`,
        "google_drive_file_rename",
        {
          fileId: p.fileId,
        },
      );
    }
    case "google_drive_file_update_description": {
      const p = googleDriveFileUpdateDescriptionInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Update Drive file description",
        `Update description for file ${p.fileId}.`,
        "google_drive_file_update_description",
        {
          fileId: p.fileId,
        },
      );
    }
    case "google_drive_file_move": {
      const p = googleDriveFileMoveInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Move Drive file",
        `Move file ${p.fileId} from ${p.fromFolderId} to ${p.toFolderId}.`,
        "google_drive_file_move",
      );
    }
    case "google_drive_file_copy": {
      const p = googleDriveFileCopyInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Copy Drive file",
        `Copy file ${p.fileId}.`,
        "google_drive_file_copy",
      );
    }
    case "google_drive_file_upload": {
      const p = googleDriveFileUploadInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      const mimeType = p.source.kind === "direct_content" ? p.source.mimeType : p.source.mimeType ?? "artifact MIME type";
      const source = p.source.kind === "profile_file" ? `profile file ` : "direct content";
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Upload Drive file",
        `Upload "${p.name}" from ${source} (${mimeType}).`,
        "google_drive_file_upload",
      );
    }
    case "google_drive_file_trash": {
      const p = googleDriveFileTrashInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Trash Drive file",
        `Trash file ${p.fileId}.`,
        "google_drive_file_trash",
        { fileId: p.fileId },
      );
    }
    case "google_drive_file_restore": {
      const p = googleDriveFileRestoreInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Restore Drive file",
        `Restore file ${p.fileId}.`,
        "google_drive_file_restore",
        {
          fileId: p.fileId,
        },
      );
    }
    case "google_drive_file_delete": {
      const p = googleDriveFileDeleteInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Delete Drive file",
        `Permanently delete file ${p.fileId}.`,
        "google_drive_file_delete",
        { fileId: p.fileId },
      );
    }
    case "google_drive_file_share": {
      const p = googleDriveFileShareInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Share Drive file",
        `Add permission ${p.type}/${p.role} on file ${p.fileId}.`,
        "google_drive_file_share",
        { fileId: p.fileId },
      );
    }
    case "google_drive_permission_update": {
      const p = googleDrivePermissionUpdateInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Update Drive permission",
        `Update permission ${p.permissionId} on file ${p.fileId} to ${p.role}.`,
        "google_drive_permission_update",
      );
    }
    case "google_drive_permission_delete": {
      const p = googleDrivePermissionDeleteInputSchema.parse(params);
      await requireGoogleDriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Remove Drive permission",
        `Delete permission ${p.permissionId} on file ${p.fileId}.`,
        "google_drive_permission_delete",
      );
    }
    default:
      return null;
  }
}
