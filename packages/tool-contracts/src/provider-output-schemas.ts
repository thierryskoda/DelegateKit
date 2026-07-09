import { z } from "zod";

export const providerAccountSchema = z
  .object({
    connectedAccountId: z
      .string()
      .trim()
      .min(1)
      .describe("Connected provider account id to pass when selecting this account.")
      .meta({ examples: ["550e8400-e29b-41d4-a716-446655440000"] }),
    provider: z.string().trim().min(1).describe("Provider slug for this connected account."),
    label: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Human-readable account label, preferring provider identity such as email when known."),
    connected: z.boolean().describe("Whether credentials currently exist for this account."),
    credentialStatus: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Credential readiness or blocker status reported by the backend."),
    accountEmail: z
      .string()
      .trim()
      .email()
      .nullable()
      .describe("Email address associated with the provider account when known.")
      .meta({ examples: ["client@example.com"] }),
    ready: z.boolean().describe("Whether the account is ready for provider tool calls."),
  })
  .strict()
  .describe("Connected provider account available to this assistant profile.");

export const providerAccountsListOutputSchema = z
  .object({
    accounts: z
      .array(providerAccountSchema)
      .describe("Provider accounts available for this capability."),
  })
  .strict();

export const providerProfileFileBaseSchema = z
  .object({
    accountEmail: z
      .string()
      .trim()
      .email()
      .nullable()
      .describe("Provider account email used to fetch or create the artifact, when known.")
      .meta({ examples: ["client@example.com"] }),
    profileFileId: z
      .string()
      .uuid()
      .describe("Durable profile file id for the saved file.")
      .meta({ examples: ["550e8400-e29b-41d4-a716-446655440000"] }),
    filename: z
      .string()
      .trim()
      .min(1)
      .describe("Stored profile-file filename including extension.")
      .meta({ examples: ["signed-agreement.pdf"] }),
    mimeType: z
      .string()
      .trim()
      .min(1)
      .describe("MIME type of the saved artifact.")
      .meta({ examples: ["application/pdf"] }),
    byteSize: z
      .number()
      .int()
      .nonnegative()
      .describe("Profile file size in bytes.")
      .meta({ examples: [24576] }),
    sha256: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/i)
      .describe("SHA-256 hex digest for stale-file protection.")
      .meta({
        examples: ["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
      }),
  })
  .strict()
  .describe("Profile file saved from provider content.");

export const providerArtifactBaseSchema = providerProfileFileBaseSchema;

export function providerSavedArtifactOutputSchema<TProvider extends string>(
  providerSchema: z.ZodType<TProvider>,
) {
  return providerProfileFileBaseSchema
    .extend({ provider: providerSchema.describe("Provider that produced the saved profile file.") })
    .strict();
}

export const externalWriteStatusSchema = z
  .enum(["needs_review", "processing", "blocked", "rejected", "expired", "completed", "failed", "unknown"])
  .describe("Assistant-facing lifecycle status for an external write.");

export type ExternalWriteStatus = z.infer<typeof externalWriteStatusSchema>;

export type ExternalWriteStatusAgentSemantic = {
  meaning: string;
  agentResponse: string;
};

export const externalWriteStatusAgentSemantics = {
  needs_review: {
    meaning: "The external write is waiting for an approve or reject decision.",
    agentResponse: "Say the write is waiting for review; do not claim it executed.",
  },
  processing: {
    meaning: "The provider write has been accepted for execution and is still running.",
    agentResponse: "Say it is processing; do not claim completion until the status changes.",
  },
  blocked: {
    meaning: "The write cannot proceed because write policy or provider prerequisites blocked it.",
    agentResponse: "Explain the blocker using result.",
  },
  rejected: {
    meaning: "The pending action was rejected before the external write ran.",
    agentResponse: "Say it was rejected; prepare a new action only if the user still wants it.",
  },
  expired: {
    meaning: "The pending action expired before approval.",
    agentResponse: "Say it expired; prepare a new action only if the user still wants it.",
  },
  completed: {
    meaning: "The external provider write completed.",
    agentResponse: "Confirm the outcome briefly.",
  },
  failed: {
    meaning: "The system knows the external provider write did not complete.",
    agentResponse: "Explain the failure using result and the structured failure fields.",
  },
  unknown: {
    meaning: "The provider write may or may not have completed.",
    agentResponse:
      "Explain the uncertainty and do not retry automatically unless the user asks after hearing it.",
  },
} satisfies Record<ExternalWriteStatus, ExternalWriteStatusAgentSemantic>;

export const externalWriteFailureKindSchema = z.enum([
  "auth",
  "permission",
  "rate_limit",
  "quota",
  "timeout",
  "provider_unavailable",
  "bad_request",
  "not_found",
  "provider_contract",
  "network",
  "unknown",
]);

