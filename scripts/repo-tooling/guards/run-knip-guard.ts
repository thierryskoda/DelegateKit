#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import path from "node:path";
import { repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { z } from "zod";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { validateKnipJson } from "./deterministic/knip-json";
import { runKnipConfigJudge } from "./semantic/knip-config";
import { parseProfile } from "./cli";
import { pathToFileURL } from "node:url";

const cliSchema = z
  .object({
    help: z.boolean().optional(),
    profile: z.string().optional(),
    "no-judge": z.boolean().optional(),
  })
  .transform((v) => ({
    help: v.help ?? false,
    profile: parseProfile(v.profile ?? process.env.AI_ASSISTANTS_PROFILE),
    noJudge: v["no-judge"] === true,
  }));

function parseArgs(argv: readonly string[]): {
  profile: RuntimeProfile;
  help: boolean;
  noJudge: boolean;
} {
  return parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      "no-judge": { type: "boolean" },
    },
    schema: cliSchema,
  });
}

function usage(): string {
  return [
    "Usage: npm run guard -- knip -- [--profile dev]",
    "",
    "1) Deterministic validation: every knip.json entry path exists; globs match ≥1 file;",
    "   project/ignore globs behave as expected.",
    "2) Optional LLM judge: coherence check for entry/project/ignore.",
    "   Skipped with --no-judge (deterministic checks always run).",
    "",
    "Runs npm run smoke:codex-agent after deterministic checks (validates Codex before optional judge).",
    "Called from npm start after guard source. Exit code 1 if deterministic checks fail",
    "or if the judge returns ok=false / error findings.",
    "",
  ].join("\n");
}

function judgePassed(result: { ok: boolean; findings: readonly { severity: string }[] }): boolean {
  const errors = result.findings.filter((f) => f.severity === "error").length;
  return result.ok && errors === 0;
}

export async function runKnipGuardCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const root = repoRoot(import.meta.url);
  const deterministic = validateKnipJson(root);

  const detPayload = {
    phase: "deterministic" as const,
    schema_version: 1,
    ok: deterministic.ok,
    knip_json: path.relative(root, deterministic.knipJsonPath),
    errors: deterministic.errors,
    warnings: deterministic.warnings,
    entry: deterministic.entry,
    project: deterministic.project,
    ignore: deterministic.ignore,
  };

  console.log(JSON.stringify(detPayload, null, 2));

  if (!deterministic.ok) {
    console.error(
      `knip.json deterministic validation failed:\n${deterministic.errors.map((e) => `  - ${e}`).join("\n")}`,
    );
    process.exitCode = 1;
    return;
  }

  if (deterministic.warnings.length > 0) {
    console.error(
      `knip.json deterministic warnings:\n${deterministic.warnings.map((w) => `  - ${w}`).join("\n")}`,
    );
  }

  console.error("Running codex-agent smoke (npm run smoke:codex-agent)...");
  execFileSync("npm", ["run", "--silent", "smoke:codex-agent"], { cwd: root, stdio: "inherit" });

  if (args.noJudge) {
    console.error("Skipping Knip LLM judge (--no-judge).");
    return;
  }

  console.error(`Running Knip LLM judge (profile=${args.profile})...`);
  const { result, cacheStatus, cacheKey, durationMs } = await runKnipConfigJudge({
    root,
    profile: args.profile,
    deterministic,
  });

  const passed = judgePassed(result);
  const warningCount = result.findings.filter((f) => f.severity === "warning").length;
  const errorCount = result.findings.filter((f) => f.severity === "error").length;

  console.error(
    `Knip LLM judge: ${passed ? "ok" : "failed"} (${cacheStatus}, errors=${errorCount}, warnings=${warningCount}, ${durationMs}ms)`,
  );

  const judgePayload = {
    phase: "llm_judge" as const,
    schema_version: 1,
    prompt_version: 1,
    ok: passed,
    judged_at: new Date().toISOString(),
    profile: args.profile,
    duration_ms: durationMs,
    cache_key: cacheKey ?? null,
    cache_status: cacheStatus,
    result,
  };
  console.log(JSON.stringify(judgePayload, null, 2));

  if (!passed) {
    const detail = result.findings
      .filter((f) => f.severity === "error")
      .map((f) => `- [${f.topic}] ${f.explanation}`)
      .join("\n");
    console.error(`Knip LLM judge failed:\n${detail}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runKnipGuardCli());
}
