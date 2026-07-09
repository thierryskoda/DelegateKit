import { profileActionWriteToolDataSchema } from "@ai-assistants/actions-contracts/schemas";
import {
  providerAccountsListOutputSchema,
  providerSavedArtifactOutputSchema,
  stringField,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";

export const driveOptionalConnectedAccountIdSchema = z
  .string()
  .trim()
  .uuid()
  .describe(
    "Connected provider account id from google_drive_accounts_list when multiple Drive accounts exist. Do not use profile_context_get capability instance ids for this field.",
  )
  .optional();

const capabilitySelectorFields = { connectedAccountId: driveOptionalConnectedAccountIdSchema };

function optionalNonEmptyStringField(description: string): z.ZodType<string | undefined> {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    stringField(description).optional(),
  );
}

export const googleDriveAccountsListInputSchema = z.object({}).strict();

export const googleDriveAboutGetInputSchema = z.object({ ...capabilitySelectorFields }).strict();

export const googleDriveFoldersSyncedListInputSchema = z
  .object({
    ...capabilitySelectorFields,
    cursor: z.string().trim().min(1).optional().describe("Pagination cursor from a prior result."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum folders to return."),
  })
  .strict();

export const googleDriveFilesSyncedListInputSchema = z
  .object({
    ...capabilitySelectorFields,
    cursor: z.string().trim().min(1).optional().describe("Pagination cursor from a prior result."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum files to return."),
  })
  .strict();

export const googleDriveFolderListInputSchema = z
  .object({
    ...capabilitySelectorFields,
    folderId: stringField("Drive folder id, or omit for My Drive root.").optional(),
    cursor: z.string().trim().min(1).optional().describe("Pagination cursor from a prior result."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum files to return."),
    includeSharedDrives: z
      .boolean()
      .optional()
      .describe(
        "When true, include items from shared drives in folder listing results where the provider supports it.",
      ),
  })
  .strict();

export const googleDriveSearchInputSchema = z
  .object({
    ...capabilitySelectorFields,
    query: optionalNonEmptyStringField(
      "Plain-language file search text, such as a file name, client name, or document topic.",
    ),
    driveQuery: optionalNonEmptyStringField(
      "Advanced Google Drive `q` search string. Use only when exact Drive query syntax is needed.",
    ),
    cursor: z.string().trim().min(1).optional().describe("Pagination cursor from a prior result."),
    pageSize: z.number().int().min(1).max(200).optional().describe("Maximum files to return."),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (!val.query && !val.driveQuery) {
      ctx.addIssue({
        code: "custom",
        path: ["query"],
        message: "query or driveQuery is required.",
      });
    }
  });

export const googleDriveFileGetInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("Google Drive file id."),
  })
  .strict();

export const googleDriveFileSaveInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("Google Drive file id."),
    filename: stringField(
      "Artifact filename including extension. Required when mode=export.",
    ).optional(),
    mode: z
      .enum(["media", "export"])
      .default("media")
      .describe(
        "Use media for binary files; use export for Google Workspace native files such as Docs, Sheets, or Slides.",
      ),
    exportMimeType: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Required when mode=export, e.g. application/pdf."),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.mode === "export" && !val.exportMimeType?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["exportMimeType"],
        message: "exportMimeType is required when mode is export.",
      });
    }
    if (val.mode === "export" && !val.filename?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["filename"],
        message: "filename is required when mode is export so the saved artifact has an explicit extension.",
      });
    }
    if (val.mode === "export" && val.filename?.trim() && !/\.[A-Za-z0-9]{1,10}$/.test(val.filename.trim())) {
      ctx.addIssue({
        code: "custom",
        path: ["filename"],
        message: "filename must include an explicit extension when mode is export.",
      });
    }
  });

export const googleDriveSharedDrivesListInputSchema = z
  .object({
    ...capabilitySelectorFields,
    cursor: z.string().trim().min(1).optional().describe("Pagination cursor from a prior result."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum shared drives to return."),
    query: stringField("Shared drive search query (optional).").optional(),
  })
  .strict();

export const googleDrivePermissionsListInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("File or shared drive id."),
    cursor: z.string().trim().min(1).optional().describe("Pagination cursor from a prior result."),
    pageSize: z.number().int().min(1).max(100).optional().describe("Maximum permissions to return."),
  })
  .strict();

