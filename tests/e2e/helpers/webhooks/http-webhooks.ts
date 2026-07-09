import { createHmac } from "node:crypto";
import type { BackendServerHandle } from "../processes/start-backend";

type WebhookHeaders = Headers | Record<string, string> | Array<[string, string]>;

export type E2eWebhookResponse<TBody> = {
  status: number;
  body: TBody;
  bodyText: string;
};

async function parseWebhookResponse<TBody>(response: Response): Promise<E2eWebhookResponse<TBody>> {
  const bodyText = await response.text();
  const body = (bodyText ? JSON.parse(bodyText) : null) as TBody;
  return { status: response.status, body, bodyText };
}

function normalizeHeaders(headers: WebhookHeaders): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}

export async function postJsonWebhook<TBody>(
  backend: BackendServerHandle,
  path: string,
  body: unknown,
  headers: WebhookHeaders = {},
): Promise<E2eWebhookResponse<TBody>> {
  const response = await fetch(`${backend.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...normalizeHeaders(headers),
    },
    body: JSON.stringify(body),
  });
  return parseWebhookResponse<TBody>(response);
}

export async function postRawWebhook<TBody>(
  backend: BackendServerHandle,
  path: string,
  body: string,
  headers: WebhookHeaders = {},
): Promise<E2eWebhookResponse<TBody>> {
  const response = await fetch(`${backend.baseUrl}${path}`, {
    method: "POST",
    headers: normalizeHeaders(headers),
    body,
  });
  return parseWebhookResponse<TBody>(response);
}

export function nangoWebhookSignatureHeader(rawBody: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret).update(rawBody, "utf8").digest("hex");
}

export function boldSignWebhookSignatureHeader(input: {
  rawBody: string;
  signingSecret: string;
  timestampSeconds?: number;
}): string {
  const timestamp = input.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", input.signingSecret)
    .update(`${timestamp}.${input.rawBody}`, "utf8")
    .digest("hex");
  return `t=${timestamp},s0=${signature}`;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function mondayAuthorizationHeader(input: {
  audience: string;
  signingSecret: string;
  expiresAtSeconds?: number;
}): string {
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson({
    aud: input.audience,
    exp: input.expiresAtSeconds ?? Math.floor(Date.now() / 1000) + 300,
  });
  const signature = createHmac("sha256", input.signingSecret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `Bearer ${header}.${payload}.${signature}`;
}
