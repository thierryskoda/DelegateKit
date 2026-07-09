import type { Hono } from "hono";
import { applyGoogleCalendarWebhook } from "../../capabilities/google-calendar/notification";
import { controlDb } from "../control-db";

export function registerGoogleCalendarWebhookRoutes(app: Hono) {
  app.post("/webhooks/google-calendar", async (c) => {
    const result = await applyGoogleCalendarWebhook({
      db: controlDb(),
      headers: c.req.raw.headers,
    });
    return c.json(result, 202);
  });
}
