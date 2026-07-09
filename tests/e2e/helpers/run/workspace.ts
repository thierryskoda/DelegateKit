import path from "node:path";
import { agentAgentDir, workspaceDir } from "@ai-assistants/repo-layout";

/** Canonical agent for managed E2Es (see `clients/testing`). */
export const DEFAULT_E2E_AGENT_ID = "testing";

/**
 * Resolves the E2E agent id from `AI_ASSISTANTS_E2E_AGENT`. Use only inside subprocesses spawned by an
 * outer harness that sets env (not inside tests that call `createE2eRun()` directly). For those,
 * take `run.agentId` from `createE2eRun()`.
 */
export function resolveE2eAgentId(): string {
  const raw = process.env.AI_ASSISTANTS_E2E_AGENT;
  if (raw === undefined) return DEFAULT_E2E_AGENT_ID;
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error(
      "AI_ASSISTANTS_E2E_AGENT is set but empty. Unset it or set AI_ASSISTANTS_E2E_AGENT=testing.",
    );
  }
  if (trimmed !== DEFAULT_E2E_AGENT_ID) {
    throw new Error(
      `E2E tests must run with agent "${DEFAULT_E2E_AGENT_ID}"; got AI_ASSISTANTS_E2E_AGENT=${JSON.stringify(trimmed)}.`,
    );
  }
  return DEFAULT_E2E_AGENT_ID;
}

/**
 * Reads `AI_ASSISTANTS_E2E_RUNTIME_ROOT` (falls back to `repoRoot`). Use **only** in tests that run
 * inside a subprocess where an outer harness set runtime env — those tests do not call
 * `createE2eRun` and must read env. Host-side tests should use `run.runtimeRoot`.
 */
export function e2eRuntimeRootFromEnv(repoRoot: string): string {
  const override = process.env.AI_ASSISTANTS_E2E_RUNTIME_ROOT?.trim();
  return override ? path.resolve(override) : repoRoot;
}

export function e2eWorkspaceDir(runtimeRoot: string, agentId: string): string {
  return workspaceDir(runtimeRoot, agentId);
}

export function e2eAgentDir(runtimeRoot: string, agentId: string): string {
  return agentAgentDir(runtimeRoot, agentId);
}
