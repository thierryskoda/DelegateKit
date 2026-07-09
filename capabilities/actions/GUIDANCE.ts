import { coveredToolCatalog, definePluginGuidance, md, plugin } from "@ai-assistants/guidance-authoring";
import { actionsToolContracts } from "@ai-assistants/actions-contracts/contracts";

export default definePluginGuidance({
  name: "actions",
  plugin: plugin("actions"),
  description:
    "Load when approval-backed provider write actions or write-policy settings need review or mutation.",
  body: md`
# Actions

Use actions for approval-governed provider writes and write policy.

- Provider tools create actions when a write needs review; actions decide user approval/rejection.
- Decide only when the trusted-channel user decision clearly matches the pending action.
- Write-policy changes are safety-sensitive and require explicit user intent.
- When a provider write returns \`needs_review\`, tell the user in plain language that the action is waiting for their review and has not executed yet.
- Do not expose raw action ids, backend ids, \`/approve\` commands, or internal approval mechanics in normal client replies. Use approval tools only after a clear trusted-channel approval or rejection, or use profile-link tools only when the user explicitly asks for a review link.

${coveredToolCatalog(actionsToolContracts, {
  action_list: true,
  action_get: true,
  action_decide: true,
  write_policy_get: true,
  write_policy_update: true,
})}
`,
});
