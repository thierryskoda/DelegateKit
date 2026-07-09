import { isIP } from "node:net";
import {
  publicWebFetchUrlOutputSchema,
  publicWebSearchOutputSchema,
  type PublicWebFailure,
  type PublicWebFetchUrlInput,
  type PublicWebFetchUrlOutput,
  type PublicWebSearchInput,
  type PublicWebSearchOutput,
} from "@ai-assistants/public-web-contracts";
import { formatUnknownError } from "@ai-assistants/errors";
import { timedFetch } from "@ai-assistants/workspace-shared/timed-fetch";
import { backendApiEnv } from "../../shared/env";

const SEARCH_ENDPOINT = "https://api.perplexity.ai/search";
const AGENT_ENDPOINT = "https://api.perplexity.ai/v1/agent";
const PERPLEXITY_TIMEOUT_MS = 30_000;

function providerFailure(
  kind: PublicWebFailure["kind"],
  message: string,
  retryable: boolean,
): PublicWebFailure {
  return { kind, message, retryable };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function responseErrorMessage(body: unknown, fallback: string): string {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  return asNonEmptyString(error?.message) ?? asNonEmptyString(record?.message) ?? fallback;
}

function failureForProviderStatus(status: number, body: unknown): PublicWebFailure {
  if (status === 400 || status === 422) {
    return providerFailure("bad_request", responseErrorMessage(body, "Perplexity rejected the request."), false);
  }
  if (status === 401 || status === 403) {
    return providerFailure(
      "missing_config",
      responseErrorMessage(body, "PERPLEXITY_API_KEY was rejected by Perplexity."),
      false,
    );
  }
  if (status === 408 || status === 504) {
    return providerFailure("timeout", responseErrorMessage(body, "Perplexity timed out."), true);
  }
  if (status === 429) {
    return providerFailure("rate_limit", responseErrorMessage(body, "Perplexity rate limit reached."), true);
  }
  if (status >= 500) {
    return providerFailure(
      "provider_unavailable",
      responseErrorMessage(body, "Perplexity is unavailable."),
      true,
    );
  }
  return providerFailure(
    "provider_contract",
    responseErrorMessage(body, `Unexpected Perplexity status ${status}.`),
    false,
  );
}

function perplexityApiKeyOrFailure(): string | PublicWebFailure {
  try {
    return backendApiEnv().perplexityApiKey;
  } catch (error) {
    return providerFailure("missing_config", formatUnknownError(error), false);
  }
}

async function postPerplexity(
  endpoint: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; body: unknown } | { ok: false; failure: PublicWebFailure }> {
  try {
    const response = await timedFetch.fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: PERPLEXITY_TIMEOUT_MS,
    });
    const responseBody = await response
      .json()
      .catch(() => null);
    if (!response.ok) {
      return { ok: false, failure: failureForProviderStatus(response.status, responseBody) };
    }
    return { ok: true, body: responseBody };
  } catch (error) {
    if (error instanceof Error && /timed out/i.test(error.message)) {
      return {
        ok: false,
        failure: providerFailure("timeout", "Perplexity request timed out.", true),
      };
    }
    return {
      ok: false,
      failure: providerFailure("provider_unavailable", formatUnknownError(error), true),
    };
  }
}

function siteNameForUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function normalizeSearchResults(body: unknown) {
  const record = asRecord(body);
  const rawResults = Array.isArray(record?.results) ? record.results : null;
  if (!rawResults) return null;
  return rawResults.flatMap((item) => {
    const result = asRecord(item);
    if (!result) return [];
    const url = asNonEmptyString(result.url);
    if (!url) return [];
    const title = asNonEmptyString(result.title) ?? url;
    return [
      {
        title,
        url,
        snippet: asNonEmptyString(result.snippet),
        date: asNonEmptyString(result.date),
        lastUpdated: asNonEmptyString(result.last_updated),
        siteName: siteNameForUrl(url),
      },
    ];
  });
}

function searchRequestBody(input: PublicWebSearchInput): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      query: input.query,
      max_results: input.count,
      country: input.country,
      search_language_filter: input.search_language_filter,
      search_domain_filter: input.search_domain_filter,
      search_recency_filter: input.search_recency_filter,
      search_after_date_filter: input.search_after_date_filter,
      search_before_date_filter: input.search_before_date_filter,
      last_updated_after_filter: input.last_updated_after_filter,
      last_updated_before_filter: input.last_updated_before_filter,
      max_tokens: input.max_tokens,
      max_tokens_per_page: input.max_tokens_per_page,
    }).filter(([, value]) => value !== undefined),
  );
}

