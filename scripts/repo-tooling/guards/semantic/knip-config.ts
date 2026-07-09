import { readFile } from "node:fs/promises";
import path from "node:path";
import { CODEX_AGENT_DEFAULT_TIMEOUT_MS } from "@ai-assistants/codex-agent";
import { runJsonJudge } from "@ai-assistants/llm-judge";
import { profileRuntimeDir, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { z } from "zod";
import { knipConfigInstructionsPath } from "../../judges/registry";
import type { KnipJsonDeterministicResult } from "../deterministic/knip-json";

const PROMPT_VERSION = 4;
const SCHEMA_VERSION = 2;
const KNIP_CONFIG_JUDGE_TIMEOUT_MS = CODEX_AGENT_DEFAULT_TIMEOUT_MS;

/** Accepts structured findings or a legacy `{ message }` shape from misaligned model output. */
const knipConfigFindingSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    topic: z.string().trim().min(1).optional(),
    explanation: z.string().trim().min(1).optional(),
    recommendation: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1).optional(),
  })
  .transform((v) => {
    const explanation = v.explanation ?? v.message ?? "";
    const topic = v.topic?.trim() || explanation.slice(0, 120).trim() || "Knip configuration";
    const recommendation =
      v.recommendation?.trim() ||
      "Review knip.json entry/project/ignore patterns against the deterministic guard output and repo layout.";
    return {
      severity: v.severity,
      topic,
      explanation: explanation || topic,
      recommendation,
    };
  })
  .pipe(
    z.object({
      severity: z.enum(["error", "warning"]),
      topic: z.string().trim().min(1),
      explanation: z.string().trim().min(1),
      recommendation: z.string().trim().min(1),
    }),
  );

const knipConfigJudgeResultSchema = z
  .object({
    ok: z.boolean(),
    summary: z.string().trim().min(1),
    findings: z.array(knipConfigFindingSchema),
  })
  .strict();

export type KnipConfigJudgeResult = z.infer<typeof knipConfigJudgeResultSchema>;

export async function runKnipConfigJudge(input: {
  root: string;
  profile: RuntimeProfile;
  deterministic: KnipJsonDeterministicResult;
}): Promise<{
  result: KnipConfigJudgeResult;
  cacheStatus: string;
  cacheKey: string | undefined;
  durationMs: number;
}> {
  const instructionsPath = knipConfigInstructionsPath();
  const [instructionsText, knipRaw] = await Promise.all([
    readFile(instructionsPath, "utf8"),
    readFile(input.deterministic.knipJsonPath, "utf8"),
  ]);

  const evidence = {
    knipJsonPath: path.relative(input.root, input.deterministic.knipJsonPath),
    knipJsonText: knipRaw.trim(),
    deterministicValidation: input.deterministic,
    instructionsPath: path.relative(input.root, instructionsPath),
  };

  const cacheDir = path.join(
    profileRuntimeDir(input.profile),
    "cache",
    "llm-judges",
    "knip-config",
  );

  const startedAt = Date.now();
  const judge = await runJsonJudge({
    id: "knip-config",
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    schema: knipConfigJudgeResultSchema,
    instructions: instructionsText.trim(),
    evidence,
    repoRoot: input.root,
    cacheDir,
    timeoutMs: KNIP_CONFIG_JUDGE_TIMEOUT_MS,
  });

  return {
    result: judge.result,
    cacheStatus: judge.cacheStatus,
    cacheKey: judge.cacheKey,
    durationMs: Date.now() - startedAt,
  };
}