export const googleDrivePermissionGetInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("File or shared drive id."),
    permissionId: stringField("Permission id."),
  })
  .strict();

export const drivePermissionRoleSchema = z.enum([
  "owner",
  "organizer",
  "fileOrganizer",
  "writer",
  "commenter",
  "reader",
]);

export const googleDrivePermissionUpdateInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("File or shared drive id."),
    permissionId: stringField("Permission id."),
    role: drivePermissionRoleSchema.describe("Google Drive permission role to set."),
  })
  .strict();

export const googleDrivePermissionDeleteInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("File id."),
    permissionId: stringField("Permission id."),
  })
  .strict();

export const googleDriveFileShareInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("File id."),
    type: z.enum(["user", "group", "domain", "anyone"]).describe("Permission grantee type."),
    role: drivePermissionRoleSchema.describe("Google Drive permission role to grant."),
    emailAddress: z
      .string()
      .trim()
      .email()
      .optional()
      .describe("Required when type is user or group."),
    domain: stringField("Domain for type=domain.").optional(),
    allowFileDiscovery: z
      .boolean()
      .optional()
      .describe("For anyone/domain shares, whether the file can be discovered in search."),
    sendNotificationEmail: z
      .boolean()
      .optional()
      .describe("Whether Google Drive should send a sharing notification email when supported."),
  })
  .strict()
  .superRefine((val, ctx) => {
    if ((val.type === "user" || val.type === "group") && !val.emailAddress?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["emailAddress"],
        message: "emailAddress is required for type user or group.",
      });
    }
    if (val.type === "domain" && !val.domain?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["domain"],
        message: "domain is required for type domain.",
      });
    }
  });

export const googleDriveFileRenameInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("File id."),
    name: stringField("New file name."),
  })
  .strict();

export const googleDriveFileUpdateDescriptionInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("File id."),
    description: stringField("New file description."),
  })
  .strict();

export const googleDriveFolderCreateInputSchema = z
  .object({
    ...capabilitySelectorFields,
    name: stringField("New folder name."),
    parentId: stringField("Parent folder id (omit for drive root).").optional(),
  })
  .strict();

export const googleDriveFileUpdateInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("File id."),
    name: stringField("New file name.").optional(),
    description: stringField("Description.").optional(),
    starred: z.boolean().optional().describe("Whether to mark the file as starred."),
    trashed: z.boolean().optional().describe("Whether to move the file to or from trash."),
  })
  .strict();

export const googleDriveFileMoveInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("File id to move."),
    fromFolderId: stringField("Current parent folder id."),
    toFolderId: stringField("Destination parent folder id."),
  })
  .strict();

export const googleDriveFileCopyInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("Source file id."),
    name: stringField("Name for the copy.").optional(),
    destinationFolderId: stringField("Folder id for the copy.").optional(),
  })
  .strict();

export const googleDriveFileUploadSourceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("direct_content"),
      content: stringField("Plain text or base64 file body; keep uploads small enough for direct upload."),
      mimeType: stringField("MIME type of the created file."),
      isBase64: z.boolean().optional().describe("true when content is base64-encoded file bytes."),
    })
    .strict(),
  z
    .object({
      kind: z.literal("profile_file"),
      profileFileId: stringField("Profile file id for the saved file to upload."),
      expectedSha256: stringField("Optional stale-file protection hash.").optional(),
      mimeType: stringField("Optional MIME type override; omit to use the artifact MIME type.").optional(),
    })
    .strict(),
]);

export const googleDriveFileUploadInputSchema = z
  .object({
    ...capabilitySelectorFields,
    name: stringField("File name including extension."),
    source: googleDriveFileUploadSourceSchema.describe(
      "File source to upload: direct small content or an existing profile file.",
    ),
    folderId: stringField(
      "Destination parent folder id; omit for the provider default/root.",
    ).optional(),
    description: stringField("File description.").optional(),
  })
  .strict();

export const googleDriveFileTrashInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("File id to move to trash."),
  })
  .strict();

export const googleDriveFileRestoreInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("Trashed file id to restore."),
  })
  .strict();

