import { randomUUID } from "node:crypto";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import {
  listProviderSandboxResources,
  registerProviderSandboxOperation,
  upsertProviderSandboxResource,
  type ProviderSandboxBinding,
} from ".";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";

export const providerSandboxOperationResponseResourceType = "provider_operation_response";

const sandboxProxyRequestSchema = z.record(z.string(), z.unknown());

type SandboxProxyRequest = z.infer<typeof sandboxProxyRequestSchema>;

const mondaySandboxItemResourceType = "monday_item";
const googleDriveSandboxFileResourceType = "google_drive_file";
const boldSignDocumentResourceType = "boldsign_document";

function parseOperationFixtureState<TSchema extends z.ZodType>(
  responseSchema: TSchema,
  state: unknown,
): z.output<TSchema> {
  const parsed = z.object({ response: responseSchema }).parse(state) as {
    response: z.output<TSchema>;
  };
  return parsed.response;
}

async function loadSeededOperationResponse<TSchema extends z.ZodType>(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  providerKey: string;
  operation: string;
  responseSchema: TSchema;
}): Promise<z.output<TSchema>> {
  const resources = await listProviderSandboxResources({
    db: input.db,
    binding: input.binding,
    providerKey: input.providerKey,
    resourceType: providerSandboxOperationResponseResourceType,
  });
  const resource = resources.find((row) => row.resource_id === input.operation);
  if (!resource) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Provider sandbox has no seeded response for ${input.providerKey}/${input.operation}.`,
    );
  }
  return parseOperationFixtureState(input.responseSchema, resource.state);
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function maybeParseJsonRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return {};
  try {
    return recordValue(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

function sandboxRequestParam(input: SandboxProxyRequest, key: string): string | null {
  const params = input.params;
  if (typeof params === "string") {
    const value = new URLSearchParams(params).get(key);
    return value?.trim() || null;
  }
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const value = (params as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }
  return null;
}

function gmailHeaderValue(message: Record<string, unknown>, headerName: string): string {
  const payloadHeaders = recordValue(message.payload).headers;
  if (!Array.isArray(payloadHeaders)) return "";
  const header = payloadHeaders.find((entry) => {
    const row = recordValue(entry);
    return String(row.name ?? "").toLowerCase() === headerName.toLowerCase();
  });
  return String(recordValue(header).value ?? "");
}

function parseGmailListMessagesResponse(raw: unknown): {
  record: Record<string, unknown>;
  messages: Record<string, unknown>[];
} {
  const record = recordValue(raw);
  const messages = Array.isArray(record.messages)
    ? record.messages.filter(
        (message): message is Record<string, unknown> =>
          message !== null && typeof message === "object" && !Array.isArray(message),
      )
    : [];
  return { record, messages };
}

function gmailQueryIncludesSentScope(input: SandboxProxyRequest): boolean {
  const q = sandboxRequestParam(input, "q")?.toLowerCase() ?? "";
  const labelIds = sandboxRequestParam(input, "labelIds")?.toLowerCase() ?? "";
  return (
    q.includes("in:sent") ||
    q.includes("label:sent") ||
    q.includes("from:john") ||
    labelIds === "sent"
  );
}

function gmailQuerySender(input: SandboxProxyRequest): string | null {
  const q = sandboxRequestParam(input, "q")?.toLowerCase() ?? "";
  const match = q.match(/\bfrom:([^\s)]+)/);
  return match?.[1] ?? null;
}

function filterGmailListMessagesResponse(input: {
  request: SandboxProxyRequest;
  response: Record<string, unknown>;
}): Record<string, unknown> {
  const { record, messages } = parseGmailListMessagesResponse(input.response);
  if (gmailQueryIncludesSentScope(input.request)) {
    return { ...record, messages: [], resultSizeEstimate: 0 };
  }
  const sender = gmailQuerySender(input.request);
  if (!sender) return input.response;
  const filtered = messages.filter((message) =>
    gmailHeaderValue(message, "From").toLowerCase().includes(sender),
  );
  return { ...record, messages: filtered, resultSizeEstimate: filtered.length };
}

function gmailMessageIdFromGetRequest(request: SandboxProxyRequest): string | null {
  const endpoint = typeof request.endpoint === "string" ? request.endpoint : "";
  const match = endpoint.match(/\/gmail\/v1\/users\/me\/messages\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function maybeHandleGmailDynamicOperation(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  providerKey: string;
  operation: string;
  request: SandboxProxyRequest;
}): Promise<{ handled: true; response: Record<string, unknown> } | { handled: false }> {
  if (
    input.providerKey !== "ai-assistants-google" ||
    input.operation !== "nango.gmail.proxy.get-message"
  ) {
    return { handled: false };
  }
  const requestedId = gmailMessageIdFromGetRequest(input.request);
  if (!requestedId) return { handled: false };
  const resources = await listProviderSandboxResources({
    db: input.db,
    binding: input.binding,
    providerKey: input.providerKey,
    resourceType: providerSandboxOperationResponseResourceType,
  });
  const listResource = resources.find(
    (resource) => resource.resource_id === "nango.gmail.proxy.list-messages",
  );
  const response = recordValue(recordValue(listResource?.state).response);
  const messages = Array.isArray(response.messages)
    ? response.messages.filter(
        (message): message is Record<string, unknown> =>
          message !== null && typeof message === "object" && !Array.isArray(message),
      )
    : [];
  const message = messages.find((candidate) => {
    const id = typeof candidate.id === "string" ? candidate.id : candidate.messageId;
    return id === requestedId;
  });
  return message ? { handled: true, response: message } : { handled: false };
}

function mondayColumnValue(input: {
  id: string;
  value: unknown;
  existingType?: string | null;
}): Record<string, unknown> {
  const value =
    typeof input.value === "string"
      ? input.value
      : input.value && typeof input.value === "object" && !Array.isArray(input.value)
        ? JSON.stringify(input.value)
        : String(input.value ?? "");
  let parsed: unknown = input.value;
  if (typeof input.value === "string") {
    try {
      parsed = JSON.parse(input.value) as unknown;
    } catch {
      parsed = input.value;
    }
  }
  const parsedRecord = recordValue(parsed);
  const text =
    typeof parsed === "string"
      ? parsed
      : typeof parsedRecord.text === "string"
        ? parsedRecord.text
        : typeof parsedRecord.label === "string"
          ? parsedRecord.label
          : typeof parsedRecord.email === "string"
            ? parsedRecord.email
            : value;
  return {
    id: input.id,
    text,
    type: input.existingType ?? "text",
    value: typeof input.value === "string" ? input.value : JSON.stringify(input.value),
  };
}

async function applyMondayItemUpdate(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  providerKey: string;
  request: SandboxProxyRequest;
}): Promise<void> {
  const data = recordValue(input.request.data);
  const variables = recordValue(data.variables ?? input.request.variables);
  const itemId = typeof variables.itemId === "string" ? variables.itemId.trim() : "";
  if (!itemId) return;
  const columnValues = maybeParseJsonRecord(variables.columnValues);
  if (Object.keys(columnValues).length === 0) return;

  const resources = await listProviderSandboxResources({
    db: input.db,
    binding: input.binding,
    providerKey: input.providerKey,
    resourceType: mondaySandboxItemResourceType,
  });
  const resource = resources.find((candidate) => candidate.resource_id === itemId);
  if (!resource || !resource.state || typeof resource.state !== "object" || Array.isArray(resource.state)) {
    return;
  }

  const state = resource.state as Record<string, unknown>;
  const existingColumns = Array.isArray(state.column_values)
    ? state.column_values.filter(
        (column): column is Record<string, unknown> =>
          column !== null && typeof column === "object" && !Array.isArray(column),
      )
    : [];
  const byId = new Map(existingColumns.map((column) => [String(column.id ?? ""), column]));
  for (const [columnId, value] of Object.entries(columnValues)) {
    const existing = byId.get(columnId);
    byId.set(
      columnId,
      mondayColumnValue({
        id: columnId,
        value,
        existingType: typeof existing?.type === "string" ? existing.type : null,
      }),
    );
  }
  await upsertProviderSandboxResource({
    db: input.db,
    binding: input.binding,
    key: {
      providerKey: input.providerKey,
      resourceType: mondaySandboxItemResourceType,
      resourceId: itemId,
    },
    state: {
      ...state,
      column_values: [...byId.values()],
    },
    metadata:
      resource.metadata && typeof resource.metadata === "object" && !Array.isArray(resource.metadata)
        ? (resource.metadata as Record<string, unknown>)
        : {},
  });
}

function googleDriveSandboxFile(input: {
  fileId: string;
  name: string;
  mimeType: string;
  folderId?: string;
  description?: string;
  size?: number;
}): Record<string, unknown> {
  const timestamp = new Date().toISOString();
  return {
    id: input.fileId,
    name: input.name,
    mimeType: input.mimeType,
    parents: input.folderId ? [input.folderId] : [],
    createdTime: timestamp,
    modifiedTime: timestamp,
    size: String(input.size ?? 1280),
    webViewLink: `https://drive.google.com/file/d/${input.fileId}/view`,
    webContentLink: `https://drive.google.com/uc?id=${input.fileId}&export=download`,
    trashed: false,
    starred: false,
    ...(input.description ? { description: input.description } : {}),
  };
}

