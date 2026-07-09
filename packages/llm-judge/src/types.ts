import type {
  CodexAgentBaseOptions,
  CodexSandboxMode,
} from "@ai-assistants/codex-agent";
import type { ZodType } from "zod";

export type JsonJudgeCacheStatus = "hit" | "miss" | "disabled";
export type JsonJudgeBackend = "codex";

export type CodexJsonJudgeOptions = {
  baseOptions?: CodexAgentBaseOptions;
  model?: string;
  profile?: string;
  sandbox?: CodexSandboxMode;
  configOverrides?: readonly string[];
  enableFeatures?: readonly string[];
  disableFeatures?: readonly string[];
  ignoreUserConfig?: boolean;
  ignoreRules?: boolean;
  extraArgs?: readonly string[];
  persistSession?: boolean;
};

export type JsonJudgeRunRef = {
  backend: "codex";
  codexThreadId: string | null;
};

export type JsonJudgeResult<T> = {
  cacheKey: string;
  cacheStatus: JsonJudgeCacheStatus;
  backend: JsonJudgeBackend;
  runRef: JsonJudgeRunRef | null;
  codexThreadId: string | null;
  result: T;
};

export type JsonJudgeInput<T> = {
  id: string;
  promptVersion: number;
  schemaVersion: number;
  schema: ZodType<T>;
  instructions: string;
  evidence: unknown;
  repoRoot: string;
  cacheDir?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  backend?: JsonJudgeBackend;
  codex?: CodexJsonJudgeOptions;
};

export type AgentJudgeResult = {
  is_correct: boolean;
  reason: string;
  evidence?: string[];
  tool_calls_ok?: boolean;
};
