import type { Hono } from "hono";
import { applyOutlookWebhook } from "../../capabilities/outlook-mail/notification";
import { controlDb } from "../control-db";

export function registerOutlookMailWebhookRoutes(app: Hono) {
  app.post("/webhooks/outlook-mail", async (c) => {
    const validationToken = c.req.query("validationToken");
    if (validationToken) return c.text(validationToken, 200);

    const body = await c.req.json();
    const result = await applyOutlookWebhook({
      db: controlDb(),
      body,
      headers: c.req.raw.headers,
    });
    return c.json(result, 202);
  });
}
