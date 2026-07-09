import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  toolInputProperty,
  toolOutputProperty,
  writeToolDescription,
  type ToolContract,
} from "@ai-assistants/tool-contracts";
import {
  gmailAccountsListInputSchema,
  gmailAttachmentSaveInputSchema,
  gmailMessageDeleteInputSchema,
  gmailMessageForwardInputSchema,
  gmailMessageGetInputSchema,
  gmailMessageMarkReadInputSchema,
  gmailMessageMoveInputSchema,
  gmailMessageReplyInputSchema,
  gmailMessageSendInputSchema,
  gmailMessagesSearchInputSchema,
  gmailAccountsListOutputSchema,
  gmailAttachmentSaveOutputSchema,
  gmailMessageGetOutputSchema,
  gmailMessagesSearchOutputSchema,
  gmailProviderWriteOutputSchema,
} from "./schemas";

export const GMAIL_PLUGIN_ID = "gmail-tools";
const GMAIL_MESSAGE_SEND_TOOL = "gmail_message_send" as const;
const GMAIL_MESSAGE_REPLY_TOOL = "gmail_message_reply" as const;
const GMAIL_MESSAGE_FORWARD_TOOL = "gmail_message_forward" as const;

export const gmailToolContracts = [
  defineReadTool({
    name: "gmail_accounts_list",
    pluginId: GMAIL_PLUGIN_ID,
    label: "List Gmail Accounts",
    description: readToolDescription({
      useWhen: "the agent needs configured Gmail mailbox choices for this profile",
      operation:
        "Lists enabled Gmail capability instances, including labels and connection health, without calling the provider",
      returns: "mailbox account metadata for choosing connectedAccountId",
      notes: ["Use this before mailbox reads or writes when multiple mailboxes may exist"],
    }),
    inputSchema: gmailAccountsListInputSchema,
    outputSchema: gmailAccountsListOutputSchema,
  }),
  defineReadTool({
    name: "gmail_messages_search",
    pluginId: GMAIL_PLUGIN_ID,
    label: "Search Messages",
    description: readToolDescription({
      useWhen: "the user needs mailbox messages found or listed from the connected provider",
      operation:
        "Searches or lists Gmail messages using Gmail search syntax and pagination; by default this uses lightweight summary hydration",
      returns:
        "message summaries, whether attachment metadata was fully loaded, and pagination details",
      notes: [
        "When the user explicitly asks for a Gmail or mailbox search, stay within Gmail tools unless the user asks to broaden the search or a Gmail result points to an attachment/file workflow",
        "Omit query to list recent mailbox messages; default search scope excludes spam and trash",
        "To include spam or trash, broaden explicitly with Gmail query operators such as in:anywhere, in:spam, or in:trash",
        "Use query for Gmail search and messagesPageCursor for additional pages",
        "messagesPageCursor should be the previous gmail_messages_search result's nextCursor. limit is an alias for maxResults; if both are supplied, they must match.",
        "Do not pass an `in` field; mailbox scopes such as in:sent, in:anywhere, in:spam, and in:trash belong inside query.",
        "Do not pass `after`, `before`, `fromDate`, `toDate`, or other date fields; date constraints belong inside query using Gmail operators such as after:2026/5/1 before:2026/6/1 or newer_than:30d.",
        "Auth expiry, quota, setup, and provider-limit failures are returned structurally; do not treat them as empty result sets.",
        "Default search summaries do not authoritatively prove whether attachments exist; call with includeAttachmentMetadata=true for focused attachment-aware searches, or call gmail_message_get on selected messages before saying a message has no attachments",
        "When the user asks for unread or pending mail from CRM contacts, first get the CRM contact email addresses from the CRM provider, then search Gmail with exact from:/to:/thread queries for those addresses. A generic is:unread inbox search is not enough to claim CRM-contact mailbox coverage.",
        "Do not treat a sender as a CRM contact merely because they appear in Gmail, signatures, files, or another provider; CRM-contact scope requires CRM evidence such as a matching contact row, email column, or selected CRM record.",
        "For broad receipt, invoice, or accounting searches, search every relevant connectedAccountId, use date and keyword query variants, follow messagesPageCursor until exhausted, and inspect likely hits with gmail_message_get before claiming completeness",
        "A found inbound message does not prove no one replied. Before saying no reply or follow-up was sent, search sent mail by exact recipient/sender email address or inspect the thread; an empty display-name-only sent search is insufficient.",
        "For deal/client follow-up status checks, use the CRM contact email when available, for example `in:sent to:client@example.com`, or inspect the known Gmail thread before making a negative follow-up claim. If you only searched a display name, say the follow-up is not verified instead of saying no reply was sent.",
      ],
    }),
    inputSchema: gmailMessagesSearchInputSchema,
    outputSchema: gmailMessagesSearchOutputSchema,
  }),
  defineReadTool({
    name: "gmail_message_get",
    pluginId: GMAIL_PLUGIN_ID,
    label: "Get Message",
    description: readToolDescription({
      useWhen: "exact Gmail content, thread metadata, or attachment ids are needed",
      operation: "Reads one mailbox message by provider message id",
      returns: "message content, message metadata, thread metadata, and attachment metadata",
      notes: [
        "Use after gmail_messages_search when the message id is not already known",
        "Use this before saving, forwarding, describing, or denying attachments unless the search result has attachmentMetadataIncluded=true",
        "The returned bodyText can be truncated; check bodyTruncated before claiming you saw the complete body or before using bodyText as complete outbound content.",
        "Auth expiry, quota, setup, and provider-limit failures are returned structurally; do not treat them as missing messages.",
      ],
    }),
    inputSchema: gmailMessageGetInputSchema,
    outputSchema: gmailMessageGetOutputSchema,
  }),
  defineWriteTool({
    name: "gmail_attachment_save",
    pluginId: GMAIL_PLUGIN_ID,
    label: "Save Attachment",
    description: writeToolDescription({
      useWhen: "a Gmail attachment must be reused, delivered later, or passed to another tool",
      operation:
        "Downloads one Gmail attachment and stores it as a bounded profile artifact for later delivery or provider/tool handoff",
      returns: "saved artifact metadata and safe failure details",
      notes: [
        "Use gmail_accounts_list to pick connectedAccountId when multiple mailboxes are enabled",
      ],
      sideEffect:
        "creates an internal durable profile artifact from Gmail attachment bytes but does not send the file by itself",
      safety: "the source message id and attachment id must identify the intended attachment",
    }),
    inputSchema: gmailAttachmentSaveInputSchema,
    outputSchema: gmailAttachmentSaveOutputSchema,
  }),
  defineWriteTool({
    name: GMAIL_MESSAGE_SEND_TOOL,
    pluginId: GMAIL_PLUGIN_ID,
    label: "Send Gmail",
    description: writeToolDescription({
      useWhen: "the user wants to send a new outbound Gmail message",
      operation: `Submits a new Gmail message through the connected Gmail provider with idempotency plus ${toolInputProperty(gmailMessageSendInputSchema, "profileFileIds")} ownership and ${toolInputProperty(gmailMessageSendInputSchema, "expectedProfileFileSha256ById")} checks for optional attachments`,
      returns: `the ${toolOutputProperty(gmailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      doNotUse: `replying to or forwarding an existing message; use ${GMAIL_MESSAGE_REPLY_TOOL} or ${GMAIL_MESSAGE_FORWARD_TOOL} instead`,
      notes: [
        "Use [] for cc, bcc, and profileFileIds when none are needed; use {} for expectedProfileFileSha256ById when there are no attachments",
        "Use threadId only for a new standalone message that should be placed in an existing Gmail thread; use gmail_message_reply for normal replies.",
      ],
      sideEffect: "may send a Gmail message or create an approval-governed Gmail action",
      safety: `${toolInputProperty(gmailMessageSendInputSchema, "to")}, ${toolInputProperty(gmailMessageSendInputSchema, "subject")}, ${toolInputProperty(gmailMessageSendInputSchema, "bodyText")}, and attachment intent must be clear`,
    }),
    inputSchema: gmailMessageSendInputSchema,
    outputSchema: gmailProviderWriteOutputSchema,
    externalAction: "gmail.message.send",
  }),
  defineWriteTool({
    name: GMAIL_MESSAGE_REPLY_TOOL,
    pluginId: GMAIL_PLUGIN_ID,
    label: "Reply To Message",
    description: writeToolDescription({
      useWhen: "the user wants to reply to an existing Gmail message",
      operation: "Submits a reply through provider reply semantics for the existing message thread",
      returns: `the ${toolOutputProperty(gmailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      doNotUse: `sending a new standalone Gmail message; use ${GMAIL_MESSAGE_SEND_TOOL} instead`,
      notes: [
        "Use [] for cc and bcc when no copied recipients are needed",
        "Omit explicit recipients for Gmail-normal reply targeting, or provide to/cc/bcc when the reply recipients must be overridden",
        "Reply attachments are not supported",
      ],
      sideEffect: "may send a Gmail reply or create an approval-governed Gmail action",
      safety: "the source message and reply body must be clear",
    }),
    inputSchema: gmailMessageReplyInputSchema,
    outputSchema: gmailProviderWriteOutputSchema,
    externalAction: "gmail.message.reply",
  }),
  defineWriteTool({
    name: GMAIL_MESSAGE_FORWARD_TOOL,
    pluginId: GMAIL_PLUGIN_ID,
    label: "Forward Message",
    description: writeToolDescription({
      useWhen:
        "the user wants to send a lightweight snippet preview of an existing Gmail message to new recipients",
      operation:
        "Sends a new plain-text Gmail message with an optional comment, a forwarded-message marker, and only the source message snippet; it does not preserve the full body or original subject",
      returns: `the ${toolOutputProperty(gmailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      doNotUse: `replying to the existing thread; use ${GMAIL_MESSAGE_REPLY_TOOL} instead. Do not use when recipients need the full original message body or attachments; these Gmail tools can send only a snippet preview, a composed summary, and saved attachments, not a native full-body forward.`,
      notes: [
        "Use [] for cc and bcc when none are needed",
        "Forward attachments are not supported",
        "The outbound subject is synthetic and based on the source message id",
      ],
      sideEffect:
        "may send a Gmail snippet-preview message or create an approval-governed Gmail action",
      safety: "the source message, recipients, and optional comment intent must be clear",
    }),
    inputSchema: gmailMessageForwardInputSchema,
    outputSchema: gmailProviderWriteOutputSchema,
    externalAction: "gmail.message.forward",
  }),
  defineWriteTool({
    name: "gmail_message_move",
    pluginId: GMAIL_PLUGIN_ID,
    label: "Move Message",
    description: writeToolDescription({
      useWhen: "the user wants to move a Gmail message to another label",
      operation: "Moves one Gmail message using Gmail label semantics",
      returns: `the ${toolOutputProperty(gmailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      notes: ["Use a known Gmail label id from prior mailbox context or client guidance"],
      sideEffect: "may move a mailbox message or create an approval-governed Gmail action",
      safety: "the exact message and destination Gmail label id must be clear",
    }),
    inputSchema: gmailMessageMoveInputSchema,
    outputSchema: gmailProviderWriteOutputSchema,
    externalAction: "gmail.message.move",
  }),
  defineWriteTool({
    name: "gmail_message_mark_read",
    pluginId: GMAIL_PLUGIN_ID,
    label: "Mark Read/Unread",
    description: writeToolDescription({
      useWhen: "the user wants to mark a Gmail message read or unread",
      operation: "Changes the read state for one provider mailbox message",
      returns: `the ${toolOutputProperty(gmailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      notes: ["Use isRead=true for read and isRead=false for unread"],
      sideEffect: "may update mailbox message state or create an approval-governed Gmail action",
      safety: "the exact message and desired read state must be clear",
    }),
    inputSchema: gmailMessageMarkReadInputSchema,
    outputSchema: gmailProviderWriteOutputSchema,
    externalAction: "gmail.message.mark_read",
  }),
  defineWriteTool({
    name: "gmail_message_delete",
    pluginId: GMAIL_PLUGIN_ID,
    label: "Delete Message",
    description: writeToolDescription({
      useWhen: "the user wants to delete or trash a Gmail message",
      operation: "Deletes or trashes one Gmail message using provider-specific deletion semantics",
      returns: `the ${toolOutputProperty(gmailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      sideEffect: "may remove a mailbox message or create an approval-governed Gmail action",
      safety: "the exact message must be confirmed because this is a destructive mailbox write",
    }),
    inputSchema: gmailMessageDeleteInputSchema,
    outputSchema: gmailProviderWriteOutputSchema,
    externalAction: "gmail.message.delete",
  }),
] as const satisfies readonly ToolContract[];

export type GmailToolName = (typeof gmailToolContracts)[number]["name"];
