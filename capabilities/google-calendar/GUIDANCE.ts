import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { googleCalendarToolContracts } from "@ai-assistants/google-calendar-contracts/contracts";

export default definePluginGuidance({
  name: "google_calendar_tools",
  plugin: plugin("google-calendar"),
  description:
    "Load when the user asks about Google Calendar work: accounts, calendars, events, availability, free time, meeting creation, event updates, or cancellations.",
  body: md`
# Google Calendar Tools

Use Google Calendar tools when the user asks about their Google schedule, availability, meeting times, or calendar changes.

## Read a schedule (today, tomorrow, or any window)

- When multiple Google Calendar accounts may exist, use \`google_calendar_accounts_list\` and pass \`connectedAccountId\` on later calls.
- For the user's main calendar when they did not name one, call ${tool(googleCalendarToolContracts, "google_calendar_events_list")} with \`calendarId\` \`primary\`, plus \`timeMin\`, \`timeMax\`, and \`timeZone\` (for example \`America/Toronto\`).
- Call \`google_calendar_calendars_list\` only when you need a non-default calendar id before listing events.
- Use \`google_calendar_events_search\` only for Google Calendar text search with a \`query\`; do not use it instead of event listing for plain schedule review.
- For available meeting times, open slots, or scheduling proposals, use ${tool(googleCalendarToolContracts, "google_calendar_free_slots_find")} instead of manually inferring availability.
- Proposing slots is read-only and does not require the other attendee's email. If it is missing, propose concrete slots first, then ask for the email before creating or holding an event.
- Do not expose raw calendar API fields such as \`sendUpdates\`; explain attendee notification choices in plain language only when relevant.
- Convert returned UTC timestamps to the user's/profile timezone before writing local clock times.

${coveredToolCatalog(googleCalendarToolContracts, {
  google_calendar_accounts_list: true,
  google_calendar_calendars_list: true,
  google_calendar_events_list: true,
  google_calendar_event_get: true,
  google_calendar_freebusy_query: true,
  google_calendar_events_search: true,
  google_calendar_free_slots_find: true,
  google_calendar_event_create: true,
  google_calendar_event_update: true,
  google_calendar_event_cancel: true,
})}
`,
});
