import { stringField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

export const publicWebProviderSchema = z.literal("browserbase-stagehand");

export const publicWebModeSchema = z.enum([
  "extract",
  "action_prepare",
  "auth_context_setup",
  "live_handoff",
]);

export const publicWebAuthContextStatusSchema = z.enum(["active", "deleted"]);

export const publicWebHandoffReasonSchema = z.enum([
  "login_required",
  "mfa_required",
  "captcha_required",
  "user_control_requested",
]);

export const publicWebHandoffStatusSchema = z.enum([
  "waiting",
  "completed",
  "cancelled",
  "expired",
]);

export const publicWebTaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting",
  "blocked",
  "succeeded",
  "failed",
  "cancelled",
]);

export const publicWebFailureKindSchema = z.enum([
  "login_required",
  "mfa_required",
  "captcha_required",
  "site_blocked",
  "domain_not_allowed",
  "ambiguous_page",
  "timeout",
  "rate_limit",
  "missing_config",
  "provider_unavailable",
  "unknown_completion",
  "provider_contract",
  "blocked_url",
  "inaccessible_url",
  "bad_request",
]);

export const publicWebArtifactSchema = z
  .object({
    profileFileId: z.string().trim().uuid().describe("Durable profile file id."),
    filename: z.string().trim().min(1).nullable().describe("Stored profile file filename."),
    artifactType: z.string().trim().min(1).describe("Internal file type."),
    mimeType: z.string().trim().min(1).nullable().describe("Profile file MIME type."),
    byteSize: z.number().int().nonnegative().nullable().describe("Profile file size in bytes."),
    sha256: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
      .describe("SHA-256 hash."),
  })
  .strict()
  .describe("Browser task evidence profile file metadata.");

export const publicWebFailureSchema = z
  .object({
    kind: publicWebFailureKindSchema.describe("Stable blocker or failure kind."),
    message: z.string().trim().min(1).describe("Safe assistant-readable failure message."),
    retryable: z.boolean().describe("Whether retrying later may reasonably succeed."),
  })
  .strict()
  .describe("Structured browser automation blocker or failure.");

export const publicWebSearchStatusSchema = z.enum(["succeeded", "failed"]);

export const publicWebFetchUrlStatusSchema = z.enum(["succeeded", "partial", "failed"]);

export const publicWebSearchResultSchema = z
  .object({
    title: z.string().trim().min(1).describe("Search result title."),
    url: z.string().trim().url().describe("Search result public URL."),
    snippet: z.string().trim().min(1).nullable().describe("Search result snippet or excerpt."),
    date: z.string().trim().min(1).nullable().describe("Published date when Perplexity returns it."),
    lastUpdated: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Last-updated date when Perplexity returns it."),
    siteName: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Hostname derived from the result URL for assistant display."),
  })
  .strict()
  .describe("Normalized Perplexity search result.");

export const publicWebSearchOutputSchema = z
  .object({
    provider: z.literal("perplexity").describe("Public web search provider."),
    status: publicWebSearchStatusSchema.describe("Search request status."),
    query: z.string().trim().min(1).describe("Submitted search query."),
    count: z.number().int().nonnegative().describe("Number of returned normalized results."),
    results: z.array(publicWebSearchResultSchema).describe("Ranked public search results."),
    tookMs: z.number().int().nonnegative().describe("Provider request duration in milliseconds."),
    failure: publicWebFailureSchema.optional().describe("Structured failure when status is failed."),
  })
  .strict()
  .describe("Perplexity-backed public web search result.");

export const publicWebFetchedContentSchema = z
  .object({
    url: z.string().trim().url().describe("Fetched public URL."),
    title: z.string().trim().min(1).nullable().describe("Fetched page title when available."),
    snippet: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Extracted content snippet returned by Perplexity."),
  })
  .strict()
  .describe("Fetched URL content returned by Perplexity Agent API.");

export const publicWebCitationSchema = z
  .object({
    title: z.string().trim().min(1).nullable().describe("Citation title when available."),
    url: z.string().trim().url().describe("Citation URL."),
  })
  .strict()
  .describe("Citation or annotation from Perplexity Agent API output.");

export const publicWebFetchUrlOutputSchema = z
  .object({
    provider: z.literal("perplexity").describe("Public URL fetch provider."),
    status: publicWebFetchUrlStatusSchema.describe("Fetch request status."),
    requestedUrl: z.string().trim().url().describe("URL requested by the assistant."),
    answer: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Provider answer synthesized from fetched URL content."),
    fetchedContents: z
      .array(publicWebFetchedContentSchema)
      .describe("Fetched content snippets returned by the fetch_url tool."),
    citations: z
      .array(publicWebCitationSchema)
      .describe("Citations or annotations attached to the provider answer."),
    tookMs: z.number().int().nonnegative().describe("Provider request duration in milliseconds."),
    providerRequestId: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Redacted Perplexity response id when returned."),
    failure: publicWebFailureSchema.optional().describe("Structured failure when status is failed."),
  })
  .strict()
  .describe("Perplexity Agent API fetch_url result for a known public URL.");

