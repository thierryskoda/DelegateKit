#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import {
  createSupabaseServiceClient,
  requireSupabaseRows,
  type SupabaseServiceClient,
} from "@ai-assistants/control-db";
import {
  assertRuntimeProfile,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { createSeedProfileGuidance } from "../../apps/backend/src/ops-support/profile-seeding";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";
import { initialGuidanceForProfileId } from "./initial-guidance";
import { loadClientRuntimeSources } from "./source";
import type { ClientGuidance } from "./schema";

type BackfillArgs = {
  profile: RuntimeProfile;
  clientId: string | null;
  apply: boolean;
};

type BackfillResult = {
  profileId: string;
  declared: number;
  existingKeys: string[];
  createdKeys: string[];
  missingKeys: string[];
};

function usage(): string {
  return [
    "Usage:",
    "  npm run clients -- guidance-backfill --profile=dev --client=testing",
    "  npm run clients -- guidance-backfill --profile=prod --client=<client-id> --apply",
    "",
    "Backfills declared initialGuidance rows into existing DB profiles.",
    "Dry-run by default. With --apply, creates only missing active keys.",
    "Existing active guidance rows are skipped; this command never overwrites, archives, or deletes guidance.",
    "",
    "Options:",
    "  --profile=dev|e2e|prod   Supabase/runtime profile to inspect (default: dev).",
    "  --client=<profile-id>     Limit backfill to one runtime client.",
    "  --apply                   Insert missing rows. Omit for dry-run.",
  ].join("\n");
}

const cliSchema = z
  .object({
    help: z.boolean().optional(),
    profile: z.string().optional(),
    client: z.string().optional(),
    apply: z.boolean().optional(),
  })
  .transform((raw) => {
    const profile = raw.profile?.trim() || "dev";
    assertRuntimeProfile(profile);
    return {
      help: raw.help ?? false,
      profile,
      clientId: raw.client?.trim() || null,
      apply: raw.apply === true,
    };
  });

function parseArgs(argv: readonly string[]): BackfillArgs {
  const parsed = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      client: { type: "string" },
      apply: { type: "boolean" },
    },
    schema: cliSchema,
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  return parsed;
}

async function existingActiveGuidanceKeys(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<Set<string>> {
  const result = await db
    .from("profile_guidance")
    .select("key")
    .eq("profile_id", profileId)
    .eq("status", "active");
  const rows = requireSupabaseRows(
    `Load active profile guidance for ${profileId}`,
    result.data,
    result.error,
  );
  return new Set(rows.map((row) => row.key));
}

async function backfillProfileGuidance(input: {
  db: SupabaseServiceClient;
  profileId: string;
  guidance: readonly ClientGuidance[];
  apply: boolean;
}): Promise<BackfillResult> {
  const existingKeys = await existingActiveGuidanceKeys(input.db, input.profileId);
  const missing = input.guidance.filter((guidance) => !existingKeys.has(guidance.key));
  const createdKeys: string[] = [];
  if (input.apply) {
    for (const guidance of missing) {
      await createSeedProfileGuidance(input.db, {
        profileId: input.profileId,
        guidance,
      });
      createdKeys.push(guidance.key);
    }
  }
  return {
    profileId: input.profileId,
    declared: input.guidance.length,
    existingKeys: input.guidance
      .filter((guidance) => existingKeys.has(guidance.key))
      .map((guidance) => guidance.key),
    createdKeys,
    missingKeys: input.apply ? [] : missing.map((guidance) => guidance.key),
  };
}

export async function runProfileGuidanceBackfillCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv);
  const sources = (await loadClientRuntimeSources()).filter((source) =>
    source.runtime.runtimeProfiles.includes(args.profile),
  );
  const selected = args.clientId
    ? sources.filter((source) => source.runtime.profileId === args.clientId)
    : sources;
  if (args.clientId && selected.length === 0) {
    throw new Error(`No client runtime source ${args.clientId} targets profile ${args.profile}.`);
  }
  if (selected.length === 0) {
    throw new Error(`No client runtime sources target profile ${args.profile}.`);
  }

  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));
  const results: BackfillResult[] = [];
  for (const source of selected) {
    const guidance = initialGuidanceForProfileId(source.runtime.profileId);
    results.push(
      await backfillProfileGuidance({
        db,
        profileId: source.runtime.profileId,
        guidance,
        apply: args.apply,
      }),
    );
  }

  console.log(
    [
      "",
      `Profile guidance backfill ${args.apply ? "applied" : "dry-run"} for ${args.profile}.`,
      ...results.map((result) =>
        [
          `- ${result.profileId}: declared=${result.declared}`,
          `existing=${result.existingKeys.length ? result.existingKeys.join(",") : "none"}`,
          args.apply
            ? `created=${result.createdKeys.length ? result.createdKeys.join(",") : "none"}`
            : `missing=${result.missingKeys.length ? result.missingKeys.join(",") : "none"}`,
        ].join(" "),
      ),
      "",
    ].join("\n"),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCliMain(() => runProfileGuidanceBackfillCli());
}
