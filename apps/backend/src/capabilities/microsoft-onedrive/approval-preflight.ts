import type { SupabaseServiceClient } from "@ai-assistants/control-db";
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
import {
  buildExternalWriteApprovalPlan,
  type ExternalWriteApprovalPlan,
} from "../../product/actions/external-write-contracts/approval-plan";
import { requireMicrosoftOnedriveNango } from "./connection";

export type MicrosoftOnedriveApprovalPack = ExternalWriteApprovalPlan;

const MICROSOFT_ONEDRIVE_WRITE_TOOLS = new Set([
  "microsoft_onedrive_folder_create",
  "microsoft_onedrive_item_update",
  "microsoft_onedrive_item_move",
  "microsoft_onedrive_item_copy",
  "microsoft_onedrive_item_delete",
  "microsoft_onedrive_small_file_upload",
  "microsoft_onedrive_sharing_link_create",
  "microsoft_onedrive_invite_recipients",
  "microsoft_onedrive_permission_delete",
]);

export async function preflightMicrosoftOnedriveWrite(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<MicrosoftOnedriveApprovalPack | null> {
  if (!MICROSOFT_ONEDRIVE_WRITE_TOOLS.has(toolName)) return null;
  switch (toolName) {
    case "microsoft_onedrive_folder_create": {
      const p = microsoftOnedriveFolderCreateInputSchema.parse(params);
      await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Create OneDrive folder",
        `Create folder "${p.name}".`,
        "microsoft_onedrive_folder_create",
      );
    }
    case "microsoft_onedrive_item_update": {
      const p = microsoftOnedriveItemUpdateInputSchema.parse(params);
      await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Update OneDrive item",
        `Update item ${p.itemId}.`,
        "microsoft_onedrive_item_update",
        {
          itemId: p.itemId,
        },
      );
    }
    case "microsoft_onedrive_item_move": {
      const p = microsoftOnedriveItemMoveInputSchema.parse(params);
      await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Move OneDrive item",
        `Move item ${p.itemId}.`,
        "microsoft_onedrive_item_move",
      );
    }
    case "microsoft_onedrive_item_copy": {
      const p = microsoftOnedriveItemCopyInputSchema.parse(params);
      await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Copy OneDrive item",
        `Copy item ${p.itemId}.`,
        "microsoft_onedrive_item_copy",
      );
    }
    case "microsoft_onedrive_item_delete": {
      const p = microsoftOnedriveItemDeleteInputSchema.parse(params);
      await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Delete OneDrive item",
        `Delete item ${p.itemId}.`,
        "microsoft_onedrive_item_delete",
      );
    }
    case "microsoft_onedrive_small_file_upload": {
      const p = microsoftOnedriveSmallFileUploadInputSchema.parse(params);
      await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      const source = p.source.kind === "profile_file" ? `profile file ` : "direct content";
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Upload OneDrive file",
        `Upload "${p.fileName}" from ${source} under parent ${p.parentItemId}.`,
        "microsoft_onedrive_small_file_upload",
      );
    }
    case "microsoft_onedrive_sharing_link_create": {
      const p = microsoftOnedriveSharingLinkCreateInputSchema.parse(params);
      await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Create OneDrive sharing link",
        `Create ${p.type} link for item ${p.itemId}.`,
        "microsoft_onedrive_sharing_link_create",
      );
    }
    case "microsoft_onedrive_invite_recipients": {
      const p = microsoftOnedriveInviteRecipientsInputSchema.parse(params);
      await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Invite OneDrive recipients",
        `Invite ${p.recipients.length} recipient(s) to item ${p.itemId}.`,
        "microsoft_onedrive_invite_recipients",
      );
    }
    case "microsoft_onedrive_permission_delete": {
      const p = microsoftOnedrivePermissionDeleteInputSchema.parse(params);
      await requireMicrosoftOnedriveNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Delete OneDrive permission",
        `Delete permission ${p.permissionId} on item ${p.itemId}.`,
        "microsoft_onedrive_permission_delete",
      );
    }
    default:
      return null;
  }
}
