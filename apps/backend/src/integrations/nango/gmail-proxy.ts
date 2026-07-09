import { z } from "zod";
import {
  nangoProxyRequestJson,
  type ProviderOperation,
  type ProviderProxyRequest,
  type NangoProxySandboxContext,
} from "./nango-proxy-client";

export const gmailNangoProxyRecordSchema = z.record(z.string(), z.unknown());
const gmailNangoProxyAttachmentResponseSchema = z
  .object({
    data: z.string().optional(),
    size: z.number().int().nonnegative().optional(),
  })
  .passthrough();
const gmailNangoProxyListMessagesResponseSchema = z
  .object({
    messages: z.array(gmailNangoProxyRecordSchema).default([]),
    nextPageToken: z.string().optional(),
    resultSizeEstimate: z.number().int().nonnegative().optional(),
  })
  .passthrough();
export const gmailNangoProxyResponseSchemas = {
  "get-attachment": gmailNangoProxyAttachmentResponseSchema,
  "get-message": gmailNangoProxyRecordSchema,
  "list-messages": gmailNangoProxyListMessagesResponseSchema,
  "modify-message": gmailNangoProxyRecordSchema,
  "send-message": gmailNangoProxyRecordSchema,
  "trash-message": gmailNangoProxyRecordSchema,
} as const;

export type GmailNangoProxyOperation =
  | "get-attachment"
  | "get-message"
  | "list-messages"
  | "modify-message"
  | "send-message"
  | "trash-message";

const stringField = z.string().trim().min(1);
const stringArray = z.array(stringField);
const gmailMessageFormatSchema = z.enum(["full", "metadata", "minimal", "raw"]);

const gmailListMessagesInputSchema = z
  .object({
    q: stringField.optional(),
    labelIds: stringArray.optional(),
    includeSpamTrash: z.boolean().optional(),
    maxResults: z.number().int().positive().max(500).optional(),
    pageToken: stringField.optional(),
  })
  .strict();

const gmailGetMessageInputSchema = z
  .object({
    id: stringField,
    format: gmailMessageFormatSchema.optional(),
    metadataHeaders: stringArray.optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.metadataHeaders?.length && input.format !== "metadata") {
      ctx.addIssue({
        code: "custom",
        path: ["metadataHeaders"],
        message: 'Gmail metadataHeaders are only valid when format is "metadata".',
      });
    }
  });

const gmailMessageAttachmentInputSchema = z
  .object({ messageId: stringField, attachmentId: stringField })
  .strict();

const gmailModifyMessageInputSchema = z
  .object({
    id: stringField,
    addLabelIds: stringArray.max(100).optional(),
    removeLabelIds: stringArray.max(100).optional(),
  })
  .strict();

const gmailSendMessageInputSchema = z
  .object({ raw: stringField, threadId: stringField.optional() })
  .strict();

const gmailTrashMessageInputSchema = z.object({ id: stringField }).strict();

const gmailModifyMessageBodySchema = z
  .object({
    addLabelIds: stringArray.max(100).optional(),
    removeLabelIds: stringArray.max(100).optional(),
  })
  .strict();

const gmailSendMessageBodySchema = gmailSendMessageInputSchema;

type GmailOperationInputByName = {
  "get-attachment": z.infer<typeof gmailMessageAttachmentInputSchema>;
  "get-message": z.infer<typeof gmailGetMessageInputSchema>;
  "list-messages": z.infer<typeof gmailListMessagesInputSchema>;
  "modify-message": z.infer<typeof gmailModifyMessageInputSchema>;
  "send-message": z.infer<typeof gmailSendMessageInputSchema>;
  "trash-message": z.infer<typeof gmailTrashMessageInputSchema>;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function repeatedQueryParams(
  values: ReadonlyArray<
    readonly [string, string | number | boolean | readonly string[] | undefined]
  >,
): string | undefined {
  const query = new URLSearchParams();
  for (const [key, value] of values) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else {
      query.set(key, String(value));
    }
  }
  const text = query.toString();
  return text || undefined;
}

function requestWithOptionalParams(
  request: Omit<ProviderProxyRequest, "params">,
  params: ProviderProxyRequest["params"] | undefined,
): ProviderProxyRequest {
  return params === undefined ? request : { ...request, params };
}

function normalizeGmailProxyOutput(
  operationName: GmailNangoProxyOperation,
  raw: unknown,
): unknown {
  const record = recordValue(raw);
  switch (operationName) {
    case "list-messages":
      return { ...record, messages: Array.isArray(record.messages) ? record.messages : [] };
    default:
      return raw;
  }
}

type GmailProviderOperationMap = {
  [K in GmailNangoProxyOperation]: ProviderOperation<GmailOperationInputByName[K], unknown>;
};

