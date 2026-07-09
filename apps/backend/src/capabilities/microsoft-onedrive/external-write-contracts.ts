import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  microsoftOnedriveExternalWriteOutputSchema,
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
  executeOnedriveFolderCreate,
  executeOnedriveInviteRecipients,
  executeOnedriveItemCopy,
  executeOnedriveItemDelete,
  executeOnedriveItemMove,
  executeOnedriveItemUpdate,
  executeOnedrivePermissionDelete,
  executeOnedriveSharingLinkCreate,
  executeOnedriveSmallFileUpload,
} from "./write-actions";
import { preflightMicrosoftOnedriveWrite } from "./approval-preflight";

type MicrosoftOnedriveExternalWriteToolName =
  | "microsoft_onedrive_folder_create"
  | "microsoft_onedrive_item_update"
  | "microsoft_onedrive_item_move"
  | "microsoft_onedrive_item_copy"
  | "microsoft_onedrive_item_delete"
  | "microsoft_onedrive_small_file_upload"
  | "microsoft_onedrive_sharing_link_create"
  | "microsoft_onedrive_invite_recipients"
  | "microsoft_onedrive_permission_delete";

const microsoftOnedriveDetailKindByToolName = {
  microsoft_onedrive_folder_create: "microsoft_onedrive_folder_create",
  microsoft_onedrive_item_update: "microsoft_onedrive_item_update",
  microsoft_onedrive_item_move: "microsoft_onedrive_item_move",
  microsoft_onedrive_item_copy: "microsoft_onedrive_item_copy",
  microsoft_onedrive_item_delete: "microsoft_onedrive_item_delete",
  microsoft_onedrive_small_file_upload: "microsoft_onedrive_small_file_upload",
  microsoft_onedrive_sharing_link_create:
    "microsoft_onedrive_sharing_link_create",
  microsoft_onedrive_invite_recipients: "microsoft_onedrive_invite_recipients",
  microsoft_onedrive_permission_delete: "microsoft_onedrive_permission_delete",
} as const;

function microsoftOnedriveHeadline(
  toolName: MicrosoftOnedriveExternalWriteToolName,
  payload: Record<string, unknown>,
): string {
  const name = textValue(payload.name) ?? textValue(payload.fileName);
  if (toolName === "microsoft_onedrive_folder_create") {
    return name
      ? `Do you approve creating the "${name}" folder in OneDrive?`
      : "Do you approve creating this OneDrive folder?";
  }
  if (toolName === "microsoft_onedrive_small_file_upload") {
    return name
      ? `Do you approve uploading "${name}" to OneDrive?`
      : "Do you approve uploading this file to OneDrive?";
  }
  if (toolName === "microsoft_onedrive_invite_recipients") {
    return "Do you approve sharing this OneDrive item?";
  }
  if (toolName === "microsoft_onedrive_sharing_link_create") {
    return "Do you approve creating a sharing link for this OneDrive item?";
  }
  if (toolName === "microsoft_onedrive_permission_delete") {
    return "Do you approve removing this OneDrive permission?";
  }
  if (toolName === "microsoft_onedrive_item_delete") {
    return "Do you approve deleting this OneDrive item?";
  }
  if (toolName === "microsoft_onedrive_item_move") {
    return "Do you approve moving this OneDrive item?";
  }
  if (toolName === "microsoft_onedrive_item_copy") {
    return "Do you approve copying this OneDrive item?";
  }
  return "Do you approve updating this OneDrive item?";
}

function buildMicrosoftOnedriveConnectDetail(
  toolName: MicrosoftOnedriveExternalWriteToolName,
  payload: Record<string, unknown>,
) {
  return detail(
    microsoftOnedriveDetailKindByToolName[toolName],
    microsoftOnedriveHeadline(toolName, payload),
    preview("View details", [
      section({
        title: "OneDrive",
        fields: fields([
          field("Name", payload.name ?? payload.fileName ?? payload.newName),
          field("Source", (payload.source as { kind?: unknown } | undefined)?.kind),
          field("Role", payload.role),
          field("Recipients", payload.recipients),
          field("Type", payload.type),
        ]),
        body: body("Description", payload.description),
      }),
    ]),
  );
}

function microsoftOnedriveTarget(payload: Record<string, unknown>): string {
  const name = textField(payload.name) ?? textField(payload.fileName) ?? textField(payload.newName);
  if (name) return quote(name);
  return textField(payload.itemId) ?? "the OneDrive item";
}

