import { formatUnknownError } from "@ai-assistants/errors";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { emitDiagnostic, getDiagnosticContext } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import type { IntegrationCredential, OAuthCredentialAccessor } from "./credentials";
import { backendDiagnosticLogger } from "../../shared/diagnostics";

const PROVIDER_FAILURE_KINDS = [
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
] as const;

type ProviderFailureKind = (typeof PROVIDER_FAILURE_KINDS)[number];

export type ProviderFailure = {
  kind: ProviderFailureKind;
  message: string;
  retryable: boolean;
  provider: string | null;
  operation: string | null;
  status: number | null;
  requestId: string | null;
  retryAfterMs: number | null;
  detail: string | null;
  providerCode: string | null;
  providerStatus: string | null;
  providerType: string | null;
  host: string | null;
  path: string | null;
  timeoutMs: number | null;
  causeName: string | null;
};

type ProviderErrorPayload = {
  detail?: string | undefined;
  providerCode?: string | undefined;
  providerStatus?: string | undefined;
  providerType?: string | undefined;
  responseBytes?: number | undefined;
};

export type ProviderHttpRequestOptions = {
  provider?: string | null;
  operation?: string | null;
  timeoutMs?: number;
  /** When set, auth headers come from the accessor; OAuth credentials get reactive 401 refresh + one retry. */
  credential?: IntegrationCredential;
  /**
   * When false, successful responses do not emit `provider.http` diagnostics (failures still emit).
   * Use when the caller logs one aggregated line for many identical requests (e.g. email message fetches).
   */
  emitSuccessDiagnostics?: boolean;
};

type ProviderHttpClientOptions = {
  defaultTimeoutMs?: number;
  errorBodyLimitBytes?: number;
  fetchImpl?: typeof fetch;
};

type ProviderUrlParts = {
  host: string | null;
  path: string | null;
};

type TimeoutSignal = {
  signal?: AbortSignal | undefined;
  cleanup: () => void;
  timedOut: () => boolean;
};

type ProviderHttpErrorInput = {
  kind: ProviderFailureKind;
  provider?: string | null | undefined;
  operation?: string | null | undefined;
  status?: number | null | undefined;
  requestId?: string | null | undefined;
  retryAfterMs?: number | null | undefined;
  detail?: string | null | undefined;
  providerCode?: string | null | undefined;
  providerStatus?: string | null | undefined;
  providerType?: string | null | undefined;
  retryable?: boolean | undefined;
  url?: string;
  timeoutMs?: number | null | undefined;
  cause?: unknown;
  message?: string;
};

const DEFAULT_PROVIDER_HTTP_TIMEOUT_MS = 45_000;
const DEFAULT_ERROR_BODY_LIMIT_BYTES = 16 * 1024;
const jsonRecordSchema = z.record(z.string(), z.unknown());

function providerUrlParts(rawUrl: string | undefined): ProviderUrlParts {
  if (!rawUrl) return { host: null, path: null };
  try {
    const url = new URL(rawUrl);
    return { host: url.host, path: url.pathname };
  } catch {
    return { host: null, path: null };
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function truncate(value: string, limit = 600): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}...`;
}

function cleanDetail(value: string): string {
  return truncate(
    value
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
      .replace(/("?(?:access|refresh)_token"?\s*[:=]\s*)"[^"]+"/gi, "$1[redacted]")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function unknownErrorDetail(error: unknown): string {
  return cleanDetail(formatUnknownError(error));
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const clean = optionalString(value);
    if (clean) return clean;
  }
  return undefined;
}

function firstErrorSubject(root: Record<string, unknown>): Record<string, unknown> | undefined {
  const error = root.error;
  const detail = root.detail;
  const errors = Array.isArray(root.errors) ? root.errors : undefined;
  return asRecord(error) ?? asRecord(detail) ?? asRecord(errors?.[0]) ?? root;
}

function formatProviderErrorPayload(payload: unknown): Omit<ProviderErrorPayload, "responseBytes"> {
  if (Array.isArray(payload)) return formatProviderErrorPayload(payload[0]);
  const root = asRecord(payload);
  if (!root) return {};
  const subject = firstErrorSubject(root);
  if (!subject) return {};
  const message = firstString(
    subject.message,
    subject.detail,
    root.message,
    root.error_description,
    root.error,
    root.detail,
  );
  const providerType = firstString(subject.type, root.type);
  const providerCode = firstString(subject.code, subject.reason, root.code, root.error);
  const providerStatus = firstString(subject.status, root.status);
  const metadata = [
    providerType ? `type=${providerType}` : undefined,
    providerCode ? `code=${providerCode}` : undefined,
    providerStatus ? `status=${providerStatus}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  const detail =
    message && metadata
      ? `${message} [${metadata}]`
      : (message ?? (metadata ? `[${metadata}]` : undefined));
  return {
    detail: detail ? cleanDetail(detail) : undefined,
    providerCode,
    providerStatus,
    providerType,
  };
}

