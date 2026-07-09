import { DomainError, domainCodes } from "@ai-assistants/errors";
import { constantTimeStringEqual } from "../../shared/security";
import type { Hono } from "hono";
import { z } from "zod";
import {
  downloadTelegramFileAttachment,
  resolveBackendChannel,
  runBackendChannelTurn,
  type BackendChannelProvider,
} from "../../product/channels/backend-channel-runner";
import { backendApiEnv } from "../../shared/env";
import { parseJsonBody, parseRouteParams } from "../../shared/http-validation";
import { controlDb } from "../control-db";
import { requireMachine } from "../http-auth";

const internalChannelProviderSchema = z.enum(["e2e-test", "webchat"]);

const channelRouteParamsSchema = z
  .object({
    provider: internalChannelProviderSchema,
  })
  .strict();

const inboundAttachmentSchema = z
  .object({
    filename: z.string().trim().min(1),
    mimeType: z.string().trim().min(1),
    contentBase64: z.string().trim().min(1),
    byteSize: z.number().int().nonnegative().optional(),
    sha256: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

const internalChannelMessageRequestSchema = z
  .object({
    senderId: z.string().trim().min(1),
    text: z.string().trim().min(1),
    accountId: z.string().trim().min(1).optional(),
    requestId: z.string().trim().min(1).optional(),
    sessionKey: z.string().trim().min(1).optional(),
    sessionId: z.string().trim().min(1).optional(),
    externalMessageId: z.string().trim().min(1).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    deliveryContext: z.record(z.string(), z.unknown()).optional(),
    attachments: z.array(inboundAttachmentSchema).max(10).default([]),
  })
  .strict();

const telegramIdSchema = z.union([z.number().int(), z.string().trim().min(1)]);

const telegramFileSchema = z
  .object({
    file_id: z.string().trim().min(1),
    file_name: z.string().trim().min(1).optional(),
    mime_type: z.string().trim().min(1).optional(),
    file_size: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const telegramPhotoSchema = z
  .object({
    file_id: z.string().trim().min(1),
    width: z.number().int().nonnegative(),
    height: z.number().int().nonnegative(),
    file_size: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const telegramMessageSchema = z
  .object({
    message_id: z.number().int(),
    date: z.number().int().nonnegative(),
    text: z.string().optional(),
    caption: z.string().optional(),
    from: z
      .object({
        id: telegramIdSchema,
        is_bot: z.boolean().optional(),
        username: z.string().optional(),
      })
      .passthrough()
      .optional(),
    chat: z
      .object({
        id: telegramIdSchema,
        type: z.string().trim().min(1),
      })
      .passthrough(),
    document: telegramFileSchema.optional(),
    audio: telegramFileSchema.optional(),
    voice: telegramFileSchema.optional(),
    photo: z.array(telegramPhotoSchema).optional(),
  })
  .passthrough();

const telegramUpdateSchema = z
  .object({
    update_id: z.number().int(),
    message: telegramMessageSchema.optional(),
    edited_message: telegramMessageSchema.optional(),
  })
  .passthrough();

type TelegramMessage = z.infer<typeof telegramMessageSchema>;
type TelegramFile = z.infer<typeof telegramFileSchema>;
type TelegramPhoto = z.infer<typeof telegramPhotoSchema>;
type TelegramAttachment = Awaited<ReturnType<typeof downloadTelegramFileAttachment>>;

function stringifyTelegramId(value: z.infer<typeof telegramIdSchema>): string {
  return String(value).trim();
}

function telegramOccurredAt(message: TelegramMessage): string {
  return new Date(message.date * 1000).toISOString();
}

function bestTelegramPhoto(photos: readonly TelegramPhoto[] | undefined): TelegramPhoto | null {
  if (!photos?.length) return null;
  return [...photos].sort((left, right) => {
    const leftPixels = left.width * left.height;
    const rightPixels = right.width * right.height;
    if (leftPixels !== rightPixels) return rightPixels - leftPixels;
    return (right.file_size ?? 0) - (left.file_size ?? 0);
  })[0] ?? null;
}

function telegramFileAttachmentSpec(input: {
  message: TelegramMessage;
  file: TelegramFile;
  fallbackFilename: string;
  fallbackMimeType: string;
}) {
  return {
    fileId: input.file.file_id,
    filename: input.file.file_name ?? input.fallbackFilename,
    mimeType: input.file.mime_type ?? input.fallbackMimeType,
    description: `Telegram message ${input.message.message_id}`,
    ...(input.file.file_size === undefined ? {} : { byteSize: input.file.file_size }),
  };
}

async function telegramAttachments(message: TelegramMessage) {
  const attachments: TelegramAttachment[] = [];
  if (message.document) {
    attachments.push(
      await downloadTelegramFileAttachment(
        telegramFileAttachmentSpec({
          message,
          file: message.document,
          fallbackFilename: `telegram-document-${message.message_id}`,
          fallbackMimeType: "application/octet-stream",
        }),
      ),
    );
  }
  if (message.audio) {
    attachments.push(
      await downloadTelegramFileAttachment(
        telegramFileAttachmentSpec({
          message,
          file: message.audio,
          fallbackFilename: `telegram-audio-${message.message_id}.mp3`,
          fallbackMimeType: "audio/mpeg",
        }),
      ),
    );
  }
  if (message.voice) {
    attachments.push(
      await downloadTelegramFileAttachment(
        telegramFileAttachmentSpec({
          message,
          file: message.voice,
          fallbackFilename: `telegram-voice-${message.message_id}.ogg`,
          fallbackMimeType: "audio/ogg",
        }),
      ),
    );
  }
  const photo = bestTelegramPhoto(message.photo);
  if (photo) {
    attachments.push(
      await downloadTelegramFileAttachment({
        fileId: photo.file_id,
        filename: `telegram-photo-${message.message_id}.jpg`,
        mimeType: "image/jpeg",
        description: `Telegram message ${message.message_id}`,
        ...(photo.file_size === undefined ? {} : { byteSize: photo.file_size }),
      }),
    );
  }
  return attachments;
}

function requireTelegramWebhookSecret(actual: string | null | undefined): void {
  const expected = backendApiEnv().telegramWebhookSecret;
  if (!expected) {
    throw new DomainError(
      domainCodes.SERVICE_UNAVAILABLE,
      "TELEGRAM_WEBHOOK_SECRET is required before Telegram webhook ingress can run.",
    );
  }
  const cleanActual = actual?.trim();
  if (!cleanActual || !constantTimeStringEqual(cleanActual, expected)) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "Invalid Telegram webhook secret.");
  }
}

function requireTelegramPrivateUserMessage(updateId: number, message: TelegramMessage | undefined) {
  if (!message) {
    return null;
  }
  if (!message.from || message.from.is_bot) {
    return null;
  }
  if (message.chat.type !== "private") {
    throw new DomainError(
      domainCodes.FORBIDDEN,
      "Telegram group chat ingress is not enabled for assistants.",
    );
  }
  return {
    updateId,
    message,
    senderId: stringifyTelegramId(message.from.id),
    chatId: stringifyTelegramId(message.chat.id),
  };
}

export function registerChannelRoutes(app: Hono) {
  app.post("/internal/ai-assistants/channels/:provider/messages", async (c) => {
    requireMachine(c);
    const params = parseRouteParams(c, channelRouteParamsSchema, "Channel route params");
    const body = await parseJsonBody(
      c,
      internalChannelMessageRequestSchema,
      "Channel message payload",
    );
    const result = await runBackendChannelTurn({
      db: controlDb(),
      provider: params.provider,
      senderId: body.senderId,
      inputText: body.text,
      ...(body.accountId ? { accountId: body.accountId } : {}),
      ...(body.requestId ? { requestId: body.requestId } : {}),
      ...(body.sessionKey ? { sessionKey: body.sessionKey } : {}),
      ...(body.sessionId ? { sessionId: body.sessionId } : {}),
      ...(body.externalMessageId ? { inboundExternalMessageId: body.externalMessageId } : {}),
      ...(body.occurredAt ? { inboundOccurredAt: body.occurredAt } : {}),
      ...(body.deliveryContext ? { deliveryContext: body.deliveryContext } : {}),
      ...(body.attachments.length ? { inboundAttachments: body.attachments } : {}),
    });
    return c.json({ ok: true, ...result });
  });

  app.post("/webhooks/telegram", async (c) => {
    requireTelegramWebhookSecret(c.req.header("x-telegram-bot-api-secret-token"));
    const update = await parseJsonBody(c, telegramUpdateSchema, "Telegram webhook payload");
    const inbound = requireTelegramPrivateUserMessage(
      update.update_id,
      update.message ?? update.edited_message,
    );
    if (!inbound) return c.json({ ok: true, ignored: true });

    const db = controlDb();
    const provider: BackendChannelProvider = "telegram";
    const resolvedChannel = await resolveBackendChannel(db, {
      provider,
      senderId: inbound.senderId,
    });
    const attachments = await telegramAttachments(inbound.message);
    const text = (inbound.message.text ?? inbound.message.caption ?? "").trim();
    const result = await runBackendChannelTurn({
      db,
      provider,
      senderId: inbound.senderId,
      inputText: text || "Please review the attached Telegram file or media.",
      requestId: `telegram:${update.update_id}`,
      inboundExternalMessageId: `telegram:${inbound.message.message_id}`,
      inboundOccurredAt: telegramOccurredAt(inbound.message),
      deliveryContext: {
        telegramUpdateId: update.update_id,
        telegramChatId: inbound.chatId,
        telegramMessageId: inbound.message.message_id,
        telegramUsername: inbound.message.from?.username ?? null,
      },
      ...(attachments.length ? { inboundAttachments: attachments } : {}),
      resolvedChannel,
    });
    return c.json({ ok: true, ...result });
  });
}
