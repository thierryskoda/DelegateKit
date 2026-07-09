import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  assertRuntimeProfile,
  profileEnvPath,
  profileRuntimeDir,
  repoRoot,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import { parseCli, profileEnvDefinitions, readDotEnvFile } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import {
  MANAGED_ENV_BLOCK_PATTERN,
  managedEnvBlockKey,
  managedEnvBlocks,
  writeSecretFileAtomic,
} from "./profile-env-blocks";

export type ProfileBuildOptions = {
  profile: RuntimeProfile;
};

type SyncProfileSourceEnvOptions = {
  homeDir?: string;
  repoRootPath?: string;
};

const PROFILE_SOURCE_ENV_FILES = {
  dev: ".env.development",
  e2e: ".env.e2e",
  prod: undefined,
} as const satisfies Record<RuntimeProfile, string | undefined>;

const E2E_ISOLATION_SENSITIVE_ENV_KEYS = new Set<string>([
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
] as const);

export function parseProfileArg(args: readonly string[]): RuntimeProfile {
  const parsed = parseCli(args, {
    options: { profile: { type: "string" } },
    schema: z.object({ profile: z.string().optional() }),
    strict: false,
    allowPositionals: true,
  });
  const raw = parsed.profile?.trim() || "dev";
  assertRuntimeProfile(raw);
  return raw;
}

export function parseProfileBuildOptions(args: readonly string[]): ProfileBuildOptions {
  const parsed = parseCli(args, {
    options: {
      profile: { type: "string" },
    },
    schema: z.object({
      profile: z.string().optional(),
    }),
  });
  const rawProfile = parsed.profile?.trim() || "dev";
  assertRuntimeProfile(rawProfile);
  return { profile: rawProfile };
}

export function runtimeRootForProfile(profile: RuntimeProfile): string {
  const preparedE2eRuntimeRoot = process.env.AI_ASSISTANTS_E2E_PROFILE_RUNTIME_ROOT?.trim();
  if (profile === "e2e" && preparedE2eRuntimeRoot) return preparedE2eRuntimeRoot;
  return profileRuntimeDir(profile);
}

const profileEnvKeySet = new Set(Object.keys(profileEnvDefinitions));

function keysAssignedInManagedBlock(block: string): Set<string> {
  const keys = new Set<string>();
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) keys.add(match[1]!);
  }
  return keys;
}

function managedBlockUsesOnlyProfileEnvKeys(block: string): boolean {
  const keys = keysAssignedInManagedBlock(block);
  if (keys.size === 0) return true;
  return [...keys].every((key) => profileEnvKeySet.has(key));
}

/** Drop stale managed blocks and bare assignments duplicated by managed blocks. */
export function compactProfileEnvFile(profile: RuntimeProfile): boolean {
  const envPath = profileEnvPath(profile);
  if (!existsSync(envPath)) return false;

  const text = readFileSync(envPath, "utf8");
  const blocks = managedEnvBlocks(text).filter(managedBlockUsesOnlyProfileEnvKeys);
  const keysInBlocks = new Set<string>();
  for (const block of blocks) {
    for (const key of keysAssignedInManagedBlock(block)) keysInBlocks.add(key);
  }

  const bodyWithoutBlocks = text.replace(MANAGED_ENV_BLOCK_PATTERN, "");
  const cleanedBodyLines = bodyWithoutBlocks.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return true;
    return !keysInBlocks.has(match[1]!);
  });

  const nextText = `${[cleanedBodyLines.join("\n").trimEnd(), ...blocks].filter(Boolean).join("\n\n")}\n`;
  if (nextText === text) return false;

  writeSecretFileAtomic(envPath, nextText);
  console.log(`Compacted duplicate profile env assignments in ${envPath}.`);
  return true;
}

function mergeSourceEnvWithExistingManagedBlocks(sourceText: string, existingText: string): string {
  const source = sourceText.trimEnd();
  const sourceManagedBlockKeys = new Set(managedEnvBlocks(source).map(managedEnvBlockKey));
  const preservedManagedBlocks = managedEnvBlocks(existingText).filter(
    (block) => !sourceManagedBlockKeys.has(managedEnvBlockKey(block)),
  );
  return [source, ...preservedManagedBlocks].filter(Boolean).join("\n\n");
}

export function profileSourceEnvPath(
  profile: RuntimeProfile,
  root = repoRoot(import.meta.url),
): string | undefined {
  const fileName = PROFILE_SOURCE_ENV_FILES[profile];
  return fileName ? path.join(root, fileName) : undefined;
}

