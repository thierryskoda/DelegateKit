import type { Hono } from "hono";
import { applyMondayWebhook } from "../../capabilities/monday/webhook-events";
import { controlDb } from "../control-db";

export function registerMondayWebhookRoutes(app: Hono) {
  app.post("/webhooks/monday", async (c) => {
    const body = await c.req.json();
    const result = await applyMondayWebhook({
      db: controlDb(),
      body,
      authorizationHeader: c.req.header("authorization") ?? null,
      headers: c.req.raw.headers,
    });
    if ("challenge" in result) return c.json({ challenge: result.challenge }, 200);
    return c.json(result, 202);
  });
}
