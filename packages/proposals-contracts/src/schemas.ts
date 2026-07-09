import {
  jsonObjectSchema,
  profileProposalKindSchema,
  profileProposalRowSchema,
  profileProposalStatusSchema,
} from "@ai-assistants/control-plane-contracts";
import { stringField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

export const profileProposalSummarySchema = z
  .object({
    proposalId: profileProposalRowSchema.shape.id.describe("Backend proposal id."),
    kind: profileProposalRowSchema.shape.proposal_kind.describe("Proposal kind."),
    status: profileProposalStatusSchema.describe("Current proposal status."),
    revision: profileProposalRowSchema.shape.revision.describe(
      "Optimistic-concurrency revision for portal review.",
    ),
    title: profileProposalRowSchema.shape.title.describe("Short proposal title."),
    summary: profileProposalRowSchema.shape.summary.describe("Compact proposal summary."),
    expiresAt: profileProposalRowSchema.shape.expires_at.describe(
      "Expiration timestamp, or null when this proposal does not expire.",
    ),
    blockerSummary: profileProposalRowSchema.shape.blocker_summary.describe(
      "Plain-language blocker when the proposal cannot be approved.",
    ),
  })
  .strict()
  .describe("Lean assistant-facing deferred-review proposal summary.");
export type ProfileProposalSummary = z.infer<typeof profileProposalSummarySchema>;

export const profileProposalCreateInputSchema = z
  .object({
    proposalKind: profileProposalKindSchema.describe(
      "Supported proposal kind. Use gmail.email.follow_up or outlook_mail.email.follow_up for email follow-up proposals.",
    ),
    title: z.string().trim().min(1).max(200).describe("Short proposal title for review UI."),
    summary: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .describe("Compact reason for the suggested follow-up."),
    proposalPayload: z
      .record(z.string(), z.unknown())
      .describe(
        "Kind-specific proposal payload. For email follow-up proposals, pass { email: <provider message send input>, sourceCheckedAt, optional sourceEmailThreadId, optional sourceEmailLastInboundAt, optional sourceMondayRecords }.",
      ),
    evidence: z
      .record(z.string(), z.unknown())
      .default({})
      .describe(
        "Structured source evidence used to create this proposal, such as checkedAt timestamps and rationale.",
      ),
    expiresAt: z.string().datetime({ offset: true }).optional().describe("Optional proposal expiration timestamp."),
    sourceWorkItemId: z.string().trim().uuid().optional().describe("Optional assistant work item id that produced this proposal."),
    sourceScheduledTaskId: z.string().trim().uuid().optional().describe("Optional scheduled task id that produced this proposal."),
  })
  .strict();
export type ProfileProposalCreateInput = z.infer<typeof profileProposalCreateInputSchema>;

const profileProposalEmailFollowUpSourcePayloadShape = {
  sourceEmailThreadId: stringField(
    "Source email thread id, when this proposal follows an email thread.",
  ).optional(),
  sourceEmailLastInboundAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("Timestamp of the latest inbound email observed for the source thread."),
  sourceCheckedAt: z
    .string()
    .datetime({ offset: true })
    .describe("Timestamp when the assistant checked source evidence before proposing."),
  sourceMondayRecords: z
    .array(
      z
        .object({
          boardId: stringField("Monday board id.").optional(),
          itemId: stringField("Monday item id."),
          name: stringField("Monday item name.").optional(),
          url: z.string().trim().url().optional().describe("Monday record URL, when available."),
          observedAt: z.string().datetime({ offset: true }).optional().describe("Timestamp when this Monday record was observed."),
        })
        .strict(),
    )
    .describe("Monday records used as source evidence for the follow-up proposal.")
    .default([]),
} as const;

export const profileProposalGmailEmailFollowUpPayloadSchema = z
  .object({
    email: jsonObjectSchema.describe(
      "Exact gmail_message_send payload to send on approval, including optional Gmail threadId when replying in a thread.",
    ),
    ...profileProposalEmailFollowUpSourcePayloadShape,
  })
  .strict()
  .describe("Payload shape for proposal_create when proposalKind is gmail.email.follow_up.");

export const profileProposalOutlookMailEmailFollowUpPayloadSchema = z
  .object({
    email: jsonObjectSchema.describe(
      "Exact outlook_mail_message_send payload to send on approval; do not include Gmail-only reply-thread fields.",
    ),
    ...profileProposalEmailFollowUpSourcePayloadShape,
  })
  .strict()
  .describe("Payload shape for proposal_create when proposalKind is outlook_mail.email.follow_up.");

export const profileProposalCreateGmailEmailFollowUpInputSchema = profileProposalCreateInputSchema.extend({
  proposalKind: z.literal("gmail.email.follow_up").describe("Gmail follow-up proposal kind."),
  proposalPayload: profileProposalGmailEmailFollowUpPayloadSchema,
});

export const profileProposalCreateOutlookMailEmailFollowUpInputSchema = profileProposalCreateInputSchema.extend({
  proposalKind: z.literal("outlook_mail.email.follow_up").describe("Outlook Mail follow-up proposal kind."),
  proposalPayload: profileProposalOutlookMailEmailFollowUpPayloadSchema,
});

export const profileProposalCreateInputRuntimeSchema = profileProposalCreateInputSchema;
export type ProfileProposalCreateInputRuntime = z.infer<typeof profileProposalCreateInputRuntimeSchema>;

export const profileProposalCreateOutputSchema = z
  .object({
    proposal: profileProposalSummarySchema.describe("Created or reused deferred-review proposal."),
    created: z.boolean().describe("Whether a new proposal row was created."),
  })
  .strict();
