import { z } from "zod";
import { defineWriteTool, defineReadTool, integerField, stringField } from "./contract";
import { readToolDescription, writeToolDescription } from "./description";
import {
  compactDigestPresentationExample,
  messagePresentationSchema,
  replyPayloadDeliverySchema,
} from "./message-presentation";

const nonEmptyString = z.string().trim().min(1);
const compactDigestMessageInputExample = {
  action: "send",
  message: compactDigestPresentationExample.text,
  presentation: compactDigestPresentationExample.presentation,
} as const;
const sha256String = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i, "Expected a SHA-256 hex digest.")
  .describe("SHA-256 hex digest for stale-content protection.")
  .meta({
    examples: ["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"],
  });
const jsonValueSchema: z.ZodType<
  string | number | boolean | null | Array<unknown> | Record<string, unknown>
> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const profileFileIdSchema = z
  .string()
  .trim()
  .uuid()
  .describe("Durable profile file id.")
  .meta({ examples: ["550e8400-e29b-41d4-a716-446655440000"] });

export const profileFileSchema = z
  .object({
    profileFileId: profileFileIdSchema,
    filename: nonEmptyString.describe("Stored profile-file filename."),
    fileType: nonEmptyString.describe("Profile file type."),
    mimeType: nonEmptyString.nullable().describe("MIME type, when known."),
    byteSize: z.number().int().nonnegative().nullable().describe("File size in bytes, when known."),
    sha256: sha256String.nullable().describe("SHA-256 hash, when known."),
    description: z.string().trim().min(1).nullable().describe("Optional short file description."),
    relatedActionId: z.string().uuid().nullable().describe("Related profile action id, when this file came from an action."),
    relatedBrowserTaskId: z.string().uuid().nullable().describe("Related browser task id, when this file belongs to a browser task."),
    createdAt: z.string().datetime({ offset: true }).describe("Timestamp when this profile file was saved."),
  })
  .strict()
  .describe("Durable profile file metadata.");
export type ProfileFile = z.infer<typeof profileFileSchema>;

export const profileArtifactSchema = z
  .object({
    id: profileFileIdSchema.describe("Durable backend artifact id."),
    filename: nonEmptyString.describe("Stored artifact filename."),
    artifactType: nonEmptyString.describe("Backend artifact type."),
    mimeType: nonEmptyString.nullable().describe("MIME type, when known."),
    byteSize: z.number().int().nonnegative().nullable().describe("Artifact size in bytes, when known."),
    sha256: sha256String.nullable().describe("SHA-256 hash, when known."),
    description: z.string().trim().min(1).nullable().describe("Optional short artifact description."),
    relatedActionId: z.string().uuid().nullable().describe("Related profile action id, when this artifact came from an action."),
    relatedBrowserTaskId: z.string().uuid().nullable().describe("Related browser task id, when this artifact belongs to a browser task."),
    createdAt: z.string().datetime({ offset: true }).describe("Timestamp when this artifact was saved."),
  })
  .strict()
  .describe("Internal durable artifact metadata.");
export type ProfileArtifact = z.infer<typeof profileArtifactSchema>;

export const messageInputSchema = z
  .object({
    action: z.literal("send").describe("Send a visible message to the current channel."),
    message: nonEmptyString
      .describe(
        "Client-visible message text to send to the current user/thread. Required unless sending media-only.",
      )
      .optional(),
    media: nonEmptyString
      .describe(
        "Optional media URL or assistant media reference to send as a native channel attachment. Prefer dedicated file delivery tools for saved profile files.",
      )
      .optional(),
    presentation: messagePresentationSchema
      .describe(
        "Optional portable assistant message presentation attached to the message text for compact buttons, selects, dividers, and semantic tone. Do not use provider-native Telegram, Slack, Discord, or Teams fields here.",
      )
      .optional(),
    delivery: replyPayloadDeliverySchema
      .describe("Optional generic delivery preferences such as pinning.")
      .optional(),
  })
  .strict()
  .refine((input) => Boolean(input.message || input.media), {
    message: "message requires text unless sending media-only.",
  })
  .meta({
    examples: [compactDigestMessageInputExample],
  });

