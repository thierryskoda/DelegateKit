import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { fileAnalysisToolContracts } from "@ai-assistants/file-analysis-contracts/contracts";
import { microsoftSharepointToolContracts } from "@ai-assistants/microsoft-sharepoint-contracts/contracts";

export default definePluginGuidance({
  name: "microsoft_sharepoint",
  plugin: plugin("microsoft-sharepoint"),
  allowedPlugins: [plugin("file-analysis")],
  description:
    "Load when the user asks about SharePoint files: list sites, inspect file metadata, or save file contents.",
  body: md`
# Microsoft SharePoint

Use SharePoint tools for team sites, shared sites, and site document libraries.

- To analyze or extract from a SharePoint PDF or image, first save it with ${tool(microsoftSharepointToolContracts, "microsoft_sharepoint_file_save")}, then call ${tool(fileAnalysisToolContracts, "file_extract_text")}, ${tool(fileAnalysisToolContracts, "file_describe")}, or ${tool(fileAnalysisToolContracts, "file_extract_data")} with the returned \`profileFileId\` and SHA-256 hash.
- Do not pass SharePoint links directly to document analysis tools.

${coveredToolCatalog(microsoftSharepointToolContracts, {
  microsoft_sharepoint_accounts_list: true,
  microsoft_sharepoint_shared_sites_list: true,
  microsoft_sharepoint_file_fetch: true,
  microsoft_sharepoint_file_save: true,
})}
`,
});
