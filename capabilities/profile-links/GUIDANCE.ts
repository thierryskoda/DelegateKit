import { coveredToolCatalog, definePluginGuidance, md, plugin } from "@ai-assistants/guidance-authoring";
import { profileLinksToolContracts } from "@ai-assistants/profile-links-contracts/contracts";

export default definePluginGuidance({
  name: "profile_links",
  plugin: plugin("profile-links"),
  description:
    "Load when the user needs a Connect portal link or Telegram Mini App launch link for integrations or approvals.",
  body: md`
# Profile Links

Use profile links to give the user a short-lived access path to Connect.

- Use portal links for browser access.
- Use Mini App links only when the Telegram Mini App surface is appropriate.
- The target section or intent must be clear before sending the link.

${coveredToolCatalog(profileLinksToolContracts, {
  portal_link_create: true,
  mini_app_link_create: true,
})}
`,
});
