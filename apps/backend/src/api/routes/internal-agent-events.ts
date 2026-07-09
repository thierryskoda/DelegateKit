import { recordAgentRuntimeEventRequestSchema } from "@ai-assistants/control-plane-contracts";
import type { Hono } from "hono";
import { recordAgentRuntimeEvent } from "../../product/agent-events/runtime-agent-event-ledger";
import { parseJsonBody } from "../../shared/http-validation";
import { controlDb } from "../control-db";
import { requireMachine } from "../http-auth";

export function registerInternalAgentEventRoutes(app: Hono) {
  app.post("/internal/ai-assistants/agent-events/record", async (c) => {
    requireMachine(c);
    const body = await parseJsonBody(
      c,
      recordAgentRuntimeEventRequestSchema,
      "Record agent runtime event payload",
    );
    return c.json(await recordAgentRuntimeEvent(controlDb(), body));
  });
}
