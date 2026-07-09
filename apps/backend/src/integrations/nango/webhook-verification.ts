import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { backendApiEnv } from "../../shared/env";

function headerLookup(headers: Headers, name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, value] of headers.entries()) {
    if (key.toLowerCase() === lower) return value;
  }
  return null;
}

function verifyNangoWebhookHmac(rawBody: string, signatureHeader: string | null): boolean {
  const secret = backendApiEnv().nangoWebhookSigningSecret;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const actual = signatureHeader?.trim();
  if (!actual || expected.length !== actual.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
  } catch {
    return false;
  }
}

export function verifyNangoWebhookRequest(rawBody: string, headers: Headers): void {
  const sig = headerLookup(headers, "x-nango-hmac-sha256");
  if (!verifyNangoWebhookHmac(rawBody, sig)) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Invalid Nango webhook signature.");
  }
}

export function parseNangoWebhookJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new DomainError(domainCodes.BAD_REQUEST, "Nango webhook body must be JSON.");
  }
}
