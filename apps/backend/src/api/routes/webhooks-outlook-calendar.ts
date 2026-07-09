import type { Hono } from "hono";
import { applyOutlookCalendarWebhook } from "../../capabilities/outlook-calendar/notification";
import { controlDb } from "../control-db";

export function registerOutlookCalendarWebhookRoutes(app: Hono) {
  app.post("/webhooks/outlook-calendar", async (c) => {
    const validationToken = c.req.query("validationToken");
    if (validationToken) return c.text(validationToken, 200);

    const body = await c.req.json();
    const result = await applyOutlookCalendarWebhook({
      db: controlDb(),
      body,
      headers: c.req.raw.headers,
    });
    return c.json(result, 202);
  });
}
