import { z } from "zod";
import { domainCodes, inferDomainCodeFromHttpStatus, type DomainCode } from "./codes.js";
import { DomainError } from "./domain-error.js";
import { formatUnknownError } from "./format-unknown-error.js";
import { HttpError } from "./http-error.js";

export type PublicApiErrorBody = {
  ok: false;
  code: DomainCode;
  error: string;
  details: unknown | null;
};

const domainCodeLiterals = Object.values(domainCodes) as [DomainCode, ...DomainCode[]];

export const domainCodeSchema = z.enum(domainCodeLiterals);

export const publicApiErrorBodySchema = z
  .object({
    ok: z.literal(false),
    code: domainCodeSchema,
    error: z.string(),
    details: z.unknown().nullable(),
  })
  .strict();

export function safeParsePublicApiErrorBody(value: unknown) {
  return publicApiErrorBodySchema.safeParse(value);
}

/**
 * Serialize any thrown value into the public API error JSON shape.
 * Prefer throwing `DomainError` for explicit codes; use `HttpError` only at HTTP boundaries.
 */
export function toPublicApiErrorBody(error: unknown): PublicApiErrorBody {
  if (error instanceof DomainError) {
    return {
      ok: false,
      code: error.code,
      error: error.message,
      details: error.details === undefined ? null : error.details,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      ok: false,
      code: domainCodes.VALIDATION,
      error: formatUnknownError(error),
      details: z.flattenError(error),
    };
  }

  if (error instanceof HttpError) {
    const code = inferDomainCodeFromHttpStatus(error.status);
    return {
      ok: false,
      code,
      error: error.message,
      details: error.details === undefined ? null : error.details,
    };
  }

  return {
    ok: false,
    code: domainCodes.INTERNAL,
    error: formatUnknownError(error),
    details: null,
  };
}