export const messageOutputSchema = z
  .object({
    messageId: nonEmptyString
      .describe("Provider or channel message id for the sent message, when available.")
      .optional(),
    channel: nonEmptyString.describe("Channel that accepted the sent message.").optional(),
  })
  .strict();

export const llmTaskInputSchema = z
  .object({
    prompt: stringField("Task instructions. The tool should return JSON only."),
    input: z
      .unknown()
      .optional()
      .describe("Optional text or structured input for the JSON-only task."),
    schema: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Optional JSON Schema-like shape the task output should satisfy."),
    provider: stringField("Optional LLM provider override.").optional(),
    model: stringField("Optional LLM model override.").optional(),
    thinking: stringField("Optional reasoning/thinking mode override.").optional(),
    authProfileId: stringField("Optional auth profile id for provider routing.").optional(),
    temperature: z.number().optional().describe("Optional sampling temperature override."),
    maxTokens: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional maximum output token budget."),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional task timeout in milliseconds."),
  })
  .strict();

export const llmTaskOutputSchema = z
  .object({
    details: z
      .object({
        json: jsonValueSchema.describe("JSON result returned by the focused LLM task.").optional(),
      })
      .strict()
      .describe("Structured details returned by the LLM task.")
      .optional(),
  })
  .strict();

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Use YYYY-MM-DD.")
  .describe("Calendar date in YYYY-MM-DD format.");

export const webSearchInputSchema = z
  .object({
    query: stringField("Search query to send to the configured web search provider."),
    count: integerField("Number of search results to return.", 1, 10, 5).optional(),
    country: stringField("Optional two-letter ISO country code for localized results.")
      .length(2)
      .optional(),
    language: stringField("Optional ISO 639-1 language code for results.").length(2).optional(),
    search_lang: stringField("Optional Brave search-language code.").optional(),
    freshness: z
      .enum(["day", "week", "month", "year"])
      .describe("Optional recency filter.")
      .optional(),
    date_after: isoDateSchema.describe("Only include results after this date.").optional(),
    date_before: isoDateSchema.describe("Only include results before this date.").optional(),
    ui_lang: stringField("Optional Brave UI language code.").optional(),
    domain_filter: z
      .array(nonEmptyString)
      .min(1)
      .max(50)
      .describe("Optional provider-specific domain allowlist or denylist.")
      .optional(),
    max_tokens: z
      .number()
      .int()
      .min(1)
      .max(100_000)
      .describe("Optional provider-specific total content budget.")
      .optional(),
    max_tokens_per_page: z
      .number()
      .int()
      .min(1)
      .max(50_000)
      .describe("Optional provider-specific per-page content budget.")
      .optional(),
  })
  .strict();

const webSearchCitationSchema = z
  .object({
    title: z.string().optional().describe("Citation title when returned by the provider."),
    url: z.string().optional().describe("Citation URL when returned by the provider."),
  })
  .passthrough()
  .describe("Provider citation or source reference.");

const webSearchResultSchema = z
  .object({
    title: z.string().optional().describe("Search result title."),
    url: z.string().optional().describe("Search result URL."),
    snippet: z.string().optional().describe("Search result snippet or description."),
  })
  .passthrough()
  .describe("Provider search result.");

export const webSearchOutputSchema = z
  .object({
    provider: z.string().optional().describe("Resolved web search provider id."),
    query: z.string().optional().describe("Search query executed by the provider."),
    answer: z.string().optional().describe("Synthesized answer when returned by the provider."),
    results: z.array(webSearchResultSchema).optional().describe("Structured search results."),
    citations: z
      .array(webSearchCitationSchema)
      .optional()
      .describe("Citations or source references returned by the provider."),
  })
  .passthrough()
  .describe("Assistant-managed web_search provider response.");

