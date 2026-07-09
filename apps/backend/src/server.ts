import { serve } from "@hono/node-server";
import { initBackendApiEnv } from "./bootstrap-env";
import { app } from "./api/app";
import { backendDiagnosticLogger, configureBackendDiagnosticService } from "./shared/diagnostics";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";

const env = initBackendApiEnv();

const port = env.backendPort;
configureBackendDiagnosticService("backend-api");

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  emitDiagnostic(backendDiagnosticLogger(), "backend.started", {
    attrs: {
      host: "0.0.0.0",
      port: info.port,
    },
  });
  console.log(`AI assistants backend listening on http://0.0.0.0:${info.port}`);
});

setInterval(() => {
  // Keep detached local server processes alive under launch/nohup wrappers.
}, 60_000);
