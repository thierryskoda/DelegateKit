import {
  buildCodexExecCommand,
  codexAgentHeadlessBaseOptionsFromEnv,
  execCodexArgv,
  extractLastCodexAgentMessage,
  parseCodexJsonEvents,
  type CodexJsonEvent,
} from "@ai-assistants/codex-agent";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { buildJudgePrompt } from "./judge-prompt";
import { parseJsonFromAgentText } from "./json-parse";
import type { CodexJsonJudgeOptions, JsonJudgeInput } from "./types";

const DEFAULT_MAX_ATTEMPTS = 2;

type JsonSchemaDocument = Record<string, unknown>;

type CodexJsonJudgeOutput<T> = {
  result: T;
  codexThreadId: string | null;
};

function isRetryableCodexJudgeError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("codex exec returned empty stdout") ||
    error.message.includes("returned empty stdout") ||
    error.message.includes("Codex JSON judge did not return a final agent message")
  );
}

function codexThreadIdFromEvents(events: readonly CodexJsonEvent[]): string | null {
  for (const event of events) {
    if (event.type !== "thread.started") continue;
    const threadId = event.thread_id;
    if (typeof threadId === "string" && threadId.trim()) return threadId;
  }
  return null;
}

async function writeCodexSchemaFile<T>(
  dir: string,
  input: Pick<JsonJudgeInput<T>, "schema" | "id">,
): Promise<string | undefined> {
  const schemaPath = path.join(dir, "output-schema.json");
  let schema: JsonSchemaDocument;
  try {
    schema = z.toJSONSchema(input.schema, {
      io: "output",
      target: "draft-07",
    }) as JsonSchemaDocument;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Transforms cannot be represented")) {
      throw error;
    }
    // Some judges use Zod transforms to normalize model output after parsing.
    return undefined;
  }
  await writeFile(
    schemaPath,
    `${JSON.stringify(
      {
        ...schema,
        title: input.id,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return schemaPath;
}

function codexOptions(input: JsonJudgeInput<unknown>): CodexJsonJudgeOptions {
  return input.codex ?? {};
}

async function runCodexJsonJudgeOnce<T>(
  input: JsonJudgeInput<T>,
): Promise<CodexJsonJudgeOutput<T>> {
  const options = codexOptions(input);
  const baseOptions = options.baseOptions ?? codexAgentHeadlessBaseOptionsFromEnv();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "ai-assistants-codex-json-judge-"));
  try {
    const schemaPath = await writeCodexSchemaFile(tempDir, input);
    const lastMessagePath = path.join(tempDir, "last-message.json");
    const argv = buildCodexExecCommand(baseOptions, {
      prompt: "-",
      cwd: input.repoRoot,
      sandbox: options.sandbox ?? "read-only",
      model: options.model,
      profile: options.profile,
      configOverrides: options.configOverrides,
      enableFeatures: options.enableFeatures,
      disableFeatures: options.disableFeatures,
      ignoreUserConfig: options.ignoreUserConfig,
      ignoreRules: options.ignoreRules,
      extraArgs: options.extraArgs,
      json: true,
      ephemeral: options.persistSession !== true,
      outputLastMessageFile: lastMessagePath,
      outputSchemaFile: schemaPath ?? undefined,
    });
    const rawEvents = await execCodexArgv(
      input.repoRoot,
      argv,
      input.timeoutMs ?? 240_000,
      buildJudgePrompt(input),
    );
    const events = parseCodexJsonEvents(rawEvents);
    const finalMessage =
      extractLastCodexAgentMessage(events) ?? (await readFile(lastMessagePath, "utf8"));
    const parsed = parseJsonFromAgentText(finalMessage, "Codex JSON judge");
    return {
      result: input.schema.parse(parsed),
      codexThreadId: codexThreadIdFromEvents(events),
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function runCodexJsonJudge<T>(
  input: JsonJudgeInput<T>,
): Promise<CodexJsonJudgeOutput<T>> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let result: CodexJsonJudgeOutput<T> | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      result = await runCodexJsonJudgeOnce(input);
      break;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableCodexJudgeError(error)) {
        throw error;
      }
    }
  }

  if (result === null) {
    throw lastError ?? new Error("Codex JSON judge failed before returning a parsed result.");
  }
  return result;
}
