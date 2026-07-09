import { z } from "zod";

export const graphSubscriptionResponseSchema = z
  .object({
    id: z.string().trim().min(1),
    resource: z.string().trim().min(1).optional(),
    changeType: z.string().trim().min(1).optional(),
    clientState: z.string().trim().min(1).optional(),
    expirationDateTime: z.string().trim().min(1),
  })
  .passthrough();
