import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { publicWebToolContracts } from "@ai-assistants/public-web-contracts/contracts";

export default definePluginGuidance({
  name: "public_web_tools",
  plugin: plugin("public-web"),
  description:
    "Load when the user asks for public web research, a known public URL, page extraction, screenshots, or preparing a website action.",
  body: md`
# Public Web Tools

Use the lightest public web tool that fits the job:

- Use ${tool(publicWebToolContracts, "public_web_search")} for public discovery, current facts, news, prices, product details, public docs, laws, schedules, and source evidence.
- Use ${tool(publicWebToolContracts, "public_web_fetch_url")} when you already know the exact public URL and need direct page inspection.
- Use browser tools for interactive pages, authenticated pages, screenshots, location-personalized pages, carts/forms, or site-specific workflows that search/fetch cannot see.
- Prefer public read tools before browser automation. Prefer read-only browser extraction before preparing a website action.
- Keep browser starts narrow: explicit HTTPS URLs, allowed domains, concrete objectives, small extraction schemas, and named fields.
- For heavy interactive sites, start with the smallest useful read/extract request before preparing an action.
- If a browser task times out, retry at most once with a smaller objective, fewer fields, or fewer interactions.
- Do not replace site-specific, account, cart, logged-in, location-personalized, or live workflow evidence with public search unless the user asks or agrees after a browser blocker.
- Explain missing setup, rate limits, blocked/inaccessible URLs, partial content, login, MFA, captcha, or unsupported access plainly.
- For authenticated sites, use saved browser auth contexts when the user expects that login to be available.
- If setup or preparation needs login, MFA, captcha, or credential entry, use handoff tools. Never ask for passwords, MFA codes, captchas, full card numbers, or CVC in chat.
- Never submit purchases, payments, bookings, messages, legal forms, account changes, or irreversible actions. Prepare the cart/form/selection and stop before final confirmation.
- Do not mention internal platform names, automation vendors, provider sessions, task-state internals, or implementation details to clients.

${coveredToolCatalog(publicWebToolContracts, {
  public_web_search: true,
  public_web_fetch_url: true,
  public_web_browser_extract_start: true,
  public_web_browser_task_get: true,
  public_web_browser_auth_contexts_list: true,
  public_web_browser_task_cancel: true,
  public_web_browser_auth_context_setup_start: true,
  public_web_browser_task_continue: true,
  public_web_browser_auth_context_delete: true,
  public_web_browser_live_handoff_start: true,
  public_web_browser_action_prepare_start: true,
})}
`,
});
