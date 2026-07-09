import { cacheFilePath, readCachedResult, writeCachedResult } from "./cache";
import { runCodexJsonJudge } from "./codex-json-judge";
import type {
  JsonJudgeBackend,
  JsonJudgeInput,
  JsonJudgeResult,
  JsonJudgeRunRef,
} from "./types";
import { sha256, stableJson } from "./primitives";

function jsonJudgeBackend(input: JsonJudgeInput<unknown>): JsonJudgeBackend {
  return input.backend ?? "codex";
}

function judgeCacheModel(input: JsonJudgeInput<unknown>): string {
  return [
    "codex",
    input.codex?.model ?? "auto",
    input.codex?.profile ? `profile:${input.codex.profile}` : null,
    input.codex?.sandbox ? `sandbox:${input.codex.sandbox}` : null,
    input.codex?.ignoreUserConfig ? "ignore-user-config" : null,
    input.codex?.ignoreRules ? "ignore-rules" : null,
  ]
    .filter(Boolean)
    .join(":");
}

function judgeCacheKey(input: JsonJudgeInput<unknown>): string {
  return sha256(
    stableJson({
      id: input.id,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
      backend: jsonJudgeBackend(input),
      model: judgeCacheModel(input),
      instructions: input.instructions,
      evidence: input.evidence,
    }),
  );
}

function runRefForCodex(codexThreadId: string | null): JsonJudgeRunRef {
  return { backend: "codex", codexThreadId };
}

export async function runJsonJudge<T>(input: JsonJudgeInput<T>): Promise<JsonJudgeResult<T>> {
  const backend = jsonJudgeBackend(input);
  const cacheKey = judgeCacheKey(input);
  const cachePath = input.cacheDir ? cacheFilePath(input.cacheDir, cacheKey) : null;
  if (cachePath) {
    const cached = await readCachedResult(input.schema, cachePath);
    if (cached) {
      return {
        cacheKey,
        cacheStatus: "hit",
        backend,
        runRef: null,
        codexThreadId: null,
        result: cached,
      };
    }
  }

  const judged = await runCodexJsonJudge(input);
  const runRef = runRefForCodex(judged.codexThreadId);

  if (cachePath) {
    await writeCachedResult(cachePath, {
      cacheKey,
      createdAt: new Date().toISOString(),
      id: input.id,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
      backend,
      model: judgeCacheModel(input),
      result: judged.result,
    });
  }

  return {
    cacheKey,
    cacheStatus: cachePath ? "miss" : "disabled",
    backend,
    runRef,
    codexThreadId: judged.codexThreadId,
    result: judged.result,
  };
}
