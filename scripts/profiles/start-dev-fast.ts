import type { RuntimeProfile } from "@ai-assistants/repo-layout";
import { runGuardRuntime, runGuardSupabaseControlDb } from "../repo-tooling/guards/guard-steps";
import { runNangoValidate } from "../integrations/nango-steps";
import { seedMissingClientProfilesForRuntime } from "../clients/seed-missing-cli";
import { startLocalSupabase } from "./start-local-supabase";

export async function runStartDevFast(profile: RuntimeProfile, clean: boolean): Promise<void> {
  await startLocalSupabase(profile, clean);
  await runGuardSupabaseControlDb(profile);
  await seedMissingClientProfilesForRuntime(profile);
  runNangoValidate();
  await runGuardRuntime(profile);
}
