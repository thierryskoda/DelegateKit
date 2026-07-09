import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import { fileAnalysisToolContracts } from "@ai-assistants/file-analysis-contracts/contracts";
import { googleDriveToolContracts } from "@ai-assistants/google-drive-contracts/contracts";

export default definePluginGuidance({
  name: "google_drive_files",
  plugin: plugin("google-drive"),
  allowedPlugins: [plugin("document-tools"), plugin("file-analysis")],
  description:
    "Load when the user asks about Google Drive files or folders: search, browse, inspect metadata, save file contents, upload, rename, move, copy, trash, restore, delete, or manage sharing.",
  body: md`
# Google Drive Files

Use Drive tools to browse folders, search files, inspect metadata, save file contents as artifacts for other tools, and make file changes.

## File Handling

- To analyze a Drive PDF or image, first save it with ${tool(googleDriveToolContracts, "google_drive_file_save")}, then call ${tool(fileAnalysisToolContracts, "file_extract_text")}, ${tool(fileAnalysisToolContracts, "file_describe")}, or ${tool(fileAnalysisToolContracts, "file_extract_data")} with the returned \`profileFileId\` and SHA-256 hash.
- To fill a Drive DOCX template, first save it with ${tool(googleDriveToolContracts, "google_drive_file_save")}, then pass the returned profile file id to ${tool(documentToolContracts, "document_template_render")}.
- Do not pass direct Drive links or download URLs to document analysis tools; they will fail authentication.
- When uploading assistant-created or saved files, use ${tool(googleDriveToolContracts, "google_drive_file_upload")} with \`source.kind="profile_file"\` and the durable \`profileFileId\`.
- Use \`source.kind="direct_content"\` only for small explicit text/base64 content that is not already a saved profile file.

## Evidence Boundaries

- Drive is document storage, not a review inbox or daily todo list.
- Search or list folders when the user names a client, deal, folder, or document, or when comparing folders to CRM requirements.
- For provider-record status checks such as whether a file is filed, saved, present, linked, or missing, use Drive search, metadata, and folder listing evidence. Do not save/download/analyze file contents unless the user asks to inspect, read, compare, extract from, or deliver the file.
- Do not scan Drive for generic "documents waiting for review" in attention lists or proactive summaries unless the user scoped a specific client, deal, or folder.
- Folder contents prove only what is present in that folder. A matching folder proves only that the folder exists.
- Before saying a named folder contains a file, has only certain files, or is missing a file, call ${tool(googleDriveToolContracts, "google_drive_folder_list")} for that folder or use file metadata whose parent folder matches that exact folder.
- If search returns a folder and a file as separate matches, do not infer that the file is inside that folder. List the folder or inspect file parent metadata before making a folder-placement claim.
- Name a document as missing, stale, or required only when CRM, a template, checklist, file column, or another current source defines that requirement.
- If no requirement source is found, report the folder/CRM facts and say you cannot name required missing documents yet.
- Do not claim supporting files, completed documents, filed records, or deal evidence unless folder listing or file-targeted search returned those file entries.
- For signed copies, final PDFs, or deal documents, verify live Drive evidence in the named client/deal/folder before saying the file is filed.
- A Drive filename containing words such as "signed", "final", "approved", or "completed" is not proof of the legal/workflow status. Say the file is named that way unless provider status, document contents, metadata, or another current source proves the status.
- Do not say a Drive result is the same file as a signature-provider download unless current evidence proves it, such as a matching checksum, matching byte size plus matching document facts, or another explicit provider link. Similar names alone are not enough.
- If the signed PDF and Drive candidate do not match or cannot be compared, distinguish the signed-provider file from the Drive filing status instead of merging them into one file claim.
- If a found file is tiny, invalid-looking, ambiguous, or outside the requested folder/deal context, report that blocker instead of treating it as properly filed.
- Before uploading, moving, copying, or filing, resolve the destination to one exact folder. If multiple active folders or records match, ask which one to use.

${coveredToolCatalog(googleDriveToolContracts, {
  google_drive_accounts_list: true,
  google_drive_folder_list: true,
  google_drive_search: true,
  google_drive_file_get: true,
  google_drive_shared_drives_list: true,
  google_drive_permissions_list: true,
  google_drive_permission_get: true,
  google_drive_file_save: true,
  google_drive_folder_create: true,
  google_drive_file_rename: true,
  google_drive_file_update_description: true,
  google_drive_file_move: true,
  google_drive_file_copy: true,
  google_drive_file_upload: true,
  google_drive_file_trash: true,
  google_drive_file_restore: true,
  google_drive_file_delete: true,
  google_drive_file_share: true,
  google_drive_permission_update: true,
  google_drive_permission_delete: true,
})}
`,
});
