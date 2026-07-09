import { formatUnknownError } from "@ai-assistants/errors";
import {
  formatSupabaseError,
  mapPostgrestErrorToDomainCode,
  type PostgrestError,
} from "@ai-assistants/control-db";
import { DomainError, DOMAIN_CODE_HTTP_STATUS, HttpError } from "@ai-assistants/errors";
import { z } from "zod";

export { HttpError };

/** Use for logging policy: 5xx → operational error (stack); 4xx → expected client outcome (no error event). */
export function isHttpServerFailureStatus(status: number): boolean {
  return status >= 500;
}

function isPostgrestError(error: unknown): error is PostgrestError {
  if (error instanceof DomainError) return false;
  if (typeof error !== "object" || error === null) return false;
  const e = error as PostgrestError;
  return typeof e.code === "string" && typeof e.message === "string";
}

/** Map raw PostgREST errors (often thrown as `throw result.error`) into `DomainError` for HTTP + wire serialization. */
export function normalizeControlPlaneError(error: unknown): unknown {
  if (!isPostgrestError(error)) return error;
  const code = mapPostgrestErrorToDomainCode(error);
  return new DomainError(code, formatSupabaseError(error), {
    cause: error,
    details: { postgrestCode: error.code },
  });
}

export function toHttpError(error: unknown): HttpError {
  const normalized = normalizeControlPlaneError(error);
  if (normalized instanceof HttpError) return normalized;
  if (normalized instanceof DomainError) {
    return new HttpError(
      DOMAIN_CODE_HTTP_STATUS[normalized.code],
      normalized.message,
      normalized.details,
    );
  }
  if (normalized instanceof z.ZodError) return new HttpError(400, formatUnknownError(normalized));
  return new HttpError(500, formatUnknownError(normalized));
}
