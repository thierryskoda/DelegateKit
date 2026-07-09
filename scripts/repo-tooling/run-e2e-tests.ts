import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildAndValidateProfile } from "../profiles/deploy";
import { runNangoProfileBind } from "../integrations/bind-profile-nango";
import { createSupabaseServiceClient } from "@ai-assistants/control-db";
import { envForE2eLaneRuntime, materializeE2eLaneRuntime } from "./e2e-lanes";
import { acquireE2eLaneLease, type E2eLaneLease } from "./e2e-lane-state";
import { releaseLeasedE2eLaneAfterRun, resetLeasedE2eLaneBeforeRun } from "./e2e-lane-prepare";
import { collectE2eInfrastructureDiagnostics } from "./e2e-infra-diagnostics";
import { enableEveryTestingProviderSandbox } from "./e2e-provider-sandbox";
import {
  E2E_DEFAULT_PATTERN,
  e2eSuitePattern,
  isE2eSuiteName,
  resolveE2eSetupScope,
  type E2eSetupScope,
} from "./e2e-test-scope";

const SCRIPT_NAME = "run-e2e-tests.ts";
const E2E_NODE_TEST_TIMEOUT_MS = 12 * 60_000;
const E2E_NODE_TEST_KILL_GRACE_MS = 10_000;

type E2eTiming = {
  label: string;
  durationMs: number;
};

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

async function timedStep<T>(
  timings: E2eTiming[],
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    const durationMs = Date.now() - startedAt;
    timings.push({ label, durationMs });
    console.log(`[e2e:timing] ${label} ${formatDuration(durationMs)}`);
  }
}

function printTimingSummary(input: { timings: readonly E2eTiming[]; totalMs: number }): void {
  console.log(
    JSON.stringify(
      {
        ok: true,
        kind: "e2e.timing",
        totalMs: input.totalMs,
        phases: input.timings,
      },
      null,
      2,
    ),
  );
}

function usage(): string {
  return [
    "Usage:",
    "  npm run e2e",
    "  npm run e2e -- capabilities",
    "  npm run e2e -- scenarios",
    "  npm run e2e -- connect",
    "  npm run e2e -- others",
    "  npm run e2e -- tests/e2e/<category>/<name>-e2e.ts",
    "  npm run e2e -- tests/e2e/<category>/<name>-e2e.ts --no-wait",
  ].join("\n");
}

function extractNoWait(args: readonly string[]): { args: string[]; noWait: boolean } {
  return {
    args: args.filter((arg) => arg !== "--no-wait"),
    noWait: args.includes("--no-wait"),
  };
}

async function prepareE2eCommand(
  lease: E2eLaneLease,
  setupScope: E2eSetupScope,
  timings: E2eTiming[],
): Promise<void> {
  const { lane } = lease;
  materializeE2eLaneRuntime(lane);
  console.log(`[e2e] Using fixed E2E lane: ${lane.id}`);
  console.log(`[e2e] Supabase project: ${lane.projectId}`);
  Object.assign(process.env, envForE2eLaneRuntime(lane));
  console.log(`[e2e] Supabase API: ${process.env.SUPABASE_URL ?? "<unknown>"}`);
  console.log(`[e2e] resetting leased E2E lane before test execution...`);
  const sandboxOnly = setupScope.kind === "sandbox-only";
  if (sandboxOnly) {
    console.log("[e2e] sandbox-only scope: preparing testing provider sandbox accounts.");
  }
  await timedStep(timings, "e2e.lane_pre_run_reset", () =>
    resetLeasedE2eLaneBeforeRun(lease, {
      afterResetBeforeBuild: sandboxOnly
        ? async () => {
            const result = await enableEveryTestingProviderSandbox(createSupabaseServiceClient());
            console.log(
              `[e2e] testing provider sandbox ready: ${result.linksUpdated} capability account link(s).`,
            );
          }
        : undefined,
    }),
  );
  if (setupScope.kind === "live-bindings") {
    const filterArgs = setupScope.bindings.flatMap((binding) => [
      `--capability=${binding.capabilitySlug}`,
      `--provider=${binding.provider}`,
    ]);
    const scopeLabel =
      setupScope.bindings.length > 0
        ? setupScope.bindings.map((b) => `${b.capabilitySlug}/${b.provider}`).join(", ")
        : "all checked-in e2e bindings";
    console.log(`[e2e] applying checked-in e2e Nango bindings: ${scopeLabel}`);
    await timedStep(timings, "e2e.nango_bind_apply", () =>
      runNangoProfileBind(["apply", "--profile=e2e", "--no-wait-for-setup", ...filterArgs]),
    );
  } else {
    console.log("[e2e] sandbox-only scope: skipping global live Nango binding.");
  }
  console.log("[e2e] validating e2e backend profile...");
  await timedStep(timings, "e2e.profile_build_validate", () =>
    buildAndValidateProfile({
      profile: "e2e",
      runtimeRoot: lane.runtimeRoot,
      env: envForE2eLaneRuntime(lane),
    }),
  );
}

