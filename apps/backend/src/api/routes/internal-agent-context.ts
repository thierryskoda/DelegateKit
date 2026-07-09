import type { Hono } from "hono";
import { requireAssistantProfile } from "../../auth/assistant-resolution";
import { parseRouteParams } from "../../shared/http-validation";
import { requireMachine } from "../http-auth";
import { controlDb } from "../control-db";
import { agentParamsSchema } from "@ai-assistants/connect-api-contracts";

export function registerInternalAgentContextRoutes(app: Hono) {
  app.get("/internal/ai-assistants/agents/:agentId/context", async (c) => {
    requireMachine(c);
    const { agentId } = parseRouteParams(
      c,
      agentParamsSchema,
      "AI assistants agent context route params",
    );
    const { assistant, profile } = await requireAssistantProfile(controlDb(), agentId);
    return c.json({
      ok: true,
      overview: await import("../../product/profiles/context-builder").then((m) =>
        m.profileOverviewForAssistant(controlDb(), profile.id, assistant.assistant_id),
      ),
    });
  });
}
