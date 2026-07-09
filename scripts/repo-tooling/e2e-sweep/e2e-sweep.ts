import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "@ai-assistants/repo-layout";
import { runBoundedCommand } from "../bounded-command.js";
import {
  extractRunDir,
  parseE2eSweepScopeArgs,
  reportDirForExecutionId,
} from "./e2e-sweep-scope.js";
import { exitIfHelp, resolvePassthroughArgs, writeSweepManifest } from "./e2e-sweep-shared.js";

const SCRIPT_NAME = "e2e-sweep.ts";
const E2E_SWEEP_TEST_TIMEOUT_MS = 15 * 60 * 1_000;

function usage(): string {
  return [
    "Usage:",
    "  npm run e2e:sweep -- scenarios --limit=5",
    "  npm run e2e:sweep -- others --fail-fast",
    "  npm run e2e:sweep -- tests/e2e/scenarios/ts-hv-001-file-intake-e2e.ts",
    "",
    "Runs E2E files one at a time via npm run e2e, with per-test logs and results.tsv.",
    "",
    "Options:",
    "  --limit=N           Run only the first N tests after resolving suite/paths",
    "  --fail-fast         Stop after the first failing test (remaining rows marked not-run)",
    "  --execution-id=ID   Report directory name under tmp/e2e/reports/",
    "",
    "Writes:",
    "  tmp/e2e/reports/<execution-id>/results.tsv",
    "  tmp/e2e/reports/<execution-id>/logs/<basename>.log",
    "  tmp/e2e/reports/<execution-id>/sweep.log",
  ].join("\n");
}

function appendLine(filePath: string, line: string): void {
  fs.appendFileSync(filePath, `${line}\n`);
}

function checkDiskSpaceGb(dirPath: string): number {
  try {
    const stats = fs.statfsSync(dirPath);
    const freeBytes = stats.bfree * stats.bsize;
    return freeBytes / (1024 * 1024 * 1024);
  } catch {
    return 999;
  }
}

function markRemainingNotRun(
  resultsPath: string,
  testPaths: readonly string[],
  fromIndex: number,
): number {
  let notRunCount = 0;
  for (let index = fromIndex; index < testPaths.length; index += 1) {
    appendLine(resultsPath, ["not-run", testPaths[index]!, "", "0", "none", ""].join("\t"));
    notRunCount += 1;
  }
  return notRunCount;
}

function markRemainingBlocked(
  resultsPath: string,
  testPaths: readonly string[],
  fromIndex: number,
  reason: string,
): number {
  let blockedCount = 0;
  for (let index = fromIndex; index < testPaths.length; index += 1) {
    appendLine(resultsPath, ["blocked", testPaths[index]!, "", "0", "none", reason].join("\t"));
    blockedCount += 1;
  }
  return blockedCount;
}

function finishSweepEarly(input: {
  reportDir: string;
  root: string;
  executionId: string;
  resultsPath: string;
  testPaths: readonly string[];
  fromIndex: number;
  passCount: number;
  failCount: number;
  blockedCount: number;
  total: number;
  sweepLogPath: string;
  reason: string;
  markRemainingAs?: "not-run" | "blocked";
}): never {
  console.error(`\n[sweep] ${input.reason}`);
  appendLine(input.sweepLogPath, `[sweep] ${input.reason}`);
  const remainingBlocked =
    input.markRemainingAs === "blocked"
      ? markRemainingBlocked(input.resultsPath, input.testPaths, input.fromIndex, input.reason)
      : 0;
  const notRunCount =
    input.markRemainingAs === "blocked"
      ? 0
      : markRemainingNotRun(input.resultsPath, input.testPaths, input.fromIndex);
  writeSweepManifest(input.reportDir, input.root, {
    executionId: input.executionId,
    passCount: input.passCount,
    failCount: input.failCount,
    blockedCount: input.blockedCount + remainingBlocked,
    notRunCount,
    total: input.total,
  });
  console.log(
    `\n[sweep] complete: ${input.passCount} passed, ${input.failCount} failed, ${input.blockedCount + remainingBlocked} blocked, ${notRunCount} not-run`,
  );
  console.log(`[sweep] report directory: ${input.reportDir}`);
  process.exit(1);
}

