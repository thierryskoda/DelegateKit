import { createDiagnosticLogger, type DiagnosticLogger } from "@ai-assistants/runtime-diagnostics";

export type BackendDiagnosticService = "backend-api" | "backend-worker";

let configuredService: BackendDiagnosticService = "backend-api";
let cachedLogger: DiagnosticLogger | null = null;

export function configureBackendDiagnosticService(service: BackendDiagnosticService): void {
  if (configuredService === service) return;
  configuredService = service;
  cachedLogger = null;
}

export function backendDiagnosticLogger(): DiagnosticLogger {
  cachedLogger ??= createDiagnosticLogger({ service: configuredService });
  return cachedLogger;
}
