import { existsSync, readFileSync } from "node:fs";

import { profileEnvPath, type RuntimeProfile } from "@ai-assistants/repo-layout";

/**
 * Minimal `.env` parser: KEY=VALUE lines. Invalid lines throw.
 *
 * This intentionally matches the repo's historical simple parser instead of accepting a
 * broader dotenv dialect, so ambiguous credentials fail fast during E2E and scripts that load profile `.env`.
 */
export function readDotEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};

  const entries: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      throw new Error(
        `Invalid .env line in ${filePath} (expected KEY=VALUE): ${JSON.stringify(trimmed.slice(0, 200))}`,
      );
    }

    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) {
      throw new Error(
        `Invalid .env line in ${filePath} (expected KEY=VALUE): ${JSON.stringify(trimmed.slice(0, 200))}`,
      );
    }
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

/** Minimal `.env` loader: KEY=VALUE lines; does not override existing `process.env`. Invalid lines throw. */
function loadDotEnv(filePath: string): Record<string, string> {
  const entries = readDotEnvFile(filePath);
  for (const [key, value] of Object.entries(entries)) {
    process.env[key] ??= value;
  }
  return entries;
}

/**
 * Load a profile runtime `.env` (e.g. `~/.ai-assistants-dev/.env`, often opened via `profiles/dev/.env` symlink).
 * Backend API/worker entrypoints call this (after optional shell exports).
 */
export function loadProfileDotEnv(profile: RuntimeProfile): void {
  loadDotEnv(profileEnvPath(profile));
}

/** Non-empty trimmed value or throws (use after loading the needed profile env). */
export function requireEnv(name: string, detail = ""): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(
      detail
        ? `${name} is required. ${detail}`
        : `${name} is required (set it in the active assistant runtime profile .env or export it).`,
    );
  }
  return v;
}

/** Fail fast when any listed variable is missing (after loading the needed profile env). */
export function requireEnvVars(names: readonly string[], context: string): void {
  const missing = names.filter((n) => !process.env[n]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `${context}: missing required environment variable(s): ${missing.join(", ")}. Set them in the active assistant runtime profile .env or export them.`,
    );
  }
}
