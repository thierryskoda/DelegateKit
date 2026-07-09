import { defineGenericGuidance, md } from "@ai-assistants/guidance-authoring";

export default defineGenericGuidance({
  name: "message_presentation",
  description:
    "Load when a mobile-first reply may need compact presentation controls, ambiguity resolution, confirmations, approval-style choices, digest navigation, or callback tokens.",
  body: md`
# Message Presentation

Use the \`message\` tool's \`presentation\` field for compact mobile replies when controls reduce typing, ambiguity, or long text. Keep the visible \`message\` useful by itself; controls should make the next action easier, not hide the answer.

## When To Use

- Use presentations for choices, approve/reject or confirm/cancel decisions, yes/no questions, ambiguity resolution, next-step menus, drill-down sections, status summaries with actions, and dense briefs where details can wait for a tap.
- Use presentations for two to ten clear choices, such as sections, next actions, confirmation/cancel, or digest navigation.
- Keep the \`message\` field short and readable without the controls. Channels may render controls differently or degrade to text.
- Do not use provider-native button payloads such as Telegram \`reply_markup\`, \`callback_data\`, Slack blocks, Discord components, or Teams cards.
- Do not use presentations for simple one-line answers where controls add friction.
- Presentation controls do not bypass write or approval rules: before destructive or external writes, use the owning tool and required approval or trusted-channel boundary.

## Callback Values

- Button and select values are short callback tokens such as \`brief:headlines\`, \`approval:approve:abc123\`, or \`calendar:slot:slot_42\`.
- Tokens must be safe to show in logs and chat. Do not put secrets, JSON, URLs, local paths, credentials, or bulky provider payloads in token values.
- Treat callback-looking inbound text as meaningful only when it matches a recent presentation you sent or an active workflow context.
- A callback alone is not permission for destructive writes. Use the owning tool/workflow and existing approval or trusted-channel boundary before changing external state.

## Reply Shape

- Call the \`message\` tool with \`action: "send"\`, a short visible \`message\`, and a \`presentation\` object. Do not use \`message_send\`.
- The native \`tool_describe\` result may omit \`presentation\`; it is still a supported pass-through field on the \`message\` tool for portable controls.
- In chat summaries, do not use Markdown tables, ASCII tables, pipe-delimited rows, boxed layouts, or code blocks for summaries. Use short bullets or labeled lines; reserve code blocks for literal code, commands, logs, or copy-ready text.
- The portable presentation object uses \`title\`, \`tone\`, and \`blocks\`. Valid \`tone\` values are \`neutral\`, \`info\`, \`success\`, \`warning\`, and \`danger\`.
- Do not invent \`controls\`, \`components\`, \`reply_markup\`, \`callback\`, \`callback_data\`, \`action_id\`, or provider-native shapes.
- Buttons must be inside a \`{ type: "buttons", buttons: [...] }\` block, and each callback button uses \`label\` plus \`value\`. Do not put buttons directly at \`presentation.buttons\`.
- Invalid button examples: \`{ "text": "Approve", "callback": "deal:approve" }\` and \`{ "label": "Approve", "callback": "deal:approve" }\`.
- Valid button example: \`{ "label": "Approve", "value": "deal:approve" }\`.
- Do not use \`tone: "action"\`; use \`tone: "info"\` or omit \`tone\` for ordinary choices.
- Example:

~~~json
{
  "action": "send",
  "message": "Today's brief is ready.",
  "presentation": {
    "title": "Daily Brief",
    "tone": "info",
    "blocks": [
      { "type": "context", "text": "Three sections need attention." },
      {
        "type": "buttons",
        "buttons": [
          { "label": "Headlines", "value": "brief:headlines" },
          { "label": "Decisions", "value": "brief:decisions" },
          { "label": "Schedule", "value": "brief:schedule" }
        ]
      }
    ]
  }
}
~~~

- Prefer one compact title, optional one-line context, and one button row.
- Use labels that fit on a phone: one to three words is usually enough.
- For long answers, send a compact overview first, then use callbacks for sections the user taps.
  `,
});
