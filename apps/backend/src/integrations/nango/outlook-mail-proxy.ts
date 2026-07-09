import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  nangoProxyRequestJson,
  nangoProxyRequestVoid,
  type NangoProxySandboxContext,
  type ProviderOperation,
  type ProviderProxyRequest,
} from "./nango-proxy-client";

export const outlookMailNangoProxyRecordSchema = z.record(z.string(), z.unknown());

export type OutlookMailNangoProxyOperation =
  | "delete-message"
  | "download-message-attachment"
  | "get-message"
  | "list-messages"
  | "move-message"
  | "reply-to-message"
  | "send-mail"
  | "update-message";

const stringField = z.string().trim().min(1);

const outlookListMessagesInputSchema = z
  .object({
    folderId: stringField.optional(),
    filter: stringField.optional(),
    limit: z.number().int().positive().optional(),
    cursor: stringField.optional(),
  })
  .strict();

const outlookMessageIdInputSchema = z.object({ messageId: stringField }).strict();

const outlookMessageAttachmentInputSchema = z
  .object({ messageId: stringField, attachmentId: stringField })
  .strict();

const outlookBodyContentTypeSchema = z.enum(["text", "html", "Text", "HTML"]);
const outlookItemBodySchema = z
  .object({
    contentType: outlookBodyContentTypeSchema,
    content: z.string(),
  })
  .strict();
const outlookEmailAddressRequestSchema = z
  .object({
    address: stringField,
    name: stringField.optional(),
  })
  .strict();
const outlookRecipientRequestSchema = z
  .object({
    emailAddress: outlookEmailAddressRequestSchema,
  })
  .strict();
const outlookFileAttachmentRequestSchema = z
  .object({
    "@odata.type": z.literal("#microsoft.graph.fileAttachment"),
    name: stringField,
    contentType: stringField.optional(),
    contentBytes: stringField,
  })
  .strict();
const outlookSendMailMessageSchema = z
  .object({
    subject: z.string(),
    body: outlookItemBodySchema,
    toRecipients: z.array(outlookRecipientRequestSchema).optional(),
    ccRecipients: z.array(outlookRecipientRequestSchema).optional(),
    bccRecipients: z.array(outlookRecipientRequestSchema).optional(),
    attachments: z.array(outlookFileAttachmentRequestSchema).optional(),
  })
  .strict();
const outlookSendMailInputSchema = z
  .object({
    message: outlookSendMailMessageSchema,
    saveToSentItems: z.boolean().optional(),
  })
  .strict();
const outlookSendMailBodySchema = z
  .object({
    message: outlookSendMailMessageSchema,
    saveToSentItems: z.boolean(),
  })
  .strict();

const outlookMoveMessageInputSchema = z
  .object({ messageId: stringField, destinationId: stringField })
  .strict();
const outlookMoveMessageBodySchema = z.object({ destinationId: stringField }).strict();
const outlookReplyToMessageInputSchema = z
  .object({ messageId: stringField, comment: z.string() })
  .strict();
const outlookReplyToMessageBodySchema = z.object({ comment: z.string() }).strict();
const outlookDateTimeTimeZoneSchema = z
  .object({
    dateTime: stringField,
    timeZone: stringField,
  })
  .strict();
const outlookFollowupFlagSchema = z
  .object({
    completedDateTime: outlookDateTimeTimeZoneSchema.optional(),
    dueDateTime: outlookDateTimeTimeZoneSchema.optional(),
    flagStatus: z.enum(["notFlagged", "complete", "flagged"]).optional(),
    startDateTime: outlookDateTimeTimeZoneSchema.optional(),
  })
  .strict();
const outlookUpdateMessageInputSchema = z
  .object({
    messageId: stringField,
    subject: z.string().optional(),
    body: outlookItemBodySchema.optional(),
    categories: z.array(stringField).optional(),
    isRead: z.boolean().optional(),
    flag: outlookFollowupFlagSchema.optional(),
  })
  .strict();
