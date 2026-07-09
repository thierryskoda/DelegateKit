#!/usr/bin/env tsx

import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import {
  assertRuntimeProfile,
  isLocalSupabaseManagedProfile,
  profileEnvPath,
  repoRoot,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import {
  parseCli,
  validateEnvExampleFile,
  validateResolvedStartEnv,
} from "@ai-assistants/workspace-shared";
import { buildAndValidateProfile } from "./deploy";
import {
  compactProfileEnvFile,
  envForProfile,
  runtimeRootForProfile,
  syncProfileSourceEnv,
} from "./profile";
import { runStartDevFast } from "./start-dev-fast";
import { runStartDevFull } from "./start-dev-full";
import { ensureLauncherDefaults, ensureLauncherRuntimeEnvDefaults } from "./start-env-defaults";
import { runForegroundServices } from "./start-foreground-services";

export type ParsedStartArgs = {
  clean: boolean;
  fast: boolean;
  help: boolean;
  profile: RuntimeProfile;
  watch: boolean;
};

const startCliSchema = z
  .object({
    clean: z.boolean().optional(),
    fast: z.boolean().optional(),
    help: z.boolean().optional(),
    profile: z.string().optional(),
    watch: z.boolean().optional(),
  })
  .transform((v) => {
    const profile = v.profile?.trim();
    if (!profile) {
      if (v.help) {
        return {
          clean: v.clean ?? false,
          fast: v.fast ?? false,
          help: true,
          profile: "dev" as const,
          watch: v.watch ?? false,
        };
      }
      throw new Error("Missing required --profile=dev|e2e.");
    }
    assertRuntimeProfile(profile);
    return {
      clean: v.clean ?? false,
      fast: v.fast ?? false,
      help: v.help ?? false,
      profile,
      watch: v.watch ?? false,
    };
  });

export function parseStartArgs(args: readonly string[]): ParsedStartArgs {
  return parseCli(args, {
    options: {
      clean: { type: "boolean" },
      fast: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      watch: { type: "boolean" },
    },
    schema: startCliSchema,
  });
}

function printHelp(): void {
  console.log(
    [
      "Usage:",
      "  npm run start:dev",
      "  npm run start:dev:fast",
      "  npm run start:dev:watch",
      "  npm run start:dev -- --clean",
      "",
      "Full start (default):",
      "  - Local Supabase start/reset",
      "  - Control DB guard (migrations + contract generation)",
      "  - clients validate, clients seed-missing, Nango validate/apply/sync apply, runtime guard",
      "  - Backend profile validation, then foreground services",
      "",
      "Fast start skips clients validate and Nango apply/sync apply.",
      "It still runs Supabase, control DB guard, clients seed-missing, Nango validate, runtime guard, and services.",
      "Use npm run review:source for the local CI/source-review path (source guards, semantic judges, typecheck, tests, build).",
      "start:dev:watch uses backend/worker watch mode and the Vite Connect dev server for inner-loop editing.",
    ].join("\n"),
  );
}

function readProfileEnv(profile: RuntimeProfile): NodeJS.ProcessEnv {
  return envForProfile(profile);
}

function envForForegroundServices(profile: RuntimeProfile): NodeJS.ProcessEnv {
  const profileEnv = readProfileEnv(profile);
  const env: NodeJS.ProcessEnv = { ...process.env, ...profileEnv };
  env.AI_ASSISTANTS_PROFILE = profile;
  env.AI_ASSISTANTS_RUNTIME_DIR = runtimeRootForProfile(profile);
  return env;
}

function printPhase(label: string): void {
  console.log(`\n==> Phase: ${label}`);
}

export async function runStartCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseStartArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (!isLocalSupabaseManagedProfile(args.profile)) {
    throw new Error(
      `npm run start:* is local-only for dev/e2e. Configure your own production launcher for ${args.profile}.`,
    );
  }

  const root = repoRoot(import.meta.url);
  const examplePath = path.join(root, ".env.example");
  printPhase("preflight");
  syncProfileSourceEnv(args.profile);
  validateEnvExampleFile(examplePath);
  ensureLauncherDefaults(args.profile);
  ensureLauncherRuntimeEnvDefaults();

  printPhase("startup checks");
  if (args.fast) {
    await runStartDevFast(args.profile, args.clean);
  } else {
    await runStartDevFull(args.profile, args.clean);
  }

  ensureLauncherDefaults(args.profile);
  compactProfileEnvFile(args.profile);
  printPhase("backend profile");
  await buildAndValidateProfile({ profile: args.profile });

  printPhase("foreground services");
  const env = envForForegroundServices(args.profile);
  compactProfileEnvFile(args.profile);
  validateResolvedStartEnv({ env, envPath: profileEnvPath(args.profile), examplePath });
  await runForegroundServices(args.profile, env, {
    mode: args.watch ? "watch" : "parity",
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runStartCli().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
