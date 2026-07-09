import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { profileRuntimeDir } from "@ai-assistants/repo-layout";
import { allocateFreePort } from "./e2e-run-ports";
import { AGENT_ID_RE, RUN_ID_RE, generatedRunId, sanitizeId } from "./e2e-run-ports";
import {
  cloneE2eRuntimeState,
  ensureRequiredAgentRuntimeDirs,
  removeEmptyRootRuntimeDirs,
  removePath,
} from "./e2e-runtime-state";
import { DEFAULT_E2E_AGENT_ID } from "./workspace";

export { allocateFreePort };

export type PrepareE2eRunInput = {
  rootDir: string;
  /** Stable label for logs and run-id prefix; usually the test scenario id. */
  label: string;
  /** Defaults to DEFAULT_E2E_AGENT_ID ("testing"). */
  agentId?: string;
  /** Override the generated runId; useful for `--keep-run-dir` workflows. */
  runId?: string;
  /** Keep run dir after teardown for inspection. Default true via createE2eRun. */
  keepRunDir?: boolean;
};

export type E2eRunContext = {
  rootDir: string;
  runId: string;
  runDir: string;
  runtimeRoot: string;
  stateDir: string;
  agentId: string;
  keepRunDir: boolean;
};

function preparedE2eRuntimeRoot(): string {
  const configured = process.env.AI_ASSISTANTS_E2E_PROFILE_RUNTIME_ROOT?.trim();
  return configured || profileRuntimeDir("e2e");
}

export async function prepareE2eRunContext(input: PrepareE2eRunInput): Promise<E2eRunContext> {
  const agentId = sanitizeId(input.agentId ?? DEFAULT_E2E_AGENT_ID, "E2E agent id", AGENT_ID_RE);
  const runId = sanitizeId(input.runId ?? generatedRunId(input.label), "E2E run id", RUN_ID_RE);
  const runDir = path.join(input.rootDir, "tmp", "e2e", "runs", runId);
  const runtimeRoot = runDir;
  const stateDir = runDir;

  if (existsSync(runDir)) {
    throw new Error(
      `E2E run dir already exists: ${runDir}. Choose a new runId or remove the stale run after inspection.`,
    );
  }
  mkdirSync(runDir, { recursive: true });

  cloneE2eRuntimeState(preparedE2eRuntimeRoot(), runDir);
  ensureRequiredAgentRuntimeDirs(runDir, agentId);

  return {
    rootDir: input.rootDir,
    runId,
    runDir,
    runtimeRoot,
    stateDir,
    agentId,
    keepRunDir: input.keepRunDir === true,
  };
}

export function cleanupE2eRunContext(context: E2eRunContext, succeeded: boolean): void {
  removeEmptyRootRuntimeDirs(context.rootDir);
  if (!succeeded || context.keepRunDir) {
    console.error(`[e2e] Keeping run dir for inspection: ${context.runDir}`);
    return;
  }
  removePath(context.runDir);
}
