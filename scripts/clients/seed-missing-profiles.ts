import type { RuntimeProfile } from "@ai-assistants/repo-layout";
import { requireSupabaseRows, type SupabaseServiceClient } from "@ai-assistants/control-db";
import { seedClientProfileIfMissing, type ClientSeedSummary } from "./seed-profile-db";
import {
  loadClientRuntimeSources,
  loadClientSeed,
  type ClientRuntimeSource,
  type ClientSeedSource,
} from "./source";
import { stableLockHash, withRepoLock } from "../repo-tooling/repo-lock";

export type SeedMissingClientProfileResult = {
  source: ClientRuntimeSource;
  summary:
    | ClientSeedSummary
    | {
        status: "existing";
        profileId: string;
        runtimeProfiles: RuntimeProfile[];
      };
};

const seedFlights = new Map<string, Promise<SeedMissingClientProfileResult[]>>();

export type SeedMissingClientProfilesInput = {
  db: SupabaseServiceClient;
  runtimeProfile: RuntimeProfile;
  supabaseUrl: string;
};

function seedFlightKey(input: SeedMissingClientProfilesInput): string {
  return `${input.runtimeProfile}.${stableLockHash(input.supabaseUrl)}`;
}

async function existingProfileIds(
  input: SeedMissingClientProfilesInput,
  sources: readonly ClientRuntimeSource[],
): Promise<Set<string>> {
  const ids = sources.map((source) => source.runtime.profileId);
  const result = await input.db.from("profiles").select("id").in("id", ids);
  const rows = requireSupabaseRows(
    `Load ${input.runtimeProfile} client profile existence`,
    result.data,
    result.error,
  );
  return new Set(rows.map((row) => row.id));
}

async function loadSeedSource(source: ClientRuntimeSource): Promise<ClientSeedSource> {
  if (!source.seedPath) {
    throw new Error(`Client ${source.clientId} has no seed.ts bootstrap source.`);
  }
  const seed = await loadClientSeed(source.seedPath);
  if (seed.profile.id !== source.runtime.profileId) {
    throw new Error(
      `Client ${source.clientId} seed profile.id and runtime profileId must match; got ${seed.profile.id} and ${source.runtime.profileId}.`,
    );
  }
  return { ...source, seedPath: source.seedPath, seed };
}

async function seedMissingClientProfilesUnlocked(
  input: SeedMissingClientProfilesInput,
): Promise<SeedMissingClientProfileResult[]> {
  const sources = await loadClientRuntimeSources();
  if (sources.length === 0) throw new Error("No client sources found under clients/*.");
  const selectedSources = sources.filter(({ runtime }) =>
    runtime.runtimeProfiles.includes(input.runtimeProfile),
  );
  if (selectedSources.length === 0) {
    throw new Error(`No client runtime configs target runtime profile ${input.runtimeProfile}.`);
  }
  const existingIds = await existingProfileIds(input, selectedSources);
  const missingLaunched = selectedSources.filter(
    (source) => !source.seedPath && !existingIds.has(source.runtime.profileId),
  );
  if (missingLaunched.length) {
    throw new Error(
      [
        `Runtime profile ${input.runtimeProfile} has launched client(s) with no seed.ts and no DB profile.`,
        ...missingLaunched.map(
          (source) =>
            `  - ${source.clientId}: create the profile explicitly in the control plane, or restore a pre-launch seed.ts before running seed-missing.`,
        ),
      ].join("\n"),
    );
  }
  const results: SeedMissingClientProfileResult[] = [];
  for (const source of selectedSources) {
    if (!source.seedPath) {
      results.push({
        source,
        summary: {
          status: "existing",
          profileId: source.runtime.profileId,
          runtimeProfiles: source.runtime.runtimeProfiles,
        },
      });
      continue;
    }
    const seedSource = await loadSeedSource(source);
    const summary = await seedClientProfileIfMissing(seedSource.seed, {
      runtime: seedSource.runtime,
      runtimeProfile: input.runtimeProfile,
      db: input.db,
      build: false,
      restart: false,
    });
    results.push({ source: seedSource, summary });
  }
  const created = results.filter((result) => result.summary.status === "created");
  const skipped = results.filter((result) => result.summary.status !== "created");
  console.log(
    `Seeded missing client profiles for ${input.runtimeProfile}: ${created.length} created, ${skipped.length} existing/skipped (${results.map((result) => result.source.clientId).join(", ")}).`,
  );
  return results;
}

export async function seedMissingClientProfiles(
  input: SeedMissingClientProfilesInput,
): Promise<SeedMissingClientProfileResult[]> {
  const key = seedFlightKey(input);
  const existing = seedFlights.get(key);
  if (existing) return existing;

  const run = withRepoLock(`client-seed-missing.${key}`, () =>
    seedMissingClientProfilesUnlocked(input),
  ).finally(() => {
    seedFlights.delete(key);
  });
  seedFlights.set(key, run);
  return run;
}
