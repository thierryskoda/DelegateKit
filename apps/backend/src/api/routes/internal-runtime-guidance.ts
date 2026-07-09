import type { Hono } from "hono";
import { z } from "zod";
import { requireAssistantProfile } from "../../auth/assistant-resolution";
import {
  listActiveProfileGuidanceIndex,
  loadActiveProfileGuidanceMarkdown,
} from "../../product/profile-guidance/profile-guidance";
import { parseJsonBody, parseRouteParams } from "../../shared/http-validation";
import { controlDb } from "../control-db";
import { requireMachine } from "../http-auth";
import { agentParamsSchema } from "@ai-assistants/connect-api-contracts";

const selectedProfileGuidanceBodySchema = z
  .object({
    profileGuidanceDbIds: z.array(z.string().uuid()).max(20),
  })
  .strict();

export function registerInternalRuntimeGuidanceRoutes(app: Hono) {
  app.get("/internal/ai-assistants/agents/:agentId/runtime-guidance/profile-index", async (c) => {
    requireMachine(c);
    const { agentId } = parseRouteParams(
      c,
      agentParamsSchema,
      "AI assistants runtime guidance route params",
    );
    const db = controlDb();
    const { profile } = await requireAssistantProfile(db, agentId);
    const guidance = await listActiveProfileGuidanceIndex(db, profile.id);
    return c.json({
      ok: true,
      profileId: profile.id,
      guidance,
    });
  });

  app.post(
    "/internal/ai-assistants/agents/:agentId/runtime-guidance/profile-markdown",
    async (c) => {
      requireMachine(c);
      const { agentId } = parseRouteParams(
        c,
        agentParamsSchema,
        "AI assistants runtime guidance route params",
      );
      const body = await parseJsonBody(
        c,
        selectedProfileGuidanceBodySchema,
        "AI assistants runtime guidance selected body",
      );
      const db = controlDb();
      const { profile } = await requireAssistantProfile(db, agentId);
      const guidance = await loadActiveProfileGuidanceMarkdown(db, {
        profileId: profile.id,
        guidanceIds: body.profileGuidanceDbIds,
      });
      return c.json({
        ok: true,
        profileId: profile.id,
        guidance,
      });
    },
  );
}
