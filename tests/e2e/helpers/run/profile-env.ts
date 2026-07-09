import { existsSync } from "node:fs";
import { profileEnvPath, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { readDotEnvFile } from "@ai-assistants/workspace-shared";

/**
 * Env keys whose values are derived from the run context (not the profile .env).
 * These are filtered out before we passthrough profile env into process.env.
 */
const RUNNER_CONTROLLED_ENV_KEYS: readonly string[] = [
  "BACKEND_PORT",
  "AI_ASSISTANTS_BACKEND_MACHINE_TOKEN",
  "AI_ASSISTANTS_BACKEND_URL",
  "AI_ASSISTANTS_E2E_AGENT",
  "AI_ASSISTANTS_E2E_RUN_DIR",
  "AI_ASSISTANTS_E2E_RUN_ID",
  "AI_ASSISTANTS_E2E_RUNTIME_ROOT",
  "AI_ASSISTANTS_RUNTIME_DIR",
];

const RUNNER_CONTROLLED_ENV_KEY_SET = new Set(RUNNER_CONTROLLED_ENV_KEYS);

/**
 * Env keys that must come from the selected E2E profile, never from the user's shell/dev profile.
 */
const ISOLATION_SENSITIVE_ENV_KEYS = [
  "SUPABASE_LOCAL_WORKDIR",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "NANGO_SECRET_KEY",
  "NANGO_WEBHOOK_SIGNING_SECRET",
  "BACKEND_PUBLIC_URL",
  "CONNECT_PUBLIC_URL",
  "SUPABASE_PUBLIC_URL",
  "OAUTH_PUBLIC_URL",
  "GMAIL_PUBSUB_TOPIC_NAME",
  "MONDAY_SIGNING_SECRET",
  "BOLDSIGN_WEBHOOK_SIGNING_SECRET",
  "BOLDSIGN_WEBHOOK_SIGNING_SECRET_OLD",
] as const;

const ISOLATION_SENSITIVE_ENV_KEY_SET = new Set<string>(ISOLATION_SENSITIVE_ENV_KEYS);

/**
 * Loads a profile `.env`, mirrors non-runner keys into `process.env`, and returns a snapshot of the
 * loaded values for downstream consumers. E2E isolation-sensitive keys intentionally override shell
 * values so a stale dev shell cannot point tests at dev Supabase or dev Nango.
 */
export function loadE2eProfileEnv(
  profile: RuntimeProfile = "e2e",
): Readonly<Record<string, string>> {
  const envPath =
    profile === "e2e" && process.env.AI_ASSISTANTS_E2E_PROFILE_ENV_PATH?.trim()
      ? process.env.AI_ASSISTANTS_E2E_PROFILE_ENV_PATH.trim()
      : profileEnvPath(profile);
  const loaded = existsSync(envPath) ? readDotEnvFile(envPath) : {};
  for (const [key, value] of Object.entries(loaded)) {
    if (RUNNER_CONTROLLED_ENV_KEY_SET.has(key)) continue;
    if (profile === "e2e" && ISOLATION_SENSITIVE_ENV_KEY_SET.has(key)) {
      process.env[key] = value;
      continue;
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return loaded;
}