function main(): void {
  const root = repoRoot(import.meta.url);
  const rawArgs = resolvePassthroughArgs(import.meta.url, SCRIPT_NAME);
  exitIfHelp(rawArgs, usage());

  const scope = parseE2eSweepScopeArgs(rawArgs, import.meta.url);
  const { executionId, testPaths, failFast } = scope;
  const reportDir = reportDirForExecutionId(executionId, import.meta.url);
  const logsDir = path.join(reportDir, "logs");
  const failuresDir = path.join(reportDir, "failures");
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(failuresDir, { recursive: true });

  const resultsPath = path.join(reportDir, "results.tsv");
  const sweepLogPath = path.join(reportDir, "sweep.log");
  fs.writeFileSync(resultsPath, "status\tfile\texit_code\tduration_s\trun_dir\treason\n");

  const disk = runBoundedCommand("df", ["-h", "."], {
    cwd: root,
    timeoutMs: 5_000,
    maxBuffer: 1_000_000,
  });
  appendLine(
    sweepLogPath,
    `[sweep] execution-id=${executionId} tests=${testPaths.length} fail_fast=${failFast}`,
  );
  if (disk.stdout) {
    appendLine(sweepLogPath, `[sweep] disk:\n${disk.stdout.trim()}`);
  }

  const freeGb = checkDiskSpaceGb(root);
  if (freeGb < 1.0) {
    const errMsg = `CRITICAL: Low disk space (${freeGb.toFixed(2)} GB free). Stopping before sweep.`;
    console.error(`\n[sweep] ${errMsg}`);
    appendLine(sweepLogPath, `[sweep] ${errMsg}`);
    markRemainingNotRun(resultsPath, testPaths, 0);
    writeSweepManifest(reportDir, root, {
      executionId,
      passCount: 0,
      failCount: 0,
      blockedCount: 0,
      notRunCount: testPaths.length,
      total: testPaths.length,
    });
    console.log(`\n[sweep] complete: 0 passed, 0 failed, ${testPaths.length} not-run`);
    process.exit(1);
  }

  let passCount = 0;
  let failCount = 0;
  let blockedCount = 0;
  const total = testPaths.length;

  for (let index = 0; index < testPaths.length; index += 1) {
    const testPath = testPaths[index]!;
    const basename = path.basename(testPath, ".ts");
    const logPath = path.join(logsDir, `${basename}.log`);
    const label = `[${index + 1}/${total}] ${testPath}`;
    console.log(`\n===== ${label} =====`);
    appendLine(sweepLogPath, `===== ${label} =====`);

    const startMs = Date.now();
    const result = runBoundedCommand("npm", ["run", "e2e", "--", testPath], {
      cwd: root,
      maxBuffer: 64 * 1024 * 1024,
      timeoutMs: E2E_SWEEP_TEST_TIMEOUT_MS,
    });
    const durationS = Math.round((Date.now() - startMs) / 1000);
    const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    fs.writeFileSync(logPath, combined);

    const exitCode = result.status ?? 1;
    const status =
      exitCode === 0 && !result.timedOut ? "pass" : result.timedOut ? "blocked" : "fail";
    if (status === "pass") {
      passCount += 1;
    } else if (status === "blocked") {
      blockedCount += 1;
    } else {
      failCount += 1;
    }
    const runDir = extractRunDir(combined, root);
    appendLine(
      resultsPath,
      [
        status,
        testPath,
        String(exitCode),
        String(durationS),
        runDir || "none",
        result.timedOut ? "Timed out while running npm run e2e." : "",
      ].join("\t"),
    );
    appendLine(
      sweepLogPath,
      `===== RESULT: ${status} exit=${exitCode} duration=${durationS}s run_dir=${runDir || "none"} =====`,
    );

    const isSystemic =
      status === "blocked" ||
      (exitCode !== 0 &&
        (combined.includes("ENOSPC") ||
          combined.includes("No space left on device") ||
          combined.includes("missing repo-wide prerequisite") ||
          combined.includes("Supabase CLI failed") ||
          combined.includes("failed to inspect container health")));

    if (isSystemic) {
      finishSweepEarly({
        reportDir,
        root,
        executionId,
        resultsPath,
        testPaths,
        fromIndex: index + 1,
        passCount,
        failCount,
        blockedCount,
        total,
        sweepLogPath,
        reason: "Systemic environment blocker detected. Stopping sweep early.",
        markRemainingAs: status === "blocked" ? "blocked" : "not-run",
      });
    }

    if (failFast && status === "fail") {
      finishSweepEarly({
        reportDir,
        root,
        executionId,
        resultsPath,
        testPaths,
        fromIndex: index + 1,
        passCount,
        failCount,
        blockedCount,
        total,
        sweepLogPath,
        reason: "Fail-fast: stopping after first failing test.",
      });
    }
  }

  writeSweepManifest(reportDir, root, {
    executionId,
    passCount,
    failCount,
    blockedCount,
    notRunCount: 0,
    total,
  });
  console.log(
    `\n[sweep] complete: ${passCount} passed, ${failCount} failed, ${blockedCount} blocked`,
  );
  console.log(`[sweep] report directory: ${reportDir}`);
  process.exit(failCount > 0 || blockedCount > 0 ? 1 : 0);
}

main();
