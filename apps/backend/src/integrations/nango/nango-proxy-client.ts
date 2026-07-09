// ARR-0006 — architecture-rationale/0006-nango-backend-proxy-transport.md
import type { Nango } from "@nangohq/node";
import type { ProxyConfiguration } from "@nangohq/node";
import { Buffer } from "node:buffer";
import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  emitDiagnostic,
  sanitizeDiagnosticFields,
  type JsonObject,
} from "@ai-assistants/runtime-diagnostics";
import type { ZodError, ZodType } from "zod";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import {
  requireProviderSandboxOperation,
  runProviderSandboxOperation,
} from "../provider-sandbox";
import { providerRuntimeModeForCapabilityLink } from "../provider-runtime";
import { createNangoAdminClient } from "./nango-client";
import { withNangoClient, type NangoClientErrorContext } from "./nango-admin-client-error";

type NangoProxyHttpMethod = "get" | "post" | "put" | "patch" | "delete";

type NangoProxyParamValue = string | number | boolean;
export type NangoProxyParams = Readonly<Record<string, NangoProxyParamValue | undefined>> | string;
type NormalizedNangoProxyParams = Record<string, string | number> | string;

export type ProviderProxyRequest = {
  method: NangoProxyHttpMethod;
  endpoint: string;
  params?: NangoProxyParams;
  data?: unknown;
  bodySchema?: ZodType<unknown>;
  headers?: Record<string, string>;
  voidResponse?: boolean;
  retries?: number;
};

export type ProviderOperation<I, O> = {
  inputSchema: ZodType<I>;
  responseSchema: ZodType<O>;
  toProxyRequest(input: I): ProviderProxyRequest;
  normalize(raw: unknown, input: I): O;
};

export type NangoProxySandboxContext = {
  db: SupabaseServiceClient;
  binding: {
    link: TableRow<"capability_account_links">;
    account: TableRow<"connected_provider_accounts">;
  };
};

function authFailureProjectionFromSandbox(
  sandbox: NangoProxySandboxContext | undefined,
): NangoClientErrorContext["authFailureProjection"] | undefined {
  if (!sandbox) return undefined;
  return { db: sandbox.db, account: sandbox.binding.account };
}

function authFailureProjectionForInput(input: {
  authFailureProjection?: NangoClientErrorContext["authFailureProjection"];
  sandbox?: NangoProxySandboxContext;
}): NangoClientErrorContext["authFailureProjection"] | undefined {
  return input.authFailureProjection ?? authFailureProjectionFromSandbox(input.sandbox);
}

function authFailureProjectionFieldsForInput(input: {
  authFailureProjection?: NangoClientErrorContext["authFailureProjection"];
  sandbox?: NangoProxySandboxContext;
}): { authFailureProjection: NonNullable<NangoClientErrorContext["authFailureProjection"]> } | {} {
  const projection = authFailureProjectionForInput(input);
  return projection === undefined ? {} : { authFailureProjection: projection };
}

/** Query params for Nango proxy: booleans become `"true"` / `"false"` strings per Nango conventions. */
function normalizeNangoProxyParams(
  params?: NangoProxyParams,
): NormalizedNangoProxyParams | undefined {
  if (!params) return undefined;
  if (typeof params === "string") {
    const query = params.trim().replace(/^\?/, "");
    return query || undefined;
  }
  const entries = Object.entries(params).filter(
    (e): e is [string, NangoProxyParamValue] => e[1] !== undefined,
  );
  if (!entries.length) return undefined;
  const out: Record<string, string | number> = {};
  for (const [k, v] of entries) {
    out[k] = typeof v === "boolean" ? String(v) : v;
  }
  return out;
}

function requireNonEmptyString(label: string, value: string | undefined): string {
  const v = value?.trim();
  if (!v) {
    throw new DomainError(domainCodes.INTERNAL, `Nango proxy ${label} is required.`);
  }
  return v;
}

function headersToFlatRecord(headers: unknown): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (!headers || typeof headers !== "object") return out;
  for (const [k, v] of Object.entries(headers)) {
    out[k] =
      typeof v === "string"
        ? v
        : Array.isArray(v)
          ? v.filter((x): x is string => typeof x === "string").join(",")
          : undefined;
  }
  return out;
}

