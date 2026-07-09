import path from "node:path";
import os from "node:os";
import { z } from "zod";

export const REPO_FILES = {
  packageJson: "package.json",
  runtimeLog: "assistant-runtime.jsonl",
} as const;

export const RUNTIME_PROFILES = ["dev", "e2e", "prod"] as const;
export type RuntimeProfile = (typeof RUNTIME_PROFILES)[number];

export const runtimeProfileSchema = z.enum(RUNTIME_PROFILES);

export function assertRuntimeProfile(value: string): asserts value is RuntimeProfile {
  if (!RUNTIME_PROFILES.includes(value as RuntimeProfile)) {
    throw new Error(
      `Invalid runtime profile ${JSON.stringify(value)}. Expected one of: ${RUNTIME_PROFILES.join(", ")}.`,
    );
  }
}

export function isLocalSupabaseManagedProfile(profile: RuntimeProfile): boolean {
  return profile === "dev" || profile === "e2e";
}

export function isProductionLikeProfile(profile: RuntimeProfile): boolean {
  return profile === "prod";
}

export function requiresProdConfirmation(profile: RuntimeProfile): boolean {
  return isProductionLikeProfile(profile);
}

export function profileRuntimeDir(profile: RuntimeProfile, homeDir = os.homedir()): string {
  return path.join(homeDir, `.ai-assistants-${profile}`);
}

export function profileEnvPath(profile: RuntimeProfile, homeDir = os.homedir()): string {
  return path.join(profileRuntimeDir(profile, homeDir), ".env");
}

export function runtimeLogsDir(runtimeRoot: string): string {
  return path.join(runtimeRoot, "logs");
}

export function runtimeLogFilePath(runtimeRoot: string): string {
  return path.join(runtimeLogsDir(runtimeRoot), REPO_FILES.runtimeLog);
}

export function diagnosticsLogDir(runtimeRoot: string): string {
  return path.join(runtimeLogsDir(runtimeRoot), "diagnostics");
}

/** Resolve a path expressed relative to repo root (e.g. `workspaces/client-a` or `capabilities/monday`). */
export function repoRelativePath(repoRoot: string, relativePosixPath: string): string {
  return path.join(repoRoot, ...relativePosixPath.split("/").filter(Boolean));
}

export function workspacesRoot(runtimeRoot: string): string {
  return path.join(runtimeRoot, "workspaces");
}

export function workspaceDir(runtimeRoot: string, agentOrClientId: string): string {
  return path.join(workspacesRoot(runtimeRoot), agentOrClientId);
}

export function agentsRoot(runtimeRoot: string): string {
  return path.join(runtimeRoot, "agents");
}

export function agentAgentDir(runtimeRoot: string, agentId: string): string {
  return path.join(agentsRoot(runtimeRoot), agentId, "agent");
}

export function agentSessionsDir(runtimeRoot: string, agentId: string): string {
  return path.join(agentsRoot(runtimeRoot), agentId, "sessions");
}

/** Session transcript file (`<sessionId>.jsonl`) under the agent's sessions dir. */
export function agentSessionTranscriptPath(
  runtimeRoot: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(agentSessionsDir(runtimeRoot, agentId), `${sessionId}.jsonl`);
}

/** Tool/trace trajectory (`<sessionId>.trajectory.jsonl`) companion to the session transcript. */
export function agentSessionTrajectoryPath(
  runtimeRoot: string,
  agentId: string,
  sessionId: string,
): string {
  return path.join(agentSessionsDir(runtimeRoot, agentId), `${sessionId}.trajectory.jsonl`);
}

/** Plugin/sync state under a workspace (e.g. `workspaces/client-a/state`). */
export function workspaceStateDir(runtimeRoot: string, workspaceId: string): string {
  return path.join(workspaceDir(runtimeRoot, workspaceId), "state");
}

export function packageJsonPath(repoRoot: string): string {
  return path.join(repoRoot, REPO_FILES.packageJson);
}
