#!/usr/bin/env tsx

import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { assertRuntimeProfile, repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli } from "@ai-assistants/workspace-shared";
import { createSupabaseServiceClient } from "@ai-assistants/control-db";
import { loadClientRuntime, loadClientSeed } from "./source";
import { seedClientProfileIfMissing } from "./seed-profile-db";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";

type CliArgs = {
  profile: RuntimeProfile;
  inputPath: string;
  build: boolean;
  restart: boolean;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run clients -- seed clients/acme/seed.ts",
    "  npm run clients -- seed clients/acme/seed.ts --profile=prod --restart",
    "",
    "Defaults:",
    "  - creates the profile, auth user, assistants, capabilities, channels, identity, and write policy only when the profile is missing",
    "  - skips without DB mutation when profiles.id already exists",
    "  - validates generated runtime data",
    "  - --restart is a compatibility alias for refreshing runtime validation; it does not restart a process",
    "",
    "Options:",
    "  --profile=dev|e2e|prod   Runtime profile to update (default: dev).",
    "  --no-build",
    "  --restart",
  ].join("\n");
}

const clientSeedRawSchema = z.object({
  help: z.boolean().optional(),
  profile: z.string().optional(),
  inputPath: z.string().optional(),
  "no-build": z.boolean().optional(),
  restart: z.boolean().optional(),
});

function parseArgs(args: readonly string[]): CliArgs {
  const raw = parseCli(args, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      "no-build": { type: "boolean" },
      restart: { type: "boolean" },
    },
    allowPositionals: true,
    transform: ({ values, positionals }) => {
      if (positionals.length > 1) {
        throw new Error(`Expected one client seed TypeScript path.\n\n${usage()}`);
      }
      return { ...values, inputPath: positionals[0] };
    },
    schema: clientSeedRawSchema,
  });
  if (raw.help) {
    console.log(usage());
    process.exit(0);
  }
  const profileRaw = raw.profile?.trim() ?? "dev";
  assertRuntimeProfile(profileRaw);
  const inputPath = raw.inputPath?.trim();
  if (!inputPath) throw new Error(`Missing client seed TypeScript path.\n\n${usage()}`);
  return {
    profile: profileRaw,
    inputPath,
    build: raw["no-build"] !== true,
    restart: raw.restart === true,
  };
}

export async function runClientSeedCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const absoluteInputPath = path.isAbsolute(args.inputPath)
    ? args.inputPath
    : path.join(repoRoot(import.meta.url), args.inputPath);
  if (path.basename(absoluteInputPath) !== "seed.ts") {
    throw new Error(`Client seed path must end in seed.ts; got ${args.inputPath}.`);
  }
  const runtimePath = path.join(path.dirname(absoluteInputPath), "runtime.ts");
  const [seed, runtime] = await Promise.all([
    loadClientSeed(absoluteInputPath),
    loadClientRuntime(runtimePath),
  ]);

  const summary = await seedClientProfileIfMissing(seed, {
    runtime,
    runtimeProfile: args.profile,
    db: createSupabaseServiceClient(supabaseConfigFromProfile(args.profile)),
    build: args.build,
    restart: args.restart,
  });

  console.log(
    [
      "",
      `Client seed:       ${summary.status}`,
      `Profile:           ${summary.profileId}`,
      `Portal user:       ${summary.portalEmail}${summary.authUserId ? ` (${summary.authUserId})` : ""}`,
      `Runtime profiles:  ${summary.runtimeProfiles.join(", ")}`,
      `Capabilities:      ${summary.capabilitySlugs.length ? summary.capabilitySlugs.join(", ") : "none"}`,
      `Channels:          ${summary.channelCount}`,
      `Seeded caps:       ${summary.capabilitiesSeeded}`,
      `Seeded guidance:   ${summary.guidanceSeeded}`,
      `Runtime refresh:   ${summary.runtimeBuilt ? "done" : "skipped"}`,
      "",
    ].join("\n"),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runClientSeedCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
