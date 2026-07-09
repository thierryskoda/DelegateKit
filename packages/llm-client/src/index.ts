import {
  createDeepSeek,
  type DeepSeekProvider,
  type DeepSeekProviderSettings,
} from "@ai-sdk/deepseek";
import { generateObject, generateText, NoObjectGeneratedError, type LanguageModel } from "ai";
import { ZodError, type z } from "zod";
import { withLlmCallRetries, type LlmRetryOptions } from "./retry.js";

export const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-pro";

export type LlmModel = LanguageModel;
export type DeepSeekModel = ReturnType<DeepSeekProvider>;

export type DeepSeekProviderOptions = DeepSeekProviderSettings;

export type CreateDeepSeekModelParams = {
  model?: string;
  provider?: DeepSeekProviderOptions;
};

export class LlmEmptyOutputError extends Error {
  constructor() {
    super("LLM returned empty text.");
    this.name = "LlmEmptyOutputError";
  }
}

export function createDeepSeekModel(params: CreateDeepSeekModelParams = {}): DeepSeekModel {
  const provider = createDeepSeek(params.provider ?? {});
  return provider(params.model ?? DEFAULT_DEEPSEEK_MODEL);
}

type JsonValue = null | string | number | boolean | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue | undefined };

export type LlmCallOptions = LlmRetryOptions & {
  /**
   * AI SDK timeout in milliseconds, or separate total/step limits for multi-step calls.
   */
  timeout?: number | { totalMs?: number; stepMs?: number };
  maxRetries?: number;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
  providerOptions?: Record<string, JsonObject>;
};

export type LlmObjectRepairOptions = {
  /**
   * Validation repair attempts after a model returns invalid structured output.
   * The original generation plus repair sequence is still wrapped by `callAttempts`.
   */
  repairAttempts?: number;
};

export type LlmPromptParams = {
  model?: LlmModel;
  /**
   * High-priority behavioral instructions. Passed as the AI SDK `system` prompt.
   */
  instructions?: string;
  input: string;
};

type SharedGenerateTextParams = LlmPromptParams & LlmCallOptions;

function buildGenerateTextParams(params: SharedGenerateTextParams) {
  return {
    model: params.model ?? createDeepSeekModel(),
    prompt: params.input,
    ...(params.instructions !== undefined ? { system: params.instructions } : {}),
    ...(params.timeout !== undefined ? { timeout: params.timeout } : {}),
    ...(params.maxRetries !== undefined ? { maxRetries: params.maxRetries } : {}),
    ...(params.maxOutputTokens !== undefined ? { maxOutputTokens: params.maxOutputTokens } : {}),
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    ...(params.topP !== undefined ? { topP: params.topP } : {}),
    ...(params.abortSignal !== undefined ? { abortSignal: params.abortSignal } : {}),
    ...(params.headers !== undefined ? { headers: params.headers } : {}),
    ...(params.providerOptions !== undefined ? { providerOptions: params.providerOptions } : {}),
  };
}

export type GenerateLlmTextParams = SharedGenerateTextParams;

export async function generateLlmText(params: GenerateLlmTextParams): Promise<string> {
  return withLlmCallRetries(params, async () => {
    const result = await generateText(buildGenerateTextParams(params));
    const text = result.text.trim();
    if (!text) throw new LlmEmptyOutputError();
    return text;
  });
}

export type GenerateLlmObjectParams<TSchema extends z.ZodType> = SharedGenerateTextParams & {
  schema: TSchema;
  outputName?: string;
  outputDescription?: string;
} & LlmObjectRepairOptions;

const DEFAULT_LLM_OBJECT_REPAIR_ATTEMPTS = 1;

function normalizedRepairAttempts(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LLM_OBJECT_REPAIR_ATTEMPTS;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `llm repairAttempts must be a non-negative integer; got ${JSON.stringify(value)}.`,
    );
  }
  return value;
}

