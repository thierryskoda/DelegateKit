#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  isLocalSupabaseManagedProfile,
  profileEnvPath,
  repoRoot,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import { readDotEnvFile } from "@ai-assistants/workspace-shared";
import { parseConnectWebEnv } from "@ai-assistants/workspace-shared/env";
import { parseProfileArg } from "./profile";
import { localPortsForProfile } from "./profile-ports";
import { pathToFileURL } from "node:url";

type Action = "dev";

type ParsedArgs = {
  action: Action;
  profile: RuntimeProfile;
  viteArgs: string[];
};

function parseArgs(args: readonly string[]): ParsedArgs {
  const actionIndex = args.findIndex((arg) => !arg.startsWith("--"));
  const action = actionIndex >= 0 ? args[actionIndex] : undefined;
  if (action !== "dev") {
    throw new Error("Usage: tsx scripts/profiles/connect.ts dev --profile=dev|e2e [vite args...]");
  }

  return {
    action,
    profile: parseProfileArg(args),
    viteArgs: args.filter(
      (arg, index) => index !== actionIndex && arg !== "--" && !arg.startsWith("--profile="),
    ),
  };
}

function envForConnect(
  profile: RuntimeProfile,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...baseEnv };
  const profileEnv = readDotEnvFile(profileEnvPath(profile));
  const ports = localPortsForProfile(profile);
  for (const [key, value] of Object.entries(profileEnv)) {
    if (!env[key]?.trim()) env[key] = value;
  }
  const backendUrl =
    env.BACKEND_PUBLIC_URL?.trim() ||
    env.AI_ASSISTANTS_BACKEND_URL?.trim() ||
    `http://127.0.0.1:${ports.backend}`;
  env.BACKEND_PUBLIC_URL = backendUrl;
  env.AI_ASSISTANTS_BACKEND_URL = env.AI_ASSISTANTS_BACKEND_URL?.trim() || backendUrl;
  env.SUPABASE_PUBLIC_URL = env.SUPABASE_PUBLIC_URL?.trim() || env.SUPABASE_URL?.trim();
  env.VITE_CONNECT_HMR_HOST = env.VITE_CONNECT_HMR_HOST?.trim() || "127.0.0.1";
  return env;
}

function assertRequiredConnectEnv(profile: RuntimeProfile, env: NodeJS.ProcessEnv): void {
  try {
    parseConnectWebEnv(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Connect dev server for profile ${JSON.stringify(profile)} has invalid env.`,
        message,
        `Set values in ${profileEnvPath(profile)} or export them before running npm run profile -- connect dev --profile=${profile}.`,
        `Run npm run profile -- supabase start --profile=${profile}; public tunnel config can be prepared with npm run tunnel -- ${profile} env when needed.`,
      ].join(" "),
      { cause: error },
    );
  }
}

export async function runProfileConnectCli(argv = process.argv.slice(2)): Promise<void> {
  const { profile, viteArgs } = parseArgs(argv);
  if (!isLocalSupabaseManagedProfile(profile)) {
    throw new Error(
      `Connect dev bridge is local-only for dev/e2e. Configure your own production Connect launcher for ${profile}.`,
    );
  }
  const root = repoRoot(import.meta.url);
  const env = envForConnect(profile);
  assertRequiredConnectEnv(profile, env);

  const viteBin = path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vite.cmd" : "vite",
  );
  const args = [
    "--host",
    "127.0.0.1",
    "--strictPort",
    "--config",
    "apps/connect/vite.config.ts",
    "--port",
    String(localPortsForProfile(profile).connect),
    ...viteArgs,
  ];
  console.log(`Starting Connect dev server for ${profile} using ${profileEnvPath(profile)}.`);
  const result = spawnSync(viteBin, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.signal) {
    process.exitCode = result.signal === "SIGINT" ? 130 : 1;
    return;
  }
  process.exitCode = result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runProfileConnectCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