export async function runPerplexitySearch(
  input: PublicWebSearchInput,
): Promise<PublicWebSearchOutput> {
  const startedAt = Date.now();
  const apiKey = perplexityApiKeyOrFailure();
  if (typeof apiKey !== "string") {
    return publicWebSearchOutputSchema.parse({
      provider: "perplexity",
      status: "failed",
      query: input.query,
      count: 0,
      results: [],
      tookMs: Date.now() - startedAt,
      failure: apiKey,
    });
  }

  const response = await postPerplexity(SEARCH_ENDPOINT, apiKey, searchRequestBody(input));
  if (!response.ok) {
    return publicWebSearchOutputSchema.parse({
      provider: "perplexity",
      status: "failed",
      query: input.query,
      count: 0,
      results: [],
      tookMs: Date.now() - startedAt,
      failure: response.failure,
    });
  }

  const results = normalizeSearchResults(response.body);
  if (!results) {
    return publicWebSearchOutputSchema.parse({
      provider: "perplexity",
      status: "failed",
      query: input.query,
      count: 0,
      results: [],
      tookMs: Date.now() - startedAt,
      failure: providerFailure(
        "provider_contract",
        "Perplexity search response did not include a results array.",
        false,
      ),
    });
  }

  return publicWebSearchOutputSchema.parse({
    provider: "perplexity",
    status: "succeeded",
    query: input.query,
    count: results.length,
    results,
    tookMs: Date.now() - startedAt,
  });
}

function validatePublicUrl(rawUrl: string): PublicWebFailure | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return providerFailure("bad_request", "URL is not valid.", false);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return providerFailure("blocked_url", "Only public http and https URLs can be fetched.", false);
  }
  if (parsed.username || parsed.password) {
    return providerFailure("blocked_url", "URLs with embedded credentials cannot be fetched.", false);
  }
  const host = parsed.hostname.toLowerCase();
  const ipHost = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return providerFailure("blocked_url", "Local or internal hostnames cannot be fetched.", false);
  }
  const ipKind = isIP(ipHost);
  if (ipKind === 4) {
    const parts = ipHost.split(".").map((part) => Number.parseInt(part, 10));
    const [first, second] = parts;
    if (first === undefined || second === undefined) {
      return providerFailure("blocked_url", "Invalid IPv4 URL host cannot be fetched.", false);
    }
    if (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    ) {
      return providerFailure("blocked_url", "Private or loopback IP URLs cannot be fetched.", false);
    }
  }
  if (
    ipKind === 6 &&
    (ipHost === "::" ||
      ipHost === "::1" ||
      ipHost.startsWith("fc") ||
      ipHost.startsWith("fd") ||
      ipHost.startsWith("fe80") ||
      ipHost.startsWith("::ffff:0:") ||
      ipHost.startsWith("::ffff:7f") ||
      ipHost.startsWith("::ffff:a") ||
      ipHost.startsWith("::ffff:ac1") ||
      ipHost.startsWith("::ffff:c0a8"))
  ) {
    return providerFailure("blocked_url", "Private or loopback IP URLs cannot be fetched.", false);
  }
  return null;
}

function collectOutputText(output: unknown): string | null {
  if (!Array.isArray(output)) return null;
  const texts: string[] = [];
  for (const item of output) {
    const record = asRecord(item);
    const content = Array.isArray(record?.content) ? record.content : [];
    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem);
      const text = asNonEmptyString(contentRecord?.text);
      if (text) texts.push(text);
    }
  }
  return texts.join("\n\n").trim() || null;
}

function collectFetchedContents(output: unknown) {
  if (!Array.isArray(output)) return [];
  return output.flatMap((item) => {
    const record = asRecord(item);
    if (record?.type !== "fetch_url_results") return [];
    const contents = Array.isArray(record.contents) ? record.contents : [];
    return contents.flatMap((content) => {
      const contentRecord = asRecord(content);
      const url = asNonEmptyString(contentRecord?.url);
      if (!url) return [];
      return [
        {
          url,
          title: asNonEmptyString(contentRecord?.title),
          snippet: asNonEmptyString(contentRecord?.snippet),
        },
      ];
    });
  });
}

