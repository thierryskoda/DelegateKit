import type { RuntimeProfile } from "@ai-assistants/repo-layout";
import {
  runGuardRuntime,
  runGuardSupabaseControlDb,
} from "../repo-tooling/guards/guard-steps";
import { runNangoApply, runNangoSyncApply, runNangoValidate } from "../integrations/nango-steps";
import { seedMissingClientProfilesForRuntime } from "../clients/seed-missing-cli";
import { runClientValidateCli } from "../clients/validate-clients";
import { startLocalSupabase } from "./start-local-supabase";

export async function runStartDevFull(profile: RuntimeProfile, clean: boolean): Promise<void> {
  await startLocalSupabase(profile, clean);
  await runGuardSupabaseControlDb(profile);
  await runClientValidateCli([]);
  await seedMissingClientProfilesForRuntime(profile);
  runNangoValidate();
  await runNangoApply(profile);
  await runNangoSyncApply(profile);
  await runGuardRuntime(profile);
}