function classifyProviderFailure(input: {
  status?: number | null;
  detail?: string | null | undefined;
  providerCode?: string | null | undefined;
  providerStatus?: string | null | undefined;
  cause?: unknown;
  timedOut?: boolean;
  retryAfterMs?: number | null;
}): { kind: ProviderFailureKind; retryable: boolean } {
  const status = input.status ?? null;
  const haystack = [
    input.detail,
    input.providerCode,
    input.providerStatus,
    input.cause instanceof Error ? input.cause.message : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (input.timedOut) return { kind: "timeout", retryable: true };
  if (status === null) return { kind: "network", retryable: true };

  if (
    status === 401 ||
    /\b(invalid_grant|invalid_token|unauthorized|unauthenticated|expired_token)\b/.test(haystack)
  ) {
    return { kind: "auth", retryable: false };
  }
  if (
    /\b(insufficient_quota|quota|billing|payment|required balance|usage limit|daily limit)\b/.test(
      haystack,
    ) ||
    status === 402
  ) {
    return { kind: "quota", retryable: input.retryAfterMs != null };
  }
  if (
    status === 429 ||
    /\b(rate[_ -]?limit|too many requests|ratelimit|rate limit exceeded)\b/.test(haystack)
  ) {
    return { kind: "rate_limit", retryable: true };
  }
  if (
    status === 403 ||
    /\b(forbidden|permission_denied|permission denied|access denied|insufficient permissions?)\b/.test(
      haystack,
    )
  ) {
    return { kind: "permission", retryable: false };
  }
  if (status === 404) return { kind: "not_found", retryable: false };
  if ([400, 409, 413, 415, 422].includes(status)) return { kind: "bad_request", retryable: false };
  if (status === 408 || status === 425 || status === 423)
    return { kind: "provider_unavailable", retryable: true };
  if (status >= 500) return { kind: "provider_unavailable", retryable: true };
  return { kind: "unknown", retryable: false };
}

function retryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function providerRequestId(headers: Headers): string | null {
  return (
    firstString(
      headers.get("x-request-id"),
      headers.get("request-id"),
      headers.get("x-ms-request-id"),
      headers.get("x-goog-request-id"),
      headers.get("x-amzn-requestid"),
      headers.get("cf-ray"),
    ) ?? null
  );
}

function causeName(cause: unknown): string | null {
  return cause instanceof Error && cause.name ? cause.name : null;
}

function providerFailureMessage(failure: Omit<ProviderFailure, "message">): string {
  const subject =
    [failure.provider, failure.operation].filter(Boolean).join(" ") || "Provider request";
  const status = failure.status == null ? "" : `, HTTP ${failure.status}`;
  const retryAfter =
    failure.retryAfterMs == null ? "" : ` Retry after ${Math.ceil(failure.retryAfterMs / 1000)}s.`;
  const requestId = failure.requestId ? ` [request_id=${failure.requestId}]` : "";
  const detail = failure.detail ? `: ${failure.detail}` : ".";
  return `${subject} failed (${failure.kind}${status})${detail}${requestId}${retryAfter}`;
}

function retryableForKind(kind: ProviderFailureKind): boolean {
  return ["network", "timeout", "provider_unavailable", "rate_limit"].includes(kind);
}

function providerFailureKindForDomainCode(code: string): ProviderFailureKind {
  if (code === domainCodes.UNAUTHORIZED) return "auth";
  if (code === domainCodes.FORBIDDEN) return "permission";
  if (code === domainCodes.NOT_FOUND) return "not_found";
  if (code === domainCodes.RATE_LIMITED) return "rate_limit";
  if (code === domainCodes.SERVICE_UNAVAILABLE) return "provider_unavailable";
  if (code === domainCodes.BAD_REQUEST || code === domainCodes.VALIDATION) return "bad_request";
  return "unknown";
}

export class ProviderHttpError extends Error {
  readonly failureKind: ProviderFailureKind;
  readonly provider: string | null;
  readonly operation: string | null;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly retryAfterMs: number | null;
  readonly detail: string | null;
  readonly providerCode: string | null;
  readonly providerStatus: string | null;
  readonly providerType: string | null;
  readonly retryable: boolean;
  readonly host: string | null;
  readonly path: string | null;
  readonly timeoutMs: number | null;
  readonly cause: unknown;

  constructor(input: ProviderHttpErrorInput) {
    const parts = providerUrlParts(input.url);
    const baseFailure = {
      kind: input.kind,
      retryable: input.retryable ?? retryableForKind(input.kind),
      provider: input.provider ?? null,
      operation: input.operation ?? null,
      status: input.status ?? null,
      requestId: input.requestId ?? null,
      retryAfterMs: input.retryAfterMs ?? null,
      detail: input.detail ? cleanDetail(input.detail) : null,
      providerCode: input.providerCode ?? null,
      providerStatus: input.providerStatus ?? null,
      providerType: input.providerType ?? null,
      host: parts.host,
      path: parts.path,
      timeoutMs: input.timeoutMs ?? null,
      causeName: causeName(input.cause),
    };
    super(input.message ?? providerFailureMessage(baseFailure), { cause: input.cause });
    this.name = "ProviderHttpError";
    this.failureKind = baseFailure.kind;
    this.provider = baseFailure.provider;
    this.operation = baseFailure.operation;
    this.status = baseFailure.status;
    this.requestId = baseFailure.requestId;
    this.retryAfterMs = baseFailure.retryAfterMs;
    this.detail = baseFailure.detail;
    this.providerCode = baseFailure.providerCode;
    this.providerStatus = baseFailure.providerStatus;
    this.providerType = baseFailure.providerType;
    this.retryable = baseFailure.retryable;
    this.host = baseFailure.host;
    this.path = baseFailure.path;
    this.timeoutMs = baseFailure.timeoutMs;
    this.cause = input.cause;
  }

  static fromResponse(input: {
    response: Response;
    url: string;
    provider?: string | null | undefined;
    operation?: string | null | undefined;
    payload: ProviderErrorPayload;
    timeoutMs?: number | null | undefined;
  }): ProviderHttpError {
    const retryAfter = retryAfterMs(input.response.headers);
    const requestId = providerRequestId(input.response.headers);
    const classification = classifyProviderFailure({
      status: input.response.status,
      detail: input.payload.detail,
      providerCode: input.payload.providerCode,
      providerStatus: input.payload.providerStatus,
      retryAfterMs: retryAfter,
    });
    return new ProviderHttpError({
      kind: classification.kind,
      retryable: classification.retryable,
      provider: input.provider,
      operation: input.operation,
      status: input.response.status,
      requestId,
      retryAfterMs: retryAfter,
      detail: input.payload.detail ?? input.response.statusText,
      providerCode: input.payload.providerCode,
      providerStatus: input.payload.providerStatus,
      providerType: input.payload.providerType,
      url: input.url,
      timeoutMs: input.timeoutMs ?? null,
    });
  }

  static fromNetwork(input: {
    error: unknown;
    url: string;
    provider?: string | null | undefined;
    operation?: string | null | undefined;
    timedOut: boolean;
    timeoutMs?: number | null | undefined;
  }): ProviderHttpError {
    const classification = classifyProviderFailure({
      status: null,
      cause: input.error,
      timedOut: input.timedOut,
    });
    return new ProviderHttpError({
      kind: classification.kind,
      retryable: classification.retryable,
      provider: input.provider,
      operation: input.operation,
      detail: unknownErrorDetail(input.error),
      url: input.url,
      timeoutMs: input.timeoutMs ?? null,
      cause: input.error,
    });
  }

  toJSON(): ProviderFailure {
    return {
      kind: this.failureKind,
      message: this.message,
      retryable: this.retryable,
      provider: this.provider,
      operation: this.operation,
      status: this.status,
      requestId: this.requestId,
      retryAfterMs: this.retryAfterMs,
      detail: this.detail,
      providerCode: this.providerCode,
      providerStatus: this.providerStatus,
      providerType: this.providerType,
      host: this.host,
      path: this.path,
      timeoutMs: this.timeoutMs,
      causeName: causeName(this.cause),
    };
  }
}

export function isProviderHttpError(error: unknown): error is ProviderHttpError {
  return error instanceof ProviderHttpError;
}

export function serializeProviderFailure(
  error: unknown,
  context: ProviderHttpRequestOptions = {},
): ProviderFailure {
  if (error instanceof ProviderHttpError) {
    const serialized = error.toJSON();
    return {
      ...serialized,
      provider: serialized.provider ?? context.provider ?? null,
      operation: serialized.operation ?? context.operation ?? null,
    };
  }
  if (error instanceof DomainError) {
    const status =
      error.details &&
      typeof error.details === "object" &&
      !Array.isArray(error.details) &&
      typeof Reflect.get(error.details, "httpStatus") === "number"
        ? (Reflect.get(error.details, "httpStatus") as number)
        : null;
    const kind = providerFailureKindForDomainCode(error.code);
    return {
      kind,
      message: cleanDetail(error.message),
      retryable: retryableForKind(kind),
      provider: context.provider ?? null,
      operation: context.operation ?? null,
      status,
      requestId: null,
      retryAfterMs: null,
      detail: cleanDetail(error.message),
      providerCode: null,
      providerStatus: null,
      providerType: null,
      host: null,
      path: null,
      timeoutMs: context.timeoutMs ?? null,
      causeName: causeName(error),
    };
  }
  const parts = providerUrlParts(undefined);
  const kind: ProviderFailureKind = "unknown";
  const baseFailure = {
    kind,
    retryable: false,
    provider: context.provider ?? null,
    operation: context.operation ?? null,
    status: null,
    requestId: null,
    retryAfterMs: null,
    detail: unknownErrorDetail(error),
    providerCode: null,
    providerStatus: null,
    providerType: null,
    host: parts.host,
    path: parts.path,
    timeoutMs: context.timeoutMs ?? null,
    causeName: causeName(error),
  };
  return {
    ...baseFailure,
    message: providerFailureMessage(baseFailure),
  };
}

function timeoutSignal(input: {
  signal?: AbortSignal | null | undefined;
  timeoutMs?: number;
}): TimeoutSignal {
  const timeoutMs = input.timeoutMs;
  const sourceSignal = input.signal ?? undefined;
  if (!timeoutMs && !sourceSignal) return { cleanup: () => {}, timedOut: () => false };
  if (!timeoutMs)
    return {
      ...(sourceSignal === undefined ? {} : { signal: sourceSignal }),
      cleanup: () => {},
      timedOut: () => false,
    };

  const controller = new AbortController();
  let didTimeout = false;
  const relayAbort = () => controller.abort(sourceSignal?.reason);
  const timeoutId = setTimeout(
    () => {
      didTimeout = true;
      controller.abort(new Error(`Provider request timed out after ${timeoutMs}ms.`));
    },
    Math.max(1, timeoutMs),
  );

  if (sourceSignal?.aborted) {
    relayAbort();
  } else if (sourceSignal) {
    sourceSignal.addEventListener("abort", relayAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      sourceSignal?.removeEventListener("abort", relayAbort);
    },
    timedOut: () => didTimeout,
  };
}

async function readTextLimited(
  response: Response,
  limitBytes: number,
): Promise<{ text: string; bytes: number }> {
  if (limitBytes <= 0) return { text: "", bytes: 0 };
  const reader = response.body?.getReader();
  if (!reader) return { text: "", bytes: 0 };
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  let reachedLimit = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const remaining = limitBytes - bytes;
      if (remaining <= 0) {
        reachedLimit = true;
        break;
      }
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      bytes += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });
      if (bytes >= limitBytes) {
        reachedLimit = true;
        break;
      }
    }
    text += decoder.decode();
  } finally {
    if (reachedLimit) await reader.cancel().catch(() => {});
  }
  return { text, bytes };
}