export const googleDriveFileDeleteInputSchema = z
  .object({
    ...capabilitySelectorFields,
    fileId: stringField("File id to permanently delete."),
  })
  .strict();

const googleDriveContextSchema = {
  provider: z.literal("google-drive").describe("Provider backing this result."),
  accountEmail: z
    .string()
    .email()
    .nullable()
    .describe("Google account email used for this result.")
    .meta({ examples: ["client@example.com"] }),
};

export const googleDriveFileSummarySchema = z
  .object({
    id: z.string().trim().min(1).describe("Google Drive file or folder id."),
    name: z.string().trim().min(1).nullable().describe("Drive item display name."),
    mimeType: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Drive item MIME type.")
      .meta({ examples: ["application/pdf"] }),
    webUrl: z
      .string()
      .url()
      .nullable()
      .describe("Browser URL for opening the Drive item.")
      .meta({ examples: ["https://drive.google.com/file/d/example/view"] }),
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
    trashed: z.boolean().describe("Whether the item is in Google Drive trash."),
  })
  .strict()
  .describe("Google Drive file or folder summary.");

export const googleDriveFileDetailSchema = googleDriveFileSummarySchema
  .extend({
    parents: z.array(z.string().trim().min(1)).describe("Parent folder ids for this item."),
    driveId: z.string().trim().min(1).nullable().describe("Shared drive id, when applicable."),
    description: z.string().nullable().describe("Drive item description."),
    starred: z.boolean().describe("Whether the file is starred."),
  })
  .strict();

export const googleDriveSharedDriveSchema = z
  .object({
    id: z.string().trim().min(1).describe("Google shared drive id."),
    name: z.string().trim().min(1).nullable().describe("Shared drive display name."),
  })
  .strict()
  .describe("Google shared drive summary.");

export const googleDrivePermissionSchema = z
  .object({
    id: z.string().trim().min(1).describe("Google Drive permission id."),
    type: z.string().trim().min(1).nullable().describe("Permission grantee type."),
    role: z.string().trim().min(1).nullable().describe("Permission role."),
    emailAddress: z
      .string()
      .email()
      .nullable()
      .describe("Grantee email address, when applicable.")
      .meta({ examples: ["client@example.com"] }),
    displayName: z.string().trim().min(1).nullable().describe("Grantee display name."),
    deleted: z.boolean().describe("Whether the grantee account is deleted."),
  })
  .strict()
  .describe("Google Drive permission.");

export const googleDriveFilesOutputSchema = z
  .object({
    ...googleDriveContextSchema,
    files: z.array(googleDriveFileSummarySchema).describe("Drive files or folders returned."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const googleDriveFileOutputSchema = z
  .object({
    ...googleDriveContextSchema,
    file: googleDriveFileDetailSchema.describe("Requested Drive file or folder."),
  })
  .strict();

export const googleDriveSharedDrivesOutputSchema = z
  .object({
    ...googleDriveContextSchema,
    drives: z.array(googleDriveSharedDriveSchema).describe("Shared drives returned."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const googleDrivePermissionsOutputSchema = z
  .object({
    ...googleDriveContextSchema,
    permissions: z.array(googleDrivePermissionSchema).describe("Permissions returned."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const googleDrivePermissionOutputSchema = z
  .object({
    ...googleDriveContextSchema,
    permission: googleDrivePermissionSchema.describe("Requested Drive permission."),
  })
  .strict();

export const googleDriveCapabilitiesOutputSchema = z
  .object({
    plugin: z.literal("google-drive-tools").describe("Plugin id for Google Drive tools."),
    fileMirrorBackedTools: z.boolean().describe("Whether file-mirror backed tools are enabled."),
    oauthIntegrationSupported: z
      .boolean()
      .describe("Whether OAuth-backed integration setup is supported."),
    nangoBackedTools: z.boolean().describe("Whether Nango-backed tools are enabled."),
  })
  .strict();

export const googleDriveAccountsListOutputSchema = providerAccountsListOutputSchema;

export const googleDriveFileSaveOutputSchema = providerSavedArtifactOutputSchema(
  z.literal("google-drive"),
);

export const googleDriveExternalWriteOutputSchema = profileActionWriteToolDataSchema;