function resolvePassthroughArgs(): string[] {
  const argv = process.argv;
  const scriptPath = fileURLToPath(import.meta.url);

  let scriptIndex = argv.findIndex((arg) => arg.replace(/\\/g, "/").endsWith(SCRIPT_NAME));
  if (scriptIndex < 0) {
    scriptIndex = argv.findIndex((arg) => arg === scriptPath);
  }

  if (scriptIndex < 0) {
    console.error("run-e2e-tests: could not locate script argv entry; pass test paths explicitly.");
    return [];
  }

  return argv.slice(scriptIndex + 1);
}

function resolvePatterns(args: readonly string[]): string[] {
  const [first, ...rest] = args;
  if (first && isE2eSuiteName(first)) return rest.length > 0 ? rest : [e2eSuitePattern(first)];
  return args.length > 0 ? [...args] : [E2E_DEFAULT_PATTERN];
}

async function runNodeTest(
  patterns: readonly string[],
  timings: E2eTiming[],
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; timedOut: boolean }> {
  const startedAt = Date.now();
  return await new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let killTimer: NodeJS.Timeout | null = null;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--test", "--test-concurrency=1", ...patterns],
      {
        stdio: "inherit",
        shell: false,
        env: { ...env, AI_ASSISTANTS_E2E_RUNNER_PREPARED: "1" },
      },
    );
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      console.error(
        `[e2e] node --test timed out after ${formatDuration(E2E_NODE_TEST_TIMEOUT_MS)}; terminating child process ${child.pid ?? "<unknown>"}.`,
      );
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, E2E_NODE_TEST_KILL_GRACE_MS);
      killTimer.unref();
    }, E2E_NODE_TEST_TIMEOUT_MS);
    timeoutTimer.unref();

    child.on("error", (error) => {
      settled = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      settled = true;
      clearTimeout(timeoutTimer);
      if (killTimer) clearTimeout(killTimer);
      const durationMs = Date.now() - startedAt;
      timings.push({ label: "node_test", durationMs });
      console.log(`[e2e:timing] node_test ${formatDuration(durationMs)}`);
      if (timedOut) {
        resolve({ code: 124, timedOut: true });
        return;
      }
      if (signal) {
        process.kill(process.pid, signal as NodeJS.Signals);
        return;
      }
      resolve({ code: code ?? 1, timedOut: false });
    });
  });
}

async function releaseRuntimeLease(lease: E2eLaneLease): Promise<void> {
  await releaseLeasedE2eLaneAfterRun(lease);
  console.log(`[e2e] Released E2E lane: ${lease.lane.id}`);
}

function collectDiagnosticsForLease(input: {
  lease: E2eLaneLease;
  phase: "setup-failure" | "test-timeout";
}): void {
  try {
    const diagnosticsPath = collectE2eInfrastructureDiagnostics({
      runtime: input.lease.runtime,
      phase: input.phase,
    });
    console.error(`[e2e] Infrastructure diagnostics: ${diagnosticsPath}`);
  } catch (diagnosticsError) {
    console.warn(
      `[e2e] Failed to collect infrastructure diagnostics: ${
        diagnosticsError instanceof Error ? diagnosticsError.message : String(diagnosticsError)
      }`,
    );
  }
}

async function quarantineRuntimeLease(input: {
  lease: E2eLaneLease;
  phase: "setup-failure" | "test-timeout";
  reason: string;
  logMessage: string;
}): Promise<void> {
  collectDiagnosticsForLease({ lease: input.lease, phase: input.phase });
  await input.lease.quarantine(input.reason);
  console.warn(`${input.logMessage}: ${input.lease.lane.id}`);
}

async function main(): Promise<void> {
  const passthrough = resolvePassthroughArgs();
  if (passthrough.includes("--help") || passthrough.includes("-h")) {
    console.log(usage());
    return;
  }
  const { args: commandArgs, noWait } = extractNoWait(passthrough);
  const patterns = resolvePatterns(commandArgs);
  const setupScope = resolveE2eSetupScope(patterns);
  const timings: E2eTiming[] = [];
  const commandStartedAt = Date.now();
  let lease: E2eLaneLease | null = null;
  let setupCompleted = false;
  let childTimedOut = false;
  let code = 1;
  try {
    lease = await timedStep(timings, "e2e.lane_lease", () =>
      acquireE2eLaneLease({ wait: !noWait }),
    );
    materializeE2eLaneRuntime(lease.lane);
    Object.assign(process.env, envForE2eLaneRuntime(lease.lane));
    await prepareE2eCommand(lease, setupScope, timings);
    setupCompleted = true;
    const testResult = await runNodeTest(patterns, timings, envForE2eLaneRuntime(lease.lane));
    code = testResult.code;
    childTimedOut = testResult.timedOut;
  } finally {
    if (lease) {
      const runtimeLease = lease;
      await timedStep(timings, "e2e.runtime_release", async () => {
        if (!setupCompleted) {
          await quarantineRuntimeLease({
            lease: runtimeLease,
            phase: "setup-failure",
            reason: "E2E setup failed before test execution.",
            logMessage: "[e2e] Quarantined lane after setup failure",
          });
          return;
        }
        if (childTimedOut) {
          await quarantineRuntimeLease({
            lease: runtimeLease,
            phase: "test-timeout",
            reason: "E2E child test process timed out.",
            logMessage: "[e2e] Quarantined lane after child test timeout",
          });
          return;
        }
        await releaseRuntimeLease(runtimeLease);
      });
    }
    printTimingSummary({ timings, totalMs: Date.now() - commandStartedAt });
  }
  process.exitCode = code;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
