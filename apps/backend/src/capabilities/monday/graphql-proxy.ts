import { z } from "zod";
import { Buffer } from "node:buffer";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { timedFetch } from "@ai-assistants/workspace-shared/timed-fetch";
import {
  nangoProxyRequestJson,
  type NangoProxySandboxContext,
} from "../../integrations/nango/nango-proxy-client";
import {
  requireProviderSandboxOperation,
  runProviderSandboxOperation,
} from "../../integrations/provider-sandbox";
import { providerRuntimeModeForCapabilityLink } from "../../integrations/provider-runtime";
import { backendApiEnv } from "../../shared/env";

const MONDAY_FILE_UPLOAD_TIMEOUT_MS = 60_000;

export const mondayGraphqlEnvelopeSchema = z
  .object({
    data: z.record(z.string(), z.unknown()).optional(),
    errors: z.array(z.object({ message: z.string().optional() }).passthrough()).optional(),
  })
  .passthrough();
const mondayGraphqlRequestBodySchema = z
  .object({
    query: z.string().trim().min(1),
    variables: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

function mondayGraphqlApiVersionHeader(): string {
  return backendApiEnv().mondayGraphqlApiVersion;
}

export async function mondayProxyGraphql(input: {
  operation: string;
  publicSummary: string;
  providerConfigKey: string;
  connectionId: string;
  query: string;
  variables?: Record<string, unknown>;
  sandbox?: NangoProxySandboxContext;
}): Promise<Record<string, unknown>> {
  const apiVersion = mondayGraphqlApiVersionHeader();
  const envelope = await nangoProxyRequestJson({
    operation: input.operation,
    publicSummary: input.publicSummary,
    providerConfigKey: input.providerConfigKey,
    connectionId: input.connectionId,
    method: "post",
    endpoint: "/v2",
    data: { query: input.query, ...(input.variables ? { variables: input.variables } : {}) },
    bodySchema: mondayGraphqlRequestBodySchema,
    headers: { "API-Version": apiVersion },
    responseSchema: mondayGraphqlEnvelopeSchema,
    ...(input.sandbox ? { sandbox: input.sandbox } : {}),
  });
  if (envelope.errors?.length) {
    const messages = envelope.errors
      .map((e) => (e.message ? e.message : JSON.stringify(e)))
      .join("; ");
    throw new DomainError(
      domainCodes.CONFLICT,
      `Monday GraphQL rejected ${input.operation}: ${messages}`,
    );
  }
  if (!envelope.data) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Monday GraphQL returned no data for ${input.operation}.`,
    );
  }
  return envelope.data;
}

export async function mondayProxyGraphqlFile(input: {
  operation: string;
  publicSummary: string;
  providerConfigKey: string;
  connectionId: string;
  authHeaders: Record<string, string>;
  query: string;
  variables: Record<string, string>;
  fileVariableName: string;
  file: { filename: string; mimeType: string; bytes: Uint8Array };
  sandbox?: NangoProxySandboxContext;
}): Promise<Record<string, unknown>> {
  if (input.sandbox && providerRuntimeModeForCapabilityLink(input.sandbox.binding.link) === "sandbox") {
    const definition = requireProviderSandboxOperation(input.providerConfigKey, input.operation);
    const response = await runProviderSandboxOperation({
      db: input.sandbox.db,
      binding: input.sandbox.binding,
      definition,
      request: {
        query: input.query,
        variables: input.variables,
        fileVariableName: input.fileVariableName,
        file: {
          filename: input.file.filename,
          mimeType: input.file.mimeType,
          byteLength: input.file.bytes.byteLength,
        },
      },
      metadata: {
        transport: "monday_graphql_file",
        providerConfigKey: input.providerConfigKey,
      },
    });
    return z.record(z.string(), z.unknown()).parse(response);
  }

  const form = new FormData();
  form.append("query", input.query);
  for (const [key, value] of Object.entries(input.variables)) {
    form.append(`variables[${key}]`, value);
  }
  const buffer = Buffer.from(input.file.bytes);
  const blob = new Blob([buffer], { type: input.file.mimeType });
  form.append(`variables[${input.fileVariableName}]`, blob, input.file.filename);

  const response = await timedFetch.fetch("https://api.monday.com/v2/file", {
    timeoutMs: MONDAY_FILE_UPLOAD_TIMEOUT_MS,
    method: "POST",
    headers: {
      ...input.authHeaders,
      "API-Version": mondayGraphqlApiVersionHeader(),
    },
    body: form,
  });
  const raw = await response.json().catch((error: unknown) => {
    throw new DomainError(
      domainCodes.INTERNAL,
      `${input.publicSummary}: Monday file endpoint returned non-JSON response.`,
      { cause: error },
    );
  });
  const envelope = mondayGraphqlEnvelopeSchema.parse(raw);
  if (!response.ok) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `${input.publicSummary}: Monday file endpoint returned HTTP ${response.status}.`,
    );
  }
  if (envelope.errors?.length) {
    const messages = envelope.errors
      .map((e) => (e.message ? e.message : JSON.stringify(e)))
      .join("; ");
    throw new DomainError(
      domainCodes.CONFLICT,
      `Monday GraphQL rejected ${input.operation}: ${messages}`,
    );
  }
  if (!envelope.data) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Monday GraphQL returned no data for ${input.operation}.`,
    );
  }
  return envelope.data;
}

export function mondayRequireObject(
  data: Record<string, unknown>,
  fieldName: string,
  operation: string,
): Record<string, unknown> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(data[fieldName]);
  if (!parsed.success) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Monday ${operation} missing field ${JSON.stringify(fieldName)}.`,
    );
  }
  return parsed.data;
}

export function mondayProviderId(record: Record<string, unknown>): string | undefined {
  const id = record["id"];
  return typeof id === "string" && id.trim()
    ? id.trim()
    : typeof id === "number"
      ? String(id)
      : undefined;
}
