import {
  defineWriteTool,
  type ToolContract,
  writeToolDescription,
} from "@ai-assistants/tool-contracts";
import {
  profileProposalCreateInputRuntimeSchema,
  profileProposalCreateOutputSchema,
} from "./schemas";

export const PROPOSALS_PLUGIN_ID = "proposals-tools";

export const proposalsToolContracts = [
  defineWriteTool({
    name: "proposal_create",
    pluginId: PROPOSALS_PLUGIN_ID,
    label: "Create Proposal",
    description: writeToolDescription({
      useWhen:
        "proactive, scheduled, batch, or later-review work finds a concrete suggestion for Connect review",
      operation: "Creates or reuses a deferred-review proposal card",
      returns: "the proposal summary and whether it was newly created",
      doNotUse:
        "the user is actively approving an action in chat; use provider write and action approval path",
      sideEffect: "creates a profile proposal row visible in Connect",
      safety:
        "proposal kind, payload, source evidence, and nested proposalPayload.sourceCheckedAt must be exact",
    }),
    inputSchema: profileProposalCreateInputRuntimeSchema,
    outputSchema: profileProposalCreateOutputSchema,
    trustedChannelRequired: false,
  }),
] as const satisfies readonly ToolContract[];

export type ProposalsToolName = (typeof proposalsToolContracts)[number]["name"];
