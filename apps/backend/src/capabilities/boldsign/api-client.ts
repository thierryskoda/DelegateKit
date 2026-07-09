import { Buffer } from "node:buffer";
import { z } from "zod";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { BackendSecretProviderCapabilityAccountBinding } from "../../integrations/provider-runtime";
import { providerRuntimeModeForCapabilityLink } from "../../integrations/provider-runtime";
import {
  requireProviderSandboxOperation,
  runProviderSandboxOperation,
} from "../../integrations/provider-sandbox";
import { ProviderHttpClient } from "../../integrations/provider-runtime/provider-http";
import { backendApiEnv } from "../../shared/env";
import { resolveBoldSignApiBaseUrl } from "./api-base-url";
const boldsignDocRecordSchema = z.record(z.string(), z.unknown());

export const boldsignDocumentListResponseSchema = z
  .object({
    result: z.array(boldsignDocRecordSchema).optional(),
    documents: z.array(boldsignDocRecordSchema).optional(),
    documentRecords: z.array(boldsignDocRecordSchema).optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

export type BoldsignDocumentListResponse = z.infer<typeof boldsignDocumentListResponseSchema>;

const boldsignSendFileSchema = z
  .object({
    base64: z.string().min(1),
    fileName: z.string().min(1),
  })
  .strict();

const boldsignSignerSchema = z
  .object({
    name: z.string().min(1),
    emailAddress: z.email(),
    signerType: z.literal("Signer"),
    locale: z.literal("EN"),
  })
  .strict();

const boldsignTextTagDefinitionSchema = z
  .object({
    DefinitionId: z.string().min(1),
    Type: z.enum(["Signature", "DateSigned"]),
    SignerIndex: z.number().int().positive(),
    IsRequired: z.boolean(),
    FieldId: z.string().min(1),
    Size: z
      .object({
        Width: z.number().positive(),
        Height: z.number().positive(),
      })
      .strict(),
  })
  .strict();

const boldsignDocumentSendBodySchema = z
  .object({
    Title: z.string().min(1),
    UseTextTags: z.literal(true),
    Files: z.array(boldsignSendFileSchema).min(1),
    Signers: z.array(boldsignSignerSchema).min(1),
    Labels: z.array(z.string().trim().min(1).max(255).regex(/^\S+$/)).optional(),
    MetaData: z.record(z.string().trim().min(1).max(50), z.string().max(500)).optional(),
    TextTagDefinitions: z.array(boldsignTextTagDefinitionSchema).optional(),
  })
  .strict();

export const boldsignDocumentSendResponseSchema = z.record(z.string(), z.unknown());

export type BoldsignDocumentSendResponse = z.infer<typeof boldsignDocumentSendResponseSchema>;

const boldsignRequestMessageBodySchema = z
  .object({
    Message: z.string().min(1),
    OnBehalfOf: z.email().optional(),
  })
  .strict();

export const boldsignEmptyResponseSchema = z
  .object({})
  .passthrough()
  .optional()
  .transform((value) => value ?? {});

export type BoldsignEmptyResponse = z.infer<typeof boldsignEmptyResponseSchema>;

export const boldsignDocumentDownloadSandboxResponseSchema = z
  .object({
    bodyBase64: z.string(),
    contentType: z.string().min(1).optional(),
  })
  .strict();

type BoldSignParamValue = string | number | boolean | string[] | number[] | undefined;
type BoldSignUrlParams = { readonly [key: string]: BoldSignParamValue };

type BoldSignListDocumentsQuery = {
  page: number;
  pageSize: number;
  searchKey?: string | undefined;
  sentBy?: string[] | undefined;
  recipients?: string[] | undefined;
  status?: string[] | undefined;
  labels?: string[] | undefined;
  transmitType?: "Sent" | "Received" | "Both" | undefined;
  dateFilterType?: "SentBetween" | "Expiring" | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  nextCursor?: number | undefined;
};

type BoldSignDocumentIdQuery = {
  documentId: string;
};

type BoldSignDocumentDownloadQuery = {
  documentId: string;
  onBehalfOf?: string | undefined;
};

type BoldSignDocumentSendBody = z.input<typeof boldsignDocumentSendBodySchema>;
export type BoldSignTextTagDefinition = z.input<typeof boldsignTextTagDefinitionSchema>;
type BoldSignRequestMessageBody = z.input<typeof boldsignRequestMessageBodySchema>;
type BoldSignProvider = "boldsign";
type BoldSignProviderOperation =
  | "boldsign.document.list"
  | "boldsign.document.send"
  | "boldsign.document.remind"
  | "boldsign.document.revoke"
  | "boldsign.document.download";
type BoldSignProviderContext = {
  provider: BoldSignProvider;
  operation: BoldSignProviderOperation;
};
type BoldSignSandboxContext = {
  db: SupabaseServiceClient;
  binding: BackendSecretProviderCapabilityAccountBinding;
};

const BOLDSIGN_PROVIDER_CONTEXTS = {
  listDocuments: { provider: "boldsign", operation: "boldsign.document.list" },
  sendDocument: { provider: "boldsign", operation: "boldsign.document.send" },
  remindDocument: { provider: "boldsign", operation: "boldsign.document.remind" },
  revokeDocument: { provider: "boldsign", operation: "boldsign.document.revoke" },
  downloadDocument: { provider: "boldsign", operation: "boldsign.document.download" },
} as const satisfies Record<string, BoldSignProviderContext>;

const providerHttp = new ProviderHttpClient();

async function maybeRunBoldSignSandboxOperation(input: {
  sandbox: BoldSignSandboxContext | undefined;
  context: BoldSignProviderContext;
  request: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<unknown | null> {
  if (!input.sandbox) return null;
  const mode = providerRuntimeModeForCapabilityLink(input.sandbox.binding.link);
  if (mode !== "sandbox") return null;
  const definition = requireProviderSandboxOperation(
    input.context.provider,
    input.context.operation,
  );
  return runProviderSandboxOperation({
    db: input.sandbox.db,
    binding: input.sandbox.binding,
    definition,
    request: input.request,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
}

function sandboxRequest(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function boldSignApiKey(): string {
  return backendApiEnv().boldSignApiKey;
}

function boldSignUrl(path: string, params?: BoldSignUrlParams): string {
  const url = new URL(`${resolveBoldSignApiBaseUrl()}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function boldSignHeaders(contentType?: string): Record<string, string> {
  return {
    accept: "application/json",
    "X-API-KEY": boldSignApiKey(),
    ...(contentType ? { "content-type": contentType } : {}),
  };
}

function buildBoldSignListDocumentsQuery(input: {
  page: number;
  pageSize: number;
  searchKey?: string;
  sentBy?: string[];
  recipients?: string[];
  status?: string[];
  labels?: string[];
  transmitType?: "Sent" | "Received" | "Both";
  dateFilterType?: "SentBetween" | "Expiring";
  startDate?: string;
  endDate?: string;
  nextCursor?: number;
}): BoldSignListDocumentsQuery {
  return {
    page: input.page,
    pageSize: input.pageSize,
    searchKey: input.searchKey,
    sentBy: input.sentBy,
    recipients: input.recipients,
    status: input.status,
    labels: input.labels,
    transmitType: input.transmitType,
    dateFilterType: input.dateFilterType,
    startDate: input.startDate,
    endDate: input.endDate,
    nextCursor: input.nextCursor,
  } satisfies BoldSignListDocumentsQuery;
}

function buildBoldSignSendDocumentBody(input: {
  title: string;
  files: Array<{ fileName: string; content: Uint8Array; mimeType: string }>;
  signers: Array<{ name: string; emailAddress: string }>;
  textTagDefinitions?: BoldSignTextTagDefinition[];
  labels?: string[];
  metadata?: Record<string, string>;
}): BoldSignDocumentSendBody {
  const rawBody = {
    Title: input.title,
    UseTextTags: true,
    Files: input.files.map((file) => ({
      fileName: file.fileName,
      base64: `data:${file.mimeType};base64,${Buffer.from(file.content).toString("base64")}`,
    })),
    Signers: input.signers.map((signer) => ({
      name: signer.name,
      emailAddress: signer.emailAddress,
      signerType: "Signer",
      locale: "EN",
    })),
    ...(input.labels === undefined || input.labels.length === 0 ? {} : { Labels: input.labels }),
    ...(input.metadata === undefined || Object.keys(input.metadata).length === 0
      ? {}
      : { MetaData: input.metadata }),
    ...(input.textTagDefinitions === undefined || input.textTagDefinitions.length === 0
      ? {}
      : { TextTagDefinitions: input.textTagDefinitions }),
  } satisfies BoldSignDocumentSendBody;
  return boldsignDocumentSendBodySchema.parse(rawBody);
}

function buildBoldSignDocumentIdQuery(documentId: string): BoldSignDocumentIdQuery {
  return { documentId } satisfies BoldSignDocumentIdQuery;
}

function buildBoldSignDocumentDownloadQuery(input: {
  documentId: string;
  onBehalfOf?: string;
}): BoldSignDocumentDownloadQuery {
  return {
    documentId: input.documentId,
    onBehalfOf: input.onBehalfOf,
  } satisfies BoldSignDocumentDownloadQuery;
}

function buildBoldSignRequestMessageBody(input: {
  message: string;
  onBehalfOf?: string;
}): BoldSignRequestMessageBody {
  const rawBody = {
    Message: input.message,
    ...(input.onBehalfOf === undefined ? {} : { OnBehalfOf: input.onBehalfOf }),
  } satisfies BoldSignRequestMessageBody;
  return boldsignRequestMessageBodySchema.parse(rawBody);
}

export async function boldsignApiListDocuments(input: {
  page: number;
  pageSize: number;
  searchKey?: string;
  sentBy?: string[];
  recipients?: string[];
  status?: string[];
  labels?: string[];
  transmitType?: "Sent" | "Received" | "Both";
  dateFilterType?: "SentBetween" | "Expiring";
  startDate?: string;
  endDate?: string;
  nextCursor?: number;
  sandbox?: BoldSignSandboxContext;
}): Promise<BoldsignDocumentListResponse> {
  const query = buildBoldSignListDocumentsQuery(input);
  const sandboxResponse = await maybeRunBoldSignSandboxOperation({
    sandbox: input.sandbox,
    context: BOLDSIGN_PROVIDER_CONTEXTS.listDocuments,
    request: sandboxRequest(query),
    metadata: { transport: "boldsign_api" },
  });
  if (sandboxResponse) return boldsignDocumentListResponseSchema.parse(sandboxResponse);
  return providerHttp.json(
    boldSignUrl("/document/list", query),
    { method: "GET", headers: boldSignHeaders() },
    boldsignDocumentListResponseSchema,
    BOLDSIGN_PROVIDER_CONTEXTS.listDocuments,
  );
}

export async function boldsignApiSendDocument(input: {
  title: string;
  files: Array<{ fileName: string; content: Uint8Array; mimeType: string }>;
  signers: Array<{ name: string; emailAddress: string }>;
  textTagDefinitions?: BoldSignTextTagDefinition[];
  labels?: string[];
  metadata?: Record<string, string>;
  sandbox?: BoldSignSandboxContext;
}): Promise<BoldsignDocumentSendResponse> {
  const body = buildBoldSignSendDocumentBody(input);
  const sandboxResponse = await maybeRunBoldSignSandboxOperation({
    sandbox: input.sandbox,
    context: BOLDSIGN_PROVIDER_CONTEXTS.sendDocument,
    request: body,
    metadata: { transport: "boldsign_api" },
  });
  if (sandboxResponse) return boldsignDocumentSendResponseSchema.parse(sandboxResponse);
  return providerHttp.json(
    boldSignUrl("/document/send"),
    {
      method: "POST",
      headers: boldSignHeaders("application/json"),
      body: JSON.stringify(body),
    },
    boldsignDocumentSendResponseSchema,
    BOLDSIGN_PROVIDER_CONTEXTS.sendDocument,
  );
}

export async function boldsignApiRemindDocument(input: {
  documentId: string;
  message: string;
  onBehalfOf?: string;
  sandbox?: BoldSignSandboxContext;
}): Promise<BoldsignEmptyResponse> {
  const body = buildBoldSignRequestMessageBody(input);
  const query = buildBoldSignDocumentIdQuery(input.documentId);
  const sandboxResponse = await maybeRunBoldSignSandboxOperation({
    sandbox: input.sandbox,
    context: BOLDSIGN_PROVIDER_CONTEXTS.remindDocument,
    request: sandboxRequest({ ...query, ...body }),
    metadata: { transport: "boldsign_api" },
  });
  if (sandboxResponse) return boldsignEmptyResponseSchema.parse(sandboxResponse);
  return providerHttp.json(
    boldSignUrl("/document/remind", query),
    {
      method: "POST",
      headers: boldSignHeaders("application/json"),
      body: JSON.stringify(body),
    },
    boldsignEmptyResponseSchema,
    BOLDSIGN_PROVIDER_CONTEXTS.remindDocument,
  );
}

export async function boldsignApiRevokeDocument(input: {
  documentId: string;
  message: string;
  onBehalfOf?: string;
  sandbox?: BoldSignSandboxContext;
}): Promise<BoldsignEmptyResponse> {
  const body = buildBoldSignRequestMessageBody(input);
  const query = buildBoldSignDocumentIdQuery(input.documentId);
  const sandboxResponse = await maybeRunBoldSignSandboxOperation({
    sandbox: input.sandbox,
    context: BOLDSIGN_PROVIDER_CONTEXTS.revokeDocument,
    request: sandboxRequest({ ...query, ...body }),
    metadata: { transport: "boldsign_api" },
  });
  if (sandboxResponse) return boldsignEmptyResponseSchema.parse(sandboxResponse);
  return providerHttp.json(
    boldSignUrl("/document/revoke", query),
    {
      method: "POST",
      headers: boldSignHeaders("application/json"),
      body: JSON.stringify(body),
    },
    boldsignEmptyResponseSchema,
    BOLDSIGN_PROVIDER_CONTEXTS.revokeDocument,
  );
}

export async function boldsignApiDownloadDocument(input: {
  documentId: string;
  onBehalfOf?: string;
  sandbox?: BoldSignSandboxContext;
}): Promise<{ body: Uint8Array; contentType: string | undefined }> {
  const query = buildBoldSignDocumentDownloadQuery(input);
  const sandboxResponse = await maybeRunBoldSignSandboxOperation({
    sandbox: input.sandbox,
    context: BOLDSIGN_PROVIDER_CONTEXTS.downloadDocument,
    request: sandboxRequest(query),
    metadata: { transport: "boldsign_api" },
  });
  if (sandboxResponse) {
    const parsed = boldsignDocumentDownloadSandboxResponseSchema.parse(sandboxResponse);
    return {
      body: Uint8Array.from(Buffer.from(parsed.bodyBase64, "base64")),
      contentType: parsed.contentType ?? undefined,
    };
  }
  const result = await providerHttp.bytes(
    boldSignUrl("/document/download", query),
    { method: "GET", headers: boldSignHeaders() },
    BOLDSIGN_PROVIDER_CONTEXTS.downloadDocument,
  );
  return { body: result.bytes, contentType: result.contentType ?? undefined };
}
