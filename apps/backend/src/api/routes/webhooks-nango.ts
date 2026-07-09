import type { Hono } from "hono";
import { applyNangoWebhook } from "../../product/connected-accounts/apply-nango-webhook";
import { controlDb } from "../control-db";

export function registerNangoWebhookRoutes(app: Hono) {
  app.post("/webhooks/nango", async (c) => {
    const rawBody = await c.req.text();
    const result = await applyNangoWebhook({
      db: controlDb(),
      rawBody,
      headers: c.req.raw.headers,
    });
    return c.json(result, result.handled ? 200 : 202);
  });
}
