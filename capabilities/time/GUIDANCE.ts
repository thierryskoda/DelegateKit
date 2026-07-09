import { coveredToolCatalog, definePluginGuidance, md, plugin } from "@ai-assistants/guidance-authoring";
import { timeToolContracts } from "@ai-assistants/time-contracts/contracts";

export default definePluginGuidance({
  name: "time",
  plugin: plugin("time"),
  description:
    "Load when a reply, provider query, date range, billing period, or relative date depends on the profile timezone.",
  body: md`
# Time

Use time resolution before making user-visible claims or provider searches involving today, yesterday, tomorrow, local dates, months, or UTC timestamps.

- Resolve local civil date ranges before provider timestamp searches.
- Do not treat UTC calendar boundaries as the user's local day or month.

${coveredToolCatalog(timeToolContracts, { time_resolve: true })}
`,
});
