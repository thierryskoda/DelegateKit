import { createHash } from "node:crypto";
import {
  requireJsonObject,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError } from "@ai-assistants/errors";
import { gmailMessageSendInputSchema } from "@ai-assistants/gmail-contracts/schemas";
import { outlookMailMessageSendInputSchema } from "@ai-assistants/outlook-mail-contracts/schemas";
import { z } from "zod";
import {
  buildEquivalentActionKey,
  findExistingEquivalentProfileAction,
} from "../actions/action-attempts";
import {
  buildValidatedWritePlan,
  resolvedRequestHashForWritePlan,
} from "../actions/external-write-contracts/registry";
import {
  detail,
  preview,
  section,
  fields,
  field,
  body,
} from "../actions/external-write-contracts/connect-detail";
import type { ProposalKindContract } from "./proposal-kind-registry";

const sourceMondayRecordSchema = z
  .object({
    boardId: z.string().trim().min(1).optional(),
    itemId: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    url: z.string().trim().url().optional(),
    observedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const emailFollowUpSourcePayloadShape = {
  sourceEmailThreadId: z.string().trim().min(1).optional(),
  sourceEmailLastInboundAt: z.string().datetime({ offset: true }).optional(),
  sourceCheckedAt: z.string().datetime({ offset: true }),
  sourceMondayRecords: z.array(sourceMondayRecordSchema).default([]),
} as const;

const gmailEmailFollowUpProposalPayloadSchema = z
  .object({
    email: gmailMessageSendInputSchema.describe(
      "Exact gmail_message_send payload to execute on approval.",
    ),
    ...emailFollowUpSourcePayloadShape,
  })
  .strict();
type GmailEmailFollowUpProposalPayload = z.infer<
  typeof gmailEmailFollowUpProposalPayloadSchema
>;

const outlookMailEmailFollowUpProposalPayloadSchema = z
  .object({
    email: outlookMailMessageSendInputSchema.describe(
      "Exact outlook_mail_message_send payload to execute on approval.",
    ),
    ...emailFollowUpSourcePayloadShape,
  })
  .strict();
type OutlookMailEmailFollowUpProposalPayload = z.infer<
  typeof outlookMailEmailFollowUpProposalPayloadSchema
>;

type EmailFollowUpProposalPayload =
  | GmailEmailFollowUpProposalPayload
  | OutlookMailEmailFollowUpProposalPayload;

const emailFollowUpProposalEvidenceSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    sourceCheckedAt: z.string().datetime({ offset: true }),
    rationale: z.string().trim().min(1).max(2000).optional(),
  })
  .passthrough();

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function emailFollowUpEquivalenceKey(input: {
  kind: "gmail.email.follow_up" | "outlook_mail.email.follow_up";
  payload: EmailFollowUpProposalPayload;
  includeGmailThreadId: boolean;
}): string {
  const gmailThreadId =
    input.includeGmailThreadId && "threadId" in input.payload.email
      ? input.payload.email.threadId ?? null
      : undefined;
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          kind: input.kind,
          to: input.payload.email.to.map((email) => email.trim().toLowerCase()),
          cc: input.payload.email.cc.map((email) => email.trim().toLowerCase()),
          bcc: input.payload.email.bcc.map((email) => email.trim().toLowerCase()),
          subject: input.payload.email.subject.trim(),
          bodyText: input.payload.email.bodyText.trim(),
          ...(gmailThreadId !== undefined ? { threadId: gmailThreadId } : {}),
          connectedAccountId: input.payload.email.connectedAccountId ?? null,
          sourceEmailThreadId: input.payload.sourceEmailThreadId ?? null,
          sourceMondayRecords: input.payload.sourceMondayRecords.map((record) => ({
            boardId: record.boardId ?? null,
            itemId: record.itemId,
          })),
        }),
      ),
    )
    .digest("hex");
}

