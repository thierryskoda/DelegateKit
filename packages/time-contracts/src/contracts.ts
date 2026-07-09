import { defineReadTool, readToolDescription, type ToolContract } from "@ai-assistants/tool-contracts";
import { profileTimeResolveInputSchema, profileTimeResolveOutputSchema } from "./schemas";

export const TIME_PLUGIN_ID = "time-tools";

export const timeToolContracts = [
  defineReadTool({
    name: "time_resolve",
    pluginId: TIME_PLUGIN_ID,
    label: "Resolve Profile Time",
    description: readToolDescription({
      useWhen:
        "a user-visible answer, provider query, billing period, date range, or relative date depends on timezone",
      operation: "Resolves timestamps and profile-local civil dates using the profile timezone",
      returns: "profile timezone, local labels, and UTC query bounds",
    }),
    inputSchema: profileTimeResolveInputSchema,
    outputSchema: profileTimeResolveOutputSchema,
  }),
] as const satisfies readonly ToolContract[];

export type TimeToolName = (typeof timeToolContracts)[number]["name"];
