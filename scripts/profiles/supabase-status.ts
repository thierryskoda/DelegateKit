import { repoRoot } from "@ai-assistants/repo-layout";
import { runRequiredBoundedCommand } from "../repo-tooling/bounded-command";

const SUPABASE_CLI = ["--yes", "supabase@2.98.1"] as const;
const SUPABASE_STATUS_TIMEOUT_MS = 90_000;

export type SupabaseLocalStatus = {
  workdir: string;
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  databaseUrl: string;
};

function parseSupabaseStatusEnv(output: string): Record<string, string> {
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(?:"(.*)"|(.*))$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1]!, match[2] ?? match[3] ?? ""]),
  );
}

export function readSupabaseLocalStatus(
  workdir: string,
  options: { dockerContext?: string } = {},
): SupabaseLocalStatus {
  const result = runRequiredBoundedCommand(
    "npx",
    [...SUPABASE_CLI, "status", "-o", "env", "--workdir", workdir],
    {
      cwd: repoRoot(import.meta.url),
      maxBuffer: 5_000_000,
      timeoutMs: SUPABASE_STATUS_TIMEOUT_MS,
      env: options.dockerContext
        ? { ...process.env, DOCKER_CONTEXT: options.dockerContext }
        : undefined,
    },
  );
  const output = result.stdout;
  const parsed = parseSupabaseStatusEnv(output);
  if (!parsed.API_URL || !parsed.ANON_KEY || !parsed.SERVICE_ROLE_KEY || !parsed.DB_URL) {
    throw new Error(
      "Supabase status output did not include API_URL, ANON_KEY, SERVICE_ROLE_KEY, and DB_URL.",
    );
  }
  return {
    workdir,
    apiUrl: parsed.API_URL,
    anonKey: parsed.ANON_KEY,
    serviceRoleKey: parsed.SERVICE_ROLE_KEY,
    databaseUrl: parsed.DB_URL,
  };
}

/** Direct Postgres URL from `supabase status` (pooler-independent). Prefer this over `supabase db query` when scripts need SQL. */
export function readSupabaseLocalDatabaseUrl(
  workdir: string,
  options: { dockerContext?: string } = {},
): string {
  const result = runRequiredBoundedCommand(
    "npx",
    [...SUPABASE_CLI, "status", "-o", "env", "--workdir", workdir],
    {
      cwd: repoRoot(import.meta.url),
      maxBuffer: 5_000_000,
      timeoutMs: SUPABASE_STATUS_TIMEOUT_MS,
      env: options.dockerContext
        ? { ...process.env, DOCKER_CONTEXT: options.dockerContext }
        : undefined,
    },
  );
  const output = result.stdout;
  const parsed = parseSupabaseStatusEnv(output);
  const dbUrl = parsed.DB_URL?.trim();
  if (!dbUrl) {
    throw new Error("Supabase status output did not include DB_URL. Is local Supabase running?");
  }
  return dbUrl;
}