export const publicWebExtractedFieldsSchema = z
  .record(z.string().trim().min(1), z.string().nullable())
  .describe("Named fields extracted from the page.");

export const publicWebPreparedActionSchema = z
  .object({
    targetAction: z
      .string()
      .trim()
      .min(1)
      .describe("Website action that was prepared but not submitted."),
    reviewBoundary: z
      .string()
      .trim()
      .min(1)
      .describe("Final action boundary where browser automation stopped."),
    summary: z.string().trim().min(1).describe("User-review summary of the prepared page state."),
  })
  .strict()
  .describe("Prepared browser action that stopped before final confirmation.");

export const publicWebHandoffSchema = z
  .object({
    handoffId: z.string().trim().uuid().describe("Durable browser handoff id."),
    reason: publicWebHandoffReasonSchema.describe("Sensitive step the user must complete."),
    clientUrl: z
      .string()
      .trim()
      .url()
      .nullable()
      .describe("Client-facing portal URL; null after handoff is no longer open."),
    expiresAt: z.string().datetime({ offset: true }).describe("Handoff expiry timestamp."),
    status: publicWebHandoffStatusSchema.describe("Current handoff lifecycle status."),
  })
  .strict()
  .describe("Redacted client browser handoff state.");

export const publicWebAuthContextSchema = z
  .object({
    authContextId: z.string().trim().uuid().describe("Saved browser auth context id."),
    label: z.string().trim().min(1).describe("User-facing saved login label."),
    primaryDomain: z.string().trim().min(1).describe("Primary website domain for this context."),
    allowedDomains: z
      .array(z.string().trim().min(1))
      .min(1)
      .describe("Website domains covered by this context."),
    accountHint: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Optional user-facing account hint, such as an email or store account label."),
    status: publicWebAuthContextStatusSchema.describe("Saved auth context status."),
    lastVerifiedAt: z
      .string()
      .datetime({ offset: true })
      .nullable()
      .describe("Last timestamp this context was successfully used or verified."),
    createdAt: z.string().datetime({ offset: true }).describe("Auth context creation timestamp."),
    updatedAt: z.string().datetime({ offset: true }).describe("Auth context update timestamp."),
  })
  .strict()
  .describe("Profile-scoped saved browser authentication context.");

export const publicWebTaskSchema = z
  .object({
    browserTaskId: z.string().trim().uuid().describe("Durable browser task id."),
    provider: publicWebProviderSchema.describe("Browser automation provider used for this task."),
    mode: publicWebModeSchema.describe("Browser task mode."),
    status: publicWebTaskStatusSchema.describe("Current durable browser task lifecycle status."),
    objective: z
      .string()
      .trim()
      .min(1)
      .describe("Assistant-facing objective for this browser task."),
    startUrl: z.string().trim().url().describe("HTTPS URL where the browser task started."),
    currentUrl: z.string().trim().url().nullable().describe("Current or final browser page URL."),
    authContextId: z
      .string()
      .trim()
      .uuid()
      .nullable()
      .describe("Saved browser auth context used by the task, if any."),
    artifacts: z
      .array(publicWebArtifactSchema)
      .describe("Evidence artifacts captured for the task."),
    extractedFields: publicWebExtractedFieldsSchema.optional(),
    preparedAction: publicWebPreparedActionSchema.optional(),
    handoff: publicWebHandoffSchema.optional(),
    failure: publicWebFailureSchema.optional(),
    createdAt: z.string().datetime({ offset: true }).describe("Task creation timestamp."),
    updatedAt: z.string().datetime({ offset: true }).describe("Last task update timestamp."),
  })
  .strict()
  .describe("Durable browser task state for assistant use.");

export const publicWebTaskOutputSchema = z
  .object({
    task: publicWebTaskSchema,
  })
  .strict();

export const publicWebAuthContextsOutputSchema = z
  .object({
    authContexts: z
      .array(publicWebAuthContextSchema)
      .describe("Active saved browser auth contexts for the profile."),
  })
  .strict();

export const publicWebAuthContextOutputSchema = z
  .object({
    authContext: publicWebAuthContextSchema,
  })
  .strict();

const publicWebUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "Only https URLs are supported.");

const allowedDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .regex(/^[a-z0-9.-]+$/)
  .describe("Allowed hostname, for example www.ubereats.com.");

export const publicWebFieldSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
      .describe("CamelCase or snake_case field name for extracted data."),
    description: stringField("What to extract for this field.").max(500),
    required: z.boolean().default(true).describe("Whether this extracted field is required."),
  })
  .strict();

const searchDomainFilterSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(/^-?[a-z0-9.-]+$/)
  .describe("Domain filter; prefix with - to denylist a domain.");

export const publicWebSearchInputSchema = z
  .object({
    query: stringField("Public web search query.").max(1000),
    count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe("Maximum number of ranked public web results to return."),
    country: z
      .string()
      .trim()
      .length(2)
      .toUpperCase()
      .optional()
      .describe("Optional ISO 3166-1 alpha-2 country filter."),
    search_language_filter: z
      .array(z.string().trim().length(2).toLowerCase())
      .max(10)
      .optional()
      .describe("Optional ISO 639-1 language filters."),
    search_domain_filter: z
      .array(searchDomainFilterSchema)
      .max(20)
      .optional()
      .describe("Optional Perplexity domain allowlist or denylist filters."),
    search_recency_filter: z
      .enum(["hour", "day", "week", "month", "year"])
      .optional()
      .describe("Optional publication recency filter."),
    search_after_date_filter: z
      .string()
      .trim()
      .min(1)
      .max(10)
      .optional()
      .describe("Optional publication date lower bound in Perplexity-supported MM/DD/YYYY format."),
    search_before_date_filter: z
      .string()
      .trim()
      .min(1)
      .max(10)
      .optional()
      .describe("Optional publication date upper bound in Perplexity-supported MM/DD/YYYY format."),
    last_updated_after_filter: z
      .string()
      .trim()
      .min(1)
      .max(10)
      .optional()
      .describe("Optional last-updated lower bound in Perplexity-supported MM/DD/YYYY format."),
    last_updated_before_filter: z
      .string()
      .trim()
      .min(1)
      .max(10)
      .optional()
      .describe("Optional last-updated upper bound in Perplexity-supported MM/DD/YYYY format."),
    max_tokens: z
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .optional()
      .describe("Optional total extracted content budget across search results."),
    max_tokens_per_page: z
      .number()
      .int()
      .min(1)
      .max(1_000_000)
      .optional()
      .describe("Optional extracted content budget per search result."),
  })
  .strict()
  .superRefine((value, ctx) => {
    const domainFilters = value.search_domain_filter ?? [];
    const hasAllowlist = domainFilters.some((domain) => !domain.startsWith("-"));
    const hasDenylist = domainFilters.some((domain) => domain.startsWith("-"));
    if (hasAllowlist && hasDenylist) {
      ctx.addIssue({
        code: "custom",
        path: ["search_domain_filter"],
        message: "Use either allowlist domains or denylist domains, not both.",
      });
    }
  });

export const publicWebFetchUrlInputSchema = z
  .object({
    url: z
      .string()
      .trim()
      .url()
      .describe("Known public http or https URL to fetch through Perplexity."),
    objective: stringField("What the assistant needs from this exact URL.").max(1000),
    instructions: stringField("Specific fetch/extraction instructions for this URL.").max(1500),
    maxOutputTokens: z
      .number()
      .int()
      .min(100)
      .max(4000)
      .default(1200)
      .describe("Maximum Agent API answer tokens."),
  })
  .strict();

function refineAllowedDomainCoverage(
  value: { startUrl: string; allowedDomains: readonly string[] },
  ctx: z.RefinementCtx,
): void {
  const host = new URL(value.startUrl).hostname.toLowerCase();
  if (!value.allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    ctx.addIssue({
      code: "custom",
      path: ["allowedDomains"],
      message: `allowedDomains must include the startUrl host ${host}.`,
    });
  }
}

export const publicWebExtractStartInputSchema = z
  .object({
    startUrl: publicWebUrlSchema.describe("HTTPS URL where the browser task must begin."),
    allowedDomains: z
      .array(allowedDomainSchema)
      .min(1)
      .max(10)
      .describe(
        "Hostnames the browser may visit during this task; must include the startUrl hostname.",
      ),
    objective: stringField("Concrete browsing objective.").max(1000),
    extractionInstruction: stringField("Natural-language extraction instruction.").max(1000),
    fields: z
      .array(publicWebFieldSchema)
      .min(1)
      .max(20)
      .describe("Named fields the assistant expects from the page."),
    authContextId: z
      .string()
      .trim()
      .uuid()
      .optional()
      .describe("Optional saved browser auth context id to use for this read-only task."),
    maxSteps: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(3)
      .describe("Maximum browser reasoning/action steps allowed for extraction."),
  })
  .strict()
  .superRefine(refineAllowedDomainCoverage);

export const publicWebTaskGetInputSchema = z
  .object({
    browserTaskId: z.string().trim().uuid().describe("Browser task id to read."),
  })
  .strict();

