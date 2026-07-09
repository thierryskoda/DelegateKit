import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import pino, { type Logger as PinoLogger } from "pino";
import { diagnosticsLogDir } from "@ai-assistants/repo-layout";
import { parseDiagnosticsEnv } from "@ai-assistants/workspace-shared/env";
import { diagnosticFilePath, diagnosticServiceSlug } from "./files";
import { sanitizeDiagnosticObject, type SanitizeDiagnosticOptions } from "./redaction";
import { resolveDiagnosticRuntimeRoot, type DiagnosticRuntimeOptions } from "./runtime-root";
import {
  assertDiagnosticRecord,
  DIAGNOSTIC_SCHEMA_VERSION,
  type DiagnosticContext,
  type DiagnosticFields,
  type DiagnosticLevel,
  isDiagnosticLevel,
} from "./types";

export type DiagnosticLoggerOptions = DiagnosticRuntimeOptions & {
  service: string;
  level?: DiagnosticLevel;
};

export type DiagnosticLogger = {
  service: string;
  runtimeRoot: string;
  child(fields: DiagnosticContext | Record<string, unknown>): DiagnosticLogger;
  pino: PinoLogger;
};

export type EmitDiagnosticOptions = {
  sanitize?: SanitizeDiagnosticOptions;
};

const diagnosticContext = new AsyncLocalStorage<Record<string, unknown>>();

class DailyDiagnosticDestination {
  constructor(
    private readonly runtimeRoot: string,
    private readonly service: string,
  ) {}

  write(line: string): void {
    const filePath = diagnosticFilePath(this.runtimeRoot, this.service);
    mkdirSync(path.dirname(filePath), { recursive: true });
    appendFileSync(filePath, line, "utf8");
  }
}

/** NDJSON to rotating diagnostic files and stdout. Pretty-print with `pino-pretty --messageKey message` when tailing files only. */
function createPinoLogger(options: DiagnosticLoggerOptions, runtimeRoot: string): PinoLogger {
  const service = diagnosticServiceSlug(options.service);
  mkdirSync(diagnosticsLogDir(runtimeRoot), { recursive: true });
  const env = options.env ?? process.env;
  const diagnosticsEnv = parseDiagnosticsEnv(env);
  const fileDest = new DailyDiagnosticDestination(runtimeRoot, service);
  const destination = pino.multistream([
    { level: "trace", stream: fileDest },
    { level: "trace", stream: process.stdout },
  ]);

  return pino(
    {
      level: options.level ?? diagnosticsEnv.logLevel,
      base: { schema_version: DIAGNOSTIC_SCHEMA_VERSION, service },
      messageKey: "message",
      timestamp: false,
      formatters: {
        level(label) {
          if (!isDiagnosticLevel(label))
            throw new Error(`Unsupported diagnostic log level ${JSON.stringify(label)}.`);
          return { level: label };
        },
      },
    },
    destination,
  );
}

function wrapPinoLogger(
  service: string,
  runtimeRoot: string,
  logger: PinoLogger,
): DiagnosticLogger {
  return {
    service,
    runtimeRoot,
    pino: logger,
    child(fields) {
      return wrapPinoLogger(service, runtimeRoot, logger.child(sanitizeDiagnosticObject(fields)));
    },
  };
}

export function createDiagnosticLogger(options: DiagnosticLoggerOptions): DiagnosticLogger {
  const runtimeRoot = resolveDiagnosticRuntimeRoot(options);
  const service = diagnosticServiceSlug(options.service);
  return wrapPinoLogger(
    service,
    runtimeRoot,
    createPinoLogger({ ...options, service }, runtimeRoot),
  );
}

export function withDiagnosticContext<T>(
  fields: DiagnosticContext | Record<string, unknown>,
  fn: () => T,
): T {
  const current = diagnosticContext.getStore() ?? {};
  const next = sanitizeDiagnosticObject({ ...current, ...fields });
  return diagnosticContext.run(next, fn);
}

export function getDiagnosticContext(): DiagnosticContext {
  return { ...(diagnosticContext.getStore() ?? {}) } as DiagnosticContext;
}

function levelFor(fields: DiagnosticFields): DiagnosticLevel {
  if (fields.level) return fields.level;
  if (fields.err) return "error";
  if (fields.ok === false) return "warn";
  return "info";
}

export function emitDiagnostic(
  logger: DiagnosticLogger,
  kind: string,
  fields: DiagnosticFields = {},
  message?: string,
  options: EmitDiagnosticOptions = {},
): void {
  const level = levelFor(fields);
  const ts =
    typeof fields.ts === "string" && fields.ts.trim() ? fields.ts : new Date().toISOString();
  const sanitized = sanitizeDiagnosticObject(
    {
      ...getDiagnosticContext(),
      ...fields,
      ts,
      kind,
      ...(message ? { message } : {}),
    },
    options.sanitize,
  );
  const record = {
    schema_version: DIAGNOSTIC_SCHEMA_VERSION,
    level,
    service: logger.service,
    ...sanitized,
  };
  assertDiagnosticRecord(record);
  const payload = { ...sanitized };
  delete (payload as { level?: unknown }).level;
  logger.pino[level](payload, message);
}
