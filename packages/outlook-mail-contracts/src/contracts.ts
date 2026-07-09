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
  outlookMailAccountsListInputSchema,
  outlookMailAttachmentSaveInputSchema,
  outlookMailMessageDeleteInputSchema,
  outlookMailMessageForwardInputSchema,
  outlookMailMessageGetInputSchema,
  outlookMailMessageMarkReadInputSchema,
  outlookMailMessageMoveInputSchema,
  outlookMailMessageReplyInputSchema,
  outlookMailMessageSendInputSchema,
  outlookMailMessagesSearchInputSchema,
  outlookMailAccountsListOutputSchema,
  outlookMailAttachmentSaveOutputSchema,
  outlookMailMessageGetOutputSchema,
  outlookMailMessagesSearchOutputSchema,
  outlookMailProviderWriteOutputSchema,
} from "./schemas";

export const OUTLOOK_MAIL_PLUGIN_ID = "outlook-mail-tools";
const OUTLOOK_MAIL_MESSAGE_SEND_TOOL = "outlook_mail_message_send" as const;
const OUTLOOK_MAIL_MESSAGE_REPLY_TOOL = "outlook_mail_message_reply" as const;
const OUTLOOK_MAIL_MESSAGE_FORWARD_TOOL = "outlook_mail_message_forward" as const;

