import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { profileEnvPath, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { readDotEnvFile } from "@ai-assistants/workspace-shared";
import { localPortsForProfile } from "./profile-ports";
import {
  parseEnvAssignmentLines,
  upsertManagedEnvBlock,
  writeSecretFileAtomic,
} from "./profile-env-blocks";

const START_DEFAULTS_BLOCK_BEGIN = "# BEGIN AI ASSISTANTS START DEFAULTS";
const START_DEFAULTS_BLOCK_END = "# END AI ASSISTANTS START DEFAULTS";

function randomSecret(): string {
  return randomBytes(32).toString("hex");
}

function readProfileEnv(profile: RuntimeProfile): Record<string, string> {
  return readDotEnvFile(profileEnvPath(profile));
}

function envValue(entries: Record<string, string>, key: string): string | undefined {
  return entries[key]?.trim() || process.env[key]?.trim() || undefined;
}

function managedDefaultsBlock(profile: RuntimeProfile, entries: Record<string, string>): string[] {
  return [
    `# Managed by npm run start:${profile} for missing local startup defaults. Edit values in this file when needed.`,
    ...Object.entries(entries).map(([key, value]) => `${key}=${value}`),
  ];
}

function upsertManagedDefaults(profile: RuntimeProfile, additions: Record<string, string>): void {
  if (Object.keys(additions).length === 0) return;

  const envPath = profileEnvPath(profile);
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const currentPattern = new RegExp(
    `${START_DEFAULTS_BLOCK_BEGIN}[\\s\\S]*?${START_DEFAULTS_BLOCK_END}`,
    "g",
  );
  const match = currentPattern.exec(existing);
  const existingBlockEntries = match ? parseEnvAssignmentLines(match[0]) : {};
  const bodyLines = managedDefaultsBlock(profile, { ...existingBlockEntries, ...additions });
  const next = upsertManagedEnvBlock({
    existingText: existing,
    blockBegin: START_DEFAULTS_BLOCK_BEGIN,
    blockEnd: START_DEFAULTS_BLOCK_END,
    blockBodyLines: bodyLines,
  });
  writeSecretFileAtomic(envPath, next);
  console.log(`Wrote missing ${profile} startup defaults to ${envPath}.`);
}

export function ensureLauncherDefaults(profile: RuntimeProfile): void {
  const profileEnv = readProfileEnv(profile);
  const additions: Record<string, string> = {};
  const ports = localPortsForProfile(profile);
  const addMissing = (key: string, value: string) => {
    if (!envValue(profileEnv, key)) additions[key] = value;
  };

  const backendPort = envValue(profileEnv, "BACKEND_PORT") ?? String(ports.backend);
  const backendUrl =
    envValue(profileEnv, "AI_ASSISTANTS_BACKEND_URL") ?? `http://localhost:${backendPort}`;

  addMissing("BACKEND_PORT", backendPort);
  addMissing("AI_ASSISTANTS_BACKEND_URL", backendUrl);
  addMissing("AI_ASSISTANTS_BACKEND_MACHINE_TOKEN", randomSecret());
  addMissing("OAUTH_STATE_SECRET", randomSecret());
  addMissing("AI_ASSISTANTS_WEB_BRIDGE_PORT", String(ports.webBridge));

  upsertManagedDefaults(profile, additions);
}

export function ensureLauncherRuntimeEnvDefaults(
  targetEnv: NodeJS.ProcessEnv = process.env,
): void {
  targetEnv.MONDAY_GRAPHQL_API_VERSION ??= "2026-07";
}
