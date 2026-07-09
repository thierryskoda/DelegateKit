import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { configureSupabaseServiceClient } from "@ai-assistants/control-db";
import { loadProfileDotEnv } from "@ai-assistants/workspace-shared";
import {
  getBackendApiEnv,
  getBackendWorkerEnv,
  type BackendApiEnv,
  type BackendWorkerEnv,
} from "@ai-assistants/workspace-shared/env";

/**
 * Loads the assistant runtime profile `.env` (`~/.ai-assistants-<profile>/.env`, e.g. via `profiles/dev` symlink)
 * then validates required vars. Does not override variables already set in the shell.
 * Profile: `AI_ASSISTANTS_PROFILE` if set and valid, otherwise `dev` for local runs.
 */
export function resolveBackendProfile(): RuntimeProfile {
  const raw = process.env.AI_ASSISTANTS_PROFILE?.trim();
  if (!raw) return "dev";
  assertRuntimeProfile(raw);
  return raw;
}

function loadBackendEnv(): void {
  loadProfileDotEnv(resolveBackendProfile());
}

export function initBackendApiEnv(): BackendApiEnv {
  loadBackendEnv();
  const env = getBackendApiEnv();
  configureSupabaseServiceClient({
    url: env.supabaseUrl,
    serviceRoleKey: env.supabaseServiceRoleKey,
  });
  return env;
}

export function initBackendWorkerEnv(): BackendWorkerEnv {
  loadBackendEnv();
  const env = getBackendWorkerEnv();
  configureSupabaseServiceClient({
    url: env.supabaseUrl,
    serviceRoleKey: env.supabaseServiceRoleKey,
  });
  return env;
}
