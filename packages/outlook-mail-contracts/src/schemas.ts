import { profileActionWriteToolDataSchema } from "@ai-assistants/actions-contracts/schemas";
import {
  providerAccountsListOutputSchema,
  providerSavedArtifactOutputSchema,
  stringField,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";

export const outlookMailOptionalConnectedAccountIdSchema = z
  .string()
  .trim()
  .uuid()
  .describe(
    "Connected provider account id from outlook_mail_accounts_list when multiple Outlook mailboxes match. Do not use profile_context_get capability instance ids for this field.",
  )
  .optional();

const outlookMailAddressList = (description: string, max: number) =>
  z.array(z.string().trim().email().describe("Email address.")).max(max).describe(description);
const optionalOutlookMailAddressList = (description: string, max: number) =>
  z
    .array(z.string().trim().email().describe("Email address."))
    .max(max)
    .default([])
    .describe(description);
const expectedArtifactHashByIdSchema = z.record(
  z.string().trim().uuid(),
  z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/),
);
const outlookMailMessageSearchMaxResultsSchema = z.number().int().min(1).max(100);

export const outlookMailAccountsListInputSchema = z.object({}).strict();

export const outlookMailMessagesSearchInputSchema = z
  .object({
    connectedAccountId: outlookMailOptionalConnectedAccountIdSchema,
    query: stringField(
      "Outlook Microsoft Graph search text. Default scope uses the inbox folder unless folderId selects another folder.",
    ).optional(),
    maxResults: outlookMailMessageSearchMaxResultsSchema
      .optional()
      .describe("Maximum messages to return. Defaults to 25."),
    limit: outlookMailMessageSearchMaxResultsSchema
      .optional()
      .describe("Alias for maxResults when the agent naturally thinks in result limits."),
    messagesPageCursor: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Outlook pagination cursor from a previous outlook_mail_messages_search result."),
    folderId: stringField(
      "Outlook mail folder id (default inbox). Use well-known ids such as archive, junkemail, or deleteditems to search archive, junk, or trash.",
    ).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.maxResults !== undefined && val.limit !== undefined && val.maxResults !== val.limit) {
      ctx.addIssue({
        code: "custom",
        path: ["limit"],
        message: "limit must match maxResults when both are provided.",
      });
    }
  });

export const outlookMailMessageGetInputSchema = z
  .object({
    connectedAccountId: outlookMailOptionalConnectedAccountIdSchema,
    messageId: stringField("Provider message id."),
  })
  .strict();

export const outlookMailAttachmentSaveInputSchema = z
  .object({
    connectedAccountId: outlookMailOptionalConnectedAccountIdSchema,
    messageId: stringField("Provider message id containing the attachment."),
    attachmentId: stringField("Provider attachment id."),
    filename: stringField("Stored artifact filename.").optional(),
  })
  .strict();

export const outlookMailMessageSendInputSchema = z
  .object({
    connectedAccountId: outlookMailOptionalConnectedAccountIdSchema,
    to: outlookMailAddressList("Primary recipients for the outbound email.", 50).min(1),
    cc: optionalOutlookMailAddressList("CC recipients for the outbound email.", 50),
    bcc: optionalOutlookMailAddressList("BCC recipients for the outbound email.", 50),
    subject: stringField("Email subject."),
    bodyText: stringField("Plain text email body."),
    profileFileIds: z
      .array(z.string().trim().uuid().describe("Backend profile file id to attach."))
      .max(10)
      .default([])
      .describe("Profile files to attach to the outbound email."),
    expectedProfileFileSha256ById: expectedArtifactHashByIdSchema
      .default({})
      .describe(
        "Optional stale-file protection map keyed by profile file id; keys must also appear in profileFileIds.",
      ),
  })
  .strict()
  .superRefine((val, ctx) => {
    const profileFileIds = new Set(val.profileFileIds);
    for (const profileFileId of Object.keys(val.expectedProfileFileSha256ById)) {
      if (!profileFileIds.has(profileFileId)) {
        ctx.addIssue({
          code: "custom",
          path: ["expectedProfileFileSha256ById", profileFileId],
          message: "Expected profile file hashes must reference a profile file id in profileFileIds.",
        });
      }
    }
  });

