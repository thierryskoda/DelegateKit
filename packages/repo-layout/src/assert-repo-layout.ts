import { existsSync, statSync } from "node:fs";
import { packageJsonPath } from "./layout";

/**
 * Ensures stable repo-root files referenced by layout helpers exist.
 * Does not require generated files or runtime-only logs.
 */
export function assertRepoLayoutPaths(repoRoot: string): void {
  const errors: string[] = [];

  const requiredFiles: readonly [label: string, abs: string][] = [
    ["package.json", packageJsonPath(repoRoot)],
  ];

  for (const [label, abs] of requiredFiles) {
    if (!existsSync(abs)) {
      errors.push(`missing file (${label}): ${abs}`);
    } else if (!statSync(abs).isFile()) {
      errors.push(`path is not a file (${label}): ${abs}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Repo layout check failed (${errors.length} issue(s)). Restore or fix paths:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }
}
