import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { backendApiEnv } from "../../shared/env";

function requireSigningSecret(): string {
  return backendApiEnv().mondaySigningSecret;
}

function base64UrlDecode(value: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch (error) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Monday webhook JWT is malformed.", {
      cause: error,
    });
  }
}

function parseJwtPart(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64UrlDecode(value).toString("utf8")) as unknown;
  } catch (error) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Monday webhook JWT is malformed.", {
      cause: error,
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Monday webhook JWT is malformed.");
  }
  return parsed as Record<string, unknown>;
}

function tokenAudienceMatches(aud: unknown, expectedAudience: string): boolean {
  if (typeof aud === "string") return aud === expectedAudience;
  if (Array.isArray(aud)) return aud.some((entry) => entry === expectedAudience);
  return false;
}

export function verifyMondayWebhookAuthorization(input: {
  authorizationHeader: string | null;
  expectedAudience: string;
}): void {
  if (!input.authorizationHeader?.trim()) {
    throw new DomainError(
      domainCodes.UNAUTHORIZED,
      "Monday webhook request missing Authorization.",
    );
  }
  const match = /^Bearer\s+(.+)$/i.exec(input.authorizationHeader.trim());
  if (!match) {
    throw new DomainError(
      domainCodes.UNAUTHORIZED,
      "Monday webhook Authorization must be Bearer JWT.",
    );
  }

  const token = match[1]!;
  const parts = token.split(".");
  const [headerRaw, payloadRaw, signatureRaw] = parts;
  if (!headerRaw || !payloadRaw || !signatureRaw || parts.length !== 3) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Monday webhook JWT is malformed.");
  }

  const header = parseJwtPart(headerRaw);
  if (header.alg !== "HS256") {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Monday webhook JWT must use HS256.");
  }

  const payload = parseJwtPart(payloadRaw);
  const exp = payload.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Monday webhook JWT is missing exp.");
  }
  if (Date.now() >= exp * 1000) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Monday webhook JWT is expired.");
  }
  if (!tokenAudienceMatches(payload.aud, input.expectedAudience)) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Monday webhook JWT audience is invalid.");
  }

  const expected = createHmac("sha256", requireSigningSecret())
    .update(`${headerRaw}.${payloadRaw}`)
    .digest();
  const actual = base64UrlDecode(signatureRaw);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Monday webhook JWT signature is invalid.");
  }
}
