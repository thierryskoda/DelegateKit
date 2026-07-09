import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import { fileAnalysisToolContracts } from "@ai-assistants/file-analysis-contracts/contracts";
import { microsoftOnedriveToolContracts } from "@ai-assistants/microsoft-onedrive-contracts/contracts";

export default definePluginGuidance({
  name: "microsoft_onedrive",
  plugin: plugin("microsoft-onedrive"),
  allowedPlugins: [plugin("document-tools"), plugin("file-analysis")],
  description:
    "Load when the user asks about OneDrive files: search, browse, inspect metadata, save file contents, upload, move, copy, rename, delete, or share.",
  body: md`
# Microsoft OneDrive

Use OneDrive tools for a user's personal or shared OneDrive files.

- To analyze or extract from a OneDrive PDF or image, first save it with ${tool(microsoftOnedriveToolContracts, "microsoft_onedrive_file_save")}, then call ${tool(fileAnalysisToolContracts, "file_extract_text")}, ${tool(fileAnalysisToolContracts, "file_describe")}, or ${tool(fileAnalysisToolContracts, "file_extract_data")} with the returned \`profileFileId\` and SHA-256 hash.
- Do not pass OneDrive links directly to document analysis tools.
- Use ${tool(microsoftOnedriveToolContracts, "microsoft_onedrive_small_file_upload")} with \`source.kind="profile_file"\` and the durable \`profileFileId\` when uploading assistant-created or previously saved files.
- Use \`source.kind="direct_content"\` only for small explicit base64 content that is not already a saved profile file.

${coveredToolCatalog(microsoftOnedriveToolContracts, {
  microsoft_onedrive_accounts_list: true,
  microsoft_onedrive_drives_list: true,
  microsoft_onedrive_drive_get: true,
  microsoft_onedrive_folder_children_list: true,
  microsoft_onedrive_recent_items_list: true,
  microsoft_onedrive_files_search: true,
  microsoft_onedrive_shared_items_list: true,
  microsoft_onedrive_item_get: true,
  microsoft_onedrive_versions_list: true,
  microsoft_onedrive_permissions_list: true,
  microsoft_onedrive_permission_get: true,
  microsoft_onedrive_file_save: true,
  microsoft_onedrive_folder_create: true,
  microsoft_onedrive_item_update: true,
  microsoft_onedrive_item_move: true,
  microsoft_onedrive_item_copy: true,
  microsoft_onedrive_item_delete: true,
  microsoft_onedrive_small_file_upload: true,
  microsoft_onedrive_sharing_link_create: true,
  microsoft_onedrive_invite_recipients: true,
  microsoft_onedrive_permission_delete: true,
})}
`,
});