export const outlookMailMessageReplyInputSchema = z
  .object({
    connectedAccountId: outlookMailOptionalConnectedAccountIdSchema,
    replyToMessageId: stringField("Provider message id to reply to."),
    bodyText: stringField("Plain text reply body."),
  })
  .strict();

export const outlookMailMessageForwardInputSchema = z
  .object({
    connectedAccountId: outlookMailOptionalConnectedAccountIdSchema,
    forwardMessageId: stringField("Provider message id to forward."),
    to: outlookMailAddressList("Primary recipients for the forwarded email.", 50).min(1),
    cc: optionalOutlookMailAddressList("CC recipients for the forwarded email.", 50),
    bcc: optionalOutlookMailAddressList("BCC recipients for the forwarded email.", 50),
    additionalComment: stringField("Optional short comment to prepend.").optional(),
  })
  .strict();

export const outlookMailMessageMoveInputSchema = z
  .object({
    connectedAccountId: outlookMailOptionalConnectedAccountIdSchema,
    messageId: stringField("Provider message id."),
    destinationMailboxId: stringField("Destination Outlook folder id."),
  })
  .strict();

export const outlookMailMessageMarkReadInputSchema = z
  .object({
    connectedAccountId: outlookMailOptionalConnectedAccountIdSchema,
    messageId: stringField("Provider message id."),
    isRead: z.boolean().describe("true marks the message read; false marks it unread."),
  })
  .strict();

export const outlookMailMessageDeleteInputSchema = z
  .object({
    connectedAccountId: outlookMailOptionalConnectedAccountIdSchema,
    messageId: stringField("Provider message id to delete or move to trash (provider-specific)."),
  })
  .strict();

export const outlookMailProviderSchema = z.literal("outlook-mail");

export const outlookMailAddressSchema = z
  .object({
    name: z.string().trim().min(1).nullable().describe("Display name for this email address."),
    email: z
      .string()
      .trim()
      .email()
      .describe("Email address.")
      .meta({ examples: ["client@example.com"] }),
  })
  .strict()
  .describe("Email mailbox identity.");

export const outlookMailAttachmentSummarySchema = z
  .object({
    id: z.string().trim().min(1).describe("Provider attachment id."),
    filename: z.string().trim().min(1).nullable().describe("Attachment filename."),
    mimeType: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Attachment MIME type.")
      .meta({ examples: ["application/pdf"] }),
    byteSize: z.number().int().nonnegative().nullable().describe("Attachment size in bytes."),
  })
  .strict()
  .describe("Email attachment summary.");

export const outlookMailMessageDetailSchema = z
  .object({
    id: z.string().trim().min(1).describe("Provider message id."),
    threadId: z.string().trim().min(1).nullable().describe("Provider thread id, when available."),
    provider: outlookMailProviderSchema.describe("Email provider backing this message."),
    from: outlookMailAddressSchema.nullable().describe("Sender mailbox identity, when available."),
    to: z.array(outlookMailAddressSchema).describe("Primary recipient mailbox identities."),
    cc: z.array(outlookMailAddressSchema).describe("CC recipient mailbox identities."),
    bcc: z.array(outlookMailAddressSchema).describe("BCC recipient mailbox identities."),
    subject: z.string().trim().min(1).nullable().describe("Email subject."),
    sentAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe(
        "Timestamp when the email was sent, when available. Convert offset/Z timestamps before telling the client a local date or time.",
      )
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    receivedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe(
        "Timestamp when the email was received, when available. Convert offset/Z timestamps before telling the client a local date or time.",
      )
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    snippet: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Provider-supplied message preview text."),
    bodyText: z.string().nullable().describe("Plain text email body, when available."),
    bodyTruncated: z
      .boolean()
      .describe("Whether bodyText was truncated and may not contain the full email body."),
    attachments: z
      .array(outlookMailAttachmentSummarySchema)
      .describe("Attachments on this message."),
    labels: z.array(z.string().trim().min(1)).describe("Provider labels or folder markers."),
    canReply: z.boolean().describe("Whether this message can be used as a reply target."),
  })
  .strict()
  .describe("Email message normalized for assistant use.");

