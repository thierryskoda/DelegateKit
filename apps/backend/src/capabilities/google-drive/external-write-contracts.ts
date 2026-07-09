import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  googleDriveExternalWriteOutputSchema,
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
import type { z } from "zod";
import type { ActionResult } from "../../product/actions/execution/types";
import {
  body,
  detail,
  field,
  fields,
  preview,
  section,
  textValue,
} from "../../product/actions/external-write-contracts/connect-detail";
import {
  buildExternalWriteAgentResult,
  lifecycleResultSentence,
  providerErrorMessage,
  quote,
  textField,
} from "../../product/actions/external-write-contracts/agent-result";
import {
  defineExternalWriteActionContract,
  type ExternalWriteActionContract,
} from "../../product/actions/external-write-contracts/types";
import {
  executeGoogleDriveFileCopy,
  executeGoogleDriveFileDelete,
  executeGoogleDriveFileMove,
  executeGoogleDriveFileRename,
  executeGoogleDriveFileRestore,
  executeGoogleDriveFileShare,
  executeGoogleDriveFileTrash,
  executeGoogleDriveFileUpdateDescription,
  executeGoogleDriveFileUpload,
  executeGoogleDriveFolderCreate,
  executeGoogleDrivePermissionDelete,
  executeGoogleDrivePermissionUpdate,
} from "./write-actions";
import { preflightGoogleDriveWrite } from "./approval-preflight";

type GoogleDriveExternalWriteToolName =
  | "google_drive_folder_create"
  | "google_drive_file_rename"
  | "google_drive_file_update_description"
  | "google_drive_file_move"
  | "google_drive_file_copy"
  | "google_drive_file_upload"
  | "google_drive_file_trash"
  | "google_drive_file_restore"
  | "google_drive_file_delete"
  | "google_drive_file_share"
  | "google_drive_permission_update"
  | "google_drive_permission_delete";

const googleDriveDetailKindByToolName = {
  google_drive_folder_create: "google_drive_folder_create",
  google_drive_file_rename: "google_drive_file_rename",
  google_drive_file_update_description: "google_drive_file_update_description",
  google_drive_file_move: "google_drive_file_move",
  google_drive_file_copy: "google_drive_file_copy",
  google_drive_file_upload: "google_drive_file_upload",
  google_drive_file_trash: "google_drive_file_trash",
  google_drive_file_restore: "google_drive_file_restore",
  google_drive_file_delete: "google_drive_file_delete",
  google_drive_file_share: "google_drive_file_share",
  google_drive_permission_update: "google_drive_permission_update",
  google_drive_permission_delete: "google_drive_permission_delete",
} as const;

function googleDriveHeadline(
  toolName: GoogleDriveExternalWriteToolName,
  payload: Record<string, unknown>,
): string {
  const name = textValue(payload.name) ?? textValue(payload.fileName);
  if (toolName === "google_drive_folder_create") {
    return name
      ? `Do you approve creating the "${name}" folder in Google Drive?`
      : "Do you approve creating this Google Drive folder?";
  }
  if (toolName === "google_drive_file_upload") {
    return name
      ? `Do you approve uploading "${name}" to Google Drive?`
      : "Do you approve uploading this file to Google Drive?";
  }
  if (toolName === "google_drive_file_rename") return "Do you approve renaming this Google Drive file?";
  if (toolName === "google_drive_file_share") return "Do you approve sharing this Google Drive file?";
  if (toolName === "google_drive_permission_update") return "Do you approve changing this Google Drive permission?";
  if (toolName === "google_drive_permission_delete") return "Do you approve removing this Google Drive permission?";
  if (toolName === "google_drive_file_trash") return "Do you approve moving this Google Drive file to trash?";
  if (toolName === "google_drive_file_restore") return "Do you approve restoring this Google Drive file?";
  if (toolName === "google_drive_file_delete") return "Do you approve permanently deleting this Google Drive file?";
  if (toolName === "google_drive_file_copy") return "Do you approve copying this Google Drive file?";
  if (toolName === "google_drive_file_move") return "Do you approve moving this Google Drive file?";
  return "Do you approve updating this Google Drive file?";
}

function buildGoogleDriveConnectDetail(
  toolName: GoogleDriveExternalWriteToolName,
  payload: Record<string, unknown>,
) {
  return detail(
    googleDriveDetailKindByToolName[toolName],
    googleDriveHeadline(toolName, payload),
    preview("View details", [
      section({
        title: "Google Drive",
        fields: fields([
          field("Name", payload.name ?? payload.fileName ?? payload.newName),
          field("Source", (payload.source as { kind?: unknown } | undefined)?.kind),
          field("Role", payload.role),
          field("Recipient", payload.emailAddress ?? payload.domain),
          field("Folder", payload.parentFolderId ?? payload.destinationFolderId),
        ]),
        body: body("Description", payload.description),
      }),
    ]),
  );
}

function googleDriveTarget(payload: Record<string, unknown>): string {
  const name = textField(payload.name) ?? textField(payload.fileName) ?? textField(payload.newName);
  if (name) return quote(name);
  return textField(payload.fileId) ?? textField(payload.folderId) ?? "the Google Drive item";
}

