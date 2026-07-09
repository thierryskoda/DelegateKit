import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "@ai-assistants/repo-layout";
import { runBoundedCommand, type BoundedCommandResult } from "./bounded-command";
import type { E2eLaneRuntime } from "./e2e-lane-runtime";

const DIAGNOSTIC_TIMEOUT_MS = 10_000;

type E2eInfraDiagnostics = {
  kind: "ai-assistants.e2e.infrastructure-diagnostics";
  createdAt: string;
  phase: string;
  runtime: {
    runId: string;
    projectId: string;
    dockerContext?: string;
    runtimeRoot: string;
    supabaseWorkdir: string;
    envPath: string;
    ports: E2eLaneRuntime["ports"];
  };
  commands: readonly BoundedCommandResult[];
};

function diagnosticsDir(root: string): string {
  const dir = path.join(root, "tmp", "e2e", "reports", "infrastructure");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function collectE2eInfrastructureDiagnostics(input: {
  runtime: E2eLaneRuntime;
  phase: string;
}): string {
  const root = repoRoot(import.meta.url);
  const dockerEnv = input.runtime.dockerContext
    ? { ...process.env, DOCKER_CONTEXT: input.runtime.dockerContext }
    : undefined;
  const commands = [
    runBoundedCommand(
      "npx",
      [
        "--yes",
        "supabase@2.98.1",
        "status",
        "-o",
        "env",
        "--workdir",
        input.runtime.supabaseWorkdir,
      ],
      { cwd: root, timeoutMs: DIAGNOSTIC_TIMEOUT_MS, maxBuffer: 5_000_000, env: dockerEnv },
    ),
    runBoundedCommand(
      "docker",
      ["ps", "--filter", `label=com.docker.compose.project=${input.runtime.projectId}`],
      {
        cwd: root,
        timeoutMs: DIAGNOSTIC_TIMEOUT_MS,
        maxBuffer: 5_000_000,
        env: dockerEnv,
      },
    ),
    runBoundedCommand(
      "docker",
      ["volume", "ls", "--filter", `label=com.docker.compose.project=${input.runtime.projectId}`],
      {
        cwd: root,
        timeoutMs: DIAGNOSTIC_TIMEOUT_MS,
        maxBuffer: 5_000_000,
        env: dockerEnv,
      },
    ),
  ];
  const diagnostics: E2eInfraDiagnostics = {
    kind: "ai-assistants.e2e.infrastructure-diagnostics",
    createdAt: new Date().toISOString(),
    phase: input.phase,
    runtime: {
      runId: input.runtime.runId,
      projectId: input.runtime.projectId,
      dockerContext: input.runtime.dockerContext,
      runtimeRoot: input.runtime.runtimeRoot,
      supabaseWorkdir: input.runtime.supabaseWorkdir,
      envPath: input.runtime.envPath,
      ports: input.runtime.ports,
    },
    commands,
  };
  const filePath = path.join(
    diagnosticsDir(root),
    `${input.runtime.runId}-${Date.now()}-diagnostics.json`,
  );
  writeFileSync(filePath, `${JSON.stringify(diagnostics, null, 2)}\n`, { mode: 0o600 });
  return filePath;
}
