#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runJsonJudge } from "@ai-assistants/llm-judge";
import { profileRuntimeDir, repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { z } from "zod";
import {
  instructionsPathForJudge,
  metaPromptAlignmentPath,
  type RegisteredJudgePromptId,
  targetJudgePurpose,
} from "../../judges/registry";
import { parseCli } from "@ai-assistants/workspace-shared";
import { parseJudgeId, parseProfile } from "../cli";

const PROMPT_VERSION = 2;
const SCHEMA_VERSION = 1;
const JUDGE_TIMEOUT_MS = 240_000;

type Args = {
  profile: RuntimeProfile;
  judge: RegisteredJudgePromptId;
  help: boolean;
};

const judgePromptHealthFindingSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    topic: z.string().trim().min(1),
    explanation: z.string().trim().min(1),
    recommendation: z.string().trim().min(1),
    agents_md_lines: z.string().trim().min(1).nullable(),
    instruction_excerpt: z.string().trim().min(1).nullable(),
  })
  .strict();

const judgePromptHealthResultSchema = z
  .object({
    is_aligned: z.boolean(),
    summary: z.string().trim().min(1),
    findings: z.array(judgePromptHealthFindingSchema),
  })
  .strict();

type JudgePromptHealthResult = z.infer<typeof judgePromptHealthResultSchema>;

const judgePromptHealthCliSchema = z
  .object({
    help: z.boolean().optional(),
    profile: z.string().optional(),
    judge: z.string().optional(),
  })
  .transform((v) => ({
    help: v.help ?? false,
    profile: parseProfile(v.profile ?? process.env.AI_ASSISTANTS_PROFILE),
    judge: parseJudgeId(v.judge),
  }));

function parseArgs(argv: readonly string[]): Args {
  return parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      judge: { type: "string" },
    },
    schema: judgePromptHealthCliSchema,
  });
}

function usage(): string {
  return [
    "Usage: npm run guard -- semantic prompt-health [--profile dev] [--judge plugin-boundary-overlap]",
    "",
    "Advisory meta-judge: compares a target judge instruction file to repo-root AGENTS.md for drift and misalignment.",
    "LLMs can be wrong; use findings as a signal, not ground truth.",
    "Exit code 1 when is_aligned is false or any finding has severity error.",
  ].join("\n");
}

function lineNumbered(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line, index) => `${String(index + 1).padStart(4, " ")} | ${line}`)
    .join("\n");
}

function formatFailure(result: JudgePromptHealthResult): string {
  return result.findings
    .filter((finding) => finding.severity === "error")
    .map((finding) =>
      [
        `- [${finding.topic}]`,
        `  ${finding.explanation}`,
        `  Recommendation: ${finding.recommendation}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export async function runPromptHealthJudgeCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const root = repoRoot(import.meta.url);
  const instructionsPath = instructionsPathForJudge(args.judge);
  const metaPath = metaPromptAlignmentPath();

  const [instructionsText, metaInstructions, agentsMd] = await Promise.all([
    readFile(instructionsPath, "utf8"),
    readFile(metaPath, "utf8"),
    readFile(path.join(root, "AGENTS.md"), "utf8"),
  ]);

  const judgeEvidence = {
    targetJudgeId: args.judge,
    targetJudgePurpose: targetJudgePurpose(args.judge),
    instructionsPath: path.relative(root, instructionsPath),
    instructionsText: instructionsText.trim(),
    agentsMd: {
      path: "AGENTS.md",
      lineNumbered: lineNumbered(agentsMd.trim()),
    },
    judgmentScope: [
      "Compare target judge instructions to AGENTS.md maintainer contract only.",
      "Do not evaluate plugin manifests or live tool contracts here.",
    ],
  };

  const cacheDir = path.join(
    profileRuntimeDir(args.profile),
    "cache",
    "llm-judges",
    "judge-prompt-health",
    args.judge,
  );

  console.error(
    `Running judge prompt health meta-judge (target=${args.judge}, profile=${args.profile}, cache ${cacheDir ? "enabled" : "disabled"}).`,
  );

  const startedAt = Date.now();
  const judge = await runJsonJudge({
    id: `judge-prompt-health:${args.judge}`,
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    schema: judgePromptHealthResultSchema,
    instructions: metaInstructions.trim(),
    evidence: judgeEvidence,
    repoRoot: root,
    cacheDir,
    timeoutMs: JUDGE_TIMEOUT_MS,
    codex: {
      ignoreUserConfig: true,
      ignoreRules: true,
    },
  });

  const errorCount = judge.result.findings.filter((finding) => finding.severity === "error").length;
  const warningCount = judge.result.findings.filter(
    (finding) => finding.severity === "warning",
  ).length;
  const alignedOk = judge.result.is_aligned && errorCount === 0;

  console.error(
    `Judge prompt health: ${alignedOk ? "aligned" : "not aligned"} (${judge.cacheStatus}, errors=${errorCount}, warnings=${warningCount})`,
  );

  const output = {
    schema_version: SCHEMA_VERSION,
    prompt_version: PROMPT_VERSION,
    ok: alignedOk,
    judged_at: new Date().toISOString(),
    profile: args.profile,
    target_judge: args.judge,
    cache: cacheDir ? { enabled: true, dir: cacheDir } : { enabled: false, dir: null },
    duration_ms: Date.now() - startedAt,
    cache_status: judge.cacheStatus,
    cache_key: judge.cacheKey,
    judge_run_ref: judge.runRef,
    codex_thread_id: judge.codexThreadId,
    result: judge.result,
  };
  console.log(JSON.stringify(output, null, 2));

  if (!alignedOk) {
    console.error(`Judge prompt health failed:\n\n${formatFailure(judge.result)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPromptHealthJudgeCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
