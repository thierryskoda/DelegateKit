import { z } from "zod";
import {
  nangoProxyRequestBinary,
  nangoProxyRequestJson,
  type NangoProxySandboxContext,
  type ProviderOperation,
  type ProviderProxyRequest,
} from "../nango/nango-proxy-client";

export const microsoftSharepointDriveNangoProxyRecordSchema = z.record(z.string(), z.unknown());

export type MicrosoftSharepointDriveProxyOperation = "fetch-file" | "list-shared-sites";

const stringField = z.string().trim().min(1);
const nangoParamsObjectSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.undefined()]),
);
const emptyInputSchema = z.object({}).strict();
const sharepointFetchFileInputSchema = z.object({ siteId: stringField, itemId: stringField }).strict();
const microsoftSharepointDriveBinaryGetInputSchema = z
  .object({
    endpoint: stringField,
    params: nangoParamsObjectSchema.optional(),
    retries: z.number().int().positive().optional(),
  })
  .strict();

type MicrosoftSharepointDriveOperationInputByName = {
  "fetch-file": z.infer<typeof sharepointFetchFileInputSchema>;
  "list-shared-sites": z.infer<typeof emptyInputSchema>;
};

type MicrosoftSharepointDriveOperationMap = {
  [K in MicrosoftSharepointDriveProxyOperation]: ProviderOperation<
    MicrosoftSharepointDriveOperationInputByName[K],
    unknown
  >;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function normalizeSharepointDriveOutput(
  operationName: MicrosoftSharepointDriveProxyOperation,
  raw: unknown,
): unknown {
  const record = recordValue(raw);
  switch (operationName) {
    case "fetch-file":
      return { id: record.id, download_url: record["@microsoft.graph.downloadUrl"] ?? null };
    case "list-shared-sites":
      return { sites: arrayValue(record.value), sitesToSync: arrayValue(record.value) };
    default: {
      const _exhaustive: never = operationName;
      throw new Error(`Unhandled SharePoint drive normalization ${String(_exhaustive)}.`);
    }
  }
}

const microsoftSharepointDriveOperations: MicrosoftSharepointDriveOperationMap = {
  "fetch-file": {
    inputSchema: sharepointFetchFileInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input): ProviderProxyRequest => ({
      method: "get",
      endpoint: `/v1.0/sites/${encodeURIComponent(input.siteId)}/drive/items/${encodeURIComponent(input.itemId)}`,
      params: { select: "id, @microsoft.graph.downloadUrl" },
    }),
    normalize: (raw) => normalizeSharepointDriveOutput("fetch-file", raw),
  },
  "list-shared-sites": {
    inputSchema: emptyInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (): ProviderProxyRequest => ({
      method: "get",
      endpoint: "/v1.0/sites",
      params: { search: "*" },
    }),
    normalize: (raw) => normalizeSharepointDriveOutput("list-shared-sites", raw),
  },
};

export async function executeMicrosoftSharepointDriveNangoProxyOperation<
  T,
  TOperation extends MicrosoftSharepointDriveProxyOperation,
>(
  providerConfigKey: string,
  connectionId: string,
  operationName: TOperation,
  responseSchema: z.ZodType<T>,
  input: MicrosoftSharepointDriveOperationInputByName[TOperation],
  sandbox?: NangoProxySandboxContext,
): Promise<T> {
  const operation = microsoftSharepointDriveOperations[operationName];
  const parsedInput = operation.inputSchema.parse(input);
  const request = operation.toProxyRequest(parsedInput as never);
  const raw = await nangoProxyRequestJson({
    operation: `nango.microsoft_sharepoint_drive.proxy.${operationName}`,
    publicSummary: `Nango Microsoft SharePoint drive proxy operation "${operationName}" failed`,
    providerConfigKey,
    connectionId,
    method: request.method,
    endpoint: request.endpoint,
    ...(request.params === undefined ? {} : { params: request.params }),
    ...(request.data === undefined ? {} : { data: request.data }),
    ...(request.headers === undefined ? {} : { headers: request.headers }),
    ...(request.bodySchema === undefined ? {} : { bodySchema: request.bodySchema }),
    responseSchema: operation.responseSchema,
    retries: request.retries ?? 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
  return responseSchema.parse(operation.normalize(raw, parsedInput as never));
}

export async function microsoftSharepointDriveNangoProxyGetBinary(
  providerConfigKey: string,
  connectionId: string,
  input: z.infer<typeof microsoftSharepointDriveBinaryGetInputSchema>,
  sandbox?: NangoProxySandboxContext,
): Promise<{ body: Uint8Array; contentType: string | undefined }> {
  const parsedInput = microsoftSharepointDriveBinaryGetInputSchema.parse(input);
  return nangoProxyRequestBinary({
    operation: "nango.microsoft_sharepoint_drive.proxy.get.binary",
    publicSummary: "Nango Microsoft SharePoint drive binary download failed",
    providerConfigKey,
    connectionId,
    endpoint: parsedInput.endpoint,
    ...(parsedInput.params === undefined ? {} : { params: parsedInput.params }),
    retries: parsedInput.retries ?? 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
}