function binaryProxyDataToUint8Array(raw: unknown): Uint8Array {
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Buffer.isBuffer(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  if (ArrayBuffer.isView(raw)) {
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  }
  throw new DomainError(
    domainCodes.INTERNAL,
    `Nango binary proxy returned unsupported response data type ${Object.prototype.toString.call(raw)}.`,
  );
}

function throwNangoProxyResponseContractError(input: {
  ctx: NangoClientErrorContext;
  method: NangoProxyHttpMethod;
  endpoint: string;
  zodError: ZodError;
}): never {
  const attrs: JsonObject = {
    nango_operation: input.ctx.operation,
    ...(input.ctx.providerConfigKey
      ? { nango_provider_config_key: input.ctx.providerConfigKey }
      : {}),
    nango_proxy_http_method: input.method,
    nango_proxy_endpoint: input.endpoint,
    nango_proxy_contract: "response_schema",
    nango_proxy_zod_issues: sanitizeDiagnosticFields(input.zodError.issues) as JsonObject,
  };
  emitDiagnostic(backendDiagnosticLogger(), "nango.proxy.contract_error", {
    ok: false,
    level: "error",
    err: input.zodError,
    attrs,
  });
  throw new DomainError(
    domainCodes.INTERNAL,
    `${input.ctx.publicSummary}: Nango proxy response failed schema validation.`,
    {
      cause: input.zodError,
      details: { vendor: "nango", kind: "proxy_response_contract" as const },
    },
  );
}

function throwNangoProxyBodyContractError(input: {
  ctx: NangoClientErrorContext;
  method: NangoProxyHttpMethod;
  endpoint: string;
  zodError: ZodError;
}): never {
  const attrs: JsonObject = {
    nango_operation: input.ctx.operation,
    ...(input.ctx.providerConfigKey
      ? { nango_provider_config_key: input.ctx.providerConfigKey }
      : {}),
    nango_proxy_http_method: input.method,
    nango_proxy_endpoint: input.endpoint,
    nango_proxy_contract: "request_body_schema",
    nango_proxy_zod_issues: sanitizeDiagnosticFields(input.zodError.issues) as JsonObject,
  };
  emitDiagnostic(backendDiagnosticLogger(), "nango.proxy.contract_error", {
    ok: false,
    level: "error",
    err: input.zodError,
    attrs,
  });
  throw new DomainError(
    domainCodes.INTERNAL,
    `${input.ctx.publicSummary}: Nango proxy request body failed schema validation.`,
    {
      cause: input.zodError,
      details: { vendor: "nango", kind: "proxy_request_body_contract" as const },
    },
  );
}

type NangoProxyTransportOptions = Pick<
  ProxyConfiguration,
  "retries" | "retryOn" | "baseUrlOverride" | "headers" | "decompress" | "responseType"
>;

type NangoProxyJsonBase = NangoClientErrorContext & {
  providerConfigKey: string;
  connectionId: string;
  method: NangoProxyHttpMethod;
  endpoint: string;
  params?: NangoProxyParams;
  data?: unknown;
  bodySchema?: ZodType<unknown>;
  sandbox?: NangoProxySandboxContext;
} & NangoProxyTransportOptions;

type NangoProxyBodyData = string | Buffer | Uint8Array | ArrayBuffer;

function proxyTransport(
  input: NangoProxyTransportOptions,
  responseType: NonNullable<NangoProxyTransportOptions["responseType"]>,
): NangoProxyTransportOptions {
  return {
    ...(input.retries === undefined ? {} : { retries: input.retries }),
    ...(input.retryOn === undefined ? {} : { retryOn: input.retryOn }),
    ...(input.baseUrlOverride === undefined ? {} : { baseUrlOverride: input.baseUrlOverride }),
    ...(input.headers === undefined ? {} : { headers: input.headers }),
    ...(input.decompress === undefined ? {} : { decompress: input.decompress }),
    responseType,
  };
}

function buildProxyConfig(input: {
  providerConfigKey: string;
  connectionId: string;
  endpoint: string;
  method: NangoProxyHttpMethod;
  params?: NormalizedNangoProxyParams;
  data?: unknown;
  transport: NangoProxyTransportOptions;
}): ProxyConfiguration {
  const { providerConfigKey, connectionId, endpoint, params, data, transport } = input;
  return {
    endpoint,
    providerConfigKey,
    connectionId,
    ...(params ? { params } : {}),
    ...(data === undefined ? {} : { data }),
    ...(transport.retries !== undefined ? { retries: transport.retries } : {}),
    ...(transport.retryOn !== undefined ? { retryOn: transport.retryOn } : {}),
    ...(transport.baseUrlOverride !== undefined
      ? { baseUrlOverride: transport.baseUrlOverride }
      : {}),
    ...(transport.headers !== undefined ? { headers: transport.headers } : {}),
    ...(transport.decompress !== undefined ? { decompress: transport.decompress } : {}),
    ...(transport.responseType !== undefined ? { responseType: transport.responseType } : {}),
  };
}

function dataForSandboxRequestEnvelope(data: unknown): unknown {
  if (data === undefined) return undefined;
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return data;
  }
  if (data === null) return null;
  if (Buffer.isBuffer(data) || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return {
      kind: "binary",
      byteLength:
        data instanceof ArrayBuffer
          ? data.byteLength
          : Buffer.isBuffer(data)
            ? data.byteLength
            : data.byteLength,
    };
  }
  return data;
}

