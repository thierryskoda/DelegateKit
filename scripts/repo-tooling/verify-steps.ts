import { execFileSync } from "node:child_process";
import { repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import {
  runGuardBackendPrompt,
  runGuardKnip,
  runGuardRuntime,
  runGuardSemanticAll,
  runGuardSource,
  runGuardSupabaseControlDb,
} from "./guards/guard-steps";
import { seedMissingClientProfilesForRuntime } from "../clients/seed-missing-cli";
import { startLocalSupabase } from "../profiles/start-local-supabase";

function runNpmScript(script: string, scriptArgs: readonly string[] = [], env = process.env): void {
  execFileSync("npm", ["run", script, ...(scriptArgs.length ? ["--", ...scriptArgs] : [])], {
    cwd: repoRoot(import.meta.url),
    stdio: "inherit",
    env,
  });
}

function runTypecheck(env: NodeJS.ProcessEnv = process.env): void {
  runNpmScript("typecheck", [], env);
}

function runTestScripts(env: NodeJS.ProcessEnv = process.env): void {
  runNpmScript("test", [], env);
}

function runBuildPackages(env: NodeJS.ProcessEnv = process.env): void {
  execFileSync("npm", ["run", "build:packages"], {
    cwd: repoRoot(import.meta.url),
    stdio: "inherit",
    env,
  });
}

async function withProcessEnv<T>(env: NodeJS.ProcessEnv, run: () => Promise<T>): Promise<T> {
  const merged = { ...process.env, ...env };
  const previous = process.env;
  process.env = merged;
  try {
    return await run();
  } finally {
    process.env = previous;
  }
}

export async function runVerifySource(
  env: NodeJS.ProcessEnv = process.env,
  profile: RuntimeProfile = "dev",
): Promise<void> {
  await withProcessEnv(env, async () => {
    await runGuardSource();
    await runGuardKnip({ judge: true });
    await runGuardSemanticAll(profile);
    runTypecheck(env);
    runTestScripts(env);
    runBuildPackages(env);
  });
}

export async function runVerifySourceFast(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  await withProcessEnv(env, async () => {
    await runGuardSource();
    await runGuardKnip({ judge: false });
    runTypecheck(env);
    runTestScripts(env);
  });
}

export async function runVerifyRuntime(profile: RuntimeProfile = "dev"): Promise<void> {
  await startLocalSupabase(profile, false);
  await runGuardSupabaseControlDb(profile);
  await seedMissingClientProfilesForRuntime(profile);
  await runGuardRuntime(profile);
  await runGuardBackendPrompt(profile);
}

export async function runVerifyAll(
  env: NodeJS.ProcessEnv = process.env,
  profile: RuntimeProfile = "dev",
): Promise<void> {
  await runVerifySource(env, profile);
  await runVerifyRuntime(profile);
}
