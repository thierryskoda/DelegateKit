import { coveredToolCatalog, definePluginGuidance, md, plugin } from "@ai-assistants/guidance-authoring";
import { proposalsToolContracts } from "@ai-assistants/proposals-contracts/contracts";

export default definePluginGuidance({
  name: "proposals",
  plugin: plugin("proposals"),
  description:
    "Load when proactive, scheduled, batch, or later-review work should create a concrete suggestion for Connect review.",
  body: md`
# Proposals

Use proposals for concrete suggestions the user should review later in Connect.

- Do not use proposals when the user is actively approving an exact action in chat.
- Proposal payloads must be exact executable data with source evidence.
- Email follow-up proposals must include provider-specific send payloads and sourceCheckedAt.

${coveredToolCatalog(proposalsToolContracts, { proposal_create: true })}
`,
});
