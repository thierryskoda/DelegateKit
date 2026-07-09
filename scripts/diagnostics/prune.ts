/**
 * Delete old daily JSONL diagnostic files under the selected runtime profile.
 */
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { repoRoot } from "@ai-assistants/repo-layout";
import { parseDiagnosticPruneArgv } from "./lib/diagnostics-cli";
import { resolveDiagnosticRuntimeContext } from "./lib/runtime-context";
import { pathToFileURL } from "node:url";

const EVENT_RE = /^[a-z0-9_.-]+-(\d{4})-(\d{2})-(\d{2})\.jsonl$/;

function cutoffMs(days: number): number {
  return Date.now() - days * 86400_000;
}

async function pruneDir(dir: string, ms: number): Promise<number> {
  if (!existsSync(dir)) return 0;
  let removed = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isFile() || !EVENT_RE.test(ent.name)) continue;
    const full = path.join(dir, ent.name);
    const st = await stat(full);
    if (st.mtimeMs < ms) {
      await rm(full, { force: true });
      removed += 1;
    }
  }
  return removed;
}

export async function runDiagnosticsPrune(argv = process.argv.slice(2)): Promise<void> {
  const root = repoRoot(import.meta.url);
  const { days, profile, runtimeRoot } = parseDiagnosticPruneArgv(argv);
  const runtime = resolveDiagnosticRuntimeContext(root, { profile, runtimeRoot });
  const ms = cutoffMs(days);
  const removed = await pruneDir(runtime.diagnosticsDir, ms);
  console.log(
    JSON.stringify(
      { ok: true, days, profile: profile ?? null, runtimeRoot: runtime.runtimeRoot, removed },
      null,
      2,
    ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runDiagnosticsPrune().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