async function readProviderErrorPayload(
  response: Response,
  limitBytes: number,
): Promise<ProviderErrorPayload> {
  const { text, bytes } = await readTextLimited(response, limitBytes);
  const rawText = optionalString(text);
  if (!rawText) return { responseBytes: bytes };
  try {
    return { ...formatProviderErrorPayload(JSON.parse(rawText)), responseBytes: bytes };
  } catch {
    return { detail: cleanDetail(rawText), responseBytes: bytes };
  }
}

function parseJsonObjectResponse(input: {
  text: string;
  url: string;
  response: Response;
  provider?: string | null | undefined;
  operation?: string | null | undefined;
  timeoutMs?: number | null | undefined;
}): Record<string, unknown> {
  if (!input.text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.text);
  } catch (error) {
    throw new ProviderHttpError({
      kind: "provider_contract",
      retryable: false,
      provider: input.provider,
      operation: input.operation,
      status: input.response.status,
      requestId: providerRequestId(input.response.headers),
      detail: `Response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      url: input.url,
      timeoutMs: input.timeoutMs ?? null,
      cause: error,
    });
  }

  const body = jsonRecordSchema.safeParse(parsed);
  if (!body.success) {
    throw new ProviderHttpError({
      kind: "provider_contract",
      retryable: false,
      provider: input.provider,
      operation: input.operation,
      status: input.response.status,
      requestId: providerRequestId(input.response.headers),
      detail: `Response JSON must be an object: ${formatUnknownError(body.error)}`,
      url: input.url,
      timeoutMs: input.timeoutMs ?? null,
    });
  }
  return body.data;
}

function emitProviderHttpDiagnostic(input: {
  url: string;
  init: RequestInit;
  startedAt: number;
  status?: number | null | undefined;
  ok: boolean;
  level?: "info" | "warn" | "error";
  err?: unknown;
  provider?: string | null | undefined;
  operation?: string | null | undefined;
  responseBytes?: number | undefined;
  failure?: ProviderFailure | null | undefined;
  timeoutMs?: number | null | undefined;
}): void {
  const parts = providerUrlParts(input.url);
  const context = getDiagnosticContext();
  emitDiagnostic(backendDiagnosticLogger(), "provider.http", {
    ok: input.ok,
    level: input.level ?? (input.ok ? "info" : "warn"),
    duration_ms: Date.now() - input.startedAt,
    provider: input.provider ?? context.provider ?? null,
    err: input.err,
    attrs: {
      method: input.init.method ?? "GET",
      host: parts.host,
      path: parts.path,
      operation: input.operation ?? null,
      status: input.status ?? null,
      timeout_ms: input.timeoutMs ?? null,
      ...(input.responseBytes != null ? { response_bytes: input.responseBytes } : {}),
      ...(input.failure
        ? {
            failure_kind: input.failure.kind,
            retryable: input.failure.retryable,
            provider_request_id: input.failure.requestId,
            retry_after_ms: input.failure.retryAfterMs,
          }
        : {}),
    },
  });
}

async function mergeInitWithCredential(
  init: RequestInit,
  signal: AbortSignal | undefined,
  credential?: IntegrationCredential,
): Promise<RequestInit> {
  const headers = new Headers(init.headers);
  if (credential) {
    const auth = await credential.getAuthHeaders();
    for (const [key, value] of Object.entries(auth)) {
      headers.set(key, value);
    }
  }
  return { ...init, headers, ...(signal === undefined ? {} : { signal }) };
}

function oauthCredential(options: ProviderHttpRequestOptions): OAuthCredentialAccessor | undefined {
  const c = options.credential;
  return c?.kind === "oauth" ? c : undefined;
}

type ProviderResponseReader<TBody> = (input: {
  response: Response;
  url: string;
  options: ProviderHttpRequestOptions;
  timeoutMs: number;
}) => Promise<{ body: TBody; responseBytes?: number }>;

export class ProviderHttpClient {
  private readonly defaultTimeoutMs: number;
  private readonly errorBodyLimitBytes: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ProviderHttpClientOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_PROVIDER_HTTP_TIMEOUT_MS;
    this.errorBodyLimitBytes = options.errorBodyLimitBytes ?? DEFAULT_ERROR_BODY_LIMIT_BYTES;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async json<TBody extends Record<string, unknown>>(
    url: string,
    init: RequestInit,
    responseSchema: z.ZodType<TBody>,
    options: ProviderHttpRequestOptions = {},
  ): Promise<TBody> {
    return this.request(url, init, options, async ({ response, url, options, timeoutMs }) => {
      const text = await response.text();
      const responseBytes = Buffer.byteLength(text, "utf8");
      const body = parseJsonObjectResponse({
        text,
        url,
        response,
        provider: options.provider,
        operation: options.operation,
        timeoutMs,
      });
      const parsedBody = responseSchema.safeParse(body);
      if (!parsedBody.success) {
        throw new ProviderHttpError({
          kind: "provider_contract",
          retryable: false,
          provider: options.provider,
          operation: options.operation,
          status: response.status,
          requestId: providerRequestId(response.headers),
          detail: `Response JSON failed schema validation: ${formatUnknownError(parsedBody.error)}`,
          url,
          timeoutMs,
        });
      }
      return { body: parsedBody.data, responseBytes };
    });
  }

  async bytes(
    url: string,
    init: RequestInit,
    options: ProviderHttpRequestOptions = {},
  ): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    return this.request(url, init, options, async ({ response }) => {
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        body: { bytes, contentType: response.headers.get("content-type") },
        responseBytes: bytes.byteLength,
      };
    });
  }

  private async request<TBody>(
    url: string,
    init: RequestInit,
    options: ProviderHttpRequestOptions,
    readSuccess: ProviderResponseReader<TBody>,
  ): Promise<TBody> {
    const startedAt = Date.now();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const signal = timeoutSignal({ signal: init.signal, timeoutMs });
    let response: Response | undefined;
    let responseBytes: number | undefined;
    let didOAuth401Retry = false;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const mergedInit = await mergeInitWithCredential(init, signal.signal, options.credential);
        response = await this.fetchImpl(url, mergedInit);
        const oauth = oauthCredential(options);
        if (response.status === 401 && oauth && attempt === 0) {
          await oauth.forceRefresh();
          didOAuth401Retry = true;
          continue;
        }
        break;
      }
      if (!response) {
        throw new DomainError(
          domainCodes.INTERNAL,
          "Provider HTTP json(): internal error (no response).",
        );
      }
      if (!response.ok) {
        const oauth = oauthCredential(options);
        if (response.status === 401 && oauth && didOAuth401Retry) {
          await oauth.markRevoked();
          throw new DomainError(
            domainCodes.UNAUTHORIZED,
            `${options.provider ?? "Provider"} rejected OAuth credentials after refresh. Reconnect the provider capability.`,
          );
        }
        const payload = await readProviderErrorPayload(response, this.errorBodyLimitBytes);
        responseBytes = payload.responseBytes;
        throw ProviderHttpError.fromResponse({
          response,
          url,
          provider: options.provider,
          operation: options.operation,
          payload,
          timeoutMs,
        });
      }
      const success = await readSuccess({
        response,
        url,
        options,
        timeoutMs,
      });
      responseBytes = success.responseBytes;
      if (options.emitSuccessDiagnostics !== false) {
        emitProviderHttpDiagnostic({
          url,
          init,
          startedAt,
          status: response.status,
          ok: true,
          level: "info",
          provider: options.provider,
          operation: options.operation,
          responseBytes,
          timeoutMs,
        });
      }
      return success.body;
    } catch (error) {
      if (error instanceof DomainError) {
        emitProviderHttpDiagnostic({
          url,
          init,
          startedAt,
          status: response?.status ?? null,
          ok: false,
          level: "error",
          err: error,
          provider: options.provider,
          operation: options.operation,
          responseBytes,
          failure: null,
          timeoutMs,
        });
        throw error;
      }
      const providerError =
        error instanceof ProviderHttpError
          ? error
          : ProviderHttpError.fromNetwork({
              error,
              url,
              provider: options.provider,
              operation: options.operation,
              timedOut: signal.timedOut(),
              timeoutMs,
            });
      const failure = providerError.toJSON();
      emitProviderHttpDiagnostic({
        url,
        init,
        startedAt,
        status: response?.status ?? providerError.status,
        ok: false,
        level: response ? "warn" : "error",
        err: providerError,
        provider: options.provider,
        operation: options.operation,
        responseBytes,
        failure,
        timeoutMs,
      });
      throw providerError;
    } finally {
      signal.cleanup();
    }
  }
}
