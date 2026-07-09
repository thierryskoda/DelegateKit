import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { outlookCalendarToolContracts } from "@ai-assistants/outlook-calendar-contracts/contracts";

export default definePluginGuidance({
  name: "outlook_calendar_tools",
  plugin: plugin("outlook-calendar"),
  description:
    "Load when the user asks about Outlook Calendar work: accounts, calendars, events, availability, free time, meeting creation, event updates, or cancellations.",
  body: md`
# Outlook Calendar Tools

Use Outlook Calendar tools when the user asks about their Outlook schedule, availability, meeting times, or calendar changes.

## Read a schedule (today, tomorrow, or any window)

- When multiple Outlook Calendar accounts may exist, use \`outlook_calendar_accounts_list\` and pass \`connectedAccountId\` on later calls.
- For the user's main calendar when they did not name one, call ${tool(outlookCalendarToolContracts, "outlook_calendar_events_list")} with \`calendarId\` \`primary\`, plus \`timeMin\`, \`timeMax\`, and \`timeZone\` (for example \`America/Toronto\`).
- Call \`outlook_calendar_calendars_list\` only when you need a non-default calendar id before listing events.
- Use bounded event listing for schedule review. Outlook Calendar does not expose a separate text-search tool in this profile.

${coveredToolCatalog(outlookCalendarToolContracts, {
  outlook_calendar_accounts_list: true,
  outlook_calendar_calendars_list: true,
  outlook_calendar_events_list: true,
  outlook_calendar_event_get: true,
  outlook_calendar_freebusy_query: true,
  outlook_calendar_free_slots_find: true,
  outlook_calendar_event_create: true,
  outlook_calendar_event_update: true,
  outlook_calendar_event_cancel: true,
})}
`,
});