function nangoProxySandboxRequest(input: {
  method: NangoProxyHttpMethod;
  endpoint: string;
  params?: NormalizedNangoProxyParams;
  data?: unknown;
}): Record<string, unknown> {
  return {
    method: input.method,
    endpoint: input.endpoint,
    ...(input.params === undefined ? {} : { params: input.params }),
    ...(input.data === undefined
      ? {}
      : { data: dataForSandboxRequestEnvelope(input.data) }),
  };
}

async function maybeRunNangoProxySandboxOperation(input: {
  sandbox: NangoProxySandboxContext | undefined;
  providerConfigKey: string;
  operation: string;
  request: Record<string, unknown>;
}): Promise<unknown | null> {
  if (!input.sandbox) return null;
  const mode = providerRuntimeModeForCapabilityLink(input.sandbox.binding.link);
  if (mode !== "sandbox") return null;
  const definition = requireProviderSandboxOperation(input.providerConfigKey, input.operation);
  return runProviderSandboxOperation({
    db: input.sandbox.db,
    binding: input.sandbox.binding,
    definition,
    request: input.request,
    metadata: {
      transport: "nango_proxy",
      providerConfigKey: input.providerConfigKey,
    },
  });
}

async function dispatchNangoProxy(
  nango: Nango,
  method: NangoProxyHttpMethod,
  config: ProxyConfiguration,
): Promise<{ data: unknown; headers: unknown; status: number }> {
  switch (method) {
    case "get":
      return nango.get(config);
    case "post":
      return nango.post(config);
    case "put":
      return nango.put(config);
    case "patch":
      return nango.patch(config);
    case "delete":
      return nango.delete(config);
    default: {
      const _exhaustive: never = method;
      throw new DomainError(
        domainCodes.INTERNAL,
        `Unsupported Nango proxy method ${String(_exhaustive)}.`,
      );
    }
  }
}

/**
 * Single place in the backend that may call Nango proxy HTTP helpers (`get`/`post`/…).
 * All provider capabilities must go through these functions so retries and contracts stay consistent.
 */
export async function nangoProxyRequestJson<TOut>(
  input: NangoProxyJsonBase & { responseSchema: ZodType<TOut> },
): Promise<TOut> {
  const providerConfigKey = requireNonEmptyString("providerConfigKey", input.providerConfigKey);
  const connectionId = requireNonEmptyString("connectionId", input.connectionId);
  const endpoint = requireNonEmptyString("endpoint", input.endpoint);
  if (!input.responseSchema) {
    throw new DomainError(domainCodes.INTERNAL, "Nango proxy responseSchema is required.");
  }

  let data: unknown = input.data;
  if (input.bodySchema) {
    const parsed = input.bodySchema.safeParse(input.data);
    if (!parsed.success) {
      throwNangoProxyBodyContractError({
        ctx: input,
        method: input.method,
        endpoint,
        zodError: parsed.error,
      });
    }
    data = parsed.data;
  }

  const params = normalizeNangoProxyParams(input.params);
  const transport = proxyTransport(input, input.responseType ?? "json");
  const config = buildProxyConfig({
    providerConfigKey,
    connectionId,
    endpoint,
    method: input.method,
    ...(params === undefined ? {} : { params }),
    data,
    transport,
  });
  const sandboxRaw = await maybeRunNangoProxySandboxOperation({
    sandbox: input.sandbox,
    providerConfigKey,
    operation: input.operation,
    request: nangoProxySandboxRequest({
      method: input.method,
      endpoint,
      ...(params === undefined ? {} : { params }),
      data,
    }),
  });
  if (sandboxRaw !== null) {
    const sandboxValidated = input.responseSchema.safeParse(sandboxRaw);
    if (!sandboxValidated.success) {
      throwNangoProxyResponseContractError({
        ctx: input,
        method: input.method,
        endpoint,
        zodError: sandboxValidated.error,
      });
    }
    return sandboxValidated.data;
  }

  const nango = createNangoAdminClient();
  const raw = await withNangoClient(
    {
      operation: input.operation,
      publicSummary: input.publicSummary,
      providerConfigKey,
      ...authFailureProjectionFieldsForInput(input),
      evidence: {
        http_method: input.method,
        endpoint,
        ...(input.evidence ?? {}),
      },
    },
    async () => {
      const res = await dispatchNangoProxy(nango, input.method, config);
      return res.data;
    },
  );

  const validated = input.responseSchema.safeParse(raw);
  if (!validated.success) {
    throwNangoProxyResponseContractError({
      ctx: input,
      method: input.method,
      endpoint,
      zodError: validated.error,
    });
  }
  return validated.data;
}