function collectCitations(output: unknown) {
  if (!Array.isArray(output)) return [];
  const citations: { title: string | null; url: string }[] = [];
  const seen = new Set<string>();
  for (const item of output) {
    const record = asRecord(item);
    const content = Array.isArray(record?.content) ? record.content : [];
    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem);
      const annotations = Array.isArray(contentRecord?.annotations)
        ? contentRecord.annotations
        : [];
      for (const annotation of annotations) {
        const annotationRecord = asRecord(annotation);
        const url = asNonEmptyString(annotationRecord?.url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        citations.push({
          url,
          title: asNonEmptyString(annotationRecord?.title),
        });
      }
    }
  }
  return citations;
}

function fetchRequestBody(input: PublicWebFetchUrlInput): Record<string, unknown> {
  return {
    preset: "fast-search",
    input: `Fetch and inspect only this public URL: ${input.url}\n\nObjective: ${input.objective}`,
    instructions: `${input.instructions}\n\nUse fetch_url before answering. If the URL is blocked, inaccessible, or only partially available, say that plainly instead of guessing.`,
    tools: [{ type: "fetch_url", max_urls: 1 }],
    max_steps: 2,
    max_output_tokens: input.maxOutputTokens,
    stream: false,
  };
}

export async function runPerplexityFetchUrl(
  input: PublicWebFetchUrlInput,
): Promise<PublicWebFetchUrlOutput> {
  const startedAt = Date.now();
  const blocked = validatePublicUrl(input.url);
  if (blocked) {
    return publicWebFetchUrlOutputSchema.parse({
      provider: "perplexity",
      status: "failed",
      requestedUrl: input.url,
      answer: null,
      fetchedContents: [],
      citations: [],
      tookMs: Date.now() - startedAt,
      providerRequestId: null,
      failure: blocked,
    });
  }
  const apiKey = perplexityApiKeyOrFailure();
  if (typeof apiKey !== "string") {
    return publicWebFetchUrlOutputSchema.parse({
      provider: "perplexity",
      status: "failed",
      requestedUrl: input.url,
      answer: null,
      fetchedContents: [],
      citations: [],
      tookMs: Date.now() - startedAt,
      providerRequestId: null,
      failure: apiKey,
    });
  }

  const response = await postPerplexity(AGENT_ENDPOINT, apiKey, fetchRequestBody(input));
  if (!response.ok) {
    return publicWebFetchUrlOutputSchema.parse({
      provider: "perplexity",
      status: "failed",
      requestedUrl: input.url,
      answer: null,
      fetchedContents: [],
      citations: [],
      tookMs: Date.now() - startedAt,
      providerRequestId: null,
      failure: response.failure,
    });
  }

  const record = asRecord(response.body);
  const providerRequestId = asNonEmptyString(record?.id);
  const output = record?.output;
  const answer = collectOutputText(output);
  const fetchedContents = collectFetchedContents(output);
  const citations = collectCitations(output);
  const error = asRecord(record?.error);
  if (error) {
    const failure = providerFailure(
      "provider_unavailable",
      asNonEmptyString(error.message) ?? "Perplexity Agent API returned an error.",
      true,
    );
    return publicWebFetchUrlOutputSchema.parse({
      provider: "perplexity",
      status: "failed",
      requestedUrl: input.url,
      answer,
      fetchedContents,
      citations,
      tookMs: Date.now() - startedAt,
      providerRequestId,
      failure,
    });
  }
  if (fetchedContents.length === 0) {
    return publicWebFetchUrlOutputSchema.parse({
      provider: "perplexity",
      status: answer ? "partial" : "failed",
      requestedUrl: input.url,
      answer,
      fetchedContents,
      citations,
      tookMs: Date.now() - startedAt,
      providerRequestId,
      failure: providerFailure(
        "inaccessible_url",
        "Perplexity did not return fetched content for this URL.",
        false,
      ),
    });
  }

  return publicWebFetchUrlOutputSchema.parse({
    provider: "perplexity",
    status: "succeeded",
    requestedUrl: input.url,
    answer,
    fetchedContents,
    citations,
    tookMs: Date.now() - startedAt,
    providerRequestId,
  });
}