export function syncProfileSourceEnv(
  profile: RuntimeProfile,
  options: SyncProfileSourceEnvOptions = {},
): boolean {
  const sourceEnvPath = profileSourceEnvPath(profile, options.repoRootPath);
  if (!sourceEnvPath || !existsSync(sourceEnvPath)) return false;

  const envPath = profileEnvPath(profile, options.homeDir);
  const sourceText = readFileSync(sourceEnvPath, "utf8");
  const existingText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const nextText = `${mergeSourceEnvWithExistingManagedBlocks(sourceText, existingText).trimEnd()}\n`;
  if (existingText === nextText) return false;

  writeSecretFileAtomic(envPath, nextText);
  console.log(`Synced ${sourceEnvPath} to ${envPath}.`);
  return true;
}

export function envForProfile(
  profile: RuntimeProfile,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const envPath =
    profile === "e2e" && baseEnv.AI_ASSISTANTS_E2E_PROFILE_ENV_PATH?.trim()
      ? baseEnv.AI_ASSISTANTS_E2E_PROFILE_ENV_PATH.trim()
      : profileEnvPath(profile);
  const defaultProfileEnv = readDotEnvFile(envPath);
  const env = { ...baseEnv };
  for (const [key, value] of Object.entries(defaultProfileEnv)) {
    if (profile === "e2e" && E2E_ISOLATION_SENSITIVE_ENV_KEYS.has(key)) {
      env[key] = value;
      continue;
    }
    if (env[key] === undefined) env[key] = value;
  }
  assertProfileEnvIsolation(profile, env);
  return env;
}

function assertProfileEnvIsolation(profile: RuntimeProfile, env: NodeJS.ProcessEnv): void {
  const supabaseUrl = env.SUPABASE_URL?.trim() ?? "";
  const supabaseWorkdir = env.SUPABASE_LOCAL_WORKDIR?.trim() ?? "";
  const publicUrls = [
    env.BACKEND_PUBLIC_URL?.trim() ?? "",
    env.CONNECT_PUBLIC_URL?.trim() ?? "",
    env.SUPABASE_PUBLIC_URL?.trim() ?? "",
    env.OAUTH_PUBLIC_URL?.trim() ?? "",
  ].filter(Boolean);

  if (profile === "e2e") {
    if (supabaseUrl.includes(":54321")) {
      throw new Error(`Profile e2e resolved dev Supabase URL ${supabaseUrl}.`);
    }
    const repoPath = repoRoot(import.meta.url);
    if (supabaseWorkdir.includes(".ai-assistants-dev") || path.resolve(supabaseWorkdir) === repoPath) {
      throw new Error(`Profile e2e resolved non-e2e Supabase workdir ${supabaseWorkdir}.`);
    }
    const preparedRuntimeRoot = env.AI_ASSISTANTS_E2E_PROFILE_RUNTIME_ROOT?.trim();
    if (
      preparedRuntimeRoot &&
      supabaseWorkdir &&
      !supabaseWorkdir.startsWith(preparedRuntimeRoot)
    ) {
      throw new Error(
        `Profile e2e resolved Supabase workdir ${supabaseWorkdir}, outside prepared E2E runtime root ${preparedRuntimeRoot}.`,
      );
    }
    const leakedPublicUrl = publicUrls.find((url) => /dev-assistant|prod-assistant/i.test(url));
    if (leakedPublicUrl)
      throw new Error(`Profile e2e resolved non-e2e public URL ${leakedPublicUrl}.`);
    return;
  }

  if (supabaseUrl.includes(":56321")) {
    throw new Error(`Profile ${profile} resolved e2e Supabase URL ${supabaseUrl}.`);
  }
  if (supabaseWorkdir.includes(".ai-assistants-e2e")) {
    throw new Error(`Profile ${profile} resolved e2e Supabase workdir ${supabaseWorkdir}.`);
  }
  const leakedPublicUrl = publicUrls.find((url) => /e2e-assistant/i.test(url));
  if (leakedPublicUrl)
    throw new Error(`Profile ${profile} resolved e2e public URL ${leakedPublicUrl}.`);
}

export function ensureProfileRuntimeDirs(profile: RuntimeProfile): void {
  const root = runtimeRootForProfile(profile);
  mkdirSync(root, { recursive: true });
  for (const relative of ["agents", "workspaces", "logs", "tmp", "deployments"]) {
    mkdirSync(path.join(root, relative), { recursive: true });
  }
}
