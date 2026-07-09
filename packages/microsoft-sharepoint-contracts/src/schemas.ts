import {
  providerAccountsListOutputSchema,
  providerSavedArtifactOutputSchema,
  stringField,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";

export const microsoftSharepointOptionalConnectedAccountIdSchema = z
  .string()
  .trim()
  .uuid()
  .describe(
    "Required when more than one connected SharePoint account exists; use microsoft_sharepoint_accounts_list to pick connectedAccountId. Do not use profile_context_get capability instance ids for this field.",
  )
  .optional();

const capabilitySelectorFields = {
  connectedAccountId: microsoftSharepointOptionalConnectedAccountIdSchema,
};

export const microsoftSharepointAccountsListInputSchema = z.object({}).strict();

export const microsoftSharepointSharedSitesListInputSchema = z
  .object({ ...capabilitySelectorFields })
  .strict();

export const microsoftSharepointFileFetchInputSchema = z
  .object({
    ...capabilitySelectorFields,
    siteId: stringField("SharePoint site id."),
    itemId: stringField("Drive item id within the site drive."),
  })
  .strict();

export const microsoftSharepointFileSaveInputSchema = z
  .object({
    ...capabilitySelectorFields,
    siteId: stringField("SharePoint site id."),
    itemId: stringField("Drive item id within the site drive."),
    filename: stringField("Artifact filename including extension.").optional(),
  })
  .strict();

const microsoftSharepointContextSchema = {
  provider: z.literal("microsoft-sharepoint").describe("Provider backing this result."),
  accountEmail: z
    .string()
    .email()
    .nullable()
    .describe("Microsoft account email used for this result.")
    .meta({ examples: ["client@example.com"] }),
};

export const microsoftSharepointDriveItemSummarySchema = z
  .object({
    id: z.string().trim().min(1).describe("SharePoint drive item, drive, or site id."),
    name: z.string().trim().min(1).nullable().describe("SharePoint item display name."),
    type: z.enum(["file", "folder", "drive", "site", "unknown"]).describe("SharePoint item kind."),
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
  .describe("SharePoint file, folder, drive, or site summary.");

export const microsoftSharepointSiteSummarySchema = z
  .object({
    siteId: z.string().trim().min(1).describe("SharePoint site id to pass to file tools."),
    name: z.string().trim().min(1).nullable().describe("SharePoint site display name."),
    webUrl: z
      .string()
      .url()
      .nullable()
      .describe("Browser URL for opening the SharePoint site.")
      .meta({ examples: ["https://contoso.sharepoint.com/sites/example"] }),
    modifiedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe("Provider last-modified timestamp.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
  })
  .strict()
  .describe("SharePoint site summary.");

export const microsoftSharepointDriveItemDetailSchema = microsoftSharepointDriveItemSummarySchema
  .extend({
    parentId: z.string().trim().min(1).nullable().describe("Parent folder item id."),
    driveId: z.string().trim().min(1).nullable().describe("SharePoint drive id."),
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

export const microsoftSharepointSitesOutputSchema = z
  .object({
    accountEmail: microsoftSharepointContextSchema.accountEmail,
    sites: z.array(microsoftSharepointSiteSummarySchema).describe("SharePoint sites returned."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const microsoftSharepointFileOutputSchema = z
  .object({
    ...microsoftSharepointContextSchema,
    file: microsoftSharepointDriveItemDetailSchema.describe("Requested SharePoint file."),
  })
  .strict();

export const microsoftSharepointAccountsListOutputSchema = providerAccountsListOutputSchema;

export const microsoftSharepointFileSaveOutputSchema = providerSavedArtifactOutputSchema(
  z.literal("microsoft-sharepoint"),
);
