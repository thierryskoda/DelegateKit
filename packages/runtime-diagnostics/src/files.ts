import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { diagnosticsLogDir } from "@ai-assistants/repo-layout";
import { parseDiagnosticRecord, type DiagnosticRecord } from "./types";

export function utcDateString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function diagnosticServiceSlug(service: string): string {
  const slug = service
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug)
    throw new Error("Diagnostic service must contain at least one alphanumeric character.");
  return slug;
}

export function diagnosticFilePath(runtimeRoot: string, service: string, d = new Date()): string {
  return path.join(
    diagnosticsLogDir(runtimeRoot),
    `${diagnosticServiceSlug(service)}-${utcDateString(d)}.jsonl`,
  );
}

export function hashDiagnosticTarget(value: unknown): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? null);
  return createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 16);
}

export type DiagnosticReadOptions = {
  service?: string;
  days?: number;
};

function dayCutoff(days?: number): number | null {
  if (days == null) return null;
  if (!Number.isInteger(days) || days < 1) throw new Error("--days must be a positive integer.");
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export function listDiagnosticFiles(
  runtimeRoot: string,
  options: DiagnosticReadOptions = {},
): string[] {
  const dir = diagnosticsLogDir(runtimeRoot);
  if (!existsSync(dir)) return [];
  const cutoff = dayCutoff(options.days);
  const servicePrefix = options.service ? `${diagnosticServiceSlug(options.service)}-` : null;
  return readdirSync(dir)
    .filter((file) => file.endsWith(".jsonl"))
    .filter((file) => !servicePrefix || file.startsWith(servicePrefix))
    .map((file) => path.join(dir, file))
    .filter((file) => {
      if (cutoff == null) return true;
      const match = path.basename(file).match(/(\d{4}-\d{2}-\d{2})\.jsonl$/);
      return Boolean(match && Date.parse(match[1]!) >= cutoff);
    })
    .sort();
}

export function readDiagnosticRecords(
  runtimeRoot: string,
  options: DiagnosticReadOptions = {},
): DiagnosticRecord[] {
  const out: DiagnosticRecord[] = [];
  for (const file of listDiagnosticFiles(runtimeRoot, options)) {
    const raw = readFileSync(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      out.push(parseDiagnosticRecord(JSON.parse(trimmed)));
    }
  }
  return out.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}
