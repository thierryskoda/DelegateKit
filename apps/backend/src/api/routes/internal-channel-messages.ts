import { recordChannelMessageRequestSchema } from "@ai-assistants/control-plane-contracts";
import type { Hono } from "hono";
import { z } from "zod";
import {
  listProfileChannelMessages,
  recordProfileChannelMessage,
} from "../../product/channel-messages/channel-message-ledger";
import { parseJsonBody, parseQuery, parseRouteParams } from "../../shared/http-validation";
import { controlDb } from "../control-db";
import { requireMachine } from "../http-auth";

const listRouteParamsSchema = z
  .object({
    profileId: z.string().trim().min(1),
  })
  .strict();

const listQuerySchema = z
  .object({
    since: z.string().datetime({ offset: true }),
    until: z.string().datetime({ offset: true }),
    limit: z.coerce.number().int().positive().max(500).default(100),
    conversationId: z.string().trim().min(1).optional(),
  })
  .strict();

export function registerInternalChannelMessageRoutes(app: Hono) {
  app.post("/internal/ai-assistants/channel-messages/record", async (c) => {
    requireMachine(c);
    const body = await parseJsonBody(
      c,
      recordChannelMessageRequestSchema,
      "Record channel message payload",
    );
    return c.json(await recordProfileChannelMessage(controlDb(), body));
  });

  app.get("/internal/ai-assistants/profiles/:profileId/channel-messages", async (c) => {
    requireMachine(c);
    const params = parseRouteParams(c, listRouteParamsSchema);
    const query = parseQuery(c, listQuerySchema, "Channel message timeline query");
    return c.json(
      await listProfileChannelMessages(controlDb(), {
        profileId: params.profileId,
        since: query.since,
        until: query.until,
        limit: query.limit,
        conversationId: query.conversationId,
      }),
    );
  });
}