function googleDrivePhrases(toolName: GoogleDriveExternalWriteToolName) {
  if (toolName === "google_drive_folder_create")
    return { past: "created", infinitive: "create" };
  if (toolName === "google_drive_file_rename")
    return { past: "renamed", infinitive: "rename" };
  if (toolName === "google_drive_file_update_description")
    return { past: "updated", infinitive: "update" };
  if (toolName === "google_drive_file_move") return { past: "moved", infinitive: "move" };
  if (toolName === "google_drive_file_copy") return { past: "copied", infinitive: "copy" };
  if (toolName === "google_drive_file_upload")
    return { past: "uploaded", infinitive: "upload" };
  if (toolName === "google_drive_file_trash")
    return { past: "moved to trash", infinitive: "move to trash" };
  if (toolName === "google_drive_file_restore")
    return { past: "restored", infinitive: "restore" };
  if (toolName === "google_drive_file_delete")
    return { past: "permanently deleted", infinitive: "permanently delete" };
  if (toolName === "google_drive_file_share") return { past: "shared", infinitive: "share" };
  if (toolName === "google_drive_permission_update")
    return { past: "updated permission for", infinitive: "update permission for" };
  return { past: "removed permission from", infinitive: "remove permission from" };
}

function buildGoogleDriveAgentResult(
  toolName: GoogleDriveExternalWriteToolName,
  input: Parameters<ExternalWriteActionContract["buildAgentResult"]>[0],
) {
  return buildExternalWriteAgentResult({
    action: input.action,
    payload: input.payload as Record<string, unknown>,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    message: ({ action, payload, status, providerError }) => {
      const target = googleDriveTarget(payload);
      const verb = googleDrivePhrases(toolName);
      const completed = `Google Drive ${verb.past} ${target}.`;
      const pending = `Google Drive ${verb.infinitive} ${target} is waiting for review.`;
      const processing = `Google Drive ${verb.infinitive} ${target} is processing.`;
      const failed = `Google Drive could not ${verb.infinitive} ${target}.`;
      const unknown = `Google Drive may or may not have ${verb.past} ${target}.`;
      const failure = providerErrorMessage(providerError);
      return lifecycleResultSentence({
        status,
        actionId: action.id,
        completed,
        needsReview: pending,
        processing,
        failed: failure ? `${failed} ${failure}` : failed,
        unknown: failure ? `${unknown} ${failure}` : unknown,
      });
    },
  });
}

function driveWriteApprovalContract<S extends z.ZodTypeAny>(
  toolName: GoogleDriveExternalWriteToolName,
  actionPayloadSchema: S,
  executeImpl: (
    db: SupabaseServiceClient,
    action: TableRow<"profile_actions">,
    payload: z.infer<S>,
  ) => Promise<ActionResult>,
): ExternalWriteActionContract<S> {
  return defineExternalWriteActionContract({
    toolName,
    actionPayloadSchema,
    outputSchema: googleDriveExternalWriteOutputSchema,
    buildWritePlan: async (ctx) => {
      const pack = await preflightGoogleDriveWrite(ctx.db, ctx.profileId, toolName, ctx.params);
      if (!pack) {
        throw new DomainError(
          domainCodes.INTERNAL,
          `Expected Google Drive approval preflight for ${toolName}.`,
        );
      }
      return {
        actionPayload: pack.payload,
        requestHash: pack.requestHash,
        reviewTitle: pack.approvalTitle,
        reviewSummary: pack.approvalSummary,
        reviewPayload: pack.reviewPayload,
      };
    },
    buildReviewDetail: ({ payload }) =>
      buildGoogleDriveConnectDetail(toolName, payload as Record<string, unknown>),
    buildAgentResult: (input) => buildGoogleDriveAgentResult(toolName, input),
    execute: executeImpl,
  });
}

export const googleDriveExternalWriteActionContracts: ExternalWriteActionContract[] = [
  driveWriteApprovalContract(
    "google_drive_folder_create",
    googleDriveFolderCreateInputSchema,
    executeGoogleDriveFolderCreate,
  ),
  driveWriteApprovalContract(
    "google_drive_file_rename",
    googleDriveFileRenameInputSchema,
    executeGoogleDriveFileRename,
  ),
  driveWriteApprovalContract(
    "google_drive_file_update_description",
    googleDriveFileUpdateDescriptionInputSchema,
    executeGoogleDriveFileUpdateDescription,
  ),
  driveWriteApprovalContract(
    "google_drive_file_move",
    googleDriveFileMoveInputSchema,
    executeGoogleDriveFileMove,
  ),
  driveWriteApprovalContract(
    "google_drive_file_copy",
    googleDriveFileCopyInputSchema,
    executeGoogleDriveFileCopy,
  ),
  driveWriteApprovalContract(
    "google_drive_file_upload",
    googleDriveFileUploadInputSchema,
    executeGoogleDriveFileUpload,
  ),
  driveWriteApprovalContract(
    "google_drive_file_trash",
    googleDriveFileTrashInputSchema,
    executeGoogleDriveFileTrash,
  ),
  driveWriteApprovalContract(
    "google_drive_file_restore",
    googleDriveFileRestoreInputSchema,
    executeGoogleDriveFileRestore,
  ),
  driveWriteApprovalContract(
    "google_drive_file_delete",
    googleDriveFileDeleteInputSchema,
    executeGoogleDriveFileDelete,
  ),
  driveWriteApprovalContract(
    "google_drive_file_share",
    googleDriveFileShareInputSchema,
    executeGoogleDriveFileShare,
  ),
  driveWriteApprovalContract(
    "google_drive_permission_update",
    googleDrivePermissionUpdateInputSchema,
    executeGoogleDrivePermissionUpdate,
  ),
  driveWriteApprovalContract(
    "google_drive_permission_delete",
    googleDrivePermissionDeleteInputSchema,
    executeGoogleDrivePermissionDelete,
  ),
];
