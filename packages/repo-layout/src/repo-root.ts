import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REPO_FILES } from "./layout";

/** Root `package.json` name — walk-up stops here. */
const WORKSPACE_PKG_NAME = "delegatekit";

function packageName(value: unknown): string | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? typeof (value as { name?: unknown }).name === "string"
      ? (value as { name: string }).name
      : undefined
    : undefined;
}

/**
 * Repo root for any script under `scripts/` at any nesting depth
 * (e.g. `scripts/profiles/build.ts`, `capabilities/monday/e2e/monday-tools.ts`).
 */
export function repoRoot(importMetaUrl: string): string {
  let dir = path.dirname(fileURLToPath(importMetaUrl));
  for (let i = 0; i < 24; i += 1) {
    const pkgPath = path.join(dir, REPO_FILES.packageJson);
    if (existsSync(pkgPath)) {
      try {
        if (packageName(JSON.parse(readFileSync(pkgPath, "utf8")) as unknown) === WORKSPACE_PKG_NAME)
          return dir;
      } catch {
        /* non-JSON or unreadable — keep walking */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not resolve repo root (expected package.json name "${WORKSPACE_PKG_NAME}") from ${importMetaUrl}`,
  );
}
