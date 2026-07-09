import type { Hono } from "hono";
import { applyMicrosoftSharepointWebhook } from "../../capabilities/microsoft-sharepoint/notification";
import { controlDb } from "../control-db";

export function registerMicrosoftSharepointWebhookRoutes(app: Hono) {
  app.post("/webhooks/microsoft-sharepoint", async (c) => {
    const validationToken = c.req.query("validationToken");
    if (validationToken) return c.text(validationToken, 200);

    const body = await c.req.json();
    const result = await applyMicrosoftSharepointWebhook({
      db: controlDb(),
      body,
      headers: c.req.raw.headers,
    });
    return c.json(result, 202);
  });
}
