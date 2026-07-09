import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  toolOutputProperty,
  type ToolContract,
  writeToolDescription,
} from "@ai-assistants/tool-contracts";
import {
  profileFileFindInputSchema,
  profileFileFindOutputSchema,
  profileFileSendInputSchema,
  profileFileSendOutputSchema,
} from "./schemas";

export const PROFILE_FILES_PLUGIN_ID = "profile-files";

export const profileFileToolContracts = [
  defineReadTool({
    name: "profile_file_find",
    pluginId: PROFILE_FILES_PLUGIN_ID,
    label: "Find Profile Files",
    description: readToolDescription({
      useWhen: "a previously saved or generated profile file must be found, selected, or materialized for analysis",
      operation: "Lists, searches, or gets saved profile files for this profile",
      returns: `${toolOutputProperty(profileFileFindOutputSchema, "files")} and optionally inline small content`,
      doNotUse: "the request names a live provider source; use that provider's tools",
      notes: [
        "Use profileFileId for an exact saved file, query for a metadata search, or neither for recent files.",
        "For content analysis, call file_extract_text, file_describe, or file_extract_data with the returned profileFileId and sha256.",
      ],
    }),
    inputSchema: profileFileFindInputSchema,
    outputSchema: profileFileFindOutputSchema,
  }),
  defineWriteTool({
    name: "profile_file_send",
    pluginId: PROFILE_FILES_PLUGIN_ID,
    label: "Send Profile File",
    description: writeToolDescription({
      useWhen: "the user needs to receive, open, preview, or download an existing saved profile file in the current chat",
      operation: "Queues the profile file as a native current-chat attachment without exposing delivery internals",
      returns: `${toolOutputProperty(profileFileSendOutputSchema, "status")} and profile file metadata`,
      notes: [
        "This tool owns native attachment delivery; do not call message with raw media references afterward.",
        "Use a short caption if the user needs context around the attachment.",
        "Do not paste ids, hashes, local paths, delivery URLs, or tool names in visible text.",
      ],
      sideEffect: "queues a native file attachment for the current channel reply",
      safety: "the profile file id and expected hash, when known, must match the intended file",
    }),
    inputSchema: profileFileSendInputSchema,
    outputSchema: profileFileSendOutputSchema,
  }),
] as const satisfies readonly ToolContract[];

export type ProfileFileToolName = (typeof profileFileToolContracts)[number]["name"];
