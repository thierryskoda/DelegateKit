import { randomUUID } from "node:crypto";
import { startBackendServer, type BackendServerHandle } from "./backend-processes";
import { allocateFreePort } from "../run/e2e-run-context";
import type { E2eRun } from "../run/e2e-run";
import type { E2eSupabaseContext } from "../db/supabase-context";

export type StartBackendDeps = {
  /** Required: backend reads SUPABASE_URL etc. */
  supabase: E2eSupabaseContext;
};

/**
 * Allocates a free port, exports `BACKEND_PORT` / `AI_ASSISTANTS_BACKEND_URL` /
 * `AI_ASSISTANTS_BACKEND_MACHINE_TOKEN`, spawns `npm run backend:serve`, waits for `/health`, and
 * registers teardown on `run.cleanup`.
 */
export async function startBackend(
  run: E2eRun,
  deps: StartBackendDeps,
): Promise<BackendServerHandle> {
  if (!deps.supabase) {
    throw new Error(
      `[e2e:${run.id}] startBackend requires supabase. Call attachE2eSupabase first.`,
    );
  }
  const port = await allocateFreePort("backend");
  const baseUrl = `http://127.0.0.1:${port}`;
  const machineToken = `e2e-backend-${randomUUID()}`;
  process.env.BACKEND_PORT = String(port);
  process.env.AI_ASSISTANTS_BACKEND_URL = baseUrl;
  process.env.AI_ASSISTANTS_BACKEND_MACHINE_TOKEN = machineToken;
  console.log(`[e2e:${run.id}] starting backend at ${baseUrl}...`);
  const backend = await startBackendServer({
    repoRoot: run.rootDir,
    port,
    env: {
      ...process.env,
      SUPABASE_URL: deps.supabase.url,
      SUPABASE_SERVICE_ROLE_KEY: deps.supabase.serviceRoleKey,
      SUPABASE_ANON_KEY: deps.supabase.anonKey,
      AI_ASSISTANTS_BACKEND_MACHINE_TOKEN: machineToken,
      AI_ASSISTANTS_BACKEND_URL: baseUrl,
    },
  });
  run.cleanup.add(() => backend.stop());
  console.log(`[e2e:${run.id}] backendUrl=${backend.baseUrl}`);
  return backend;
}

export type { BackendServerHandle };
