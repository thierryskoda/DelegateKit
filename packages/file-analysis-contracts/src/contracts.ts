import {
  defineReadTool,
  readToolDescription,
  type ToolContract,
} from "@ai-assistants/tool-contracts";
import { FILE_ANALYSIS_PLUGIN_ID } from "./constants";
import {
  fileDescribeInputSchema,
  fileDescribeOutputSchema,
  fileExtractDataInputSchema,
  fileExtractDataOutputSchema,
  fileExtractTextInputSchema,
  fileExtractTextOutputSchema,
} from "./schemas";

export const fileAnalysisToolContracts = [
  defineReadTool({
    name: "file_extract_text",
    pluginId: FILE_ANALYSIS_PLUGIN_ID,
    label: "Extract File Text",
    description: readToolDescription({
      useWhen:
        "a saved profile file needs deterministic readable text, especially PDFs or text-like files",
      operation:
        "Loads one profile-owned file, verifies its expected hash, and extracts bounded embedded or UTF-8 text without LLM vision",
      returns: "source file metadata, extracted text, method used, and warnings",
      doNotUse:
        "for images, screenshots, scanned/image-only PDFs, or visual/layout questions; use file_describe or file_extract_data",
      notes: [
        "Provider files must first be saved as profile files by the owning provider tool.",
        "Pass the exact profileFileId and sha256 returned by the tool that created or saved the profile file.",
      ],
    }),
    inputSchema: fileExtractTextInputSchema,
    outputSchema: fileExtractTextOutputSchema,
  }),
  defineReadTool({
    name: "file_describe",
    pluginId: FILE_ANALYSIS_PLUGIN_ID,
    label: "Describe File",
    description: readToolDescription({
      useWhen:
        "a saved profile file needs a natural-language answer, visual inspection, image summary, scanned PDF reading, signature-looking check, or screenshot explanation",
      operation:
        "Loads one profile-owned file, verifies its expected hash, and answers the supplied question using deterministic text and LLM vision when needed",
      returns: "source file metadata, answer, evidence summary, method used, and warnings",
      notes: [
        "Use this for free-form answers. Use file_extract_data when the next step needs structured JSON.",
        "Do not expose profile file ids, hashes, tool names, or internal storage details in client-visible replies.",
      ],
    }),
    inputSchema: fileDescribeInputSchema,
    outputSchema: fileDescribeOutputSchema,
  }),
  defineReadTool({
    name: "file_extract_data",
    pluginId: FILE_ANALYSIS_PLUGIN_ID,
    label: "Extract File Data",
    description: readToolDescription({
      useWhen:
        "a saved profile file needs structured JSON extraction, such as identity details, addresses, receipt facts, or form fields",
      operation:
        "Loads one profile-owned file, verifies its expected hash, and extracts structured JSON according to the supplied instructions and schema",
      returns: "source file metadata, parsed JSON data, evidence summary, method used, and warnings",
      notes: [
        "Keep the schema specific to the current workflow and include only fields needed for the next step.",
        "Use file_describe instead for summaries or open-ended visual questions.",
      ],
    }),
    inputSchema: fileExtractDataInputSchema,
    outputSchema: fileExtractDataOutputSchema,
  }),
] as const satisfies readonly ToolContract[];

export type FileAnalysisToolName = (typeof fileAnalysisToolContracts)[number]["name"];
