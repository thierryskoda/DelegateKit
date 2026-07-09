import { createHash } from "node:crypto";
import type { Json } from "./database.types";
import type { AgentEventPayload } from "./schemas";

const REDACTED = "[redacted]";
const DEFAULT_MAX_STRING_LENGTH = 2_000;
const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_ARRAY_ITEMS = 50;
const DEFAULT_MAX_OBJECT_KEYS = 80;

const sensitiveKeyPattern =
  /(^|[_-])(authorization|cookie|set-cookie|token|access-token|access_token|refresh-token|refresh_token|api-key|api_key|apikey|secret|password|credential|credentials|oauth-code|oauth_code|provider-credential|provider_credential|vault-secret-name|vault_secret_name)$/i;
const normalizedSensitiveKeys = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "cookie",
  "credentials",
  "credential",
  "oauthcode",
  "password",
  "providercredential",
  "refreshtoken",
  "secret",
  "setcookie",
  "token",
  "vaultsecretname",
]);

export type AgentEvidenceRunIdentity = {
  agentId: string;
  runId?: string | null | undefined;
  sessionId?: string | null | undefined;
  sessionKey?: string | null | undefined;
};

export type SafeAgentEventJsonOptions = {
  maxStringLength?: number;
  maxDepth?: number;
  maxArrayItems?: number;
  maxObjectKeys?: number;
};

export function trimmedNonEmpty(value: string | number | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function runtimeRunId(input: AgentEvidenceRunIdentity): string | null {
  const runId = trimmedNonEmpty(input.runId);
  if (runId) return `agent_runtime:${runId}`;
  const sessionId = trimmedNonEmpty(input.sessionId);
  if (sessionId) return `agent_runtime:session:${input.agentId}:${sessionId}`;
  const sessionKey = trimmedNonEmpty(input.sessionKey);
  if (sessionKey) return `agent_runtime:session_key:${input.agentId}:${sessionKey}`;
  return null;
}

function evidenceRunKey(input: AgentEvidenceRunIdentity): string {
  return (
    trimmedNonEmpty(input.runId) ??
    (trimmedNonEmpty(input.sessionId) ? `session:${trimmedNonEmpty(input.sessionId)}` : null) ??
    (trimmedNonEmpty(input.sessionKey)
      ? `session_key:${trimmedNonEmpty(input.sessionKey)}`
      : null) ??
    "unknown_run"
  );
}

export function runtimeAgentEventSourceKey(input: {
  agentId: string;
  runId?: string | null | undefined;
  sessionId?: string | null | undefined;
  sessionKey?: string | null | undefined;
  eventType: AgentEventPayload["eventType"];
  slot: string;
}): string {
  return [
    "runtime_agent_event",
    input.agentId,
    evidenceRunKey(input),
    input.eventType,
    input.slot,
  ].join(":");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stablePayloadDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 24);
}

function isSensitiveKey(key: string): boolean {
  return sensitiveKeyPattern.test(key) || normalizedSensitiveKeys.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase());
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]`;
}

function safeJsonValue(
  value: unknown,
  options: Required<SafeAgentEventJsonOptions>,
  depth: number,
  parentKey?: string,
): Json {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return null;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return truncateString(value, options.maxStringLength);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message, options.maxStringLength),
    };
  }
  if (depth >= options.maxDepth) return "[max-depth]";
  if (Array.isArray(value)) {
    const items = value
      .slice(0, options.maxArrayItems)
      .map((item) => safeJsonValue(item, options, depth + 1, parentKey));
    if (value.length > options.maxArrayItems) {
      items.push(`[truncated ${value.length - options.maxArrayItems} items]`);
    }
    return items;
  }
  if (typeof value !== "object") return truncateString(String(value), options.maxStringLength);

  const out: Record<string, Json> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [key, child] of entries.slice(0, options.maxObjectKeys)) {
    if (child === undefined || typeof child === "function" || typeof child === "symbol") continue;
    out[key] =
      isSensitiveKey(key) || (parentKey && /headers/i.test(parentKey) && isSensitiveKey(key))
        ? REDACTED
        : safeJsonValue(child, options, depth + 1, key);
  }
  if (entries.length > options.maxObjectKeys) {
    out.__truncatedKeys = entries.length - options.maxObjectKeys;
  }
  return out;
}

export function safeAgentEventJsonObject(
  value: unknown,
  options: SafeAgentEventJsonOptions = {},
): Record<string, Json> {
  const resolved = {
    maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxArrayItems: options.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS,
    maxObjectKeys: options.maxObjectKeys ?? DEFAULT_MAX_OBJECT_KEYS,
  };
  const safe = safeJsonValue(value ?? {}, resolved, 0);
  if (safe && typeof safe === "object" && !Array.isArray(safe)) {
    return Object.fromEntries(Object.entries(safe)) as Record<string, Json>;
  }
  return { value: safe };
}