export async function nangoProxyRequestJsonWithHeaders<TOut>(
  input: NangoProxyJsonBase & { responseSchema: ZodType<TOut> },
): Promise<{ data: TOut; headers: Record<string, string | undefined> }> {
  const providerConfigKey = requireNonEmptyString("providerConfigKey", input.providerConfigKey);
  const connectionId = requireNonEmptyString("connectionId", input.connectionId);
  const endpoint = requireNonEmptyString("endpoint", input.endpoint);
  if (!input.responseSchema) {
    throw new DomainError(domainCodes.INTERNAL, "Nango proxy responseSchema is required.");
  }

  let data: unknown = input.data;
  if (input.bodySchema) {
    const parsed = input.bodySchema.safeParse(input.data);
    if (!parsed.success) {
      throwNangoProxyBodyContractError({
        ctx: input,
        method: input.method,
        endpoint,
        zodError: parsed.error,
      });
    }
    data = parsed.data;
  }

  const params = normalizeNangoProxyParams(input.params);
  const transport = proxyTransport(input, input.responseType ?? "json");
  const config = buildProxyConfig({
    providerConfigKey,
    connectionId,
    endpoint,
    method: input.method,
    ...(params === undefined ? {} : { params }),
    data,
    transport,
  });
  const sandboxRaw = await maybeRunNangoProxySandboxOperation({
    sandbox: input.sandbox,
    providerConfigKey,
    operation: input.operation,
    request: nangoProxySandboxRequest({
      method: input.method,
      endpoint,
      ...(params === undefined ? {} : { params }),
      data,
    }),
  });
  if (sandboxRaw !== null) {
    const sandboxValidated = input.responseSchema.safeParse(sandboxRaw);
    if (!sandboxValidated.success) {
      throwNangoProxyResponseContractError({
        ctx: input,
        method: input.method,
        endpoint,
        zodError: sandboxValidated.error,
      });
    }
    return { data: sandboxValidated.data, headers: {} };
  }

  const nango = createNangoAdminClient();
  const { raw, headers } = await withNangoClient(
    {
      operation: input.operation,
      publicSummary: input.publicSummary,
      providerConfigKey,
      ...authFailureProjectionFieldsForInput(input),
      evidence: {
        http_method: input.method,
        endpoint,
        ...(input.evidence ?? {}),
      },
    },
    async () => {
      const res = await dispatchNangoProxy(nango, input.method, config);
      return { raw: res.data, headers: res.headers };
    },
  );

  const validated = input.responseSchema.safeParse(raw);
  if (!validated.success) {
    throwNangoProxyResponseContractError({
      ctx: input,
      method: input.method,
      endpoint,
      zodError: validated.error,
    });
  }
  return { data: validated.data, headers: headersToFlatRecord(headers) };
}