const gmailOperations: GmailProviderOperationMap = {
  "list-messages": {
    inputSchema: gmailListMessagesInputSchema,
    responseSchema: gmailNangoProxyResponseSchemas["list-messages"],
    toProxyRequest: (input) =>
      requestWithOptionalParams(
        {
          method: "get",
          endpoint: "/gmail/v1/users/me/messages",
        },
        repeatedQueryParams([
          ["q", input.q],
          ["labelIds", input.labelIds],
          ["includeSpamTrash", input.includeSpamTrash],
          ["maxResults", input.maxResults],
          ["pageToken", input.pageToken],
        ]),
      ),
    normalize: (raw) => normalizeGmailProxyOutput("list-messages", raw),
  },
  "get-message": {
    inputSchema: gmailGetMessageInputSchema,
    responseSchema: gmailNangoProxyResponseSchemas["get-message"],
    toProxyRequest: (input) =>
      requestWithOptionalParams(
        {
          method: "get",
          endpoint: `/gmail/v1/users/me/messages/${encodeURIComponent(input.id)}`,
        },
        repeatedQueryParams([
          ["format", input.format],
          ["metadataHeaders", input.metadataHeaders],
        ]),
      ),
    normalize: (raw) => normalizeGmailProxyOutput("get-message", raw),
  },
  "get-attachment": {
    inputSchema: gmailMessageAttachmentInputSchema,
    responseSchema: gmailNangoProxyResponseSchemas["get-attachment"],
    toProxyRequest: (input) => ({
      method: "get",
      endpoint: `/gmail/v1/users/me/messages/${encodeURIComponent(input.messageId)}/attachments/${encodeURIComponent(input.attachmentId)}`,
    }),
    normalize: (raw) => normalizeGmailProxyOutput("get-attachment", raw),
  },
  "modify-message": {
    inputSchema: gmailModifyMessageInputSchema,
    responseSchema: gmailNangoProxyResponseSchemas["modify-message"],
    toProxyRequest: (input) => ({
      method: "post",
      endpoint: `/gmail/v1/users/me/messages/${encodeURIComponent(input.id)}/modify`,
      data: {
        ...(input.addLabelIds?.length ? { addLabelIds: input.addLabelIds } : {}),
        ...(input.removeLabelIds?.length ? { removeLabelIds: input.removeLabelIds } : {}),
      },
      bodySchema: gmailModifyMessageBodySchema,
    }),
    normalize: (raw) => normalizeGmailProxyOutput("modify-message", raw),
  },
  "send-message": {
    inputSchema: gmailSendMessageInputSchema,
    responseSchema: gmailNangoProxyResponseSchemas["send-message"],
    toProxyRequest: (input) => ({
      method: "post",
      endpoint: "/gmail/v1/users/me/messages/send",
      data: {
        raw: input.raw,
        ...(input.threadId ? { threadId: input.threadId } : {}),
      },
      bodySchema: gmailSendMessageBodySchema,
    }),
    normalize: (raw) => normalizeGmailProxyOutput("send-message", raw),
  },
  "trash-message": {
    inputSchema: gmailTrashMessageInputSchema,
    responseSchema: gmailNangoProxyResponseSchemas["trash-message"],
    toProxyRequest: (input) => ({
      method: "post",
      endpoint: `/gmail/v1/users/me/messages/${encodeURIComponent(input.id)}/trash`,
    }),
    normalize: (raw) => normalizeGmailProxyOutput("trash-message", raw),
  },
};

export async function executeGmailNangoProxyOperation<
  T,
  TOperation extends GmailNangoProxyOperation,
>(
  providerConfigKey: string,
  connectionId: string,
  operationName: TOperation,
  responseSchema: z.ZodType<T>,
  input: GmailOperationInputByName[TOperation],
  sandbox?: NangoProxySandboxContext,
): Promise<T> {
  const operation = gmailOperations[operationName];
  const parsedInput = operation.inputSchema.parse(input);
  const request = operation.toProxyRequest(parsedInput as never);
  const raw = await nangoProxyRequestJson({
    operation: `nango.gmail.proxy.${operationName}`,
    publicSummary: `Nango Gmail proxy operation "${operationName}" failed`,
    providerConfigKey,
    connectionId,
    method: request.method,
    endpoint: request.endpoint,
    ...(request.params === undefined ? {} : { params: request.params }),
    ...(request.data === undefined ? {} : { data: request.data }),
    ...(request.bodySchema === undefined ? {} : { bodySchema: request.bodySchema }),
    responseSchema: operation.responseSchema,
    retries: request.retries ?? 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
  return responseSchema.parse(operation.normalize(raw, parsedInput as never));
}
