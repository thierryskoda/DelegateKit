import {
  defineReadTool,
  emptyParams,
  readToolDescription,
  type ToolContract,
} from "@ai-assistants/tool-contracts";
import {
  profileActivitySearchInputSchema,
  profileActivitySearchOutputSchema,
  profileOverviewGetOutputSchema,
} from "./schemas";

export const PROFILE_CONTEXT_PLUGIN_ID = "profile-context-tools";

export const profileContextToolContracts = [
  defineReadTool({
    name: "profile_context_get",
    pluginId: PROFILE_CONTEXT_PLUGIN_ID,
    label: "Profile Context",
    description: readToolDescription({
      useWhen:
        "the agent needs compact profile status, readiness, portal availability, or operational coordination context",
      operation:
        "Fetches identity, assistant display basics, capability readiness, and operational coordination state",
      returns:
        "profile overview, readiness data, pending actions, active proposals, active browser tasks, due or running work, blockers, recent terminal events, and scheduled tasks",
      notes: [
        "Use provider-specific reads for live provider facts before acting.",
        "Capability readiness instance ids are backend link ids, not provider connectedAccountId values for provider tools.",
      ],
    }),
    inputSchema: emptyParams,
    outputSchema: profileOverviewGetOutputSchema,
  }),
  defineReadTool({
    name: "profile_activity_search",
    pluginId: PROFILE_CONTEXT_PLUGIN_ID,
    label: "Search Profile Activity",
    description: readToolDescription({
      useWhen:
        "the agent needs prior assistant work, completed provider actions, or duplicate-prone activity",
      operation: "Searches durable profile activity entries",
      returns:
        "activity cards with event type, title, summary, occurrence time, source, and reference keys",
      notes: ["Use provider-specific tools for live provider data."],
    }),
    inputSchema: profileActivitySearchInputSchema,
    outputSchema: profileActivitySearchOutputSchema,
  }),
] as const satisfies readonly ToolContract[];

export type ProfileContextToolName = (typeof profileContextToolContracts)[number]["name"];
