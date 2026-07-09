import { profileEnvPath, repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";

export type E2eSupabaseContext = {
  kind: "e2e";
  url: string;
  serviceRoleKey: string;
  anonKey: string;
  cleanup(): void;
};

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveSupabaseValue(input: {
  env: NodeJS.ProcessEnv;
  profileEnv: Record<string, string>;
  name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_ANON_KEY";
  profile: RuntimeProfile;
}): string {
  const value = nonEmpty(input.profileEnv[input.name]) ?? nonEmpty(input.env[input.name]);
  if (!value) {
    throw new Error(
      `supabase: "${input.profile}" requires ${input.name} in ${profileEnvPath(input.profile)} or the shell.`,
    );
  }
  return value;
}

function assertE2eSupabaseIsolation(input: {
  env: NodeJS.ProcessEnv;
  profileEnv: Record<string, string>;
  url: string;
  profile: RuntimeProfile;
}): void {
  if (input.profile !== "e2e") {
    throw new Error(`E2E Supabase context must use profile e2e; got ${input.profile}.`);
  }
  const workdir = nonEmpty(input.profileEnv.SUPABASE_LOCAL_WORKDIR) ?? nonEmpty(input.env.SUPABASE_LOCAL_WORKDIR);
  if (input.url.includes(":54321")) {
    throw new Error(`E2E Supabase resolved dev API port 54321: ${input.url}`);
  }
  if (workdir && workdir === repoRoot(import.meta.url)) {
    throw new Error(`E2E Supabase workdir points at the repo/dev workdir: ${workdir}`);
  }
  if (profileEnvPath(input.profile).includes(".ai-assistants-dev")) {
    throw new Error(`E2E profile env path unexpectedly points at dev: ${profileEnvPath(input.profile)}`);
  }
}

export async function waitForRestSchemaTables(input: {
  url: string;
  serviceRoleKey: string;
  tables: readonly string[];
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = input.timeoutMs ?? 30_000;
  const pending = new Set(input.tables);
  const deadline = Date.now() + timeoutMs;
  let lastError = "";

  while (pending.size > 0) {
    for (const table of [...pending]) {
      const response = await fetch(
        `${input.url.replace(/\/+$/, "")}/rest/v1/${encodeURIComponent(table)}?select=id&limit=0`,
        {
          headers: {
            apikey: input.serviceRoleKey,
            authorization: `Bearer ${input.serviceRoleKey}`,
          },
        },
      );
      if (response.ok) {
        pending.delete(table);
        continue;
      }
      const text = await response.text().catch(() => "");
      lastError = `${table} HTTP ${response.status}: ${text.slice(0, 400)}`;
    }
    if (pending.size === 0) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for Supabase REST schema table(s): ${[...pending].join(", ")}. Last error: ${lastError}`,
      );
    }
    await sleep(500);
  }
}

export async function resolveE2eSupabaseContext(input: {
  env?: NodeJS.ProcessEnv;
  profile: RuntimeProfile;
  profileEnv: Record<string, string>;
}): Promise<E2eSupabaseContext> {
  const env = input.env ?? process.env;
  const url = resolveSupabaseValue({
    env,
    profileEnv: input.profileEnv,
    name: "SUPABASE_URL",
    profile: input.profile,
  });
  const serviceRoleKey = resolveSupabaseValue({
    env,
    profileEnv: input.profileEnv,
    name: "SUPABASE_SERVICE_ROLE_KEY",
    profile: input.profile,
  });
  const anonKey = resolveSupabaseValue({
    env,
    profileEnv: input.profileEnv,
    name: "SUPABASE_ANON_KEY",
    profile: input.profile,
  });
  assertE2eSupabaseIsolation({ env, profileEnv: input.profileEnv, url, profile: input.profile });
  await waitForRestSchemaTables({
    url,
    serviceRoleKey,
    tables: [
      "profiles",
      "profile_channels",
      "capability_account_links",
      "connected_provider_accounts",
    ],
  });
  return {
    kind: "e2e",
    url,
    serviceRoleKey,
    anonKey,
    cleanup: () => {},
  };
}
