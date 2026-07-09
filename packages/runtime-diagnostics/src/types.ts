export const DIAGNOSTIC_SCHEMA_VERSION = 1 as const;

export const diagnosticLevels = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
export type DiagnosticLevel = (typeof diagnosticLevels)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type DiagnosticError = {
  type?: string;
  message: string;
  stack?: string;
  code?: string | number;
  status?: number;
};

export type DiagnosticRecord = {
  schema_version: typeof DIAGNOSTIC_SCHEMA_VERSION;
  ts: string;
  level: DiagnosticLevel;
  service: string;
  kind: string;
  message?: string;
  ok?: boolean;
  profile_id?: string | null;
  agent_id?: string | null;
  session_id?: string | null;
  run_id?: string | null;
  tool_call_id?: string | null;
  request_id?: string | null;
  job_id?: string | null;
  job_kind?: string | null;
  action_id?: string | null;
  sync_run_id?: string | null;
  capability_account_link_id?: string | null;
  provider?: string | null;
  duration_ms?: number | null;
  channel?: string | null;
  peer_hash?: string | null;
  attrs?: JsonObject;
  err?: DiagnosticError;
};

export type DiagnosticContext = Partial<
  Pick<
    DiagnosticRecord,
    | "profile_id"
    | "agent_id"
    | "session_id"
    | "run_id"
    | "tool_call_id"
    | "request_id"
    | "job_id"
    | "job_kind"
    | "action_id"
    | "sync_run_id"
    | "capability_account_link_id"
    | "provider"
    | "channel"
  >
> & {
  worker_id?: string;
  method?: string;
  path?: string;
};

export type DiagnosticFields = Partial<
  Omit<DiagnosticRecord, "schema_version" | "service" | "kind" | "attrs" | "err">
> & {
  level?: DiagnosticLevel;
  attrs?: JsonObject | Record<string, unknown>;
  err?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function optionalStringOrNull(record: Record<string, unknown>, key: keyof DiagnosticRecord): void {
  const value = record[key];
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw new Error(`Diagnostic record ${String(key)} must be a string or null when set.`);
  }
}

function optionalNumberOrNull(record: Record<string, unknown>, key: keyof DiagnosticRecord): void {
  const value = record[key];
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error(`Diagnostic record ${String(key)} must be a finite number or null when set.`);
  }
}

export function isDiagnosticLevel(value: unknown): value is DiagnosticLevel {
  return typeof value === "string" && (diagnosticLevels as readonly string[]).includes(value);
}

export function assertDiagnosticRecord(record: unknown): asserts record is DiagnosticRecord {
  if (!isRecord(record)) throw new Error("Diagnostic record must be an object.");
  if (record.schema_version !== DIAGNOSTIC_SCHEMA_VERSION)
    throw new Error("Diagnostic record schema_version must be 1.");
  if (typeof record.ts !== "string" || !Number.isFinite(Date.parse(record.ts)))
    throw new Error("Diagnostic record ts must be an ISO timestamp.");
  if (!isDiagnosticLevel(record.level))
    throw new Error(`Diagnostic record level is invalid: ${JSON.stringify(record.level)}.`);
  if (typeof record.service !== "string" || !record.service.trim())
    throw new Error("Diagnostic record service must not be empty.");
  if (typeof record.kind !== "string" || !record.kind.trim())
    throw new Error("Diagnostic record kind must not be empty.");
  if (record.message !== undefined && typeof record.message !== "string")
    throw new Error("Diagnostic record message must be a string when set.");
  if (record.ok !== undefined && typeof record.ok !== "boolean")
    throw new Error("Diagnostic record ok must be a boolean when set.");
  for (const key of [
    "profile_id",
    "agent_id",
    "session_id",
    "run_id",
    "tool_call_id",
    "request_id",
    "job_id",
    "job_kind",
    "action_id",
    "sync_run_id",
    "capability_account_link_id",
    "provider",
    "channel",
    "peer_hash",
  ] as const) {
    optionalStringOrNull(record, key);
  }
  optionalNumberOrNull(record, "duration_ms");
  const durationMs = record.duration_ms;
  if (typeof durationMs === "number" && durationMs < 0) {
    throw new Error("Diagnostic record duration_ms must be a non-negative number when set.");
  }
  if (record.attrs !== undefined && !isJsonObject(record.attrs))
    throw new Error("Diagnostic record attrs must be a JSON object when set.");
  if (record.err !== undefined) {
    if (!isRecord(record.err) || typeof record.err.message !== "string") {
      throw new Error("Diagnostic record err must include a string message when set.");
    }
    if (record.err.type !== undefined && typeof record.err.type !== "string")
      throw new Error("Diagnostic record err.type must be a string when set.");
    if (record.err.stack !== undefined && typeof record.err.stack !== "string")
      throw new Error("Diagnostic record err.stack must be a string when set.");
    if (
      record.err.code !== undefined &&
      typeof record.err.code !== "string" &&
      typeof record.err.code !== "number"
    ) {
      throw new Error("Diagnostic record err.code must be a string or number when set.");
    }
    if (
      record.err.status !== undefined &&
      (typeof record.err.status !== "number" || !Number.isFinite(record.err.status))
    ) {
      throw new Error("Diagnostic record err.status must be a finite number when set.");
    }
  }
}

export function parseDiagnosticRecord(value: unknown): DiagnosticRecord {
  assertDiagnosticRecord(value);
  return value;
}

export function formatRunId(agentId: string, sessionId: string, userEntryId: string): string {
  return `r|${agentId}|${sessionId}|${userEntryId}`;
}
