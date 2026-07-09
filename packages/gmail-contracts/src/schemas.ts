import { profileActionWriteToolDataSchema } from "@ai-assistants/actions-contracts/schemas";
import {
  providerAccountsListOutputSchema,
  providerSavedArtifactOutputSchema,
  stringField,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";

export const gmailOptionalConnectedAccountIdSchema = z
  .string()
  .trim()
  .uuid()
  .describe(
    "Connected provider account id from gmail_accounts_list when multiple Gmail mailboxes match. Do not use profile_context_get capability instance ids for this field.",
  )
  .optional();

const gmailAddressList = (description: string, max: number) =>
  z.array(z.string().trim().email().describe("Email address.")).max(max).describe(description);
const optionalGmailAddressList = (description: string, max: number) =>
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
const gmailMessageSearchMaxResultsSchema = z.number().int().min(1).max(100);

export const gmailAccountsListInputSchema = z.object({}).strict();

export const gmailMessagesSearchInputSchema = z
  .object({
    connectedAccountId: gmailOptionalConnectedAccountIdSchema,
    query: stringField(
      "Gmail `q` search syntax. Default scope excludes spam and trash; for exhaustive archive/trash coverage, broaden with Gmail operators such as in:anywhere, in:spam, or in:trash.",
    ).optional(),
    maxResults: gmailMessageSearchMaxResultsSchema
      .optional()
      .describe("Maximum messages to return. Defaults to 25."),
    limit: gmailMessageSearchMaxResultsSchema
      .optional()
      .describe("Alias for maxResults when the agent naturally thinks in result limits."),
    messagesPageCursor: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Gmail page token from a previous gmail_messages_search result."),
    includeAttachmentMetadata: z
      .boolean()
      .optional()
      .describe(
        "When true, hydrates returned messages with full Gmail metadata so the attachments array is authoritative. Leave false for normal lightweight searches, then call gmail_message_get on selected messages before acting on attachments.",
      ),
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

export const gmailMessageGetInputSchema = z
  .object({
    connectedAccountId: gmailOptionalConnectedAccountIdSchema,
    messageId: stringField("Provider message id."),
  })
  .strict();

export const gmailAttachmentSaveInputSchema = z
  .object({
    connectedAccountId: gmailOptionalConnectedAccountIdSchema,
    messageId: stringField("Provider message id containing the attachment."),
    attachmentId: stringField("Provider attachment id."),
    filename: stringField("Stored artifact filename.").optional(),
  })
  .strict();

export const gmailMessageSendInputSchema = z
  .object({
    connectedAccountId: gmailOptionalConnectedAccountIdSchema,
    to: gmailAddressList("Primary recipients for the outbound email.", 50).min(1),
    cc: optionalGmailAddressList("CC recipients for the outbound email.", 50),
    bcc: optionalGmailAddressList("BCC recipients for the outbound email.", 50),
    subject: stringField("Email subject."),
    bodyText: stringField("Plain text email body."),
    threadId: stringField("Optional Gmail thread id when sending into a thread.").optional(),
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

export const gmailMessageReplyInputSchema = z
  .object({
    connectedAccountId: gmailOptionalConnectedAccountIdSchema,
    replyToMessageId: stringField("Provider message id to reply to."),
    bodyText: stringField("Plain text reply body."),
    to: gmailAddressList(
      "Explicit reply recipients; omit for Gmail-normal reply targeting.",
      50,
    ).optional(),
    cc: optionalGmailAddressList("CC recipients for the reply.", 50),
    bcc: optionalGmailAddressList("BCC recipients for the reply.", 50),
  })
  .strict();

export const gmailMessageForwardInputSchema = z
  .object({
    connectedAccountId: gmailOptionalConnectedAccountIdSchema,
    forwardMessageId: stringField("Provider message id to forward."),
    to: gmailAddressList("Primary recipients for the forwarded email.", 50).min(1),
    cc: optionalGmailAddressList("CC recipients for the forwarded email.", 50),
    bcc: optionalGmailAddressList("BCC recipients for the forwarded email.", 50),
    additionalComment: stringField("Optional short comment to prepend.").optional(),
  })
  .strict();

export const gmailMessageMoveInputSchema = z
  .object({
    connectedAccountId: gmailOptionalConnectedAccountIdSchema,
    messageId: stringField("Provider message id."),
    destinationMailboxId: stringField("Destination Gmail label id."),
  })
  .strict();

export const gmailMessageMarkReadInputSchema = z
  .object({
    connectedAccountId: gmailOptionalConnectedAccountIdSchema,
    messageId: stringField("Provider message id."),
    isRead: z.boolean().describe("true marks the message read; false marks it unread."),
  })
  .strict();

export const gmailMessageDeleteInputSchema = z
  .object({
    connectedAccountId: gmailOptionalConnectedAccountIdSchema,
    messageId: stringField("Provider message id to delete or move to trash (provider-specific)."),
  })
  .strict();

export const gmailProviderSchema = z.literal("gmail");

export const gmailAddressSchema = z
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

export const gmailAttachmentSummarySchema = z
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

export const gmailMessageDetailSchema = z
  .object({
    id: z.string().trim().min(1).describe("Provider message id."),
    threadId: z.string().trim().min(1).nullable().describe("Provider thread id, when available."),
    provider: gmailProviderSchema.describe("Email provider backing this message."),
    from: gmailAddressSchema.nullable().describe("Sender mailbox identity, when available."),
    to: z.array(gmailAddressSchema).describe("Primary recipient mailbox identities."),
    cc: z.array(gmailAddressSchema).describe("CC recipient mailbox identities."),
    bcc: z.array(gmailAddressSchema).describe("BCC recipient mailbox identities."),
    subject: z.string().trim().min(1).nullable().describe("Email subject."),
    sentAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe(
        "Timestamp when the email was sent, when available. Convert offset/Z timestamps before telling the client a local date or time.",
      )
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    sentAtProfileLocal: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe(
        "Sent timestamp formatted in the profile timezone for client-facing summaries. Prefer this over the UTC sentAt value when telling the client a local date or time.",
      ),
    receivedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe(
        "Timestamp when the email was received, when available. Convert offset/Z timestamps before telling the client a local date or time.",
      )
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    receivedAtProfileLocal: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe(
        "Received timestamp formatted in the profile timezone for client-facing summaries. Prefer this over the UTC receivedAt value when telling the client a local date or time.",
      ),
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
    attachments: z.array(gmailAttachmentSummarySchema).describe("Attachments on this message."),
    labels: z.array(z.string().trim().min(1)).describe("Provider labels or folder markers."),
    canReply: z.boolean().describe("Whether this message can be used as a reply target."),
  })
  .strict()
  .describe("Email message normalized for assistant use.");

export type GmailMessageDetail = z.infer<typeof gmailMessageDetailSchema>;

/** Event facts stored on `gmail.email.received` assistant work items (`profileWorkItemDto.event`). */
export const gmailEmailReceivedEventSchema = z
  .object({
    provider: gmailProviderSchema.describe("Email provider backing this inbound event."),
    gmailMessageId: z
      .string()
      .trim()
      .min(1)
      .describe("Provider message id for this inbound email."),
    threadId: z.string().trim().min(1).nullable().describe("Provider thread id, when available."),
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
    historyId: z
      .string()
      .trim()
      .min(1)
      .describe("Gmail mailbox history id observed when this message was ingested."),
    from: gmailAddressSchema.nullable().describe("Sender mailbox identity, when available."),
    to: z.array(gmailAddressSchema).describe("Primary recipient mailbox identities."),
    cc: z.array(gmailAddressSchema).describe("CC recipient mailbox identities."),
    bcc: z.array(gmailAddressSchema).describe("BCC recipient mailbox identities."),
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
    labels: z.array(z.string().trim().min(1)).describe("Provider labels on the message."),
    attachments: z
      .array(gmailAttachmentSummarySchema)
      .describe("Attachment metadata for this message; empty when there are no attachments."),
  })
  .strict()
  .describe("Normalized Gmail inbound email event facts for assistant work items.");

export type GmailEmailReceivedEvent = z.infer<typeof gmailEmailReceivedEventSchema>;

export const gmailMessageListItemFields = {
  id: true,
  threadId: true,
  provider: true,
  from: true,
  subject: true,
  receivedAt: true,
  receivedAtProfileLocal: true,
  snippet: true,
  attachments: true,
  canReply: true,
} as const satisfies Partial<Record<keyof GmailMessageDetail, true>>;

export const gmailMessageListItemSchema = gmailMessageDetailSchema
  .pick(gmailMessageListItemFields)
  .extend({
    attachments: z
      .array(gmailAttachmentSummarySchema)
      .describe(
        "Attachment metadata for this search item. This is authoritative only when gmail_messages_search was called with includeAttachmentMetadata=true; otherwise an empty array can mean attachment metadata was not loaded.",
      ),
  })
  .strict();

export type GmailMessageListItem = z.infer<typeof gmailMessageListItemSchema>;

export const gmailMessagesSearchOutputSchema = z
  .object({
    provider: gmailProviderSchema.describe("Email provider backing this result."),
    accountEmail: z
      .string()
      .email()
      .nullable()
      .describe("Email account used for this result.")
      .meta({ examples: ["client@example.com"] }),
    messages: z.array(gmailMessageListItemSchema).describe("Messages matching the search."),
    attachmentMetadataIncluded: z
      .boolean()
      .describe(
        "Whether each search result was fully hydrated so its attachments array is authoritative.",
      ),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const gmailMessageGetOutputSchema = z
  .object({
    provider: gmailProviderSchema.describe("Email provider backing this result."),
    accountEmail: z
      .string()
      .email()
      .nullable()
      .describe("Email account used for this result.")
      .meta({ examples: ["client@example.com"] }),
    message: gmailMessageDetailSchema.describe("Requested email message."),
  })
  .strict();

export const gmailAccountsListOutputSchema = providerAccountsListOutputSchema;

export const gmailAttachmentSaveOutputSchema = providerSavedArtifactOutputSchema(z.string());

export const gmailProviderWriteOutputSchema = profileActionWriteToolDataSchema;