function microsoftOnedrivePhrases(toolName: MicrosoftOnedriveExternalWriteToolName) {
  if (toolName === "microsoft_onedrive_folder_create")
    return { past: "created", infinitive: "create" };
  if (toolName === "microsoft_onedrive_item_update")
    return { past: "updated", infinitive: "update" };
  if (toolName === "microsoft_onedrive_item_move")
    return { past: "moved", infinitive: "move" };
  if (toolName === "microsoft_onedrive_item_copy")
    return { past: "copied", infinitive: "copy" };
  if (toolName === "microsoft_onedrive_item_delete")
    return { past: "deleted", infinitive: "delete" };
  if (toolName === "microsoft_onedrive_small_file_upload")
    return { past: "uploaded", infinitive: "upload" };
  if (toolName === "microsoft_onedrive_sharing_link_create")
    return { past: "created a sharing link for", infinitive: "create a sharing link for" };
  if (toolName === "microsoft_onedrive_invite_recipients")
    return { past: "invited recipients to", infinitive: "invite recipients to" };
  return { past: "removed permission from", infinitive: "remove permission from" };
}

function buildMicrosoftOnedriveAgentResult(
  toolName: MicrosoftOnedriveExternalWriteToolName,
  input: Parameters<ExternalWriteActionContract["buildAgentResult"]>[0],
) {
  return buildExternalWriteAgentResult({
    action: input.action,
    payload: input.payload as Record<string, unknown>,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    message: ({ action, payload, status, providerError }) => {
      const target = microsoftOnedriveTarget(payload);
      const verb = microsoftOnedrivePhrases(toolName);
      const completed = `OneDrive ${verb.past} ${target}.`;
      const pending = `OneDrive ${verb.infinitive} ${target} is waiting for review.`;
      const processing = `OneDrive ${verb.infinitive} ${target} is processing.`;
      const failed = `OneDrive could not ${verb.infinitive} ${target}.`;
      const unknown = `OneDrive may or may not have ${verb.past} ${target}.`;
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

function microsoftOnedriveWriteApprovalContract<S extends z.ZodTypeAny>(
  toolName: MicrosoftOnedriveExternalWriteToolName,
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
    outputSchema: microsoftOnedriveExternalWriteOutputSchema,
    buildWritePlan: async (ctx) => {
      const pack = await preflightMicrosoftOnedriveWrite(ctx.db, ctx.profileId, toolName, ctx.params);
      if (!pack) {
        throw new DomainError(
          domainCodes.INTERNAL,
          `Expected OneDrive approval preflight for ${toolName}.`,
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
      buildMicrosoftOnedriveConnectDetail(toolName, payload as Record<string, unknown>),
    buildAgentResult: (input) => buildMicrosoftOnedriveAgentResult(toolName, input),
    execute: executeImpl,
  });
}

export const microsoftOnedriveExternalWriteActionContracts: ExternalWriteActionContract[] = [
  microsoftOnedriveWriteApprovalContract(
    "microsoft_onedrive_folder_create",
    microsoftOnedriveFolderCreateInputSchema,
    executeOnedriveFolderCreate,
  ),
  microsoftOnedriveWriteApprovalContract(
    "microsoft_onedrive_item_update",
    microsoftOnedriveItemUpdateInputSchema,
    executeOnedriveItemUpdate,
  ),
  microsoftOnedriveWriteApprovalContract(
    "microsoft_onedrive_item_move",
    microsoftOnedriveItemMoveInputSchema,
    executeOnedriveItemMove,
  ),
  microsoftOnedriveWriteApprovalContract(
    "microsoft_onedrive_item_copy",
    microsoftOnedriveItemCopyInputSchema,
    executeOnedriveItemCopy,
  ),
  microsoftOnedriveWriteApprovalContract(
    "microsoft_onedrive_item_delete",
    microsoftOnedriveItemDeleteInputSchema,
    executeOnedriveItemDelete,
  ),
  microsoftOnedriveWriteApprovalContract(
    "microsoft_onedrive_small_file_upload",
    microsoftOnedriveSmallFileUploadInputSchema,
    executeOnedriveSmallFileUpload,
  ),
  microsoftOnedriveWriteApprovalContract(
    "microsoft_onedrive_sharing_link_create",
    microsoftOnedriveSharingLinkCreateInputSchema,
    executeOnedriveSharingLinkCreate,
  ),
  microsoftOnedriveWriteApprovalContract(
    "microsoft_onedrive_invite_recipients",
    microsoftOnedriveInviteRecipientsInputSchema,
    executeOnedriveInviteRecipients,
  ),
  microsoftOnedriveWriteApprovalContract(
    "microsoft_onedrive_permission_delete",
    microsoftOnedrivePermissionDeleteInputSchema,
    executeOnedrivePermissionDelete,
  ),
];