export const publicWebTaskCancelInputSchema = z
  .object({
    browserTaskId: z.string().trim().uuid().describe("Browser task id to cancel."),
    reason: stringField("Why the browser task is being cancelled.").max(500).optional(),
  })
  .strict();

export const publicWebAuthContextSetupStartInputSchema = z
  .object({
    startUrl: publicWebUrlSchema.describe("HTTPS URL where login/setup must begin."),
    allowedDomains: z
      .array(allowedDomainSchema)
      .min(1)
      .max(10)
      .describe(
        "Hostnames the browser may visit during authentication setup; must include the startUrl hostname.",
      ),
    objective: stringField("Concrete authentication setup objective.").max(1000),
    label: stringField("User-facing saved login label.").max(120),
    accountHint: stringField("Optional account hint, such as an email or account label.")
      .max(200)
      .optional(),
  })
  .strict()
  .superRefine(refineAllowedDomainCoverage);

export const publicWebTaskContinueInputSchema = z
  .object({
    browserTaskId: z.string().trim().uuid().describe("Waiting browser task id to continue."),
  })
  .strict();

export const publicWebAuthContextsListInputSchema = z.object({}).strict();

export const publicWebAuthContextDeleteInputSchema = z
  .object({
    authContextId: z.string().trim().uuid().describe("Saved browser auth context id to delete."),
    reason: stringField("Why the browser auth context is being deleted.").max(500).optional(),
  })
  .strict();

export const publicWebLiveHandoffStartInputSchema = z
  .object({
    startUrl: publicWebUrlSchema.describe("HTTPS URL where the live browser handoff must open."),
    allowedDomains: z
      .array(allowedDomainSchema)
      .min(1)
      .max(10)
      .describe(
        "Hostnames the live browser may visit during this handoff; must include the startUrl hostname.",
      ),
    objective: stringField("Concrete reason the user needs temporary browser control.").max(1000),
    authContextId: z
      .string()
      .trim()
      .uuid()
      .describe("Saved browser auth context id to open for the live handoff."),
  })
  .strict()
  .superRefine(refineAllowedDomainCoverage);

export const publicWebActionPrepareStartInputSchema = z
  .object({
    startUrl: publicWebUrlSchema.describe("HTTPS URL where preparation must begin."),
    allowedDomains: z
      .array(allowedDomainSchema)
      .min(1)
      .max(10)
      .describe(
        "Hostnames the browser may visit during preparation; must include the startUrl hostname.",
      ),
    objective: stringField("Concrete preparation objective.").max(1000),
    targetAction: stringField("The action to prepare, such as building a cart.").max(500),
    reviewBoundary: stringField(
      "The exact final action the browser must stop before, such as clicking Place order.",
    ).max(500),
    preparationInstruction: stringField(
      "Natural-language steps to prepare the action while stopping before the review boundary.",
    ).max(1500),
    authContextId: z
      .string()
      .trim()
      .uuid()
      .optional()
      .describe("Optional saved browser auth context id to use for action preparation."),
    maxSteps: z
      .number()
      .int()
      .min(1)
      .max(15)
      .default(8)
      .describe("Maximum browser reasoning/action steps allowed for action preparation."),
  })
  .strict()
  .superRefine(refineAllowedDomainCoverage);

export type PublicWebTask = z.infer<typeof publicWebTaskSchema>;
export type PublicWebAuthContext = z.infer<typeof publicWebAuthContextSchema>;
export type PublicWebHandoff = z.infer<typeof publicWebHandoffSchema>;
export type PublicWebHandoffReason = z.infer<typeof publicWebHandoffReasonSchema>;
export type PublicWebFailureKind = z.infer<typeof publicWebFailureKindSchema>;
export type PublicWebFailure = z.infer<typeof publicWebFailureSchema>;
export type PublicWebSearchInput = z.infer<typeof publicWebSearchInputSchema>;
export type PublicWebSearchOutput = z.infer<typeof publicWebSearchOutputSchema>;
export type PublicWebFetchUrlInput = z.infer<typeof publicWebFetchUrlInputSchema>;
export type PublicWebFetchUrlOutput = z.infer<typeof publicWebFetchUrlOutputSchema>;
export type PublicWebExtractStartInput = z.infer<typeof publicWebExtractStartInputSchema>;
export type PublicWebAuthContextSetupStartInput = z.infer<
  typeof publicWebAuthContextSetupStartInputSchema
>;
export type PublicWebTaskContinueInput = z.infer<typeof publicWebTaskContinueInputSchema>;
export type PublicWebAuthContextDeleteInput = z.infer<
  typeof publicWebAuthContextDeleteInputSchema
>;
export type PublicWebLiveHandoffStartInput = z.infer<
  typeof publicWebLiveHandoffStartInputSchema
>;
export type PublicWebActionPrepareStartInput = z.infer<
  typeof publicWebActionPrepareStartInputSchema
>;
