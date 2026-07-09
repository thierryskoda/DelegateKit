import type { Hono } from "hono";
import { applyGoogleDriveWebhook } from "../../capabilities/google-drive/notification";
import { controlDb } from "../control-db";

export function registerGoogleDriveWebhookRoutes(app: Hono) {
  app.post("/webhooks/google-drive", async (c) => {
    const result = await applyGoogleDriveWebhook({
      db: controlDb(),
      headers: c.req.raw.headers,
      rawBody: await c.req.text(),
    });
    return c.json(result, 202);
  });
}
