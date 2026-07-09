import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
} from "@ai-assistants/guidance-authoring";
import { workToolContracts } from "@ai-assistants/work-contracts/contracts";

export default definePluginGuidance({
  name: "work_items",
  plugin: plugin("work"),
  description:
    "Load when inspecting backend-executed assistant work items or configuring provider-event work routes.",
  body: md`
# Work Items

Use work item tools to inspect backend-created assistant work and configure provider-event routes.

- Backend jobs execute due work items directly; do not look for claim, complete, fail, ignore, or release tools.
- Use \`work_item_get\` and \`work_item_list\` only when the user asks to inspect existing background work.
- Work routes create future queued work from provider events; preserve unrelated existing instructions when updating a route.
- When the user asks to add or change an incoming-event automation, list existing work routes first.
- Keep one route per supported event type and provider-account scope. A default route and account-specific routes may coexist; when a matching event type and \`connectedProviderAccountId\` scope already exists, update that matching route instead of creating a duplicate.
- Work route instructions should stay event-specific: what event wakes the assistant, what outcome to produce, what to ignore, and which profile guidance to use.
- If reusable workflow rules already exist in profile guidance, reference that guidance by title/key instead of copying the full workflow into the route.
- When feedback says an incoming-event item was too noisy, missed a required check, or should stop happening that way, treat it as possible work-route feedback before changing reusable profile guidance.

${coveredToolCatalog(workToolContracts, {
  work_item_get: true,
  work_item_list: true,
  work_route_list: true,
  work_route_create: true,
  work_route_update: true,
  work_route_delete: true,
})}
`,
});
