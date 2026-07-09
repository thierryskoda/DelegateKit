import {
  createDeepSeekModel,
  generateLlmObject,
  llmErrorDiagnostics,
} from "@ai-assistants/llm-client";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import { backendDiagnosticLogger } from "../../shared/diagnostics";

export const CHEAP_STRUCTURED_DECISION_MODEL = "deepseek-v4-flash";
export const DURABLE_STRUCTURED_DECISION_MODEL = "deepseek-v4-pro";

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 600;
const DEFAULT_MAX_PROMPT_CHARS = 20_000;
const DEFAULT_MAX_STRING_CHARS = 1_500;
const DEFAULT_MAX_ARRAY_ITEMS = 20;
const REDACTED_KEY_PATTERNS = [
  "token",
  "credential",
  "secret",
  "password",
  "authorization",
  "cookie",
] as const;

type SanitizedJson =
  | null
  | string
  | number
  | boolean
  | SanitizedJson[]
  | { [key: string]: SanitizedJson | undefined };

type CheapStructuredDecisionFailure = {
  ok: false;
  error: Record<string, unknown>;
};

type CheapStructuredDecisionSuccess<T> = {
  ok: true;
  value: T;
};

export type CheapStructuredDecisionResult<T> =
  | CheapStructuredDecisionSuccess<T>
  | CheapStructuredDecisionFailure;

export function truncateForLlmPrompt(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACTED_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

function sanitizeForLlmPrompt(
  value: unknown,
  input: { maxStringChars?: number; maxArrayItems?: number; depth?: number } = {},
): SanitizedJson {
  const depth = input.depth ?? 0;
  const maxStringChars = input.maxStringChars ?? DEFAULT_MAX_STRING_CHARS;
  const maxArrayItems = input.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS;
  if (value === null) return null;
  if (typeof value === "string") return truncateForLlmPrompt(value, maxStringChars);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value === undefined) return null;
  if (depth > 4) return "[max-depth]";
  if (Array.isArray(value)) {
    const items = value
      .slice(0, maxArrayItems)
      .map((item) =>
        sanitizeForLlmPrompt(item, { maxStringChars, maxArrayItems, depth: depth + 1 }),
      );
    if (value.length > maxArrayItems) {
      items.push(`[truncated ${value.length - maxArrayItems} array items]`);
    }
    return items;
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        shouldRedactKey(key)
          ? "[redacted]"
          : sanitizeForLlmPrompt(item, { maxStringChars, maxArrayItems, depth: depth + 1 }),
      ]),
    );
  }
  return String(value);
}

export function renderSanitizedJsonForLlm(value: unknown, maxChars = DEFAULT_MAX_PROMPT_CHARS) {
  return truncateForLlmPrompt(JSON.stringify(sanitizeForLlmPrompt(value), null, 2), maxChars);
}

export async function cheapStructuredDecision<TSchema extends z.ZodType>(input: {
  profileId?: string;
  diagnosticKind: string;
  schema: TSchema;
  outputName: string;
  outputDescription: string;
  instructions: string;
  prompt: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  model?: string;
  attrs?: Record<string, unknown>;
}): Promise<CheapStructuredDecisionResult<z.infer<TSchema>>> {
  const model = input.model ?? CHEAP_STRUCTURED_DECISION_MODEL;
  try {
    const value = await generateLlmObject({
      model: createDeepSeekModel({ model }),
      schema: input.schema,
      outputName: input.outputName,
      outputDescription: input.outputDescription,
      instructions: input.instructions,
      input: input.prompt,
      temperature: 0,
      timeout: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxOutputTokens: input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      callAttempts: 1,
      repairAttempts: 0,
    });
    emitDiagnostic(backendDiagnosticLogger(), input.diagnosticKind, {
      ok: true,
      ...(input.profileId === undefined ? {} : { profile_id: input.profileId }),
      attrs: {
        model,
        ...(input.attrs ?? {}),
      },
    });
    return { ok: true, value };
  } catch (error) {
    const diagnostics = llmErrorDiagnostics(error);
    emitDiagnostic(backendDiagnosticLogger(), `${input.diagnosticKind}_failed`, {
      ok: false,
      level: "warn",
      ...(input.profileId === undefined ? {} : { profile_id: input.profileId }),
      attrs: {
        model,
        ...(input.attrs ?? {}),
        error: diagnostics,
      },
    });
    return { ok: false, error: diagnostics };
  }
}
