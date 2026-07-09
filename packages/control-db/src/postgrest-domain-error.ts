import type { PostgrestError } from "@supabase/supabase-js";
import { domainCodes, type DomainCode } from "@ai-assistants/errors";

/**
 * Map PostgREST / Postgres error codes to domain codes. Extend only when the
 * product branches on the outcome.
 */
export function mapPostgrestErrorToDomainCode(error: PostgrestError): DomainCode {
  const c = error.code;
  if (c === "23505") return domainCodes.CONFLICT;
  if (c === "23503") return domainCodes.BAD_REQUEST;
  if (c === "23502" || c === "23514") return domainCodes.BAD_REQUEST;
  if (c === "PGRST116") return domainCodes.NOT_FOUND;
  return domainCodes.INTERNAL;
}