export const builtinToolContracts = [
  defineWriteTool({
    name: "message",
    pluginId: "assistant-builtin",
    label: "Send message",
    description: writeToolDescription({
      useWhen: "the assistant needs to send a client-visible reply in the current thread",
      operation:
        "Sends text, optional portable presentation controls, and optionally one native media attachment to the current channel",
      returns: "message send receipt data",
      notes: [
        "Always include short text when using presentation; Telegram and other channels may reject or poorly render presentation-only sends",
        "Use presentation for compact mobile UI such as digest navigation, section drill-down, choices, confirmations, and approval-style next steps; the current channel renderer handles native controls or graceful text fallback",
        'Portable button call shape is { "action": "send", "message": "Pick a section.", "presentation": { "blocks": [{ "type": "buttons", "buttons": [{ "label": "Highlights", "value": "brief:highlights" }] }] } }; do not put buttons at presentation root',
        "For buttons, use presentation.blocks[].buttons[].value as a short stable callback token like brief:headlines; do not include secrets, JSON, URLs, local paths, provider ids, or bulky payloads",
        "Button objects use label plus value or url; do not use callback, callback_data, action_id, or provider-native action objects",
        "URL buttons must use HTTPS and should only point to links safe for the client to open",
        "Do not pass provider-native fields such as reply_markup, callback_data objects, Slack blocks, Discord components, or Teams cards",
      ],
      sideEffect: "sends a visible message to the client",
      safety: "the user-visible text, presentation, and optional media attachment must be ready to send",
    }),
    executionKind: "builtin",
    inputSchema: messageInputSchema,
    outputSchema: messageOutputSchema,
  }),
  defineReadTool({
    name: "web_search",
    pluginId: "assistant-builtin",
    label: "Search the Web",
    description: readToolDescription({
      useWhen:
        "current public web information is needed and the answer cannot be produced from user-provided context or connected client data",
      operation: "Searches the web through the configured managed web search provider",
      returns:
        "provider search results or a provider-synthesized answer with citations when available",
      doNotUse:
        "for JS-heavy pages, login-only content, or fetching a known URL; use browser automation or web_fetch when those tools are available and appropriate",
      notes: [
        "Prefer connected client sources of truth such as email, calendar, Drive, OneDrive, Monday, or signed-document tools when the user asks about their private work",
        "For current public facts, prices, news, laws, schedules, products, or other time-sensitive information, search before answering",
        "Explain provider/auth/rate-limit failures plainly instead of guessing",
      ],
    }),
    executionKind: "builtin",
    inputSchema: webSearchInputSchema,
    outputSchema: webSearchOutputSchema,
  }),
  defineReadTool({
    name: "llm-task",
    pluginId: "assistant-builtin",
    label: "Run JSON LLM task",
    description: readToolDescription({
      useWhen: "small bounded extraction or classification is needed over supplied evidence",
      operation:
        "Runs a focused JSON-only LLM task over supplied text, structured input, or text descriptions of media evidence",
      returns: "structured JSON details from the focused task",
      doNotUse:
        "provider search/read tools or missing evidence are required instead, or raw image/PDF bytes need analysis rather than supplied text evidence",
      notes: [
        "This tool serializes input as JSON text and does not decode raw image bytes or media:// references.",
        "For saved file or image attachments, use file_describe or file_extract_data instead of passing raw bytes or media references to llm-task.",
      ],
    }),
    executionKind: "builtin",
    inputSchema: llmTaskInputSchema,
    outputSchema: llmTaskOutputSchema,
  }),
] as const;

export const runtimeLocalToolContracts = [] as const;
export const alwaysAvailableAgentToolContracts = [
  ...builtinToolContracts,
  ...runtimeLocalToolContracts,
] as const;
