import { z } from "zod";

export const nangoForwardedGmailWebhookSchema = z
  .object({
    type: z.literal("forward"),
    from: z.literal("google-mail"),
    providerConfigKey: z.string().trim().min(1),
    connectionId: z.string().trim().min(1),
    payload: z
      .object({
        message: z
          .object({
            data: z.string().trim().min(1),
            messageId: z.string().trim().min(1),
            publishTime: z.string().trim().min(1).optional(),
          })
          .passthrough(),
        subscription: z.string().trim().min(1).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const gmailNotificationDataSchema = z
  .object({
    emailAddress: z.string().trim().min(1),
    historyId: z.union([z.string().trim().min(1), z.number().int().nonnegative()]),
  })
  .passthrough();

export const gmailWatchResponseSchema = z
  .object({
    historyId: z.union([z.string().trim().min(1), z.number().int().nonnegative()]),
    expiration: z.union([z.string().trim().min(1), z.number().int().nonnegative()]),
  })
  .passthrough();

export const gmailHistoryResponseSchema = z
  .object({
    history: z
      .array(
        z
          .object({
            messagesAdded: z
              .array(
                z
                  .object({
                    message: z
                      .object({
                        id: z.string().trim().min(1),
                        threadId: z.string().trim().min(1).optional(),
                      })
                      .passthrough(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
    historyId: z.union([z.string().trim().min(1), z.number().int().nonnegative()]).optional(),
    nextPageToken: z.string().trim().min(1).optional(),
  })
  .passthrough();
