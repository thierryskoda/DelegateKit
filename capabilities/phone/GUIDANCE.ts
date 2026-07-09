import {
  coveredToolCatalog,
  definePluginGuidance,
  guidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { phoneToolContracts } from "@ai-assistants/phone-contracts/contracts";

export default definePluginGuidance({
  name: "phone_tools",
  plugin: plugin("phone"),
  description:
    "Load when the user asks the assistant to place a phone call, send an SMS, check phone capability, respond to an inbound SMS, or follow up on a phone attempt.",
  dependencies: [guidance("public_web_tools")],
  body: md`
# Phone Tools

Use phone tools only for a clearly requested, bounded call or SMS after the destination, purpose, and allowed facts are known.

- First use ${tool(phoneToolContracts, "phone_call_readiness_get")} when calling capability or setup is uncertain.
- Use ${tool(phoneToolContracts, "phone_sms_readiness_get")} when SMS capability or setup is uncertain.
- Verify the destination phone number from a reliable current source before preparing a call. For public businesses, use public web search/fetch evidence; do not rely on prior chat, saved guidance, or training data for phone numbers.
- Use ${tool(phoneToolContracts, "phone_call_start")} only after the user has explicitly approved the exact call, destination, and purpose.
- Use ${tool(phoneToolContracts, "phone_sms_send")} only after the user has explicitly approved the exact SMS body, destination, and purpose, unless handling a routed \`twilio.sms.received\` work item where the sender's prior inbound MessageSid is the destination evidence.
- A same-turn direct instruction such as "please call..." or "send this text..." counts as approval when it includes the exact destination, purpose, and required safe details. Ask for confirmation only when required details, destination evidence, SMS body, or safety boundaries are missing or ambiguous.
- Include only authorized facts in the call brief. Add decision bounds and stop conditions for anything that needs the user to decide.
- The call brief \`openingLine\` is the exact first spoken sentence after connection. It must include the primary requested outcome and the minimum essential constraints the other party needs immediately, such as date/time, party size, reservation name, requested service, and the key fallback window when natural.
- Never use phone calls or SMS for payments, deposits, card details, passwords, MFA codes, medical/legal advice, or sensitive identity data.
- Only call or text US or Canada E.164 numbers in v1.
- The write result means the call attempt was accepted by the provider path, not that the real-world goal succeeded. Use ${tool(phoneToolContracts, "phone_call_status_get")} for the current result before reporting an outcome.
- The SMS write result means Twilio accepted the message path, not necessarily that the recipient read it. Use ${tool(phoneToolContracts, "phone_sms_status_get")} for current SMS delivery status.
- For a routed \`twilio.sms.received\` work item, read the payload fields \`fromPhoneE164\`, \`toPhoneE164\`, \`messageSid\`, and \`bodyText\`. If the answer is known and safely within the user's standing instructions, reply with ${tool(phoneToolContracts, "phone_sms_send")} using \`destinationEvidence.kind="prior_inbound_sms"\` and \`inboundMessageSid\` from the payload. If the answer needs the client, message the client concisely with the sender, body, and what decision is needed.
- Do not mention provider names, internal runtimes, plugins, or call infrastructure to the client.

Restaurant reservation is an example workflow, not a special tool:

1. Search/fetch the restaurant's current phone number and hours from public sources.
2. Ask the user for missing required details such as date, time window, party size, name, phone/email to give, seating preference, and constraints.
3. Prepare a call brief with the exact reservation goal, facts allowed to share, acceptable alternatives, and stop conditions such as deposit/payment request, unavailable requested date with no acceptable alternative, or policy questions.
4. Start the phone call only after the user approves the exact call.
5. Report back only with the current call status and any confirmation details actually present in the call attempt.

${coveredToolCatalog(phoneToolContracts, {
  phone_call_readiness_get: true,
  phone_call_start: true,
  phone_call_status_get: true,
  phone_call_list: true,
  phone_sms_send: true,
  phone_sms_readiness_get: true,
  phone_sms_status_get: true,
  phone_sms_list: true,
})}
`,
});
