import { timedFetch } from "@ai-assistants/workspace-shared/timed-fetch";
import { z } from "zod";

const NANGO_PROVISIONING_HTTP_TIMEOUT_MS = 30_000;

const integrationRowSchema = z
  .object({
    unique_key: z.string(),
    display_name: z.string(),
    provider: z.string(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
  })
  .passthrough();

const integrationEnvelopeSchema = z.object({ data: integrationRowSchema }).strict();

const integrationListEnvelopeSchema = z.object({ data: z.array(integrationRowSchema) }).strict();

const nangoErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().optional(),
        message: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type NangoIntegrationRow = z.infer<typeof integrationRowSchema>;

class NangoProvisioningHttpError extends Error {
  readonly status: number;
  readonly bodySnippet: string;

  constructor(status: number, bodySnippet: string, message?: string) {
    super(message ?? `Nango HTTP ${status}: ${bodySnippet}`);
    this.status = status;
    this.bodySnippet = bodySnippet;
  }
}

async function readResponseBody(res: Response): Promise<{ raw: string; snippet: string }> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) return { raw: "", snippet: "" };
  const snippet = trimmed.length > 800 ? `${trimmed.slice(0, 800)}…` : trimmed;
  return { raw: trimmed, snippet };
}

function parseNangoErrorSnippet(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const err = nangoErrorSchema.safeParse(parsed);
    if (!err.success) return undefined;
    const msg = err.data.error.message ?? err.data.error.code;
    return msg ? String(msg) : undefined;
  } catch {
    return undefined;
  }
}

export async function nangoListIntegrations(input: {
  baseUrl: string;
  secretKey: string;
}): Promise<NangoIntegrationRow[]> {
  const res = await timedFetch.fetch(`${input.baseUrl}/integrations`, {
    timeoutMs: NANGO_PROVISIONING_HTTP_TIMEOUT_MS,
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      Accept: "application/json",
    },
  });
  const { raw, snippet } = await readResponseBody(res);
  if (!res.ok) {
    throw new NangoProvisioningHttpError(
      res.status,
      snippet,
      parseNangoErrorSnippet(snippet) ?? `Nango list integrations failed (${res.status}).`,
    );
  }
  const parsed = integrationListEnvelopeSchema.safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) {
    throw new Error(`Unexpected Nango list integrations response: ${snippet}`);
  }
  return parsed.data.data;
}

export type NangoOAuth2CredentialsPayload = {
  type: "OAUTH2";
  client_id: string;
  client_secret: string;
  scopes?: string | null;
};

export async function nangoCreateIntegration(input: {
  baseUrl: string;
  secretKey: string;
  body: {
    unique_key: string;
    provider: string;
    display_name: string;
    credentials: NangoOAuth2CredentialsPayload;
  };
}): Promise<NangoIntegrationRow> {
  const res = await timedFetch.fetch(`${input.baseUrl}/integrations`, {
    timeoutMs: NANGO_PROVISIONING_HTTP_TIMEOUT_MS,
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input.body),
  });
  const { raw, snippet } = await readResponseBody(res);
  if (!res.ok) {
    throw new NangoProvisioningHttpError(
      res.status,
      snippet,
      parseNangoErrorSnippet(snippet) ?? `Nango create integration failed (${res.status}).`,
    );
  }
  const parsed = integrationEnvelopeSchema.safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) {
    throw new Error(`Unexpected Nango create integration response: ${snippet}`);
  }
  return parsed.data.data;
}

export async function nangoPatchIntegration(input: {
  baseUrl: string;
  secretKey: string;
  uniqueKey: string;
  body: { display_name?: string; credentials?: NangoOAuth2CredentialsPayload };
}): Promise<NangoIntegrationRow> {
  const encoded = encodeURIComponent(input.uniqueKey);
  const res = await timedFetch.fetch(`${input.baseUrl}/integrations/${encoded}`, {
    timeoutMs: NANGO_PROVISIONING_HTTP_TIMEOUT_MS,
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(input.body),
  });
  const { raw, snippet } = await readResponseBody(res);
  if (!res.ok) {
    throw new NangoProvisioningHttpError(
      res.status,
      snippet,
      parseNangoErrorSnippet(snippet) ?? `Nango patch integration failed (${res.status}).`,
    );
  }
  const parsed = integrationEnvelopeSchema.safeParse(JSON.parse(raw || "{}"));
  if (!parsed.success) {
    throw new Error(`Unexpected Nango patch integration response: ${snippet}`);
  }
  return parsed.data.data;
}
