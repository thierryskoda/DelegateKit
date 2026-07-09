import { profileActionWriteToolDataSchema } from "@ai-assistants/actions-contracts/schemas";
import {
  integerField,
  providerSavedArtifactOutputSchema,
  stringField,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";

const boldsignDateTimeField = (description: string) =>
  z.string().trim().datetime({ offset: true }).describe(description);

const boldsignFilterTextList = (description: string, max: number) =>
  z.array(stringField(description)).min(1).max(max).describe(description);
const boldsignStatusAliasSchema = z
  .union([
    stringField("Single BoldSign document status filter."),
    boldsignFilterTextList("BoldSign document status filter.", 10),
  ])
  .optional()
  .describe("Alias for statuses when filtering by one status or a short status list.");

export const boldsignSignatureRequestsListInputSchema = z
  .object({
    connectedAccountId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Optional profile-configured BoldSign connected account id when multiple accounts exist; profile document scope is still enforced.",
      ),
    documentId: stringField(
      "Optional BoldSign document id from a prior scoped result for this profile.",
    ).optional(),
    query: stringField(
      "Optional search text. Maps to BoldSign searchKey for title, document id, sender, or recipient names. Use this field, not searchText.",
    ).optional(),
    sentBy: boldsignFilterTextList("Sender email address filter.", 10).optional(),
    recipients: boldsignFilterTextList("Signer/recipient email address filter.", 25).optional(),
    statuses: boldsignFilterTextList("BoldSign document status filter.", 10).optional(),
    status: boldsignStatusAliasSchema,
    labels: boldsignFilterTextList(
      "Additional BoldSign label/tag filter inside the current profile's assigned document scope.",
      25,
    ).optional(),
    transmitType: z
      .enum(["Sent", "Received", "Both"])
      .optional()
      .describe("Whether to list sent requests, received requests, or both."),
    dateFilterType: z
      .enum(["SentBetween", "Expiring"])
      .optional()
      .describe("Date filter mode; when set, provide both startDate and endDate."),
    startDate: boldsignDateTimeField(
      "Start date-time filter; required with dateFilterType.",
    ).optional(),
    endDate: boldsignDateTimeField(
      "End date-time filter; required with dateFilterType.",
    ).optional(),
    page: integerField("BoldSign result page to return.", 1, 10000, 1),
    nextCursor: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("BoldSign nextCursor for pagination beyond 10,000 records."),
    limit: integerField(
      "Maximum requests to return (latest first). Use this field, not pageSize.",
      1,
      100,
      25,
    ),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.status === undefined || val.statuses === undefined) return;
    const aliasValues = Array.isArray(val.status) ? val.status : [val.status];
    const canonical = new Set(val.statuses);
    const matches =
      aliasValues.length === val.statuses.length &&
      aliasValues.every((status) => canonical.has(status));
    if (!matches) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "status must match statuses when both are provided.",
      });
    }
  });

export const boldsignSendDocumentForSignatureInputSchema = z
  .object({
    profileFileId: stringField("Profile file id for the finalized PDF to send for signature."),
    signerEmail: z.string().trim().email().describe("Signer email."),
    signerName: stringField("Signer display name."),
    title: stringField("Optional signing request title.").optional(),
    expectedSha256: stringField(
      "Optional SHA-256 expected for the artifact being sent.",
    ).optional(),
  })
  .strict();

export const boldsignSignatureRequestRemindInputSchema = z
  .object({
    connectedAccountId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Optional profile-configured BoldSign connected account id when multiple accounts exist; profile document scope is still enforced.",
      ),
    documentId: stringField(
      "BoldSign document id from a prior scoped result for this profile to remind signers for.",
    ),
    message: stringField("Reminder message sent by BoldSign to pending signers."),
    onBehalfOf: z
      .string()
      .trim()
      .email()
      .optional()
      .describe("Sender identity email when the document was sent on behalf of another user."),
  })
  .strict();

export const boldsignSignatureRequestCancelInputSchema = z
  .object({
    connectedAccountId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Optional profile-configured BoldSign connected account id when multiple accounts exist; profile document scope is still enforced.",
      ),
    documentId: stringField(
      "BoldSign document id from a prior scoped result for this profile to cancel/revoke.",
    ),
    message: stringField("Cancellation reason sent by BoldSign to signers."),
    onBehalfOf: z
      .string()
      .trim()
      .email()
      .optional()
      .describe("Sender identity email when the document was sent on behalf of another user."),
  })
  .strict();

