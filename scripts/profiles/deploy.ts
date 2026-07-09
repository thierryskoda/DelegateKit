import { createSupabaseServiceClient } from "@ai-assistants/control-db";
import type { RuntimeProfile } from "@ai-assistants/repo-layout";
import { validateProfileRuntime } from "../repo-tooling/build/profile-runtime-validation";
import {
  envForProfile,
  ensureProfileRuntimeDirs,
  runtimeRootForProfile,
} from "./profile";

function requiredEnvValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required to build and validate the selected profile.`);
  }
  return value;
}

export async function buildAndValidateProfile(input: {
  profile: RuntimeProfile;
  runtimeRoot?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const { profile, runtimeRoot } = input;
  if (!runtimeRoot) ensureProfileRuntimeDirs(profile);
  const env = input.env ?? envForProfile(profile);
  const db = input.env
    ? createSupabaseServiceClient({
        url: requiredEnvValue(env, "SUPABASE_URL"),
        serviceRoleKey: requiredEnvValue(env, "SUPABASE_SERVICE_ROLE_KEY"),
      })
    : undefined;

  await validateProfileRuntime({
    profile,
    ...(db ? { db } : {}),
  });

  const resolvedRuntimeRoot = runtimeRoot ?? runtimeRootForProfile(profile);
  env.AI_ASSISTANTS_RUNTIME_DIR = resolvedRuntimeRoot;
}

export async function deployProfile(input: { profile: RuntimeProfile }): Promise<void> {
  const { profile } = input;
  await buildAndValidateProfile(input);
  const env = envForProfile(profile);
  env.AI_ASSISTANTS_RUNTIME_DIR = runtimeRootForProfile(profile);

  console.log(`\n${profile} profile runtime inputs are valid.`);
}
