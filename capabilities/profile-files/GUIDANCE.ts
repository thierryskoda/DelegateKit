import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { fileAnalysisToolContracts } from "@ai-assistants/file-analysis-contracts/contracts";
import { profileFileToolContracts } from "@ai-assistants/profile-files-contracts/contracts";

export default definePluginGuidance({
  name: "profile_files",
  plugin: plugin("profile-files"),
  allowedPlugins: [plugin("file-analysis")],
  description:
    "Load when the user asks to inspect, summarize, extract from, compare, save, send, attach, preview, or otherwise act on a file, image, PDF, screenshot, receipt, audio note, or assistant-created artifact.",
  references: [
    tool(fileAnalysisToolContracts, "file_extract_text"),
    tool(fileAnalysisToolContracts, "file_describe"),
    tool(fileAnalysisToolContracts, "file_extract_data"),
  ],
  body: md`
# Profile Files

Use this guidance when the user asks to inspect, summarize, extract from, compare, save, send, attach, preview, or otherwise act on a file, image, PDF, screenshot, receipt, audio note, or assistant-created file.

## Intake

- A bare attachment is not a file task. Apply this guidance only when current or recent user text asks for work with the file/media item.
- Work with the actual file or media item whenever possible; do not replace file work with a filename, local path, raw id, or guess.
- Current-turn chat attachments are automatically saved as private profile files before you answer when intake succeeds.
- Use the saved attachment facts from turn context: \`profileFileId\`, filename, MIME type, byte size, and SHA-256.
- Use ${tool(fileAnalysisToolContracts, "file_extract_text")} for deterministic embedded or UTF-8 text.
- Use ${tool(fileAnalysisToolContracts, "file_describe")} for summaries, image/screenshot questions, visual checks, scanned PDFs, or open-ended file questions.
- Use ${tool(fileAnalysisToolContracts, "file_extract_data")} when the next step needs structured JSON from a saved file.
- Do not try to decode image base64, media refs, or local URLs manually.
- Use a second-pass LLM task only for bounded extraction, comparison, drafting, or judgment from already available text or structured evidence; do not use it for raw files.

## Provider And File Boundaries

- For provider files or attachments, use the owning provider tools.
- Use ${tool(profileFileToolContracts, "profile_file_find")} only when the likely source is an assistant-saved profile file or the user asks for saved assistant files.
- To deliver a saved or generated profile file back in chat, call ${tool(profileFileToolContracts, "profile_file_send")} with the intended \`profileFileId\` and a short caption when useful. Do not use a second message/media step for saved profile files.
- If the user asked for a PDF, send the PDF profile file, not a generated image preview. A preview PNG can help with visual inspection, but it is not a substitute for attaching the requested PDF.
- Do not paste raw file ids, hashes, local paths, media references, delivery URLs, tool names, or internal storage details in visible text.
- Do not tell the user an "artifact" or "internal file record" was created. Say you inspected, saved, prepared, or attached the actual file only when the relevant action succeeded.

## Evidence Limits

- Empty search results, empty folders, failed provider searches, partial pages, folder-only matches, and metadata-only profile-file matches are evidence limits, not permission to guess.
- Say what was checked and what is still unknown.
- When provider sources conflict on a fact needed for a write, filing, or materialization step, ask which source is correct before changing anything.

${coveredToolCatalog(profileFileToolContracts, {
  profile_file_find: true,
  profile_file_send: true,
})}
  `,
});
