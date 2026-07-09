import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  type ToolContract,
  writeToolDescription,
} from "@ai-assistants/tool-contracts";
import {
  microsoftSharepointAccountsListOutputSchema,
  microsoftSharepointAccountsListInputSchema,
  microsoftSharepointFileFetchInputSchema,
  microsoftSharepointFileOutputSchema,
  microsoftSharepointFileSaveInputSchema,
  microsoftSharepointFileSaveOutputSchema,
  microsoftSharepointSharedSitesListInputSchema,
  microsoftSharepointSitesOutputSchema,
} from "./schemas";

export const MICROSOFT_SHAREPOINT_PLUGIN_ID = "microsoft-sharepoint-tools";

export const microsoftSharepointToolContracts = [
  defineReadTool({
    name: "microsoft_sharepoint_accounts_list",
    pluginId: MICROSOFT_SHAREPOINT_PLUGIN_ID,
    label: "List SharePoint capability instances",
    description: readToolDescription({
      useWhen: "the agent needs configured SharePoint account choices for this profile",
      operation: "Lists connected SharePoint accounts and current health without fetching files",
      returns: "SharePoint account metadata for choosing connectedAccountId",
      notes: ["Use when multiple SharePoint accounts may exist"],
    }),
    inputSchema: microsoftSharepointAccountsListInputSchema,
    outputSchema: microsoftSharepointAccountsListOutputSchema,
  }),
  defineReadTool({
    name: "microsoft_sharepoint_shared_sites_list",
    pluginId: MICROSOFT_SHAREPOINT_PLUGIN_ID,
    label: "List SharePoint sites",
    description: readToolDescription({
      useWhen: "the SharePoint site id is unknown before file fetch or save",
      operation: "Lists SharePoint sites available to the connected account",
      returns: "SharePoint site ids, names, and metadata",
      notes: ["Current provider proxy returns the available site page without a continuation cursor"],
    }),
    inputSchema: microsoftSharepointSharedSitesListInputSchema,
    outputSchema: microsoftSharepointSitesOutputSchema,
  }),
  defineReadTool({
    name: "microsoft_sharepoint_file_fetch",
    pluginId: MICROSOFT_SHAREPOINT_PLUGIN_ID,
    label: "Fetch SharePoint file metadata",
    description: readToolDescription({
      useWhen: "SharePoint file identity and metadata are needed without saving it",
      operation: "Resolves SharePoint file metadata by site id and item id",
      returns: "SharePoint file metadata; no download URL is returned",
      notes: ["This read-only lookup does not persist an artifact"],
    }),
    inputSchema: microsoftSharepointFileFetchInputSchema,
    outputSchema: microsoftSharepointFileOutputSchema,
  }),
  defineWriteTool({
    name: "microsoft_sharepoint_file_save",
    pluginId: MICROSOFT_SHAREPOINT_PLUGIN_ID,
    label: "Save SharePoint file to artifact",
    description: writeToolDescription({
      useWhen: "a SharePoint file must be delivered later or passed to another tool as an artifact",
      operation: "Downloads SharePoint file bytes and stores them as a bounded profile artifact",
      returns: "saved artifact metadata and safe failure details",
      notes: [
        "If filename is omitted, the artifact filename falls back to sharepoint-{siteId}-{itemId}",
        "Saves fail when the file exceeds the platform artifact size limit",
      ],
      sideEffect: "creates a durable profile artifact but does not send the file by itself",
      safety: "the source SharePoint site id and item id must identify the intended file",
    }),
    inputSchema: microsoftSharepointFileSaveInputSchema,
    outputSchema: microsoftSharepointFileSaveOutputSchema,
  }),
] as const satisfies readonly ToolContract[];

export type MicrosoftSharepointToolName =
  (typeof microsoftSharepointToolContracts)[number]["name"];
