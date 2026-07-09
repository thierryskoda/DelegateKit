import path from "node:path";
import { repoRoot } from "@ai-assistants/repo-layout";
import {
  collectAllE2eFiles,
  collectE2eFilesInDir,
  E2E_SUITE_DIRS,
  isE2eSuiteName,
} from "../e2e-test-scope";

export type E2eSweepScope = {
  executionId: string;
  testPaths: string[];
  limit?: number;
  failFast: boolean;
};

export function extractRunDir(log: string, root: string): string {
  const matches = [...log.matchAll(/(?:runDir=|Keeping run dir for inspection:\s+)([^\s]+)/g)];
  const last = matches.at(-1)?.[1];
  if (!last) return "";
  return path.isAbsolute(last) ? last : path.join(root, last);
}

export function parseE2eSweepScopeArgs(args: readonly string[], metaUrl: string): E2eSweepScope {
  const root = repoRoot(metaUrl);
  let executionId: string | undefined;
  let limit: number | undefined;
  let failFast = false;
  const testPaths: string[] = [];

  for (const arg of args) {
    if (arg === "--fail-fast") {
      failFast = true;
      continue;
    }
    if (arg.startsWith("--execution-id=")) {
      executionId = arg.slice("--execution-id=".length).trim();
      continue;
    }
    if (arg === "--execution-id") {
      throw new Error("--execution-id requires a value.");
    }
    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--limit must be a positive integer.");
      }
      limit = value;
      continue;
    }
    if (arg === "--limit") {
      throw new Error("--limit requires a value (e.g. --limit=5).");
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    testPaths.push(arg);
  }

  const scope = testPaths[0];
  let resolved =
    scope && isE2eSuiteName(scope)
      ? collectE2eFilesInDir(E2E_SUITE_DIRS[scope], root)
      : testPaths.length > 0
        ? testPaths.filter((p) => p.endsWith("-e2e.ts"))
        : collectAllE2eFiles(root);

  resolved = resolved.sort();
  if (limit !== undefined) {
    resolved = resolved.slice(0, limit);
  }

  const stamp = new Date();
  const defaultId = [
    stamp.getFullYear(),
    String(stamp.getMonth() + 1).padStart(2, "0"),
    String(stamp.getDate()).padStart(2, "0"),
    String(stamp.getHours()).padStart(2, "0"),
    String(stamp.getMinutes()).padStart(2, "0"),
    scope && isE2eSuiteName(scope) ? scope : "e2e",
  ].join("");

  if (resolved.length === 0) {
    throw new Error("No E2E test files matched. Pass a suite name or explicit test path.");
  }

  return {
    executionId: executionId ?? defaultId,
    testPaths: resolved,
    limit,
    failFast,
  };
}

export function reportDirForExecutionId(executionId: string, metaUrl: string): string {
  return path.join(repoRoot(metaUrl), "tmp", "e2e", "reports", executionId);
}