async function maybeHandleGoogleDriveDynamicOperation(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  providerKey: string;
  operation: string;
  request: SandboxProxyRequest;
}): Promise<{ handled: true; response: Record<string, unknown> } | { handled: false }> {
  if (
    input.providerKey !== "ai-assistants-google" ||
    ![
      "nango.google_drive.proxy.upload_document.create_metadata",
      "nango.google_drive.proxy.upload_document.media",
    ].includes(input.operation)
  ) {
    return { handled: false };
  }

  if (input.operation === "nango.google_drive.proxy.upload_document.create_metadata") {
    const data = recordValue(input.request.data);
    const fileId = `sandbox-drive-${randomUUID()}`;
    const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : fileId;
    const mimeType =
      typeof data.mimeType === "string" && data.mimeType.trim()
        ? data.mimeType.trim()
        : "application/octet-stream";
    const parents = Array.isArray(data.parents) ? data.parents : [];
    const folderId = parents.find(
      (parent): parent is string => typeof parent === "string" && parent.trim().length > 0,
    );
    const description =
      typeof data.description === "string" && data.description.trim()
        ? data.description.trim()
        : undefined;
    const file = googleDriveSandboxFile({
      fileId,
      name,
      mimeType,
      ...(folderId ? { folderId } : {}),
      ...(description ? { description } : {}),
    });
    await upsertProviderSandboxResource({
      db: input.db,
      binding: input.binding,
      key: {
        providerKey: input.providerKey,
        resourceType: googleDriveSandboxFileResourceType,
        resourceId: fileId,
      },
      state: file,
      metadata: { name, uploadedBySandbox: true },
    });
    return { handled: true, response: file };
  }

  const endpoint = typeof input.request.endpoint === "string" ? input.request.endpoint : "";
  const match = endpoint.match(/\/upload\/drive\/v3\/files\/([^/?#]+)/);
  const fileId = match?.[1] ? decodeURIComponent(match[1]) : "";
  if (!fileId) return { handled: false };
  const resources = await listProviderSandboxResources({
    db: input.db,
    binding: input.binding,
    providerKey: input.providerKey,
    resourceType: googleDriveSandboxFileResourceType,
  });
  const resource = resources.find((candidate) => candidate.resource_id === fileId);
  const state =
    resource?.state && typeof resource.state === "object" && !Array.isArray(resource.state)
      ? (resource.state as Record<string, unknown>)
      : googleDriveSandboxFile({
          fileId,
          name: fileId,
          mimeType: "application/octet-stream",
        });
  const rawData = input.request.data;
  const size =
    typeof rawData === "string"
      ? rawData.length
      : rawData instanceof Uint8Array
        ? rawData.byteLength
        : Number(state.size ?? 1280);
  const nextState = {
    ...state,
    size: String(Number.isFinite(size) ? size : state.size ?? 1280),
    modifiedTime: new Date().toISOString(),
  };
  await upsertProviderSandboxResource({
    db: input.db,
    binding: input.binding,
    key: {
      providerKey: input.providerKey,
      resourceType: googleDriveSandboxFileResourceType,
      resourceId: fileId,
    },
    state: nextState,
    metadata:
      resource?.metadata && typeof resource.metadata === "object" && !Array.isArray(resource.metadata)
        ? (resource.metadata as Record<string, unknown>)
        : {},
  });
  return { handled: true, response: nextState };
}

function boldSignDocumentFromSendRequest(input: SandboxProxyRequest): Record<string, unknown> {
  const documentId = `sandbox-boldsign-${randomUUID()}`;
  const title =
    typeof input.Title === "string" && input.Title.trim()
      ? input.Title.trim()
      : "Sandbox signature request";
  const signers = Array.isArray(input.Signers)
    ? input.Signers.filter(
        (signer): signer is Record<string, unknown> =>
          signer !== null && typeof signer === "object" && !Array.isArray(signer),
      )
    : [];
  const firstSigner = signers[0] ?? {};
  const signerEmail =
    typeof firstSigner.emailAddress === "string" && firstSigner.emailAddress.trim()
      ? firstSigner.emailAddress.trim()
      : null;
  const signerName =
    typeof firstSigner.name === "string" && firstSigner.name.trim()
      ? firstSigner.name.trim()
      : null;
  const sentDate = new Date().toISOString();
  return {
    documentId,
    id: documentId,
    title,
    documentTitle: title,
    status: "InProgress",
    documentStatus: "InProgress",
    sentDate,
    createdDate: sentDate,
    signers,
    ...(signerEmail ? { recipientEmail: signerEmail } : {}),
    ...(signerName ? { recipientName: signerName } : {}),
  };
}

async function maybeHandleBoldSignDynamicOperation(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  providerKey: string;
  operation: string;
  request: SandboxProxyRequest;
}): Promise<{ handled: true; response: Record<string, unknown> } | { handled: false }> {
  if (input.providerKey !== "boldsign") return { handled: false };
  if (input.operation === "boldsign.document.send") {
    const document = boldSignDocumentFromSendRequest(input.request);
    const documentId = String(document.documentId);
    await upsertProviderSandboxResource({
      db: input.db,
      binding: input.binding,
      key: {
        providerKey: input.providerKey,
        resourceType: boldSignDocumentResourceType,
        resourceId: documentId,
      },
      state: document,
      metadata: {
        title: String(document.title),
        sentBySandbox: true,
      },
    });
    return {
      handled: true,
      response: {
        documentId,
        id: documentId,
        status: document.status,
        title: document.title,
      },
    };
  }
  if (input.operation === "boldsign.document.list") {
    const resources = await listProviderSandboxResources({
      db: input.db,
      binding: input.binding,
      providerKey: input.providerKey,
      resourceType: boldSignDocumentResourceType,
    });
    if (resources.length === 0) return { handled: false };
    const queryDocumentId =
      typeof input.request.documentId === "string" && input.request.documentId.trim()
        ? input.request.documentId.trim()
        : null;
    const recipientFilters = Array.isArray(input.request.recipients)
      ? input.request.recipients.filter(
          (recipient): recipient is string =>
            typeof recipient === "string" && recipient.trim().length > 0,
        )
      : [];
    const documents = resources
      .map((resource) => recordValue(resource.state))
      .filter((document) => {
        if (queryDocumentId && document.documentId !== queryDocumentId && document.id !== queryDocumentId) {
          return false;
        }
        if (recipientFilters.length === 0) return true;
        const recipientEmail =
          typeof document.recipientEmail === "string" ? document.recipientEmail.toLowerCase() : "";
        return recipientFilters.some((recipient) => recipientEmail === recipient.toLowerCase());
      });
    return { handled: true, response: { result: documents } };
  }
  return { handled: false };
}

async function applyOperationFixtureRequestSemantics(input: {
  db: SupabaseServiceClient;
  binding: ProviderSandboxBinding;
  providerKey: string;
  operation: string;
  request: SandboxProxyRequest;
  response: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  if (
    input.providerKey === "ai-assistants-google" &&
    input.operation === "nango.gmail.proxy.list-messages"
  ) {
    return filterGmailListMessagesResponse({
      request: input.request,
      response: input.response,
    });
  }
  if (input.providerKey === "ai-assistants-monday" && input.operation === "monday.item.update") {
    await applyMondayItemUpdate(input);
  }
  return input.response;
}

export function registerProviderSandboxOperationFixture(input: {
  providerKey: string;
  operation: string;
  responseSchema: z.ZodType;
}): void {
  registerProviderSandboxOperation({
    providerKey: input.providerKey,
    operation: input.operation,
    requestSchema: sandboxProxyRequestSchema,
    responseSchema: input.responseSchema,
    async handle(ctx) {
      const gmailDynamic = await maybeHandleGmailDynamicOperation({
        db: ctx.db,
        binding: ctx.binding,
        providerKey: input.providerKey,
        operation: input.operation,
        request: ctx.request,
      });
      if (gmailDynamic.handled) return gmailDynamic.response;
      const boldSignDynamic = await maybeHandleBoldSignDynamicOperation({
        db: ctx.db,
        binding: ctx.binding,
        providerKey: input.providerKey,
        operation: input.operation,
        request: ctx.request,
      });
      if (boldSignDynamic.handled) return boldSignDynamic.response;
      const dynamic = await maybeHandleGoogleDriveDynamicOperation({
        db: ctx.db,
        binding: ctx.binding,
        providerKey: input.providerKey,
        operation: input.operation,
        request: ctx.request,
      });
      if (dynamic.handled) return dynamic.response;
      const response = await loadSeededOperationResponse({
        db: ctx.db,
        binding: ctx.binding,
        providerKey: input.providerKey,
        operation: input.operation,
        responseSchema: input.responseSchema,
      });
      return await applyOperationFixtureRequestSemantics({
        db: ctx.db,
        binding: ctx.binding,
        providerKey: input.providerKey,
        operation: input.operation,
        request: ctx.request,
        response: recordValue(response),
      });
    },
  });
}