export const boldsignFileDownloadInputSchema = z
  .object({
    connectedAccountId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Optional profile-configured BoldSign connected account id when multiple accounts exist; profile document scope is still enforced.",
      ),
    documentId: stringField(
      "BoldSign completed/signed document id from a prior scoped result for this profile to download.",
    ),
    filename: stringField("Optional stored artifact filename including .pdf extension.").optional(),
    onBehalfOf: z
      .string()
      .trim()
      .email()
      .optional()
      .describe("Sender identity email when the document was sent on behalf of another user."),
  })
  .strict();

const boldsignSignatureRequestItemSchema = z
  .object({
    documentId: z
      .string()
      .nullable()
      .describe("Internal BoldSign document id for follow-up tool calls; never show to clients."),
    status: z.string().describe("BoldSign signature request status."),
    title: z.string().nullable().describe("Signature request title."),
    sentAt: z
      .string()
      .nullable()
      .describe("Timestamp when the signature request was sent, when known. Convert offset/Z timestamps before telling the client a local date or time.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    sentAtProfileLocal: z
      .string()
      .nullable()
      .describe("Profile-local formatted send timestamp when sentAt is parseable."),
    completedAt: z
      .string()
      .nullable()
      .describe("Timestamp when signing completed, or null if incomplete. Convert offset/Z timestamps before telling the client a local date or time.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    completedAtProfileLocal: z
      .string()
      .nullable()
      .describe("Profile-local formatted completion timestamp when completedAt is parseable."),
  })
  .strict()
  .describe("BoldSign signature request summary.");

const boldsignSignatureRequestStatusSummarySchema = z
  .object({
    status: z.string().describe("BoldSign signature request status."),
    title: z.string().nullable().describe("Signature request title."),
    sentAt: z
      .string()
      .nullable()
      .describe("Timestamp when the signature request was sent, when known. Convert offset/Z timestamps before telling the client a local date or time.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    sentAtProfileLocal: z
      .string()
      .nullable()
      .describe("Profile-local formatted send timestamp when sentAt is parseable."),
    completedAt: z
      .string()
      .nullable()
      .describe("Timestamp when signing completed, or null if incomplete. Convert offset/Z timestamps before telling the client a local date or time.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    completedAtProfileLocal: z
      .string()
      .nullable()
      .describe("Profile-local formatted completion timestamp when completedAt is parseable."),
  })
  .strict()
  .describe("Client-safe status summary for one BoldSign signature request.");

const boldsignSignatureStatusCountSchema = z
  .object({
    status: z.string().describe("BoldSign signature request status."),
    count: z.number().int().nonnegative().describe("Number of returned requests with this status."),
  })
  .strict()
  .describe("Count of returned signature requests for one status.");

const boldsignSignatureRequestsSummarySchema = z
  .object({
    statusCounts: z
      .array(boldsignSignatureStatusCountSchema)
      .describe("Counts by status for the returned signature requests."),
    latestRequest: boldsignSignatureRequestStatusSummarySchema
      .nullable()
      .describe("Most recently sent returned signature request, or null when none were returned."),
    latestCompletedRequest: boldsignSignatureRequestStatusSummarySchema
      .nullable()
      .describe("Most recently completed returned signature request, or null when none completed."),
    viewedStatusAvailable: z
      .literal(false)
      .describe(
        "This list result does not include separate viewed/opened event evidence; do not claim viewed status from this tool.",
      ),
  })
  .strict()
  .describe("Normalized summary of returned BoldSign signature requests.");

export const boldsignSignatureRequestsListOutputSchema = z
  .object({
    provider: z.literal("boldsign").describe("Provider backing this result."),
    connectedAccountId: z
      .string()
      .min(1)
      .describe("Connected account id used for this read.")
      .meta({ examples: ["550e8400-e29b-41d4-a716-446655440000"] }),
    accountEmail: z
      .string()
      .nullable()
      .describe("BoldSign account email used for this result.")
      .meta({ examples: ["client@example.com"] }),
    requests: z
      .array(boldsignSignatureRequestItemSchema)
      .describe("BoldSign signature requests assigned to the current profile and returned."),
    summary: boldsignSignatureRequestsSummarySchema,
    nextCursor: z
      .number()
      .int()
      .nullable()
      .describe("BoldSign pagination cursor for the next page, or null when complete."),
  })
  .strict();

export const boldsignSendDocumentForSignatureOutputSchema = profileActionWriteToolDataSchema;
export const boldsignSignatureRequestRemindOutputSchema = profileActionWriteToolDataSchema;
export const boldsignSignatureRequestCancelOutputSchema = profileActionWriteToolDataSchema;
export const boldsignFileDownloadOutputSchema = providerSavedArtifactOutputSchema(
  z.literal("boldsign"),
);
