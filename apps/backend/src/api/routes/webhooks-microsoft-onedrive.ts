import type { Hono } from "hono";
import { applyMicrosoftOnedriveWebhook } from "../../capabilities/microsoft-onedrive/notification";
import { controlDb } from "../control-db";

export function registerMicrosoftOnedriveWebhookRoutes(app: Hono) {
  app.post("/webhooks/microsoft-onedrive", async (c) => {
    const validationToken = c.req.query("validationToken");
    if (validationToken) return c.text(validationToken, 200);

    const body = await c.req.json();
    const result = await applyMicrosoftOnedriveWebhook({
      db: controlDb(),
      body,
      headers: c.req.raw.headers,
    });
    return c.json(result, 202);
  });
}
