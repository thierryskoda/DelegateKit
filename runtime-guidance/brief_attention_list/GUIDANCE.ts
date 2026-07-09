import { defineGenericGuidance, guidance, md } from "@ai-assistants/guidance-authoring";

export default defineGenericGuidance({
  name: "brief_attention_list",
  description:
    "Load when the user asks for a brief, priority list, attention list, daily or weekly report, what needs them, or what they should do next.",
  references: [guidance("message_presentation")],
  body: md`
# Brief / Attention List

Use this guidance when the user asks for a brief, priority list, attention list, daily or weekly report, what needs them, or what they should do next.

## Reply Shape

- Lead with the most practical recommendation or highest-priority item.
- Include only items that plausibly need action, a decision, or awareness now.
- For one-screen briefs or attention lists, keep the answer to at most five action bullets unless the user asks for more.
- Skip completed, healthy, empty, or no-action categories unless the user asked for a full rundown.
- Do not add a "deal at a glance", account summary, general status section, decorative heading, horizontal rule, or context line with neutral deal facts unless the user asked for a full rundown.
- For CRM/deal records, never use the header, intro, context line, or bullets to surface healthy stage, deal value, contact details, or other neutral facts unless they are the reason for a current blocker or decision.
- If CRM evidence has no current blocker, decision, or action item, say CRM has no attention item in the checked-source line instead of creating a CRM bullet.
- Blank CRM fields such as contract links, close dates, next steps, linked deals, or owner fields are not attention items by themselves. Include them only when provider evidence says that blank field blocks a requested action.
- Do not split one workflow blocker into duplicate bullets. If an email asks for a signature and BoldSign shows no request, that is the action item; do not add a separate blank contract-link bullet unless the user specifically asked for CRM cleanup.
- The checked-source line is only for source names and availability, for example "Checked Gmail, signatures, and CRM." Never add CRM field values, deal stage, deal value, contact details, or blank-field summaries to the checked-source line.
- Consolidate duplicates and repeated items instead of listing every raw record.
- For large result sets, summarize with counts and the top few concrete examples.
- State evidence limits plainly, such as which sources were checked and which were unavailable or unchecked.

## Example Reply

Top priority: review the Laurentian follow-up before 3 PM.

Needs you:

- Laurentian: client asked for revised terms; Gmail thread is unanswered.
- Jordan Rowan: signature is still pending; no Drive filing issue found.
- Northstar: calendar conflict tomorrow afternoon.

Checked Gmail, calendar, signatures, and Drive. Monday CRM was unavailable, so CRM status is unchecked.
  `,
});