export async function nangoProxyRequestBinary(
  input: NangoClientErrorContext & {
    providerConfigKey: string;
    connectionId: string;
    endpoint: string;
    params?: NangoProxyParams;
    method?: "get" | "post" | "put" | "patch";
    data?: NangoProxyBodyData;
    retries?: number;
    retryOn?: number[];
    baseUrlOverride?: string;
    headers?: Record<string, string>;
    decompress?: boolean;
    sandbox?: NangoProxySandboxContext;
  },
): Promise<{ body: Uint8Array; contentType: string | undefined }> {
  const providerConfigKey = requireNonEmptyString("providerConfigKey", input.providerConfigKey);
  const connectionId = requireNonEmptyString("connectionId", input.connectionId);
  const endpoint = requireNonEmptyString("endpoint", input.endpoint);
  const method = input.method ?? "get";

  const params = normalizeNangoProxyParams(input.params);
  const transport = proxyTransport(input, "arraybuffer");
  const config = buildProxyConfig({
    providerConfigKey,
    connectionId,
    endpoint,
    method,
    ...(params === undefined ? {} : { params }),
    ...(input.data === undefined ? {} : { data: input.data }),
    transport,
  });
  const sandboxRaw = await maybeRunNangoProxySandboxOperation({
    sandbox: input.sandbox,
    providerConfigKey,
    operation: input.operation,
    request: nangoProxySandboxRequest({
      method,
      endpoint,
      ...(params === undefined ? {} : { params }),
      ...(input.data === undefined ? {} : { data: input.data }),
    }),
  });
  if (sandboxRaw !== null) {
    if (
      sandboxRaw &&
      typeof sandboxRaw === "object" &&
      typeof Reflect.get(sandboxRaw, "bodyBase64") === "string"
    ) {
      const contentType = Reflect.get(sandboxRaw, "contentType");
      return {
        body: Uint8Array.from(Buffer.from(Reflect.get(sandboxRaw, "bodyBase64") as string, "base64")),
        contentType: typeof contentType === "string" ? contentType : undefined,
      };
    }
    if (
      sandboxRaw &&
      typeof sandboxRaw === "object" &&
      "body" in sandboxRaw &&
      Reflect.get(sandboxRaw, "body") instanceof Uint8Array
    ) {
      const contentType = Reflect.get(sandboxRaw, "contentType");
      return {
        body: Reflect.get(sandboxRaw, "body") as Uint8Array,
        contentType: typeof contentType === "string" ? contentType : undefined,
      };
    }
    throw new DomainError(
      domainCodes.INTERNAL,
      `${input.publicSummary}: Nango proxy sandbox binary response failed schema validation.`,
    );
  }

  const nango = createNangoAdminClient();
  return withNangoClient(
    {
      operation: input.operation,
      publicSummary: input.publicSummary,
      providerConfigKey,
      ...authFailureProjectionFieldsForInput(input),
      evidence: { http_method: method, endpoint, ...(input.evidence ?? {}) },
    },
    async () => {
      const res = await dispatchNangoProxy(nango, method, config);
      const body = binaryProxyDataToUint8Array(res.data);
      const ct =
        res.headers && typeof res.headers === "object"
          ? Reflect.get(res.headers, "content-type")
          : undefined;
      const contentType =
        typeof ct === "string"
          ? ct
          : Array.isArray(ct)
            ? typeof ct[0] === "string"
              ? ct[0]
              : undefined
            : undefined;
      return { body, contentType };
    },
  );
}

export async function nangoProxyRequestVoid(
  input: NangoProxyJsonBase & { data?: unknown },
): Promise<{ status: number; headers: Record<string, string | undefined> }> {
  const providerConfigKey = requireNonEmptyString("providerConfigKey", input.providerConfigKey);
  const connectionId = requireNonEmptyString("connectionId", input.connectionId);
  const endpoint = requireNonEmptyString("endpoint", input.endpoint);

  let data: unknown = input.data;
  if (input.bodySchema) {
    const parsed = input.bodySchema.safeParse(input.data);
    if (!parsed.success) {
      throwNangoProxyBodyContractError({
        ctx: input,
        method: input.method,
        endpoint,
        zodError: parsed.error,
      });
    }
    data = parsed.data;
  }

  const params = normalizeNangoProxyParams(input.params);
  const transport = proxyTransport(input, input.responseType ?? "json");
  const config = buildProxyConfig({
    providerConfigKey,
    connectionId,
    endpoint,
    method: input.method,
    ...(params === undefined ? {} : { params }),
    data,
    transport,
  });
  const sandboxRaw = await maybeRunNangoProxySandboxOperation({
    sandbox: input.sandbox,
    providerConfigKey,
    operation: input.operation,
    request: nangoProxySandboxRequest({
      method: input.method,
      endpoint,
      ...(params === undefined ? {} : { params }),
      data,
    }),
  });
  if (sandboxRaw !== null) {
    return { status: 200, headers: {} };
  }

  const nango = createNangoAdminClient();
  const res = await withNangoClient(
    {
      operation: input.operation,
      publicSummary: input.publicSummary,
      providerConfigKey,
      ...authFailureProjectionFieldsForInput(input),
      evidence: {
        http_method: input.method,
        endpoint,
        ...(input.evidence ?? {}),
      },
    },
    async () => dispatchNangoProxy(nango, input.method, config),
  );

  return { status: res.status, headers: headersToFlatRecord(res.headers) };
}
