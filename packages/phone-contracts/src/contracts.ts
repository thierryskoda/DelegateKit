import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  toolOutputProperty,
  writeToolDescription,
  type ToolContract,
} from "@ai-assistants/tool-contracts";
import {
  phoneCallListInputSchema,
  phoneCallListOutputSchema,
  phoneCallReadinessInputSchema,
  phoneCallReadinessOutputSchema,
  phoneCallStartInputSchema,
  phoneCallStartOutputSchema,
  phoneCallStatusInputSchema,
  phoneCallStatusOutputSchema,
  phoneSmsListInputSchema,
  phoneSmsListOutputSchema,
  phoneSmsReadinessInputSchema,
  phoneSmsReadinessOutputSchema,
  phoneSmsSendInputSchema,
  phoneSmsSendOutputSchema,
  phoneSmsStatusInputSchema,
  phoneSmsStatusOutputSchema,
} from "./schemas";

export const PHONE_PLUGIN_ID = "phone-tools";

export const phoneToolContracts = [
  defineReadTool({
    name: "phone_call_readiness_get",
    pluginId: PHONE_PLUGIN_ID,
    label: "Get Outbound Call Readiness",
    description: readToolDescription({
      useWhen:
        "the user asks whether the assistant can place calls or before preparing any phone call",
      operation:
        "Checks whether required Twilio Voice settings and webhook configuration are available without placing a call",
      returns: "configuration readiness, current provider mode label, and concrete setup blockers",
    }),
    inputSchema: phoneCallReadinessInputSchema,
    outputSchema: phoneCallReadinessOutputSchema,
  }),
  defineWriteTool({
    name: "phone_call_start",
    pluginId: PHONE_PLUGIN_ID,
    label: "Start Outbound Call",
    description: writeToolDescription({
      useWhen:
        "the user explicitly approves one bounded phone call after destination and call brief are clear",
      operation:
        "Prepares or starts one approval-governed phone call attempt through the bounded repo-owned call surface",
      returns: `the ${toolOutputProperty(phoneCallStartOutputSchema, "write")} lifecycle status and attempt facts when started`,
      sideEffect: "may place a real phone call when provider readiness checks pass",
      safety:
        "requires verified E.164 US/Canada destination, explicit approval context, authorized facts, decision bounds, and stop conditions; never use for payments, credentials, MFA, medical/legal advice, or sensitive identity data",
    }),
    inputSchema: phoneCallStartInputSchema,
    outputSchema: phoneCallStartOutputSchema,
    externalAction: "phone.call.start",
    trustedChannelRequired: true,
  }),
  defineReadTool({
    name: "phone_sms_readiness_get",
    pluginId: PHONE_PLUGIN_ID,
    label: "Get SMS Readiness",
    description: readToolDescription({
      useWhen:
        "the user asks whether the assistant can send text messages or before preparing any SMS when setup is uncertain",
      operation:
        "Checks whether required Twilio messaging settings are configured without sending an SMS",
      returns: "configuration readiness, current provider mode label, and concrete setup blockers",
    }),
    inputSchema: phoneSmsReadinessInputSchema,
    outputSchema: phoneSmsReadinessOutputSchema,
  }),
  defineReadTool({
    name: "phone_call_status_get",
    pluginId: PHONE_PLUGIN_ID,
    label: "Get Outbound Call Status",
    description: readToolDescription({
      useWhen:
        "one phone call attempt needs current status or result facts, using either attemptId or the actionId returned by phone_call_start",
      operation:
        "Reads one bounded phone call attempt and syncs active live attempts with the voice provider when possible",
      returns: "call attempt status, provider id, safe summary, and failure facts",
    }),
    inputSchema: phoneCallStatusInputSchema,
    outputSchema: phoneCallStatusOutputSchema,
  }),
  defineReadTool({
    name: "phone_call_list",
    pluginId: PHONE_PLUGIN_ID,
    label: "List Phone",
    description: readToolDescription({
      useWhen: "recent phone call attempts need review",
      operation:
        "Lists recent bounded phone call attempts for this profile, optionally filtered to one attempt status",
      returns: "recent call attempts and statuses",
    }),
    inputSchema: phoneCallListInputSchema,
    outputSchema: phoneCallListOutputSchema,
  }),
  defineWriteTool({
    name: "phone_sms_send",
    pluginId: PHONE_PLUGIN_ID,
    label: "Send SMS",
    description: writeToolDescription({
      useWhen:
        "the user explicitly approves sending one bounded SMS, including as a fallback after a call fails or when replying to someone who texted the Twilio number",
      operation:
        "Prepares or sends one approval-governed SMS through the repo-owned Twilio messaging surface",
      returns: `the ${toolOutputProperty(phoneSmsSendOutputSchema, "write")} lifecycle status and SMS attempt facts when sent`,
      sideEffect: "may send a real SMS from the configured Twilio number when provider readiness checks pass",
      safety:
        "requires a US/Canada E.164 destination, exact approved body, clear purpose, and either public phone evidence or a prior inbound SMS MessageSid; never use for payments, credentials, MFA codes, medical/legal advice, or sensitive identity data",
    }),
    inputSchema: phoneSmsSendInputSchema,
    outputSchema: phoneSmsSendOutputSchema,
    externalAction: "phone.sms.send",
    trustedChannelRequired: true,
  }),
  defineReadTool({
    name: "phone_sms_status_get",
    pluginId: PHONE_PLUGIN_ID,
    label: "Get SMS Status",
    description: readToolDescription({
      useWhen:
        "one SMS attempt needs current status, using either attemptId or the actionId returned by phone_sms_send",
      operation:
        "Reads one bounded SMS attempt and syncs active live attempts with Twilio when possible",
      returns: "SMS attempt status, Twilio MessageSid, safe body preview, and failure facts",
    }),
    inputSchema: phoneSmsStatusInputSchema,
    outputSchema: phoneSmsStatusOutputSchema,
  }),
  defineReadTool({
    name: "phone_sms_list",
    pluginId: PHONE_PLUGIN_ID,
    label: "List SMS",
    description: readToolDescription({
      useWhen: "recent SMS attempts need review",
      operation:
        "Lists recent bounded SMS attempts for this profile, optionally filtered to one attempt status",
      returns: "recent SMS attempts and statuses",
    }),
    inputSchema: phoneSmsListInputSchema,
    outputSchema: phoneSmsListOutputSchema,
  }),
] as const satisfies readonly ToolContract[];

export type PhoneToolName = (typeof phoneToolContracts)[number]["name"];
