#!/usr/bin/env tsx

import {
  DEFAULT_DEEPSEEK_MODEL,
  createDeepSeekModel,
  generateLlmObject,
  llmErrorDiagnostics,
} from "@ai-assistants/llm-client";
import { loadProfileDotEnv, requireEnvVars } from "@ai-assistants/workspace-shared";
import { z } from "zod";

const probeResultSchema = z
  .object({
    status: z.literal("ok"),
    answer: z.literal(42),
  })
  .strict();

function selectedModel(argv: readonly string[]): string {
  const modelArgs = argv.filter((arg) => arg.startsWith("--model="));
  const unexpectedArgs = argv.filter((arg) => !arg.startsWith("--model="));
  const model = modelArgs[0]?.slice("--model=".length).trim();

  if (modelArgs.length > 1 || unexpectedArgs.length > 0 || (modelArgs.length === 1 && !model)) {
    throw new Error(
      "Usage: npm run smoke:deepseek-json -- [--model=deepseek-v4-pro|deepseek-v4-flash]",
    );
  }

  return model ?? DEFAULT_DEEPSEEK_MODEL;
}

async function main(): Promise<void> {
  const model = selectedModel(process.argv.slice(2));
  loadProfileDotEnv("dev");
  requireEnvVars(["DEEPSEEK_API_KEY"], "DeepSeek JSON smoke probe");

  const data = await generateLlmObject({
    model: createDeepSeekModel({ model }),
    schema: probeResultSchema,
    outputName: "DeepSeekJsonProbeResult",
    outputDescription: "A deterministic result proving DeepSeek returned schema-valid JSON.",
    instructions: "Return JSON only and match the requested schema exactly.",
    input: "Add 19 and 23. Return status 'ok' and the numeric answer.",
    temperature: 0,
    timeout: 30_000,
    maxRetries: 1,
    maxOutputTokens: 100,
    callAttempts: 1,
    repairAttempts: 0,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: "deepseek",
        model,
        data,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        provider: "deepseek",
        error: llmErrorDiagnostics(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
