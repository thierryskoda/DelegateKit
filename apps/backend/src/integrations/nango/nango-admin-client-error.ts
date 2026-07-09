import {
  DomainError,
  domainCodes,
  inferDomainCodeFromHttpStatus,
  type DomainCode,
} from "@ai-assistants/errors";
import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { suspendConnectedProviderAccountForReconnect } from "@ai-assistants/capability-lifecycle";
import {
  emitDiagnostic,
  getDiagnosticContext,
  sanitizeDiagnosticFields,
  type JsonObject,
  type JsonValue,
} from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";

/** Safe subset of `DomainError.details` for Nango failures (no response bodies). */
type NangoPublicErrorDetails = {
  vendor: "nango";
  operation: string;
  httpStatus: number | null;
  authFailureKind?: NangoAuthFailureKind;
  nangoErrorCode?: string;
  requestId?: string;
};

type NangoAuthFailureKind = "reconnect_required";

type NangoFailureClassification = {
  authFailureKind: NangoAuthFailureKind | null;
};

export type NangoAuthFailureProjection = {
  db: SupabaseServiceClient;
  account: TableRow<"connected_provider_accounts">;
};

export type NangoClientErrorContext = {
  /** Stable operation id for metrics / debugging, e.g. `nango.microsoft_onedrive_drive.proxy.get-item`. */
  operation: string;
  /** Short summary without embedding `error.response.data` (client-visible). */
  publicSummary: string;
  providerConfigKey?: string;
  /** Extra fields merged into diagnostic `attrs` only (sanitized by diagnostics pipeline). */
  evidence?: JsonObject | Record<string, unknown>;
  authFailureProjection?: NangoAuthFailureProjection;
};

const SAFE_RESPONSE_HEADER_KEYS = new Set([
  "content-type",
  "date",
  "retry-after",
  "x-request-id",
  "x-nango-log-id",
  "x-nango-error",
]);

function headersToRecord(headers: unknown): Record<string, unknown> {
  if (!headers || typeof headers !== "object") return {};
  const toJSON = Reflect.get(headers, "toJSON");
  if (typeof toJSON === "function") {
    try {
      const value = toJSON.call(headers);
      return value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value))
        : {};
    } catch {
      /* fall through */
    }
  }
  return Object.fromEntries(Object.entries(headers));
}

function pickSafeResponseHeaders(headers: unknown): JsonObject {
  const raw = headersToRecord(headers);
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(raw)) {
    const lower = key.toLowerCase();
    if (!SAFE_RESPONSE_HEADER_KEYS.has(lower)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      out[lower] = value;
    } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      out[lower] = value.join(", ");
    }
  }
  return out;
}

function readAxiosLikeResponse(
  err: unknown,
): { status: number | null; data: unknown; headers: unknown } | null {
  if (!err || typeof err !== "object") return null;
  const response = (err as { response?: unknown }).response;
  if (!response || typeof response !== "object") return null;
  const r = response as { status?: unknown; data?: unknown; headers?: unknown };
  const status = typeof r.status === "number" ? r.status : null;
  return { status, data: r.data, headers: r.headers };
}

function readNangoErrorCodeAndMessage(data: unknown): { code: string; message: string } | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const error = (data as { error?: unknown }).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const rawCode = (error as { code?: unknown }).code;
  const rawMessage = (error as { message?: unknown }).message;
  if (typeof rawCode !== "string" || typeof rawMessage !== "string") return null;
  const code = rawCode.trim();
  const message = rawMessage.trim();
  return code && message ? { code, message } : null;
}

function readNangoMessage(data: unknown): string | null {
  const nangoError = readNangoErrorCodeAndMessage(data);
  if (nangoError) return nangoError.message;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const rawMessage = (data as { message?: unknown }).message;
  if (typeof rawMessage !== "string") return null;
  const message = rawMessage.trim();
  return message || null;
}

function normalizedErrorText(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (!value || typeof value !== "object") return "";
  const response = readAxiosLikeResponse(value);
  const parts = [
    value instanceof Error ? value.message : null,
    readNangoMessage(response?.data),
    JSON.stringify(sanitizeDiagnosticFields(response?.data ?? null)),
  ];
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .toLowerCase();
}

