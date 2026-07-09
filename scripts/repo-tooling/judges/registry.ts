import path from "node:path";
import { fileURLToPath } from "node:url";

const JUDGES_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(JUDGES_ROOT, "prompts");

export const pluginBoundaryOverlapInstructionsPath = (): string =>
  path.join(PROMPTS_DIR, "plugin-boundary-overlap.md");

export const toolContractDescriptionsInstructionsPath = (): string =>
  path.join(PROMPTS_DIR, "tool-contract-descriptions.md");

export const runtimeGuidanceQualityInstructionsPath = (): string =>
  path.join(PROMPTS_DIR, "runtime-guidance-quality.md");

export const profileLearningReviewersInstructionsPath = (): string =>
  path.join(PROMPTS_DIR, "profile-learning-reviewers.md");

export const profileLearningReviewIntegrationInstructionsPath = (): string =>
  path.join(PROMPTS_DIR, "profile-learning-review-integration.md");

export const backendAssistantPromptQualityInstructionsPath = (): string =>
  path.join(PROMPTS_DIR, "backend-assistant-prompt-quality.md");

export const metaPromptAlignmentPath = (): string =>
  path.join(PROMPTS_DIR, "meta", "prompt-alignment.md");

const diagnosticsReviewTurnInstructionsPath = (): string =>
  path.join(PROMPTS_DIR, "diagnostics-review-turn.md");

export const knipConfigInstructionsPath = (): string => path.join(PROMPTS_DIR, "knip-config.md");

export const REGISTERED_JUDGE_PROMPT_IDS = [
  "backend-assistant-prompt-quality",
  "diagnostics-review-turn",
  "knip-config",
  "plugin-boundary-overlap",
  "profile-learning-review-integration",
  "profile-learning-reviewers",
  "runtime-guidance-quality",
  "tool-contract-descriptions",
] as const;
export type RegisteredJudgePromptId = (typeof REGISTERED_JUDGE_PROMPT_IDS)[number];

export function isRegisteredJudgePromptId(value: string): value is RegisteredJudgePromptId {
  return (REGISTERED_JUDGE_PROMPT_IDS as readonly string[]).includes(value);
}

export function instructionsPathForJudge(id: RegisteredJudgePromptId): string {
  if (id === "backend-assistant-prompt-quality")
    return backendAssistantPromptQualityInstructionsPath();
  if (id === "diagnostics-review-turn") return diagnosticsReviewTurnInstructionsPath();
  if (id === "knip-config") return knipConfigInstructionsPath();
  if (id === "plugin-boundary-overlap") return pluginBoundaryOverlapInstructionsPath();
  if (id === "profile-learning-review-integration")
    return profileLearningReviewIntegrationInstructionsPath();
  if (id === "profile-learning-reviewers") return profileLearningReviewersInstructionsPath();
  if (id === "runtime-guidance-quality") return runtimeGuidanceQualityInstructionsPath();
  if (id === "tool-contract-descriptions") return toolContractDescriptionsInstructionsPath();
  throw new Error(`Unknown judge prompt id ${JSON.stringify(id)}.`);
}

export function targetJudgePurpose(id: RegisteredJudgePromptId): string {
  if (id === "backend-assistant-prompt-quality")
    return "backend assistant prompt completeness, concision, and client-safe guidance";
  if (id === "diagnostics-review-turn")
    return "assistant turn diagnostics review, safety, tool use, failure handling, and profile isolation";
  if (id === "knip-config") return "Knip configuration coherence";
  if (id === "plugin-boundary-overlap") return "plugin tool boundary overlap";
  if (id === "profile-learning-review-integration")
    return "profile-learning review candidate integration across generation, UI, approval, and apply surfaces";
  if (id === "profile-learning-reviewers")
    return "profile-learning reviewer prompt freshness, schema alignment, and reviewer boundary coherence";
  if (id === "runtime-guidance-quality")
    return "runtime guidance placement, duplication, tool-contract alignment, and internal implementation leakage";
  if (id === "tool-contract-descriptions")
    return "agent tool contract description accuracy, sufficiency, and safety";
  throw new Error(`Unknown judge prompt id ${JSON.stringify(id)}.`);
}