function buildEmailFollowUpConnectDetail(
  proposal: TableRow<"profile_proposals">,
  payload: EmailFollowUpProposalPayload,
) {
  const detailKind =
    proposal.proposal_kind === "outlook_mail.email.follow_up"
      ? "outlook_mail_email_send"
      : "gmail_email_send";
  return detail(
    detailKind,
    `Suggested follow-up email to ${payload.email.to.join(", ")}`,
    preview("View email", [
      section({
        title: "Email",
        fields: fields([
          field("To", payload.email.to),
          field("Cc", payload.email.cc),
          field("Bcc", payload.email.bcc),
          field("Subject", payload.email.subject),
          field("Source checked", payload.sourceCheckedAt),
        ]),
        body: body("Message", payload.email.bodyText),
      }),
    ]),
  );
}

function defineEmailFollowUpProposalKind<
  TKind extends "gmail.email.follow_up" | "outlook_mail.email.follow_up",
  TPayload extends EmailFollowUpProposalPayload,
>(input: {
  kind: TKind;
  toolName: "gmail_message_send" | "outlook_mail_message_send";
  actionType: "gmail.message.send" | "outlook_mail.message.send";
  payloadSchema: z.ZodType<TPayload>;
  includeGmailThreadIdInEquivalenceKey: boolean;
}): ProposalKindContract<TPayload> & { kind: TKind } {
  return {
    kind: input.kind,
    payloadSchema: input.payloadSchema,
    evidenceSchema: emailFollowUpProposalEvidenceSchema,
    buildEquivalenceKey: (payload) =>
      emailFollowUpEquivalenceKey({
        kind: input.kind,
        payload,
        includeGmailThreadId: input.includeGmailThreadIdInEquivalenceKey,
      }),
    buildReviewDetail: buildEmailFollowUpConnectDetail,
    revalidate: async (db, proposal, payload) => {
      const existing = await findExistingEquivalentProfileAction(db, {
        profileId: proposal.profile_id,
        equivalentActionKey: buildEquivalentActionKey({
          toolName: input.toolName,
          actionType: input.actionType,
          executionPayload: payload.email,
        }),
      });
      if (existing) {
        return {
          ok: false,
          blockerCode: "duplicate_email_action",
          blockerSummary: `A matching email action is already ${existing.status}.`,
        };
      }

      try {
        const plan = await buildValidatedWritePlan(input.toolName, {
          db,
          profileId: proposal.profile_id,
          assistantId: "proposal-approval",
          toolCallId: `proposal:${proposal.id}`,
          params: payload.email,
        });
        return {
          ok: true,
          actionPayload: plan.actionPayload,
          requestHash: resolvedRequestHashForWritePlan(plan),
          reviewPayload: requireJsonObject(
            plan.reviewPayload ?? {},
            "proposal.reviewPayload",
          ) as Record<string, unknown>,
        };
      } catch (error) {
        if (error instanceof DomainError) {
          return {
            ok: false,
            blockerCode: error.code,
            blockerSummary: error.message,
          };
        }
        throw error;
      }
    },
    convertToProfileAction: ({ proposal, payload, validation }) => ({
      toolName: input.toolName,
      actionType: input.actionType,
      targetId: payload.email.to.join(","),
      toolCallId: `proposal:${proposal.id}`,
      requestHash: validation.requestHash,
      equivalentActionKey: buildEquivalentActionKey({
        toolName: input.toolName,
        actionType: input.actionType,
        executionPayload: validation.actionPayload,
      }),
      executionPayload: validation.actionPayload,
      title: proposal.title,
      reviewPayload: validation.reviewPayload,
    }),
  };
}

export const gmailEmailFollowUpProposalKind = defineEmailFollowUpProposalKind({
  kind: "gmail.email.follow_up",
  toolName: "gmail_message_send",
  actionType: "gmail.message.send",
  payloadSchema: gmailEmailFollowUpProposalPayloadSchema,
  includeGmailThreadIdInEquivalenceKey: true,
});

export const outlookMailEmailFollowUpProposalKind = defineEmailFollowUpProposalKind({
  kind: "outlook_mail.email.follow_up",
  toolName: "outlook_mail_message_send",
  actionType: "outlook_mail.message.send",
  payloadSchema: outlookMailEmailFollowUpProposalPayloadSchema,
  includeGmailThreadIdInEquivalenceKey: false,
});