function nangoErrorTypes(data: unknown): string[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const errors = (data as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors
    .map((error) => {
      if (!error || typeof error !== "object" || Array.isArray(error)) return null;
      const type = (error as { type?: unknown }).type;
      return typeof type === "string" && type.trim() ? type.trim().toLowerCase() : null;
    })
    .filter((type): type is string => type !== null);
}

function classifyNangoFailure(err: unknown): NangoFailureClassification {
  const response = readAxiosLikeResponse(err);
  const nangoError = readNangoErrorCodeAndMessage(response?.data);
  const errorCode = nangoError?.code.toLowerCase() ?? "";
  const errorTypes = nangoErrorTypes(response?.data);
  const text = normalizedErrorText(err);
  const hasAuthEvidence =
    errorTypes.includes("auth") ||
    errorCode.includes("auth") ||
    errorCode.includes("oauth") ||
    (text.includes("failed to get connection credentials") &&
      text.includes("refresh") &&
      text.includes("token")) ||
    text.includes("invalid_grant") ||
    text.includes("invalid refresh token") ||
    text.includes("refresh token is invalid") ||
    text.includes("refresh token has expired") ||
    text.includes("refresh token revoked") ||
    text.includes("missing refresh token") ||
    text.includes("oauth credentials invalid") ||
    text.includes("token has been expired or revoked") ||
    text.includes("user has revoked access");
  return { authFailureKind: hasAuthEvidence ? "reconnect_required" : null };
}

function publicNangoFailure(
  data: unknown,
  ctx: NangoClientErrorContext,
  httpStatus: number | null,
  classification: NangoFailureClassification,
): { code: DomainCode; message: string; nangoErrorCode?: string } | null {
  if (classification.authFailureKind === "reconnect_required") {
    return {
      code: domainCodes.UNAUTHORIZED,
      message: "Reconnect this integration. OAuth credentials could not be refreshed.",
    };
  }
  const nangoError = readNangoErrorCodeAndMessage(data);
  const message = readNangoMessage(data);
  if (!message) return null;
  if (nangoError?.code === "resource_capped") {
    return {
      code: domainCodes.CONFLICT,
      message: `Connection provider limit reached: ${message}`,
      nangoErrorCode: nangoError.code,
    };
  }
  return {
    code: httpStatus === null ? domainCodes.INTERNAL : inferDomainCodeFromHttpStatus(httpStatus),
    message: `${ctx.publicSummary}: ${message}`,
    ...(nangoError ? { nangoErrorCode: nangoError.code } : {}),
  };
}

async function projectTerminalAuthFailure(input: {
  ctx: NangoClientErrorContext;
  classification: NangoFailureClassification;
}): Promise<void> {
  if (input.classification.authFailureKind !== "reconnect_required") return;
  const projection = input.ctx.authFailureProjection;
  if (!projection) return;
  if (projection.account.credential_kind !== "nango_oauth") return;
  await suspendConnectedProviderAccountForReconnect(projection.db, {
    account: projection.account,
    message: `Reconnect ${projection.account.provider}. OAuth credentials could not be refreshed.`,
  });
}

/** Truncate very large string bodies before diagnostics sanitization (defense in depth). */
const RESPONSE_BODY_STRING_MAX = 16_384;

function normalizeResponseDataForDiagnostics(data: unknown): JsonValue {
  if (data === undefined) return null;
  if (data === null) return null;
  if (typeof data === "string") {
    return data.length > RESPONSE_BODY_STRING_MAX
      ? `${data.slice(0, RESPONSE_BODY_STRING_MAX)}…`
      : data;
  }
  if (typeof data === "number" || typeof data === "boolean") return data;
  if (data instanceof ArrayBuffer) {
    return { kind: "arraybuffer", byteLength: data.byteLength };
  }
  if (ArrayBuffer.isView(data)) {
    return { kind: "typedarray", byteLength: data.byteLength, name: data.constructor.name };
  }
  if (typeof data === "object") return sanitizeDiagnosticFields(data);
  return String(data);
}

function normalizeContextDiagnostics(evidence: NangoClientErrorContext["evidence"]): JsonObject {
  if (!evidence) return {};
  const sanitized = sanitizeDiagnosticFields(evidence);
  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) return {};
  return sanitized;
}

/**
 * Emit `nango.client.error` diagnostics (includes sanitized `error.response.data`) and throw
 * `DomainError` with a client-safe message and `details` only (no raw Nango/provider payloads).
 */
export function throwNangoDomainError(err: unknown, ctx: NangoClientErrorContext): never {
  const axiosParts = readAxiosLikeResponse(err);
  const httpStatus = axiosParts?.status ?? null;
  const diagnosticStore = getDiagnosticContext();
  const requestId =
    typeof diagnosticStore.request_id === "string" && diagnosticStore.request_id.trim()
      ? diagnosticStore.request_id.trim()
      : undefined;

  const attrs: JsonObject = {
    nango_operation: ctx.operation,
    ...(ctx.providerConfigKey ? { nango_provider_config_key: ctx.providerConfigKey } : {}),
    ...normalizeContextDiagnostics(ctx.evidence),
    nango_http_status: httpStatus,
    nango_response_headers: pickSafeResponseHeaders(axiosParts?.headers),
    nango_response_data: normalizeResponseDataForDiagnostics(axiosParts?.data),
  };

  const redactedAttrs = sanitizeDiagnosticFields(attrs);
  const attrsForDiagnostics =
    typeof redactedAttrs === "object" && redactedAttrs !== null && !Array.isArray(redactedAttrs)
      ? (redactedAttrs as JsonObject)
      : ({ nango_response_data: redactedAttrs } as JsonObject);

  const baseMsg = err instanceof Error ? err.message : String(err);
  emitDiagnostic(backendDiagnosticLogger(), "nango.client.error", {
    ok: false,
    level: "error",
    err: err instanceof Error ? err : new Error(baseMsg),
    attrs: attrsForDiagnostics,
  });

  const classification = classifyNangoFailure(err);
  const publicFailure = publicNangoFailure(axiosParts?.data, ctx, httpStatus, classification);

  const publicDetails: NangoPublicErrorDetails = {
    vendor: "nango",
    operation: ctx.operation,
    httpStatus,
    ...(classification.authFailureKind ? { authFailureKind: classification.authFailureKind } : {}),
    ...(publicFailure ? { nangoErrorCode: publicFailure.nangoErrorCode } : {}),
    ...(requestId ? { requestId } : {}),
  };

  throw new DomainError(
    publicFailure?.code ?? domainCodes.INTERNAL,
    publicFailure?.message ?? `${ctx.publicSummary}: ${baseMsg}`,
    {
      cause: err,
      details: publicDetails,
    },
  );
}

export async function withNangoClient<T>(
  ctx: NangoClientErrorContext,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    await projectTerminalAuthFailure({ ctx, classification: classifyNangoFailure(err) });
    throw throwNangoDomainError(err, ctx);
  }
}
