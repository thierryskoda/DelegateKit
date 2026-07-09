import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
} from "@ai-assistants/guidance-authoring";
import { profileContextToolContracts } from "@ai-assistants/profile-context-contracts/contracts";

export default definePluginGuidance({
  name: "profile_context",
  plugin: plugin("profile-context"),
  description:
    "Load when the assistant needs profile readiness, operational coordination context, prior assistant work, completed provider actions, or duplicate-prone historical activity.",
  body: md`
# Profile Context

Use profile context before work that may duplicate existing approvals, proposals, browser tasks, work items, blockers, scheduled tasks, or recent completed actions.

- Profile context is coordination and historical context, not live provider evidence.
- Before provider writes, use the owning provider tools for current facts.
- If current provider facts conflict with historical activity or context, treat provider evidence as current truth and name the conflict plainly when it affects the answer.

${coveredToolCatalog(profileContextToolContracts, {
  profile_context_get: true,
  profile_activity_search: true,
})}
`,
});
