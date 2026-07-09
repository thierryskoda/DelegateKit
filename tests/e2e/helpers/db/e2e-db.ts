import {
  createSupabaseServiceClient,
  supabaseServiceConfigFromEnv,
  type SupabaseServiceClient,
} from "@ai-assistants/control-db";
import { seedMissingClientProfiles } from "../../../../scripts/clients/seed-missing-profiles";

/**
 * Returns a Supabase service-role client and creates any missing client seed profiles. Requires
 * `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` to already be set (via `attachE2eSupabase`).
 */
export async function useE2eDb(): Promise<SupabaseServiceClient> {
  const config = supabaseServiceConfigFromEnv();
  const db = createSupabaseServiceClient(config);
  await seedMissingClientProfiles({ db, runtimeProfile: "e2e", supabaseUrl: config.url });
  return db;
}
