import type { Hono } from "hono";
import { publicBackendToolContracts } from "../../runtime/agent-tools/registry";
import { authenticatedUser } from "../http-auth";

export function registerHealthAndPublicContractRoutes(app: Hono) {
  app.get("/health", (c) => c.json({ ok: true, service: "ai-assistants-backend" }));

  app.get("/me", async (c) => {
    const user = await authenticatedUser(c);
    return c.json({ ok: true, user: { id: user.id, email: user.email ?? null } });
  });

  app.get("/tool-contracts", (c) => c.json({ ok: true, tools: publicBackendToolContracts() }));
}
