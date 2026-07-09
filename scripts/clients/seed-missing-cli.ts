#!/usr/bin/env tsx

// Creates missing seed-backed client profiles, then optionally validates
// the backend runtime profile once for the selected CLI profile.

import { createSupabaseServiceClient } from "@ai-assistants/control-db";
import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli } from "@ai-assistants/workspace-shared";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { validateProfileRuntime } from "../repo-tooling/build/profile-runtime-validation";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";
import { seedMissingClientProfiles } from "./seed-missing-profiles";

export type SeedMissingClientProfilesCliResult = {
  profile: RuntimeProfile;
  createdProfileIds: readonly string[];
  skippedProfileIds: readonly string[];
  built: boolean;
};

export async function seedMissingClientProfilesForRuntime(
  profile: RuntimeProfile,
  options: { build?: boolean } = {},
): Promise<SeedMissingClientProfilesCliResult> {
  const config = supabaseConfigFromProfile(profile);
  const db = createSupabaseServiceClient(config);
  const results = await seedMissingClientProfiles({
    db,
    runtimeProfile: profile,
    supabaseUrl: config.url,
  });
  const createdProfileIds = results
    .filter((result) => result.summary.status === "created")
    .map((result) => result.source.clientId);
  const skippedProfileIds = results
    .filter((result) => result.summary.status !== "created")
    .map((result) => result.source.clientId);
  const build = options.build !== false;
  if (build) {
    await validateProfileRuntime({ profile, db });
  }
  return { profile, createdProfileIds, skippedProfileIds, built: build };
}

const cliSchema = z
  .object({
    help: z.boolean().optional(),
    profile: z.string().optional(),
    "no-build": z.boolean().optional(),
  })
  .transform((v) => ({
    profile: v.profile?.trim(),
    noBuild: v["no-build"] === true,
    help: v.help ?? false,
  }));

function usage(): string {
  return [
    "Usage:",
    "  npm run clients -- seed-missing",
    "  npm run clients -- seed-missing --profile=dev",
    "  npm run clients -- seed-missing --no-build",
    "",
    "Creates seed-backed client profiles only when profiles.id is missing, verifies launched",
    "runtime clients already exist in the DB, then validates the backend runtime profile.",
    "",
    "Options:",
    "  --profile=dev|e2e|prod   Which profile.env / Supabase connection to use (default: dev).",
    "  --no-build           Only create missing DB rows; skip workspace + config rebuild.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): { profile: RuntimeProfile; noBuild: boolean } {
  const raw = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      "no-build": { type: "boolean" },
    },
    schema: cliSchema,
  });
  if (raw.help) {
    console.log(usage());
    process.exit(0);
  }
  const profileRaw = raw.profile?.trim() ?? "dev";
  assertRuntimeProfile(profileRaw);
  return { profile: profileRaw, noBuild: raw.noBuild };
}

export async function runClientSeedMissingCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const result = await seedMissingClientProfilesForRuntime(args.profile, { build: !args.noBuild });
  console.log(
    [
      "",
      `Seeded missing client profile(s) for ${result.profile}.`,
      `Created: ${result.createdProfileIds.length ? result.createdProfileIds.join(", ") : "none"}`,
      `Skipped: ${result.skippedProfileIds.length ? result.skippedProfileIds.join(", ") : "none"}`,
      "",
      result.built
        ? `Validated backend runtime profile ${result.profile}.`
        : "Skipped rebuild (--no-build).",
      "",
    ].join("\n"),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runClientSeedMissingCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
