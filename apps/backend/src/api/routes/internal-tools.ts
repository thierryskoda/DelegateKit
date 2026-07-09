import { backendToolResultSchema } from "@ai-assistants/tool-contracts";
import { emitDiagnostic, withDiagnosticContext } from "@ai-assistants/runtime-diagnostics";
import type { Hono } from "hono";
import { parseJsonBody } from "../../shared/http-validation";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { executeBackendToolExecution } from "../../runtime/agent-tools/executor";
import {
  backendToolCallDiagnosticAttrs,
  backendToolDiagnosticContext,
  backendToolFailureDiagnosticAttrs,
  backendToolResultDiagnosticAttrs,
} from "../../runtime/agent-tools/executor/tool-diagnostics";
import { backendToolExecuteRequestSchema } from "../../runtime/agent-tools/request-schema";
import { requireMachine } from "../http-auth";
import { controlDb } from "../control-db";

export function registerInternalToolRoutes(app: Hono) {
  app.post("/internal/ai-assistants/tools/execute", async (c) => {
    requireMachine(c);
    const body = await parseJsonBody(c, backendToolExecuteRequestSchema, "Backend tool payload");
    return withDiagnosticContext(backendToolDiagnosticContext(body), async () => {
      const startedAt = Date.now();
      emitDiagnostic(
        backendDiagnosticLogger(),
        "tool.call",
        {
          attrs: backendToolCallDiagnosticAttrs(body),
        },
        undefined,
        { sanitize: { maxStringLength: null, maxDepth: null } },
      );
      try {
        const execution = await executeBackendToolExecution(controlDb(), body);
        return withDiagnosticContext(execution.diagnosticContext, () => {
          const result = backendToolResultSchema.parse(execution.result);
          const isSuccess = !("error" in result);
          emitDiagnostic(
            backendDiagnosticLogger(),
            "tool.result",
            {
              ok: isSuccess,
              level: isSuccess ? "info" : "warn",
              duration_ms: Date.now() - startedAt,
              attrs: backendToolResultDiagnosticAttrs({ toolName: body.toolName, result }),
            },
            undefined,
            { sanitize: { maxStringLength: null, maxDepth: null } },
          );
          return c.json(result);
        });
      } catch (error) {
        emitDiagnostic(backendDiagnosticLogger(), "tool.result", {
          ok: false,
          level: "error",
          duration_ms: Date.now() - startedAt,
          err: error,
          attrs: backendToolFailureDiagnosticAttrs(body),
        });
        throw error;
      }
    });
  });
}
