import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";
import {
  isRegisteredJudgePromptId,
  REGISTERED_JUDGE_PROMPT_IDS,
  type RegisteredJudgePromptId,
} from "../judges/registry";

const DEFAULT_PROFILE: RuntimeProfile = "dev";

export function parseProfile(raw: string | undefined): RuntimeProfile {
  const value = raw?.trim() || DEFAULT_PROFILE;
  assertRuntimeProfile(value);
  return value;
}

export function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

export function parseJudgeId(raw: string | undefined): RegisteredJudgePromptId {
  const value = raw?.trim() || "plugin-boundary-overlap";
  if (isRegisteredJudgePromptId(value)) return value;
  throw new Error(
    `Unknown --judge ${JSON.stringify(value)}. Supported: ${REGISTERED_JUDGE_PROMPT_IDS.join(", ")}.`,
  );
}