function jsonPreview(value: unknown, maxLength = 20_000): string {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (!text) return String(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated ${text.length - maxLength} chars]`;
}

function errorCause(error: Error): unknown {
  return "cause" in error ? error.cause : undefined;
}

function formatLlmErrorForRepair(error: unknown): string {
  if (error instanceof ZodError) {
    return JSON.stringify(error.issues, null, 2);
  }
  if (NoObjectGeneratedError.isInstance(error)) {
    const cause = errorCause(error);
    return [
      error.message,
      cause === undefined ? null : `cause: ${formatLlmErrorForRepair(cause)}`,
      error.finishReason === undefined ? null : `finishReason: ${error.finishReason}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (error instanceof Error) {
    const cause = errorCause(error);
    return [
      `${error.name}: ${error.message}`,
      cause === undefined ? null : `cause: ${formatLlmErrorForRepair(cause)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return jsonPreview(error);
}

function generatedTextFromError(error: unknown): string | null {
  if (NoObjectGeneratedError.isInstance(error)) return error.text ?? null;
  return null;
}

function buildLlmObjectRepairInput(input: {
  originalInstructions?: string;
  originalInput: string;
  outputName?: string;
  outputDescription?: string;
  invalidOutput: string;
  validationError: string;
  repairAttempt: number;
}): string {
  return [
    "Repair the previous structured output so it exactly satisfies the requested schema.",
    "Return only the corrected structured object. Do not explain the fix.",
    `Repair attempt: ${input.repairAttempt}`,
    input.outputName ? `Output name: ${input.outputName}` : null,
    input.outputDescription ? `Output description: ${input.outputDescription}` : null,
    input.originalInstructions
      ? ["Original instructions:", input.originalInstructions].join("\n")
      : null,
    ["Original input:", input.originalInput].join("\n"),
    ["Validation error:", input.validationError].join("\n"),
    ["Invalid output:", input.invalidOutput].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

type JsonSafe =
  | null
  | string
  | number
  | boolean
  | JsonSafe[]
  | { [key: string]: JsonSafe | undefined };

function jsonSafe(value: unknown, depth = 0): JsonSafe {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(errorCause(value) === undefined ? {} : { cause: jsonSafe(errorCause(value), depth + 1) }),
    };
  }
  if (depth > 4) return "[max-depth]";
  if (Array.isArray(value)) return value.map((item) => jsonSafe(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonSafe(item, depth + 1)]),
    );
  }
  if (value === undefined) return null;
  return String(value);
}

export function llmErrorDiagnostics(error: unknown): Record<string, unknown> {
  if (NoObjectGeneratedError.isInstance(error)) {
    return {
      name: error.name,
      message: error.message,
      generatedText: error.text ?? null,
      cause: jsonSafe(errorCause(error)),
      usage: jsonSafe(error.usage),
      finishReason: error.finishReason ?? null,
      response: jsonSafe(error.response),
    };
  }
  if (error instanceof ZodError) {
    return { name: "ZodError", message: error.message, issues: error.issues };
  }
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause: jsonSafe(errorCause(error)),
    };
  }
  return { name: "UnknownError", message: String(error), value: jsonSafe(error) };
}

async function generateLlmObjectOnce<TSchema extends z.ZodType>(
  params: GenerateLlmObjectParams<TSchema>,
  input: string,
): Promise<z.infer<TSchema>> {
  const result = await generateObject({
    ...buildGenerateTextParams({ ...params, input }),
    schema: params.schema,
    ...(params.outputName !== undefined ? { schemaName: params.outputName } : {}),
    ...(params.outputDescription !== undefined
      ? { schemaDescription: params.outputDescription }
      : {}),
  });
  try {
    return params.schema.parse(result.object);
  } catch (error) {
    throw new Error("Generated object passed provider validation but failed local schema parse.", {
      cause: error,
    });
  }
}

async function generateLlmObjectWithRepairs<TSchema extends z.ZodType>(
  params: GenerateLlmObjectParams<TSchema>,
): Promise<z.infer<TSchema>> {
  const repairAttempts = normalizedRepairAttempts(params.repairAttempts);
  try {
    return await generateLlmObjectOnce(params, params.input);
  } catch (error) {
    let lastError = error;
    let invalidOutput = generatedTextFromError(error);
    if (!invalidOutput && error instanceof Error && errorCause(error) instanceof ZodError) {
      invalidOutput = "The model returned an object that failed local schema parsing.";
    }
    if (!invalidOutput || repairAttempts === 0) throw error;

    for (let repairAttempt = 1; repairAttempt <= repairAttempts; repairAttempt += 1) {
      const repairInput = buildLlmObjectRepairInput({
        originalInput: params.input,
        invalidOutput: jsonPreview(invalidOutput),
        validationError: formatLlmErrorForRepair(lastError),
        repairAttempt,
        ...(params.instructions === undefined ? {} : { originalInstructions: params.instructions }),
        ...(params.outputName === undefined ? {} : { outputName: params.outputName }),
        ...(params.outputDescription === undefined
          ? {}
          : { outputDescription: params.outputDescription }),
      });
      try {
        return await generateLlmObjectOnce(params, repairInput);
      } catch (repairError) {
        lastError = repairError;
        invalidOutput = generatedTextFromError(repairError) ?? invalidOutput;
      }
    }
    throw lastError;
  }
}

export async function generateLlmObject<TSchema extends z.ZodType>(
  params: GenerateLlmObjectParams<TSchema>,
): Promise<z.infer<TSchema>> {
  return withLlmCallRetries(params, () => generateLlmObjectWithRepairs(params));
}
