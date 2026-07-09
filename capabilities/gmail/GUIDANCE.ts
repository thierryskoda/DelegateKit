import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { gmailToolContracts } from "@ai-assistants/gmail-contracts/contracts";

export default definePluginGuidance({
  name: "gmail_tools",
  plugin: plugin("gmail"),
  description:
    "Load when the user asks about gmail or mailbox work: accounts, messages, attachments, sending, replying, forwarding, moving, marking read, or deleting.",
  body: md`
# Gmail Tools

Use Gmail tools when the user asks about their mailbox, Gmail content, attachments, sends, replies, forwards, or mailbox organization.

- For \`gmail.email.received\` work items with attachment metadata, use the payload \`gmailMessageId\` as \`messageId\` for ${tool(gmailToolContracts, "gmail_attachment_save")} before saving or forwarding files.
- Default ${tool(gmailToolContracts, "gmail_messages_search")} results are lightweight summaries. \`attachments: []\` is authoritative only when \`attachmentMetadataIncluded=true\`.
- When attachment presence matters, search with \`includeAttachmentMetadata=true\` or inspect the selected message with ${tool(gmailToolContracts, "gmail_message_get")} before saying there are no attachments.
- To verify whether a follow-up, reply, or send happened, use live Gmail search/message evidence. CRM, Drive, signatures, profile activity, or prior chat are not enough.
- A found inbound message does not prove no one replied. Before saying no reply was sent, search sent mail, inspect the thread, or state that only inbound evidence was checked.
- When using ${tool(gmailToolContracts, "gmail_accounts_list")} before another Gmail call, pass the returned \`connectedAccountId\` field exactly as \`connectedAccountId\`; do not rename it to \`accountId\`.

${coveredToolCatalog(gmailToolContracts, {
  gmail_accounts_list: true,
  gmail_messages_search: true,
  gmail_message_get: true,
  gmail_attachment_save: true,
  gmail_message_send: true,
  gmail_message_reply: true,
  gmail_message_forward: true,
  gmail_message_move: true,
  gmail_message_mark_read: true,
  gmail_message_delete: true,
})}
`,
});
