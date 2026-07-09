import { profileActionWriteToolDataSchema } from "@ai-assistants/actions-contracts/schemas";
import {
  providerAccountsListOutputSchema,
  providerSavedArtifactOutputSchema,
  stringField,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";

export const microsoftOnedriveOptionalConnectedAccountIdSchema = z
  .string()
  .trim()
  .uuid()
  .describe(
    "Required when more than one connected OneDrive account exists; use microsoft_onedrive_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.",
  )
  .optional();

const capabilitySelectorFields = {
  connectedAccountId: microsoftOnedriveOptionalConnectedAccountIdSchema,
};

export const microsoftOnedriveAccountsListInputSchema = z.object({}).strict();

export const microsoftOnedriveDrivesListInputSchema = z
  .object({ ...capabilitySelectorFields })
  .strict();

export const microsoftOnedriveDriveGetInputSchema = z
  .object({ ...capabilitySelectorFields })
  .strict();

export const microsoftOnedriveFolderChildrenListInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Folder item id; omit or use "root" for root.'),
  })
  .strict();

export const microsoftOnedriveRecentItemsListInputSchema = z
  .object({ ...capabilitySelectorFields })
  .strict();

export const microsoftOnedriveFilesSearchInputSchema = z
  .object({
    ...capabilitySelectorFields,
    query: stringField("OneDrive search query string."),
  })
  .strict();

export const microsoftOnedriveSharedItemsListInputSchema = z
  .object({ ...capabilitySelectorFields })
  .strict();

export const microsoftOnedriveGetItemInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("OneDrive drive item id. Provide exactly one of itemId or itemPath."),
    itemPath: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        "Path relative to the drive root, e.g. /Documents/file.txt. Provide exactly one of itemPath or itemId.",
      ),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasItem = Boolean(val.itemId?.trim());
    const hasPath = Boolean(val.itemPath?.trim());
    if (hasItem === hasPath) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of itemId or itemPath.",
      });
    }
  });

export const microsoftOnedriveVersionsListInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: stringField("Drive item id for a file."),
  })
  .strict();

export const microsoftOnedrivePermissionsListInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: stringField("Drive item id."),
  })
  .strict();

export const microsoftOnedrivePermissionGetInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: stringField("Drive item id."),
    permissionId: stringField("Permission id."),
  })
  .strict();

export const microsoftOnedriveFileSaveInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: stringField("OneDrive drive item id."),
    filename: stringField("Artifact filename including extension.").optional(),
  })
  .strict();

export const microsoftOnedriveFolderCreateInputSchema = z
  .object({
    ...capabilitySelectorFields,
    parentItemId: stringField('Parent folder id; use "root" for root.'),
    name: stringField("New folder name."),
    conflictBehavior: z
      .enum(["fail", "replace", "rename"])
      .optional()
      .describe("Provider conflict behavior when the folder name already exists."),
  })
  .strict();

export const microsoftOnedriveItemUpdateInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: stringField("Drive item id."),
    name: z.string().trim().min(1).optional().describe("New item name; omit to leave unchanged."),
    description: z
      .string()
      .nullable()
      .optional()
      .describe("New item description, null to clear, or omit to leave unchanged."),
    fileSystemInfo: z
      .object({
        createdDateTime: z
          .string()
          .trim()
          .optional()
          .describe("Optional created timestamp override."),
        lastModifiedDateTime: z
          .string()
          .trim()
          .optional()
          .describe("Optional modified timestamp override."),
      })
      .strict()
      .optional()
      .describe("Optional filesystem timestamp metadata to update."),
    parentReference: z
      .object({
        id: z.string().trim().optional().describe("Destination parent item id."),
        driveId: z
          .string()
          .trim()
          .optional()
          .describe("Destination drive id when moving across drives."),
        path: z.string().trim().optional().describe("Destination parent path."),
      })
      .strict()
      .optional()
      .describe("Optional parent reference for metadata-level moves."),
  })
  .strict();

export const microsoftOnedriveItemMoveInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: stringField("Drive item id to move or rename."),
    parentFolderId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Destination parent folder id; provide when moving."),
    name: z.string().trim().min(1).optional().describe("New item name; provide when renaming."),
  })
  .strict();

export const microsoftOnedriveItemCopyInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: stringField("Drive item id to copy."),
    targetParentId: stringField("Destination folder id."),
    newName: z.string().trim().min(1).optional().describe("Optional name for the copied item."),
  })
  .strict();

export const microsoftOnedriveItemDeleteInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: stringField("Drive item id to delete."),
  })
  .strict();

export const microsoftOnedriveSmallFileUploadSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("direct_content"),
      content: stringField("Small file bytes as base64 for a single-request upload."),
      isBase64: z.literal(true).describe("OneDrive direct content must be base64 encoded."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("profile_file"),
      profileFileId: stringField("Profile file id for the saved file to upload."),
      expectedSha256: stringField("Optional stale-file protection hash.").optional(),
    })
    .strict(),
]);

export const microsoftOnedriveSmallFileUploadInputSchema = z
  .object({
    ...capabilitySelectorFields,
    parentItemId: stringField("Parent folder item id."),
    fileName: stringField("Created file name."),
    source: microsoftOnedriveSmallFileUploadSourceSchema.describe(
      "File source to upload: direct small base64 content or an existing profile file.",
    ),
    contentType: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional MIME type of the uploaded file."),
  })
  .strict();

export const microsoftOnedriveSharingLinkCreateInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: stringField("Drive item id."),
    type: z.enum(["view", "edit", "embed"]).describe("Sharing link permission type."),
    scope: z
      .enum(["anonymous", "organization"])
      .optional()
      .describe("Sharing link audience scope."),
    password: z.string().trim().min(1).optional().describe("Optional sharing link password."),
    expirationDateTime: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional sharing link expiration timestamp."),
  })
  .strict();

const driveRecipientSchema = z
  .object({
    email: z.string().trim().email().optional().describe("Recipient email address."),
    objectId: z
      .string()
      .trim()
      .uuid()
      .optional()
      .describe("Directory object id for the recipient."),
    alias: z.string().trim().min(1).optional().describe("Provider alias for the recipient."),
  })
  .strict()
  .describe("Recipient identifier; include at least one of email, objectId, or alias.");

export const microsoftOnedriveInviteRecipientsInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: stringField("Drive item id."),
    recipients: z
      .array(driveRecipientSchema)
      .min(1)
      .describe("Recipients to invite; each recipient needs email, objectId, or alias."),
    roles: z
      .array(z.enum(["read", "write"]))
      .min(1)
      .describe("Permission roles to grant."),
    requireSignIn: z
      .boolean()
      .optional()
      .describe("Whether recipients must sign in to access the item."),
    sendInvitation: z.boolean().optional().describe("Whether Microsoft should email invitations."),
    message: z.string().trim().max(2000).optional().describe("Optional invitation message."),
    password: z.string().trim().optional().describe("Optional sharing password when supported."),
    expirationDateTime: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional access expiration timestamp."),
    retainInheritedPermissions: z
      .boolean()
      .optional()
      .describe("Whether to retain inherited permissions when inviting recipients."),
  })
  .strict();

export const microsoftOnedrivePermissionDeleteInputSchema = z
  .object({
    ...capabilitySelectorFields,
    itemId: stringField("Drive item id."),
    permissionId: stringField("Permission id."),
  })
  .strict();

const microsoftOnedriveContextSchema = {
  provider: z.literal("microsoft-onedrive").describe("Provider backing this result."),
  accountEmail: z
    .string()
    .email()
    .nullable()
    .describe("Microsoft account email used for this result.")
    .meta({ examples: ["client@example.com"] }),
};

export const microsoftOnedriveDriveItemSummarySchema = z
  .object({
    id: z.string().trim().min(1).describe("OneDrive drive item or drive id."),
    name: z.string().trim().min(1).nullable().describe("OneDrive item display name."),
    type: z.enum(["file", "folder", "drive", "site", "unknown"]).describe("OneDrive item kind."),
    webUrl: z
      .string()
      .url()
      .nullable()
      .describe("Browser URL for opening the Microsoft item.")
      .meta({ examples: ["https://contoso.sharepoint.com/sites/example"] }),
    createdAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe("Provider creation timestamp.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    modifiedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe("Provider last-modified timestamp.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    sizeBytes: z.number().int().nonnegative().nullable().describe("File size in bytes, if known."),
  })
  .strict()
  .describe("OneDrive file, folder, or drive summary.");

export const microsoftOnedriveDriveItemDetailSchema = microsoftOnedriveDriveItemSummarySchema
  .extend({
    parentId: z.string().trim().min(1).nullable().describe("Parent folder item id."),
    driveId: z.string().trim().min(1).nullable().describe("OneDrive drive id."),
    description: z.string().nullable().describe("Item description."),
    mimeType: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("File MIME type, when known.")
      .meta({ examples: ["application/pdf"] }),
  })
  .strict();

export const microsoftOnedrivePermissionSchema = z
  .object({
    id: z.string().trim().min(1).describe("OneDrive permission id."),
    roles: z.array(z.string().trim().min(1)).describe("Permission roles granted."),
    linkType: z.string().trim().min(1).nullable().describe("Sharing link type, when applicable."),
    grantedTo: z.string().trim().min(1).nullable().describe("User or group the permission grants."),
  })
  .strict()
  .describe("OneDrive drive item permission.");

export const microsoftOnedriveItemsOutputSchema = z
  .object({
    ...microsoftOnedriveContextSchema,
    items: z.array(microsoftOnedriveDriveItemSummarySchema).describe("OneDrive items returned."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const microsoftOnedriveItemOutputSchema = z
  .object({
    ...microsoftOnedriveContextSchema,
    item: microsoftOnedriveDriveItemDetailSchema.describe("Requested OneDrive item."),
  })
  .strict();

export const microsoftOnedriveDrivesOutputSchema = z
  .object({
    ...microsoftOnedriveContextSchema,
    drives: z.array(microsoftOnedriveDriveItemSummarySchema).describe("OneDrive drives returned."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const microsoftOnedrivePermissionsOutputSchema = z
  .object({
    ...microsoftOnedriveContextSchema,
    permissions: z.array(microsoftOnedrivePermissionSchema).describe("Permissions returned."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const microsoftOnedrivePermissionOutputSchema = z
  .object({
    ...microsoftOnedriveContextSchema,
    permission: microsoftOnedrivePermissionSchema.describe("Requested OneDrive permission."),
  })
  .strict();

export const microsoftOnedriveAccountsListOutputSchema = providerAccountsListOutputSchema;

export const microsoftOnedriveFileSaveOutputSchema = providerSavedArtifactOutputSchema(
  z.literal("microsoft-onedrive"),
);

export const microsoftOnedriveExternalWriteOutputSchema = profileActionWriteToolDataSchema;
