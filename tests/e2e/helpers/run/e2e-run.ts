import type { TestContext } from "node:test";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "@ai-assistants/repo-layout";
import { loadE2eProfileEnv } from "./profile-env";
import {
  cleanupE2eRunContext,
  prepareE2eRunContext,
  type E2eRunContext,
} from "./e2e-run-context";
import { newFlowRunToken } from "./flow-run-token";
import {
  hydrateTestingLifecycleEnv,
  missingRequiredEnvMessage,
  resolveTestingLifecycleEnvFromDb,
} from "./testing-lifecycle-env";
import { DEFAULT_E2E_AGENT_ID } from "./workspace";

export const E2E_TEST_CHANNEL_DEFAULT_PEER_ID = "e2e-user";
export const E2E_TEST_CHANNEL_PARALLEL_PEER_IDS = ["e2e-user-a", "e2e-user-b"] as const;

export type CleanupStack = {
  add(cleanup: () => Promise<void> | void): void;
  run(): Promise<void>;
};

export type E2eRun = {
  /** Stable scenario id (used in logs and as a label for the run). */
  id: string;
  /** Workspace checkout root. */
  rootDir: string;
  /** Generated unique run id. */
  runId: string;
  runDir: string;
  /** Runtime root for this run (equal to runDir). */
  runtimeRoot: string;
  stateDir: string;
  agentId: string;
  peerId: string;
  /** Wall-clock baseline used by diagnostics assertions; set when createE2eRun resolves. */
  diagnosticsStartMs: number;
  /** Test-scoped cleanup stack run during `t.after`. */
  cleanup: CleanupStack;
  /** E2E profile env loaded from .env, merged into process.env. */
  profileEnv: Readonly<Record<string, string>>;
};

export type CreateE2eRunOptions = {
  id: string;
  agentId?: string;
  peerId?: string;
  /** Keep the run dir after teardown for inspection. Default true (set false or `E2E_KEEP_RUN_DIR=0` to clean up). */
  keepRunDir?: boolean;
  /** Required env vars; missing values are hydrated from the testing DB or fail fast. */
  requiredEnv?: readonly string[];
  /** Clear `<runtimeRoot>/logs/diagnostics` before tests run. Default false. */
  clearDiagnosticLogs?: boolean;
};

function createCleanupStack(): CleanupStack {
  const cleanups: Array<() => Promise<void> | void> = [];
  return {
    add: (cleanup) => {
      cleanups.push(cleanup);
    },
    run: async () => {
      const errors: unknown[] = [];
      for (const cleanup of [...cleanups].reverse()) {
        try {
          await cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, "One or more E2E cleanup steps failed.");
      }
    },
  };
}

function applyContextEnv(context: E2eRunContext): void {
  process.env.AI_ASSISTANTS_E2E_RUN_ID = context.runId;
  process.env.AI_ASSISTANTS_E2E_AGENT = context.agentId;
  process.env.AI_ASSISTANTS_E2E_RUN_DIR = context.runDir;
  process.env.AI_ASSISTANTS_E2E_RUNTIME_ROOT = context.runtimeRoot;
  process.env.AI_ASSISTANTS_RUNTIME_DIR = context.stateDir;
}

function clearDiagnosticLogs(runtimeRoot: string): void {
  const diagnosticsDir = path.join(runtimeRoot, "logs", "diagnostics");
  if (existsSync(diagnosticsDir)) {
    rmSync(diagnosticsDir, { recursive: true, force: true });
  }
}

function assertE2eRunnerPrepared(id: string): void {
  if (process.env.AI_ASSISTANTS_E2E_RUNNER_PREPARED === "1") return;
  throw new Error(
    [
      `[e2e:${id}] E2E runner setup was not prepared.`,
      "Run this test through `npm run e2e -- <suite-or-file>` so a prepared fixed E2E worker lane is leased and the e2e profile is rebuilt before test execution.",
      "Direct `node --test tests/e2e/...` runs are intentionally blocked because they do not prepare an isolated E2E runtime.",
    ].join(" "),
  );
}

/**
 * Bootstraps a single E2E run: loads E2E profile env, hydrates required env from the testing DB,
 * builds an isolated runtime root under `tmp/e2e/runs/<runId>/`, and registers cleanup on the
 * provided `node:test` context. The `npm run e2e` command owns fixed-lane Supabase prep and profile build before
 * test execution. **Does not start any process** — call `attachE2eSupabase` and `startBackend`
 * as needed for the scenario.
 */
export async function createE2eRun(t: TestContext, options: CreateE2eRunOptions): Promise<E2eRun> {
  assertE2eRunnerPrepared(options.id);
  const cleanup = createCleanupStack();
  const rootDir = repoRoot(import.meta.url);
  const profileEnv = loadE2eProfileEnv("e2e");

  const requiredEnv = options.requiredEnv ?? [];
  if (requiredEnv.length > 0) {
    const resolvedEnv = await resolveTestingLifecycleEnvFromDb({
      env: process.env,
      requiredEnv,
      profile: "e2e",
      profileEnv,
    });
    const hydration = hydrateTestingLifecycleEnv(process.env, resolvedEnv);
    if (hydration.hydrated.length > 0) {
      console.log(
        `[e2e:${options.id}] hydrated ${hydration.hydrated.join(", ")} from the prepared E2E DB; the e2e profile .env was not modified.`,
      );
    }
    const missing = requiredEnv.filter((key) => !process.env[key]?.trim());
    if (missing.length > 0) {
      throw new Error(`[e2e:${options.id}] ${missingRequiredEnvMessage({ missing, hydration })}`);
    }
  }

  const keepRunDir = options.keepRunDir ?? process.env.E2E_KEEP_RUN_DIR !== "0";
  const context = await prepareE2eRunContext({
    rootDir,
    label: options.id,
    agentId: options.agentId,
    keepRunDir,
  });

  applyContextEnv(context);

  if (options.clearDiagnosticLogs) clearDiagnosticLogs(context.runtimeRoot);

  console.log(`[e2e:${options.id}] runId=${context.runId}`);
  console.log(`[e2e:${options.id}] runDir=${context.runDir}`);
  console.log(`[e2e:${options.id}] runtimeRoot=${context.runtimeRoot}`);

  const run: E2eRun = {
    id: options.id,
    rootDir,
    runId: context.runId,
    runDir: context.runDir,
    runtimeRoot: context.runtimeRoot,
    stateDir: context.stateDir,
    agentId: context.agentId,
    peerId: options.peerId ?? E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
    diagnosticsStartMs: Date.now(),
    cleanup,
    profileEnv,
  };

  t.after(async () => {
    let cleanupOk = true;
    try {
      await cleanup.run();
    } catch (error) {
      cleanupOk = false;
      throw error;
    } finally {
      cleanupE2eRunContext(context, cleanupOk);
    }
  });

  return run;
}

export function createMarker(prefix: string): string {
  return `${prefix}-${newFlowRunToken()}`;
}

export function enableE2eTestChannel(run: E2eRun): void {
  void run;
}

export function allowE2eAgentTools(run: E2eRun, toolIds: readonly string[]): void {
  void run;
  void toolIds;
}

export { DEFAULT_E2E_AGENT_ID };