export type OutlookMailMessageDetail = z.infer<typeof outlookMailMessageDetailSchema>;

/** Event facts stored on `outlook_mail.email.received` assistant work items (`profileWorkItemDto.event`). */
export const outlookMailEmailReceivedEventSchema = z
  .object({
    provider: outlookMailProviderSchema.describe("Email provider backing this inbound event."),
    outlookMessageId: z
      .string()
      .trim()
      .min(1)
      .describe("Provider message id for this inbound email."),
    conversationId: z.string().trim().min(1).nullable().describe("Provider conversation id."),
    connectedProviderAccountId: z
      .string()
      .trim()
      .uuid()
      .describe("Connected provider account that received this email."),
    capabilityAccountLinkId: z
      .string()
      .trim()
      .uuid()
      .describe("Capability account link for the mailbox that received this email."),
    accountEmail: z
      .string()
      .email()
      .nullable()
      .describe("Mailbox email address that received this message."),
    graphSubscriptionId: z
      .string()
      .trim()
      .min(1)
      .describe("Microsoft Graph subscription id that delivered this notification."),
    from: outlookMailAddressSchema.nullable().describe("Sender mailbox identity, when available."),
    to: z.array(outlookMailAddressSchema).describe("Primary recipient mailbox identities."),
    cc: z.array(outlookMailAddressSchema).describe("CC recipient mailbox identities."),
    bcc: z.array(outlookMailAddressSchema).describe("BCC recipient mailbox identities."),
    subject: z.string().trim().min(1).nullable().describe("Email subject."),
    snippet: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Provider-supplied message preview text."),
    bodyText: z.string().nullable().describe("Plain text email body, when available."),
    bodyTruncated: z
      .boolean()
      .describe("Whether bodyText was truncated and may not contain the full email body."),
    receivedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe(
        "Timestamp when the email was received, when available. Convert offset/Z timestamps before telling the client a local date or time.",
      ),
    messageIdHeader: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Provider internet message identifier value, when available."),
    attachments: z
      .array(outlookMailAttachmentSummarySchema)
      .describe("Attachment metadata for this message; empty when there are no attachments."),
  })
  .strict()
  .describe("Normalized Outlook Mail inbound email event facts for assistant work items.");

export type OutlookMailEmailReceivedEvent = z.infer<typeof outlookMailEmailReceivedEventSchema>;

export const outlookMailMessageListItemFields = {
  id: true,
  threadId: true,
  provider: true,
  from: true,
  subject: true,
  receivedAt: true,
  snippet: true,
  attachments: true,
  canReply: true,
} as const satisfies Partial<Record<keyof OutlookMailMessageDetail, true>>;

export const outlookMailMessageListItemSchema = outlookMailMessageDetailSchema
  .pick(outlookMailMessageListItemFields)
  .strict();

export type OutlookMailMessageListItem = z.infer<typeof outlookMailMessageListItemSchema>;

export const outlookMailMessagesSearchOutputSchema = z
  .object({
    provider: outlookMailProviderSchema.describe("Email provider backing this result."),
    accountEmail: z
      .string()
      .email()
      .nullable()
      .describe("Email account used for this result.")
      .meta({ examples: ["client@example.com"] }),
    messages: z.array(outlookMailMessageListItemSchema).describe("Messages matching the search."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const outlookMailMessageGetOutputSchema = z
  .object({
    provider: outlookMailProviderSchema.describe("Email provider backing this result."),
    accountEmail: z
      .string()
      .email()
      .nullable()
      .describe("Email account used for this result.")
      .meta({ examples: ["client@example.com"] }),
    message: outlookMailMessageDetailSchema.describe("Requested email message."),
  })
  .strict();

export const outlookMailAccountsListOutputSchema = providerAccountsListOutputSchema;

export const outlookMailAttachmentSaveOutputSchema = providerSavedArtifactOutputSchema(z.string());

export const outlookMailProviderWriteOutputSchema = profileActionWriteToolDataSchema;
