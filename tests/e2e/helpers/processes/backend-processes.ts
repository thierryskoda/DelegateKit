import { spawn } from "node:child_process";
import {
  killChildProcessGroup,
  truncateChildLogs,
  waitForChildProcessExit,
} from "./child-process-shared";

export type BackendServerHandle = {
  baseUrl: string;
  stop(): Promise<void>;
};

const LOG_TAIL = 8_000;

async function waitForBackendHealth(
  baseUrl: string,
  getLogs: () => string,
  timeoutMs: number,
): Promise<void> {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
      lastError = `HTTP ${response.status}: ${await response.text()}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Backend did not become healthy at ${baseUrl} within ${timeoutMs}ms. Last error: ${lastError}\n${getLogs()}`,
  );
}

export async function startBackendServer(input: {
  repoRoot: string;
  port: number;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<BackendServerHandle> {
  const baseUrl = `http://127.0.0.1:${input.port}`;
  const child = spawn("npm", ["run", "--silent", "backend:serve"], {
    cwd: input.repoRoot,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      ...input.env,
      BACKEND_PORT: String(input.port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  child.once("exit", (code, signal) => {
    if (code !== 0 && code !== null) stderr += `\nBackend server exited with code ${code}.`;
    if (signal) stderr += `\nBackend server exited by signal ${signal}.`;
  });

  try {
    await waitForBackendHealth(
      baseUrl,
      () =>
        `stdout:\n${truncateChildLogs(stdout, LOG_TAIL)}\nstderr:\n${truncateChildLogs(stderr, LOG_TAIL)}`,
      input.timeoutMs ?? 90_000,
    );
  } catch (error) {
    killChildProcessGroup(child, "SIGTERM");
    if (child.exitCode === null && child.signalCode === null)
      await waitForChildProcessExit(child, 5_000);
    throw error;
  }

  return {
    baseUrl,
    stop: async () => {
      killChildProcessGroup(child, "SIGTERM");
      if (child.exitCode === null && child.signalCode === null)
        await waitForChildProcessExit(child, 5_000);
    },
  };
}