const outlookUpdateMessageBodySchema = outlookUpdateMessageInputSchema.omit({ messageId: true });

type OutlookMailOperationInputByName = {
  "delete-message": z.infer<typeof outlookMessageIdInputSchema>;
  "download-message-attachment": z.infer<typeof outlookMessageAttachmentInputSchema>;
  "get-message": z.infer<typeof outlookMessageIdInputSchema>;
  "list-messages": z.infer<typeof outlookListMessagesInputSchema>;
  "move-message": z.infer<typeof outlookMoveMessageInputSchema>;
  "reply-to-message": z.infer<typeof outlookReplyToMessageInputSchema>;
  "send-mail": z.infer<typeof outlookSendMailInputSchema>;
  "update-message": z.infer<typeof outlookUpdateMessageInputSchema>;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeOutlookMailProxyOutput(
  operationName: OutlookMailNangoProxyOperation,
  input: OutlookMailOperationInputByName[OutlookMailNangoProxyOperation],
  raw: unknown,
): unknown {
  const parsedInput = recordValue(input);
  const record = recordValue(raw);
  switch (operationName) {
    case "list-messages":
      return { messages: Array.isArray(record.value) ? record.value : [], next_cursor: record["@odata.nextLink"] };
    case "download-message-attachment":
      if (typeof record.contentBytes === "string") {
        return {
          content: record.contentBytes,
          contentType:
            typeof record.contentType === "string" ? record.contentType : "application/octet-stream",
          ...(typeof record.name === "string" ? { name: record.name } : {}),
        };
      }
      return {
        content: Buffer.from(JSON.stringify(raw ?? {})).toString("base64"),
        contentType: "application/octet-stream",
      };
    case "send-mail":
      return { success: true, message: "Email sent successfully" };
    case "reply-to-message":
      return { messageId: parsedInput.messageId, success: true };
    case "delete-message":
      return { success: true, messageId: parsedInput.messageId };
    default:
      return raw;
  }
}

type OutlookMailProviderOperationMap = {
  [K in OutlookMailNangoProxyOperation]: ProviderOperation<
    OutlookMailOperationInputByName[K],
    unknown
  >;
};

const outlookMailOperations: OutlookMailProviderOperationMap = {
  "list-messages": {
    inputSchema: outlookListMessagesInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest(input): ProviderProxyRequest {
      const folderId = input.folderId?.trim() || "inbox";
      if (input.cursor?.trim()) return { method: "get", endpoint: input.cursor };
      const search = formatOutlookMailSearch(input.filter);
      return {
        method: "get",
        endpoint: `/v1.0/me/mailFolders/${encodeURIComponent(folderId)}/messages`,
        params: {
          $top: typeof input.limit === "number" ? Math.min(50, input.limit) : 25,
          ...(search ? { $search: search } : {}),
          ...(search ? {} : { $orderby: "receivedDateTime desc" }),
        },
      };
    },
    normalize: (raw, input) => normalizeOutlookMailProxyOutput("list-messages", input, raw),
  },
  "get-message": {
    inputSchema: outlookMessageIdInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({
      method: "get",
      endpoint: `/v1.0/me/messages/${encodeURIComponent(input.messageId)}`,
      params: {
        $select:
          "id,conversationId,subject,bodyPreview,body,receivedDateTime,internetMessageId,isDraft,from,sender,toRecipients,ccRecipients,bccRecipients,parentFolderId",
        $expand: "attachments($select=id,name,contentType,size)",
      },
    }),
    normalize: (raw, input) => normalizeOutlookMailProxyOutput("get-message", input, raw),
  },
  "download-message-attachment": {
    inputSchema: outlookMessageAttachmentInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({
      method: "get",
      endpoint: `/v1.0/me/messages/${encodeURIComponent(input.messageId)}/attachments/${encodeURIComponent(input.attachmentId)}`,
    }),
    normalize: (raw, input) =>
      normalizeOutlookMailProxyOutput("download-message-attachment", input, raw),
  },
  "send-mail": {
    inputSchema: outlookSendMailInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({
      method: "post",
      endpoint: "/v1.0/me/sendMail",
      data: {
        message: input.message,
        saveToSentItems: typeof input.saveToSentItems === "boolean" ? input.saveToSentItems : true,
      },
      bodySchema: outlookSendMailBodySchema,
      voidResponse: true,
      retries: 1,
    }),
    normalize: (raw, input) => normalizeOutlookMailProxyOutput("send-mail", input, raw),
  },
  "reply-to-message": {
    inputSchema: outlookReplyToMessageInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({
      method: "post",
      endpoint: `/v1.0/me/messages/${encodeURIComponent(input.messageId)}/reply`,
      data: { comment: input.comment },
      bodySchema: outlookReplyToMessageBodySchema,
      voidResponse: true,
    }),
    normalize: (raw, input) => normalizeOutlookMailProxyOutput("reply-to-message", input, raw),
  },
  "move-message": {
    inputSchema: outlookMoveMessageInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({
      method: "post",
      endpoint: `/v1.0/me/messages/${encodeURIComponent(input.messageId)}/move`,
      data: { destinationId: input.destinationId },
      bodySchema: outlookMoveMessageBodySchema,
    }),
    normalize: (raw, input) => normalizeOutlookMailProxyOutput("move-message", input, raw),
  },
  "update-message": {
    inputSchema: outlookUpdateMessageInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest(input): ProviderProxyRequest {
      const data: Record<string, unknown> = {};
      for (const key of ["subject", "body", "categories", "isRead", "flag"] as const) {
        if (input[key] !== undefined) data[key] = input[key];
      }
      return {
        method: "patch",
        endpoint: `/v1.0/me/messages/${encodeURIComponent(input.messageId)}`,
        data,
        bodySchema: outlookUpdateMessageBodySchema,
      };
    },
    normalize: (raw, input) => normalizeOutlookMailProxyOutput("update-message", input, raw),
  },
  "delete-message": {
    inputSchema: outlookMessageIdInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({
      method: "delete",
      endpoint: `/v1.0/me/messages/${encodeURIComponent(input.messageId)}`,
      voidResponse: true,
    }),
    normalize: (raw, input) => normalizeOutlookMailProxyOutput("delete-message", input, raw),
  },
};

function formatOutlookMailSearch(raw: string | undefined): string | null {
  const search = raw?.trim();
  if (!search) return null;
  if (search.startsWith('"') && search.endsWith('"')) return search;
  return `"${search.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function executeOutlookMailNangoProxyOperation<
  T,
  TOperation extends OutlookMailNangoProxyOperation,
>(
  providerConfigKey: string,
  connectionId: string,
  operationName: TOperation,
  responseSchema: z.ZodType<T>,
  input: OutlookMailOperationInputByName[TOperation],
  sandbox?: NangoProxySandboxContext,
): Promise<T> {
  const operation = outlookMailOperations[operationName];
  const parsedInput = operation.inputSchema.parse(input);
  const request = operation.toProxyRequest(parsedInput as never);
  if (request.voidResponse) {
    await nangoProxyRequestVoid({
      operation: `nango.outlook_mail.proxy.${operationName}`,
      publicSummary: `Nango Outlook Mail proxy operation "${operationName}" failed`,
      providerConfigKey,
      connectionId,
      method: request.method,
      endpoint: request.endpoint,
      ...(request.params === undefined ? {} : { params: request.params }),
      ...(request.data === undefined ? {} : { data: request.data }),
      ...(request.bodySchema === undefined ? {} : { bodySchema: request.bodySchema }),
      retries: request.retries ?? 3,
      ...(sandbox === undefined ? {} : { sandbox }),
    });
    return responseSchema.parse(operation.normalize(undefined, parsedInput as never));
  }
  const raw = await nangoProxyRequestJson({
    operation: `nango.outlook_mail.proxy.${operationName}`,
    publicSummary: `Nango Outlook Mail proxy operation "${operationName}" failed`,
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
