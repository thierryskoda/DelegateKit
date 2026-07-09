import type { JsonJudgeInput } from "./types";
import { stableJson } from "./primitives";

export function buildJudgePrompt(
  input: Pick<JsonJudgeInput<unknown>, "id" | "instructions" | "evidence">,
): string {
  return [
    "You are a read-only LLM judge. Return only JSON that matches the requested schema.",
    "",
    `Judge id: ${input.id}`,
    "",
    "Instructions:",
    input.instructions.trim(),
    "",
    "Evidence JSON:",
    stableJson(input.evidence),
    "",
  ].join("\n");
}
