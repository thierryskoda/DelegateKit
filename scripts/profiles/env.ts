#!/usr/bin/env tsx

import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  RUNTIME_PROFILES,
  isLocalSupabaseManagedProfile,
  profileEnvPath,
  repoRoot,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import { validateEnvExampleFile, validateProfileEnvFile } from "@ai-assistants/workspace-shared";

const SOURCE_PROFILE_ENV_FILES = {
  dev: ".env.development",
  e2e: ".env.e2e",
  prod: undefined,
} as const satisfies Record<RuntimeProfile, string | undefined>;

function existingEnvFiles(): string[] {
  const root = repoRoot(import.meta.url);
  const files = [path.join(root, ".env.example")];

  for (const profile of RUNTIME_PROFILES) {
    if (!isLocalSupabaseManagedProfile(profile)) continue;
    const sourceFile = SOURCE_PROFILE_ENV_FILES[profile];
    if (sourceFile) files.push(path.join(root, sourceFile));
    files.push(profileEnvPath(profile));
  }

  return files.filter((filePath) => existsSync(filePath));
}

export function runProfileEnvCheck(): void {
  const root = repoRoot(import.meta.url);
  const examplePath = path.join(root, ".env.example");
  validateEnvExampleFile(examplePath);

  for (const filePath of existingEnvFiles()) {
    if (filePath === examplePath) continue;
    validateProfileEnvFile(filePath);
  }

  console.log("Env files match the profile env schema.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    runProfileEnvCheck();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
