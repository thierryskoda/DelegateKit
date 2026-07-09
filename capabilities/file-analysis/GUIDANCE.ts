import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { fileAnalysisToolContracts } from "@ai-assistants/file-analysis-contracts/contracts";

export default definePluginGuidance({
  name: "file_analysis",
  plugin: plugin("file-analysis"),
  title: "File Analysis",
  description:
    "Load when saved profile files need text extraction, visual description, scanned document reading, screenshot/image understanding, or structured data extraction.",
  body: md`
Use file analysis tools only with saved profile files after the user asks to inspect, summarize, extract, or answer from them.

- Use ${tool(fileAnalysisToolContracts, "file_extract_text")} when you need deterministic embedded or UTF-8 text from a saved file.
- Use ${tool(fileAnalysisToolContracts, "file_describe")} when you need a natural-language answer, summary, visual inspection, screenshot/image explanation, or scanned PDF reading.
- Use ${tool(fileAnalysisToolContracts, "file_extract_data")} when the next step needs structured JSON extracted from a saved file.
- Current chat attachments are already saved as profile files in the turn context when available. Use the listed \`profileFileId\` and \`sha256\`; do not mention ids, hashes, tools, storage, or internal artifacts to the client.

${coveredToolCatalog(fileAnalysisToolContracts, {
  file_extract_text: true,
  file_describe: true,
  file_extract_data: true,
})}
`,
});
