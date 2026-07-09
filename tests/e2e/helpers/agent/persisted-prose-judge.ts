import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runJsonJudge, type JsonJudgeResult } from "@ai-assistants/llm-judge";
import { z } from "zod";
import type { E2eRun } from "../run/e2e-run";

const PERSISTED_PROSE_JUDGE_ARTIFACT_SCHEMA_VERSION = 1;

const persistedProseJudgeSchema = z
  .object({
    is_correct: z.boolean(),
    reason: z.string(),
    evidence: z.array(z.string()),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();

type PersistedProseJudgeResult = z.infer<typeof persistedProseJudgeSchema> & {
  judgeArtifactPath: string;
};

function safeArtifactName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "persisted-prose";
}

function judgeResultsDir(run: E2eRun): string {
  return path.join(run.runtimeRoot, "judge-results");
}

function errorObject(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
      ...(error.cause ? { cause: String(error.cause) } : {}),
    };
  }
  return { message: String(error) };
}

function writePersistedProseJudgeArtifact(input: {
  run: E2eRun;
  id: string;
  marker: string;
  criteria: readonly string[];
  failIf: string;
  evidence: Record<string, unknown>;
  judged: JsonJudgeResult<z.infer<typeof persistedProseJudgeSchema>>;
}): string {
  const dir = judgeResultsDir(input.run);
  mkdirSync(dir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const artifactPath = path.join(dir, `${safeArtifactName(input.id)}.json`);
  const artifact = {
    schemaVersion: PERSISTED_PROSE_JUDGE_ARTIFACT_SCHEMA_VERSION,
    generatedAt,
    id: input.id,
    marker: input.marker,
    run: {
      id: input.run.id,
      runId: input.run.runId,
      runDir: input.run.runDir,
      runtimeRoot: input.run.runtimeRoot,
      agentId: input.run.agentId,
    },
    criteria: [...input.criteria],
    failIf: input.failIf,
    evidence: input.evidence,
    judge: {
      cacheKey: input.judged.cacheKey,
      cacheStatus: input.judged.cacheStatus,
      runRef: input.judged.runRef,
      codexThreadId: input.judged.codexThreadId,
      result: input.judged.result,
    },
  };
  writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
  appendFileSync(
    path.join(dir, "index.jsonl"),
    `${JSON.stringify({
      schemaVersion: PERSISTED_PROSE_JUDGE_ARTIFACT_SCHEMA_VERSION,
      generatedAt,
      id: input.id,
      marker: input.marker,
      runId: input.run.runId,
      agentId: input.run.agentId,
      artifactPath,
      cacheKey: input.judged.cacheKey,
      cacheStatus: input.judged.cacheStatus,
      judgeRunRef: input.judged.runRef,
      codexThreadId: input.judged.codexThreadId,
      isCorrect: input.judged.result.is_correct,
      errorCount: input.judged.result.errors.length,
      warningCount: input.judged.result.warnings.length,
      errors: input.judged.result.errors,
      warnings: input.judged.result.warnings,
      result: input.judged.result,
    })}\n`,
  );
  return artifactPath;
}

function writePersistedProseJudgeErrorArtifact(input: {
  run: E2eRun;
  id: string;
  marker: string;
  criteria: readonly string[];
  failIf: string;
  evidence: Record<string, unknown>;
  error: unknown;
}): string {
  const dir = judgeResultsDir(input.run);
  mkdirSync(dir, { recursive: true });
  const generatedAt = new Date().toISOString();
  const artifactPath = path.join(dir, `${safeArtifactName(input.id)}.error.json`);
  const error = errorObject(input.error);
  writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        schemaVersion: PERSISTED_PROSE_JUDGE_ARTIFACT_SCHEMA_VERSION,
        generatedAt,
        id: input.id,
        marker: input.marker,
        run: {
          id: input.run.id,
          runId: input.run.runId,
          runDir: input.run.runDir,
          runtimeRoot: input.run.runtimeRoot,
          agentId: input.run.agentId,
        },
        criteria: [...input.criteria],
        failIf: input.failIf,
        evidence: input.evidence,
        judgeError: error,
      },
      null,
      2,
    )}\n`,
  );
  appendFileSync(
    path.join(dir, "index.jsonl"),
    `${JSON.stringify({
      schemaVersion: PERSISTED_PROSE_JUDGE_ARTIFACT_SCHEMA_VERSION,
      generatedAt,
      id: input.id,
      marker: input.marker,
      runId: input.run.runId,
      agentId: input.run.agentId,
      artifactPath,
      isCorrect: null,
      errorCount: 1,
      warningCount: 0,
      errors: [typeof error.message === "string" ? error.message : "LLM judge failed."],
      warnings: [],
      judgeError: error,
    })}\n`,
  );
  return artifactPath;
}

export async function expectPersistedProseJudgePass(input: {
  id: string;
  run: E2eRun;
  marker: string;
  purpose: string;
  sourceEvidence: Record<string, unknown>;
  persistedProse: Record<string, unknown>;
  criteria: readonly string[];
  failIf: string;
  judgeInstructions?: readonly string[];
}): Promise<PersistedProseJudgeResult> {
  const evidence = {
    marker: input.marker,
    sourceEvidence: input.sourceEvidence,
    persistedProse: input.persistedProse,
  };
  let judged: JsonJudgeResult<z.infer<typeof persistedProseJudgeSchema>>;
  try {
    judged = await runJsonJudge({
      id: input.id,
      repoRoot: input.run.rootDir,
      promptVersion: 1,
      schemaVersion: 1,
      schema: persistedProseJudgeSchema,
      instructions: [
        `Grade persisted or generated prose for this purpose: ${input.purpose}`,
        "Use only the provided source evidence and persisted/generated prose.",
        "Do not infer success from keyword overlap. Judge whether the persisted/generated prose preserves the intended meaning and avoids the listed failures.",
        ...(input.judgeInstructions ?? []),
        'Schema: {"is_correct":boolean,"reason":string,"evidence":string[],"errors":string[],"warnings":string[]}',
        'Reason contract: if is_correct is true, reason MUST be exactly "". If is_correct is false, reason MUST explain the failure.',
        "",
        "Pass only if every criterion is satisfied:",
        ...input.criteria.map((criterion) => `- ${criterion}`),
        "",
        `Fail if ${input.failIf}`,
      ].join("\n"),
      evidence,
    });
  } catch (error) {
    writePersistedProseJudgeErrorArtifact({ ...input, evidence, error });
    throw error;
  }
  const judgeArtifactPath = writePersistedProseJudgeArtifact({ ...input, evidence, judged });
  assert.equal(judged.result.is_correct, true, `${input.id}: ${judged.result.reason}`);
  assert.equal(judged.result.reason, "", `${input.id}: judge reason must be empty when passing`);
  return { ...judged.result, judgeArtifactPath };
}
