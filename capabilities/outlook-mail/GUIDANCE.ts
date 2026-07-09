import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { outlookMailToolContracts } from "@ai-assistants/outlook-mail-contracts/contracts";

export default definePluginGuidance({
  name: "outlook_mail_tools",
  plugin: plugin("outlook-mail"),
  description:
    "Load when the user asks about Outlook Mail or mailbox work: accounts, messages, attachments, sending, replying, forwarding, moving, marking read, or deleting.",
  body: md`
# Outlook Mail Tools

Use Outlook Mail tools when the user asks about their mailbox, Outlook Mail content, attachments, sends, replies, forwards, or mailbox organization.

- For \`outlook_mail.email.received\` work items with attachment metadata, use the payload \`outlookMessageId\` as \`messageId\` for ${tool(outlookMailToolContracts, "outlook_mail_attachment_save")} before saving or forwarding files.
- To verify whether a follow-up, reply, or send happened, use live Outlook Mail search/message evidence. CRM, Drive, signatures, profile activity, or prior chat are not enough.
- A found inbound message does not prove no one replied. Before saying no reply was sent, search sent mail, inspect the thread, or state that only inbound evidence was checked.

${coveredToolCatalog(outlookMailToolContracts, {
  outlook_mail_accounts_list: true,
  outlook_mail_messages_search: true,
  outlook_mail_message_get: true,
  outlook_mail_attachment_save: true,
  outlook_mail_message_send: true,
  outlook_mail_message_reply: true,
  outlook_mail_message_forward: true,
  outlook_mail_message_move: true,
  outlook_mail_message_mark_read: true,
  outlook_mail_message_delete: true,
})}
`,
});
