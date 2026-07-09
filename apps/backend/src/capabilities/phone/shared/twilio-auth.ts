import { isIP } from "node:net";
import type { Context } from "hono";
import twilio from "twilio";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { backendApiEnv } from "../../../shared/env";

const MAX_TWILIO_WEBHOOK_BODY_BYTES = 64 * 1024;
const MAX_TWILIO_ROUTE_IN_FLIGHT = 20;
const routeInFlight = new Map<string, number>();

export type TwilioWebhookAuthMode = "live" | "sandbox";

export function parseTwilioForm(rawBody: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(rawBody).entries());
}

export function stringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function requireCarrierReachablePublicUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== "https:") {
    throw new DomainError(
      domainCodes.CONFLICT,
      "BACKEND_PUBLIC_URL must use https for live Twilio webhooks.",
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0" ||
    hostname === "::" ||
    hostname === "::1"
  ) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "BACKEND_PUBLIC_URL must be carrier-reachable for live Twilio webhooks.",
    );
  }
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) {
    const [a = 0, b = 0] = hostname.split(".").map((part) => Number.parseInt(part, 10));
    if (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    ) {
      throw new DomainError(
        domainCodes.CONFLICT,
        "BACKEND_PUBLIC_URL must not use a private or loopback IPv4 address for live Twilio webhooks.",
      );
    }
  }
  if (ipVersion === 6) {
    if (
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe80")
    ) {
      throw new DomainError(
        domainCodes.CONFLICT,
        "BACKEND_PUBLIC_URL must not use a private, link-local, or loopback IPv6 address for live Twilio webhooks.",
      );
    }
  }
  return parsed.toString();
}

export function twilioWebhookUrl(path: string): string {
  return new URL(
    path,
    requireCarrierReachablePublicUrl(backendApiEnv().backendPublicUrl),
  ).toString();
}

function twilioWebhookUrlFromRequest(input: { requestUrl: string }): string {
  const current = new URL(input.requestUrl);
  return twilioWebhookUrl(`${current.pathname}${current.search}`);
}

export async function withTwilioWebhookInFlight<T>(
  routeKey: string,
  operation: () => Promise<T>,
): Promise<T> {
  const current = routeInFlight.get(routeKey) ?? 0;
  if (current >= MAX_TWILIO_ROUTE_IN_FLIGHT) {
    throw new DomainError(
      domainCodes.RATE_LIMITED,
      "Too many Twilio webhook requests are in flight.",
    );
  }
  routeInFlight.set(routeKey, current + 1);
  try {
    return await operation();
  } finally {
    const next = (routeInFlight.get(routeKey) ?? 1) - 1;
    if (next <= 0) routeInFlight.delete(routeKey);
    else routeInFlight.set(routeKey, next);
  }
}

export async function readBoundedTwilioWebhookBody(c: Context): Promise<string> {
  const contentLength = c.req.header("content-length");
  if (contentLength) {
    const parsed = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsed) && parsed > MAX_TWILIO_WEBHOOK_BODY_BYTES) {
      throw new DomainError(domainCodes.BAD_REQUEST, "Twilio webhook body is too large.");
    }
  }
  const rawBody = await c.req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_TWILIO_WEBHOOK_BODY_BYTES) {
    throw new DomainError(domainCodes.BAD_REQUEST, "Twilio webhook body is too large.");
  }
  return rawBody;
}

export function verifyTwilioWebhookSignature(input: {
  authMode: TwilioWebhookAuthMode;
  headers: Headers;
  requestUrl: string;
  params: Record<string, string>;
}): { authenticated: boolean; mode: TwilioWebhookAuthMode } {
  if (input.authMode === "sandbox") return { authenticated: false, mode: "sandbox" };
  const authToken = backendApiEnv().twilioAuthToken;
  const signature = input.headers.get("x-twilio-signature");
  if (!signature) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Twilio webhook signature is required.");
  }
  const url = twilioWebhookUrlFromRequest({ requestUrl: input.requestUrl });
  const valid = twilio.validateRequest(authToken, signature, url, input.params);
  if (!valid) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Twilio webhook signature is invalid.");
  }
  return { authenticated: true, mode: "live" };
}
