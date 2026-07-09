import { z } from "zod";

const toolInvocationContextSchema = z
  .object({
    agentId: z.string().trim().min(1),
    toolCallId: z.string().trim().min(1),
    sessionKey: z.string().trim().min(1),
    sessionId: z.string().trim().min(1).optional(),
    requestId: z.string().trim().min(1),
  })
  .strict();

const trustedChannelOriginSchema = z
  .object({
    messageChannel: z.string().trim().min(1),
    requesterSenderId: z.string().trim().min(1),
    agentAccountId: z.string().trim().min(1).optional(),
    senderIsOwner: z.boolean().optional(),
    deliveryContext: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ToolInvocationContext = z.infer<typeof toolInvocationContextSchema>;
export type TrustedChannelOrigin = z.infer<typeof trustedChannelOriginSchema>;

export {
  trustedChannelOriginSchema,
};
