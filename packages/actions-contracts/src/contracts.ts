import {
  defineReadTool,
  defineWriteTool,
  emptyParams,
  readToolDescription,
  toolOutputProperty,
  type ToolContract,
  writeToolDescription,
} from "@ai-assistants/tool-contracts";
import {
  profileActionDecideInputSchema,
  profileActionDecideOutputSchema,
  profileActionGetInputSchema,
  profileActionGetOutputSchema,
  profileActionListInputSchema,
  profileActionListOutputSchema,
  profileWritePolicyGetOutputSchema,
  profileWritePolicyUpdateInputSchema,
  profileWritePolicyUpdateOutputSchema,
} from "./schemas";

export const ACTIONS_PLUGIN_ID = "actions-tools";

export const actionsToolContracts = [
  defineReadTool({
    name: "action_list",
    pluginId: ACTIONS_PLUGIN_ID,
    label: "List Actions",
    description: readToolDescription({
      useWhen: "the user asks about approval-governed provider write actions",
      operation: "Lists approval-governed provider write actions for this profile",
      returns: "action summaries and lifecycle statuses",
    }),
    inputSchema: profileActionListInputSchema,
    outputSchema: profileActionListOutputSchema,
  }),
  defineReadTool({
    name: "action_get",
    pluginId: ACTIONS_PLUGIN_ID,
    label: "Get Action",
    description: readToolDescription({
      useWhen: "one approval-governed provider write action needs inspection by id",
      operation: "Fetches one profile action",
      returns: "action id, current write/approval lifecycle status, title, and expiration",
    }),
    inputSchema: profileActionGetInputSchema,
    outputSchema: profileActionGetOutputSchema,
  }),
  defineWriteTool({
    name: "action_decide",
    pluginId: ACTIONS_PLUGIN_ID,
    label: "Decide Action",
    description: writeToolDescription({
      useWhen:
        "the user clearly approves or rejects one pending approval-governed provider write action",
      operation: "Records the user's decision for one pending action",
      returns: `the ${toolOutputProperty(profileActionDecideOutputSchema, "action")} lifecycle status and failure details`,
      sideEffect: "approval may continue provider processing; rejection is terminal",
      safety:
        "the action id, decision, and match to the user's decision must be clear; requires a trusted user messaging session",
    }),
    inputSchema: profileActionDecideInputSchema,
    outputSchema: profileActionDecideOutputSchema,
    trustedChannelRequired: true,
  }),
  defineReadTool({
    name: "write_policy_get",
    pluginId: ACTIONS_PLUGIN_ID,
    label: "Get Write Policy",
    description: readToolDescription({
      useWhen:
        "the user asks about current approval or auto-execute settings, or before changing approval behavior for safety-sensitive provider actions",
      operation: "Fetches the active profile write policy",
      returns: "default write policy mode and explicit modes for canonical action ids",
    }),
    inputSchema: emptyParams,
    outputSchema: profileWritePolicyGetOutputSchema,
  }),
  defineWriteTool({
    name: "write_policy_update",
    pluginId: ACTIONS_PLUGIN_ID,
    label: "Update Write Policy",
    description: writeToolDescription({
      useWhen: "the user clearly asks to change approval behavior",
      operation: "Patches default write policy mode or explicit action modes",
      returns: "the updated write policy",
      sideEffect: "changes safety-sensitive profile approval settings",
      safety:
        "the requested write policy change must be explicit; requires a trusted user messaging session",
    }),
    inputSchema: profileWritePolicyUpdateInputSchema,
    outputSchema: profileWritePolicyUpdateOutputSchema,
    trustedChannelRequired: true,
  }),
] as const satisfies readonly ToolContract[];

export type ActionsToolName = (typeof actionsToolContracts)[number]["name"];
