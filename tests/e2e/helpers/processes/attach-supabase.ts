import { resolveE2eSupabaseContext, type E2eSupabaseContext } from "../db/supabase-context";
import { useE2eDb } from "../db/e2e-db";
import { ensureDefaultTestingTrustedE2eChannel } from "../fixtures/testing-trusted-channel-fixture";
import type { E2eRun } from "../run/e2e-run";

function setSupabaseEnv(supabase: E2eSupabaseContext): void {
  process.env.SUPABASE_URL = supabase.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = supabase.serviceRoleKey;
  process.env.SUPABASE_ANON_KEY = supabase.anonKey;
}

/**
 * Attaches the test process to the fixed E2E Supabase lane prepared by `npm run e2e`,
 * validates REST schema is reachable, and exports `SUPABASE_URL` /
 * `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` for downstream processes. Fails fast if
 * values point at the dev stack.
 */
export async function attachE2eSupabase(run: E2eRun): Promise<E2eSupabaseContext> {
  console.log(`[e2e:${run.id}] Attaching to isolated e2e Supabase.`);
  const supabase = await resolveE2eSupabaseContext({ profile: "e2e", profileEnv: run.profileEnv });
  setSupabaseEnv(supabase);
  const db = await useE2eDb();
  await ensureDefaultTestingTrustedE2eChannel({ db, run });
  console.log(`[e2e:${run.id}] supabaseUrl=${supabase.url}`);
  return supabase;
}

export type { E2eSupabaseContext };
