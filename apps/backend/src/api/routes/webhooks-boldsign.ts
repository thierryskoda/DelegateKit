import type { Hono } from "hono";
import { applyBoldSignWebhook } from "../../capabilities/boldsign/webhook-events";
import { controlDb } from "../control-db";

export function registerBoldSignWebhookRoutes(app: Hono) {
  app.post("/webhooks/boldsign", async (c) => {
    const rawBody = await c.req.text();
    const result = await applyBoldSignWebhook({
      db: controlDb(),
      rawBody,
      headers: c.req.raw.headers,
    });
    return c.json(result, "verification" in result ? 200 : 202);
  });
}
