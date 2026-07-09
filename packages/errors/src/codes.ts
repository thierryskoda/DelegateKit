/**
 * Stable wire / product codes. Add entries only when the app branches on them
 * (UI, metrics, or explicit handling)—do not mirror full Postgres catalogs here.
 */
export const domainCodes = {
  INTERNAL: "INTERNAL",
  VALIDATION: "VALIDATION",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  BAD_REQUEST: "BAD_REQUEST",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
} as const;

export type DomainCode = (typeof domainCodes)[keyof typeof domainCodes];

/** Default HTTP status when serving a `DomainError` (no per-route override). */
export const DOMAIN_CODE_HTTP_STATUS: Record<DomainCode, number> = {
  INTERNAL: 500,
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_REQUEST: 400,
  SERVICE_UNAVAILABLE: 503,
  RATE_LIMITED: 429,
  NOT_IMPLEMENTED: 501,
};

/**
 * Coarse mapping when only HTTP status is known (e.g. `HttpError.status`).
 * Not used for `DomainError` (code is authoritative).
 */
export function inferDomainCodeFromHttpStatus(status: number): DomainCode {
  if (status === 401) return domainCodes.UNAUTHORIZED;
  if (status === 403) return domainCodes.FORBIDDEN;
  if (status === 404) return domainCodes.NOT_FOUND;
  if (status === 409) return domainCodes.CONFLICT;
  if (status === 422) return domainCodes.VALIDATION;
  if (status === 429) return domainCodes.RATE_LIMITED;
  if (status === 503) return domainCodes.SERVICE_UNAVAILABLE;
  if (status === 501) return domainCodes.NOT_IMPLEMENTED;
  if (status >= 500) return domainCodes.INTERNAL;
  if (status === 410) return domainCodes.NOT_FOUND;
  if (status === 400) return domainCodes.BAD_REQUEST;
  if (status >= 400 && status < 500) return domainCodes.BAD_REQUEST;
  return domainCodes.INTERNAL;
}

const domainCodeSet = new Set<string>(Object.values(domainCodes));

export function isDomainCode(value: unknown): value is DomainCode {
  return typeof value === "string" && domainCodeSet.has(value);
}