export const externalWriteFailureRecoverySchema = z.enum([
  "reconnect_account",
  "ask_user_for_correct_value",
  "search_again",
  "retry_later",
  "manual_reconciliation",
]);

export const externalWriteFailureSchema = z
  .object({
    kind: externalWriteFailureKindSchema.describe("Stable machine-readable failure class."),
    message: z.string().trim().min(1).describe("Short safe failure detail."),
    retryable: z.boolean().describe("Whether retrying the same write can reasonably succeed."),
    field: z.string().trim().min(1).optional().describe("Input field related to the failure."),
    retryAfterMs: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Provider retry delay in milliseconds when known."),
    recovery: externalWriteFailureRecoverySchema
      .optional()
      .describe("Best next recovery category for the assistant."),
  })
  .strict()
  .describe("Structured failure detail for an external write.");
export type ExternalWriteFailure = z.infer<typeof externalWriteFailureSchema>;

const externalWriteReceiptBaseSchema = z
  .object({
    result: z
      .string()
      .trim()
      .min(1)
      .describe("Primary one-sentence deterministic result for the LLM to read first."),
    actionId: z
      .string()
      .uuid()
      .describe("Backend profile action id for this external write.")
      .meta({ examples: ["550e8400-e29b-41d4-a716-446655440000"] }),
    status: externalWriteStatusSchema.describe("Current lifecycle status for the external write."),
    failure: externalWriteFailureSchema
      .optional()
      .describe("Structured detail for failed or uncertain writes."),
  })
  .strict()
  .describe("Assistant-facing receipt for an external write.")
  .meta({
    examples: [
      {
        result: "The email was queued to alex@example.com with subject \"Follow-up\".",
        actionId: "550e8400-e29b-41d4-a716-446655440000",
        status: "completed",
      },
    ],
  });

export const externalWriteReceiptSchema = externalWriteReceiptBaseSchema;
export const externalWriteResultSchema = externalWriteReceiptSchema;

export function externalWriteOutputSchemaForFacts<TFactsSchema extends z.ZodType>(
  factsSchema: TFactsSchema,
) {
  return z
    .object({
      write: externalWriteReceiptBaseSchema
        .extend({
          facts: factsSchema.optional().describe("Minimal structured facts for follow-up tool use."),
        })
        .strict()
        .describe("External write result."),
    })
    .strict();
}

export function externalWriteOutputSchema() {
  return z.object({ write: externalWriteReceiptSchema.describe("External write result.") }).strict();
}

export const actionStatusResultSchema = externalWriteReceiptSchema.describe(
  "Detailed lifecycle status for one backend profile action.",
);
export type ExternalWriteReceipt = z.infer<typeof externalWriteReceiptSchema>;

export const actionStatusOutputSchema = z
  .object({
    action: actionStatusResultSchema.describe("Profile action status result."),
  })
  .strict();

export function externalWriteResult(input: {
  result: string;
  actionId: string;
  status: z.infer<typeof externalWriteStatusSchema>;
  failure?: z.infer<typeof externalWriteFailureSchema>;
}) {
  const result = {
    actionId: input.actionId,
    status: input.status,
    result: input.result,
    ...(input.failure === undefined ? {} : { failure: input.failure }),
  } satisfies ExternalWriteReceipt;
  return externalWriteResultSchema.parse(result);
}

export function actionStatusResult(input: {
  result?: string;
  actionId: string;
  status: z.infer<typeof externalWriteStatusSchema>;
  message?: string;
}) {
  const result = {
    actionId: input.actionId,
    status: input.status,
    result: input.result ?? input.message ?? `External write status is ${input.status}.`,
  } satisfies ExternalWriteReceipt;
  return actionStatusResultSchema.parse(result);
}

export function externalWriteStatusFromStorage(input: {
  status: string;
  providerExecutionStatus?: string | null;
}): {
  status: z.infer<typeof externalWriteStatusSchema>;
} {
  if (input.status === "pending_approval") {
    return { status: "needs_review" };
  }
  if (input.status === "processing") {
    return { status: "processing" };
  }
  if (input.status === "executed") {
    return { status: "completed" };
  }
  if (input.status === "rejected") {
    return { status: "rejected" };
  }
  if (input.status === "expired") {
    return { status: "expired" };
  }
  if (input.status === "blocked") {
    return { status: "blocked" };
  }
  if (input.status === "failed") {
    return {
      status:
        input.providerExecutionStatus === "unknown" || input.providerExecutionStatus === "started"
          ? "unknown"
          : "failed",
    };
  }
  if (input.status === "unknown") {
    return { status: "unknown" };
  }
  return { status: "unknown" };
}
