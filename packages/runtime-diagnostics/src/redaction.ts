import { formatUnknownError } from "@ai-assistants/errors";
import { parseDiagnosticsEnv } from "@ai-assistants/workspace-shared/env";
import type { DiagnosticError, JsonObject, JsonValue } from "./types";

const REDACTED = "[redacted]";
const MAX_STRING_LENGTH = 8_000;
const MAX_DEPTH = 10;

export type SanitizeDiagnosticOptions = {
  maxStringLength?: number | null;
  maxDepth?: number | null;
};

const sensitiveKeyPattern =
  /(^|[_-])(authorization|cookie|set-cookie|token|access-token|access_token|refresh-token|refresh_token|api-key|api_key|apikey|secret|password|credential|credentials|oauth-code|oauth_code|provider-credential|provider_credential|vault-secret-name|vault_secret_name)$/i;

const sensitivePayloadKeys = new Set(["guidancemarkdown", "bodymarkdown"]);

const sensitiveHeaderPattern = /^(authorization|cookie|set-cookie|x-api-key)$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function shouldRedactKey(key: string, parentKey?: string): boolean {
  if (sensitiveKeyPattern.test(key)) return true;
  if (sensitivePayloadKeys.has(key.replace(/[_-]/g, "").toLowerCase())) return true;
  if (parentKey && /headers/i.test(parentKey) && sensitiveHeaderPattern.test(key)) return true;
  return false;
}

function normalizeError(error: Error): DiagnosticError {
  const withFields = error as Error & { code?: unknown; status?: unknown };
  return {
    type: error.name || "Error",
    message: error.message,
    ...(typeof error.stack === "string" ? { stack: error.stack } : {}),
    ...(typeof withFields.code === "string" || typeof withFields.code === "number"
      ? { code: withFields.code }
      : {}),
    ...(typeof withFields.status === "number" ? { status: withFields.status } : {}),
  };
}

function sanitizeString(value: string, options: SanitizeDiagnosticOptions): string {
  const maxStringLength =
    options.maxStringLength === undefined ? MAX_STRING_LENGTH : options.maxStringLength;
  if (maxStringLength === null || value.length <= maxStringLength) return value;
  return `${value.slice(0, maxStringLength)}...[truncated ${value.length - maxStringLength} chars]`;
}

function sanitize(
  value: unknown,
  depth: number,
  options: SanitizeDiagnosticOptions,
  parentKey?: string,
): JsonValue {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return null;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return sanitizeString(value, options);
  if (value instanceof Error) return sanitize(normalizeError(value), depth + 1, options, parentKey);
  const maxDepth = options.maxDepth === undefined ? MAX_DEPTH : options.maxDepth;
  if (maxDepth !== null && depth >= maxDepth) return "[max-depth]";
  if (Array.isArray(value))
    return value.map((item) => sanitize(item, depth + 1, options, parentKey));
  if (!isPlainObject(value)) return sanitizeString(formatUnknownError(value), options);

  const out: JsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined || typeof child === "function" || typeof child === "symbol") continue;
    out[key] = shouldRedactKey(key, parentKey)
      ? REDACTED
      : sanitize(child, depth + 1, options, key);
  }
  return out;
}

export function sanitizeDiagnosticFields<T>(
  value: T,
  options: SanitizeDiagnosticOptions = {},
): JsonValue {
  return sanitize(value, 0, options);
}

export function sanitizeDiagnosticObject(
  value: Record<string, unknown>,
  options: SanitizeDiagnosticOptions = {},
): JsonObject {
  const sanitized = sanitizeDiagnosticFields(value, options);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    throw new Error("Diagnostic fields must sanitize to a JSON object.");
  }
  return sanitized;
}

export function diagnosticTextPayload(text: string, maxExcerpt = 240): JsonObject {
  const env = parseDiagnosticsEnv();
  const payload: JsonObject = {
    text_length: text.length,
    capture_text: env.captureText,
  };
  if (env.captureText && text.length > 0) {
    const excerpt = text.slice(0, maxExcerpt);
    payload.text_excerpt = excerpt.length < text.length ? `${excerpt}...` : excerpt;
  }
  return payload;
}
