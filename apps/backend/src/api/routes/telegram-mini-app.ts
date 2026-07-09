import type { Hono } from "hono";
import {
  telegramMiniAppSessionRequestSchema,
  telegramMiniAppSessionResponseSchema,
} from "@ai-assistants/connect-api-contracts";
import { createTelegramMiniAppSession } from "../../product/profiles/telegram-mini-app";
import { parseJsonBody } from "../../shared/http-validation";
import { controlDb } from "../control-db";

export function registerTelegramMiniAppRoutes(app: Hono) {
  app.post("/auth/telegram-mini-app/session", async (c) => {
    const body = await parseJsonBody(
      c,
      telegramMiniAppSessionRequestSchema,
      "Telegram Mini App session payload",
    );
    const session = await createTelegramMiniAppSession({
      db: controlDb(),
      initData: body.initData,
    });
    return c.json(telegramMiniAppSessionResponseSchema.parse({ ok: true, ...session }));
  });
}