export const outlookMailToolContracts = [
  defineReadTool({
    name: "outlook_mail_accounts_list",
    pluginId: OUTLOOK_MAIL_PLUGIN_ID,
    label: "List Outlook Mail Accounts",
    description: readToolDescription({
      useWhen: "the agent needs configured Outlook Mail mailbox choices for this profile",
      operation:
        "Lists enabled Outlook Mail capability instances, including labels and connection health, without calling the provider",
      returns: "mailbox account metadata for choosing connectedAccountId",
      notes: ["Use this before mailbox reads or writes when multiple mailboxes may exist"],
    }),
    inputSchema: outlookMailAccountsListInputSchema,
    outputSchema: outlookMailAccountsListOutputSchema,
  }),
  defineReadTool({
    name: "outlook_mail_messages_search",
    pluginId: OUTLOOK_MAIL_PLUGIN_ID,
    label: "Search Messages",
    description: readToolDescription({
      useWhen: "the user needs mailbox messages found or listed from the connected provider",
      operation:
        "Searches or lists Outlook mailbox messages using Graph search text, folder selection, and pagination where supported",
      returns: "message summaries and pagination details",
      notes: [
        "When the user explicitly asks for an Outlook Mail or mailbox search, stay within Outlook Mail tools unless the user asks to broaden the search or an Outlook Mail result points to an attachment/file workflow",
        "Default search scope is the inbox folder unless folderId is set",
        "To include archive, junk, or trash, broaden explicitly with Outlook folderId values such as archive, junkemail, or deleteditems",
        "Use query for Outlook search text, folderId for another Outlook folder, and messagesPageCursor for additional pages",
        "For broad receipt, invoice, or accounting searches, search every relevant connectedAccountId and folder scope, follow messagesPageCursor until exhausted, and inspect likely hits with outlook_mail_message_get before claiming completeness",
      ],
    }),
    inputSchema: outlookMailMessagesSearchInputSchema,
    outputSchema: outlookMailMessagesSearchOutputSchema,
  }),
  defineReadTool({
    name: "outlook_mail_message_get",
    pluginId: OUTLOOK_MAIL_PLUGIN_ID,
    label: "Get Message",
    description: readToolDescription({
      useWhen: "exact Outlook Mail content, thread metadata, or attachment ids are needed",
      operation: "Reads one mailbox message by provider message id",
      returns: "message content, message metadata, thread metadata, and attachment metadata",
      notes: ["Use after outlook_mail_messages_search when the message id is not already known"],
    }),
    inputSchema: outlookMailMessageGetInputSchema,
    outputSchema: outlookMailMessageGetOutputSchema,
  }),
  defineWriteTool({
    name: "outlook_mail_attachment_save",
    pluginId: OUTLOOK_MAIL_PLUGIN_ID,
    label: "Save Attachment",
    description: writeToolDescription({
      useWhen:
        "an Outlook Mail attachment must be reused, delivered later, or passed to another tool",
      operation:
        "Downloads one Outlook Mail attachment and stores it as a bounded profile artifact for later delivery or provider/tool handoff",
      returns: "saved artifact metadata and safe failure details",
      notes: [
        "Use outlook_mail_accounts_list to pick connectedAccountId when multiple mailboxes are enabled",
      ],
      sideEffect: "creates a durable profile artifact but does not send the file by itself",
      safety: "the source message id and attachment id must identify the intended attachment",
    }),
    inputSchema: outlookMailAttachmentSaveInputSchema,
    outputSchema: outlookMailAttachmentSaveOutputSchema,
  }),
  defineWriteTool({
    name: OUTLOOK_MAIL_MESSAGE_SEND_TOOL,
    pluginId: OUTLOOK_MAIL_PLUGIN_ID,
    label: "Send Outlook Mail",
    description: writeToolDescription({
      useWhen: "the user wants to send a new outbound Outlook Mail message",
      operation: `Submits a new Outlook Mail message through the connected Outlook Mail provider with idempotency plus ${toolInputProperty(outlookMailMessageSendInputSchema, "profileFileIds")} ownership and ${toolInputProperty(outlookMailMessageSendInputSchema, "expectedProfileFileSha256ById")} checks for optional attachments`,
      returns: `the ${toolOutputProperty(outlookMailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      doNotUse: `replying to or forwarding an existing message; use ${OUTLOOK_MAIL_MESSAGE_REPLY_TOOL} or ${OUTLOOK_MAIL_MESSAGE_FORWARD_TOOL} instead`,
      sideEffect:
        "may send an Outlook Mail message or create an approval-governed Outlook Mail action",
      safety: `${toolInputProperty(outlookMailMessageSendInputSchema, "to")}, ${toolInputProperty(outlookMailMessageSendInputSchema, "subject")}, ${toolInputProperty(outlookMailMessageSendInputSchema, "bodyText")}, and attachment intent must be clear`,
    }),
    inputSchema: outlookMailMessageSendInputSchema,
    outputSchema: outlookMailProviderWriteOutputSchema,
    externalAction: "outlook_mail.message.send",
  }),
  defineWriteTool({
    name: OUTLOOK_MAIL_MESSAGE_REPLY_TOOL,
    pluginId: OUTLOOK_MAIL_PLUGIN_ID,
    label: "Reply To Message",
    description: writeToolDescription({
      useWhen: "the user wants to reply to an existing Outlook Mail message",
      operation: "Submits a reply through provider reply semantics for the existing message thread",
      returns: `the ${toolOutputProperty(outlookMailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      doNotUse: `sending a new standalone Outlook Mail message; use ${OUTLOOK_MAIL_MESSAGE_SEND_TOOL} instead`,
      notes: [
        "Outlook replies use provider-normal reply targeting from the original message",
        "Reply attachments are not supported",
      ],
      sideEffect:
        "may send an Outlook Mail reply or create an approval-governed Outlook Mail action",
      safety: "the source message and reply body must be clear",
    }),
    inputSchema: outlookMailMessageReplyInputSchema,
    outputSchema: outlookMailProviderWriteOutputSchema,
    externalAction: "outlook_mail.message.reply",
  }),
  defineWriteTool({
    name: OUTLOOK_MAIL_MESSAGE_FORWARD_TOOL,
    pluginId: OUTLOOK_MAIL_PLUGIN_ID,
    label: "Forward Message",
    description: writeToolDescription({
      useWhen: "the user wants to forward an existing Outlook Mail message",
      operation:
        "Forwards an existing provider message preview/snippet to new recipients, optionally with a short prepended comment",
      returns: `the ${toolOutputProperty(outlookMailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      doNotUse: `replying to the existing thread; use ${OUTLOOK_MAIL_MESSAGE_REPLY_TOOL} instead`,
      notes: [
        "Forward content is limited to the provider message preview/snippet, not the full original body",
        "Forward attachments are not supported",
      ],
      sideEffect:
        "may send a forwarded Outlook Mail message or create an approval-governed Outlook Mail action",
      safety: "the source message, recipients, and optional comment intent must be clear",
    }),
    inputSchema: outlookMailMessageForwardInputSchema,
    outputSchema: outlookMailProviderWriteOutputSchema,
    externalAction: "outlook_mail.message.forward",
  }),
  defineWriteTool({
    name: "outlook_mail_message_move",
    pluginId: OUTLOOK_MAIL_PLUGIN_ID,
    label: "Move Message",
    description: writeToolDescription({
      useWhen: "the user wants to move an Outlook Mail message to another Outlook folder",
      operation: "Moves one Outlook Mail message using Outlook folder semantics",
      returns: `the ${toolOutputProperty(outlookMailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      notes: ["Use an Outlook folder id from prior mailbox context or client guidance"],
      sideEffect: "may move a mailbox message or create an approval-governed Outlook Mail action",
      safety: "the exact message and destination folder must be clear",
    }),
    inputSchema: outlookMailMessageMoveInputSchema,
    outputSchema: outlookMailProviderWriteOutputSchema,
    externalAction: "outlook_mail.message.move",
  }),
  defineWriteTool({
    name: "outlook_mail_message_mark_read",
    pluginId: OUTLOOK_MAIL_PLUGIN_ID,
    label: "Mark Read/Unread",
    description: writeToolDescription({
      useWhen: "the user wants to mark an Outlook Mail message read or unread",
      operation: "Changes the read state for one provider mailbox message",
      returns: `the ${toolOutputProperty(outlookMailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      notes: ["Use isRead=true for read and isRead=false for unread"],
      sideEffect:
        "may update mailbox message state or create an approval-governed Outlook Mail action",
      safety: "the exact message and desired read state must be clear",
    }),
    inputSchema: outlookMailMessageMarkReadInputSchema,
    outputSchema: outlookMailProviderWriteOutputSchema,
    externalAction: "outlook_mail.message.mark_read",
  }),
  defineWriteTool({
    name: "outlook_mail_message_delete",
    pluginId: OUTLOOK_MAIL_PLUGIN_ID,
    label: "Delete Message",
    description: writeToolDescription({
      useWhen: "the user wants to delete or trash an Outlook Mail message",
      operation:
        "Deletes or trashes one Outlook Mail message using provider-specific deletion semantics",
      returns: `the ${toolOutputProperty(outlookMailProviderWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      sideEffect: "may remove a mailbox message or create an approval-governed Outlook Mail action",
      safety: "the exact message must be confirmed because this is a destructive mailbox write",
    }),
    inputSchema: outlookMailMessageDeleteInputSchema,
    outputSchema: outlookMailProviderWriteOutputSchema,
    externalAction: "outlook_mail.message.delete",
  }),
] as const satisfies readonly ToolContract[];

export type OutlookMailToolName = (typeof outlookMailToolContracts)[number]["name"];
