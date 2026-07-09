import { profileEnvPath, type RuntimeProfile } from "@ai-assistants/repo-layout";
import {
  createSupabaseServiceClient,
  type PostgrestError,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { z } from "zod";
import { readDotEnvFile } from "@ai-assistants/workspace-shared";

const TESTING_PROFILE_ID = "testing";
const USABLE_CREDENTIAL_STATUSES = new Set(["healthy"]);

const TESTING_LIFECYCLE_HYDRATABLE_ENV = ["AI_ASSISTANTS_E2E_GMAIL_TO"] as const;

type TestingLifecycleHydratableEnvName = (typeof TESTING_LIFECYCLE_HYDRATABLE_ENV)[number];

export type TestingLifecycleResolvedEnv = {
  values: Partial<Record<TestingLifecycleHydratableEnvName, string>>;
  unresolved: Partial<Record<TestingLifecycleHydratableEnvName, string>>;
};

export type TestingLifecycleEnvHydrationResult = {
  hydrated: TestingLifecycleHydratableEnvName[];
  unresolved: Partial<Record<TestingLifecycleHydratableEnvName, string>>;
};

type MutableEnv = Record<string, string | undefined>;

export type TestingLifecycleEnvDb = {
  testingProfiles(): Promise<TableRow<"profiles">[]>;
  activeTestingGmailLinks(): Promise<TableRow<"capability_account_links">[]>;
  connectedGmailAccounts(
    capabilityAccountLinkId: string,
  ): Promise<TableRow<"connected_provider_accounts">[]>;
};

const emailSchema = z.email();

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function selectedHydratableEnv(
  requiredEnv: readonly string[],
): TestingLifecycleHydratableEnvName[] {
  return TESTING_LIFECYCLE_HYDRATABLE_ENV.filter((name) => requiredEnv.includes(name));
}

function optionalSingleton<T>(rows: readonly T[], label: string): T | null {
  if (rows.length > 1)
    throw new Error(`${label} is ambiguous: expected at most one row, found ${rows.length}.`);
  return rows[0] ?? null;
}

function parseEmail(value: string | null, label: string): string {
  const parsed = emailSchema.safeParse(value ?? "");
  if (!parsed.success)
    throw new Error(`${label} must be a valid email address; got ${JSON.stringify(value)}.`);
  return parsed.data;
}

async function supabaseRows<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const result = await query;
  return requireSupabaseRows(label, result.data, result.error);
}

function testingLifecycleEnvDbFromSupabase(db: SupabaseServiceClient): TestingLifecycleEnvDb {
  return {
    testingProfiles: () =>
      supabaseRows(
        "Load testing profile for lifecycle env hydration",
        db.from("profiles").select().eq("id", TESTING_PROFILE_ID),
      ),
    activeTestingGmailLinks: () =>
      supabaseRows(
        "Load active testing Gmail capability account link for lifecycle env hydration",
        db
          .from("capability_account_links")
          .select()
          .eq("profile_id", TESTING_PROFILE_ID)
          .eq("capability_slug", "gmail")
          .eq("provider", "gmail")
          .neq("status", "disabled"),
      ),
    connectedGmailAccounts: async (capabilityAccountLinkId) => {
      const link = await supabaseRows(
        "Load testing Gmail capability account link for lifecycle env hydration",
        db
          .from("capability_account_links")
          .select("connected_provider_account_id")
          .eq("id", capabilityAccountLinkId)
          .neq("status", "disabled"),
      );
      const connectedProviderAccountId = link[0]?.connected_provider_account_id?.trim();
      if (!connectedProviderAccountId) return [];
      const accounts = await supabaseRows(
        "Load connected testing Gmail connected provider account for lifecycle env hydration",
        db
          .from("connected_provider_accounts")
          .select()
          .eq("id", connectedProviderAccountId)
          .eq("connection_status", "connected"),
      );
      return accounts;
    },
  };
}

function supabaseConfigFromEnv(input: {
  env: MutableEnv;
  profile: RuntimeProfile;
  profileEnv?: Record<string, string>;
}): { url: string; serviceRoleKey: string } {
  const profileEnv = input.profileEnv ?? readDotEnvFile(profileEnvPath(input.profile));
  const url = nonEmpty(input.env.SUPABASE_URL) ?? nonEmpty(profileEnv.SUPABASE_URL);
  const serviceRoleKey =
    nonEmpty(input.env.SUPABASE_SERVICE_ROLE_KEY) ?? nonEmpty(profileEnv.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRoleKey) {
    throw new Error(
      `Testing lifecycle env hydration requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ${profileEnvPath(input.profile)} or the shell.`,
    );
  }
  return { url, serviceRoleKey };
}

async function loadTestingLifecycleEnvValuesFromDb(
  db: TestingLifecycleEnvDb,
): Promise<TestingLifecycleResolvedEnv> {
  const values: Partial<Record<TestingLifecycleHydratableEnvName, string>> = {};
  const unresolved: Partial<Record<TestingLifecycleHydratableEnvName, string>> = {};

  const testingProfile = optionalSingleton(await db.testingProfiles(), "Canonical testing profile");
  if (!testingProfile) {
    unresolved.AI_ASSISTANTS_E2E_GMAIL_TO = "canonical testing profile was not found";
    return { values, unresolved };
  }

  const gmailLink = optionalSingleton(
    await db.activeTestingGmailLinks(),
    "Active testing Gmail capability account link",
  );
  if (!gmailLink) {
    unresolved.AI_ASSISTANTS_E2E_GMAIL_TO = "no active testing Gmail capability account link";
    return { values, unresolved };
  }

  const gmailAccount = optionalSingleton(
    await db.connectedGmailAccounts(gmailLink.id),
    "Connected testing Gmail connected provider account",
  );
  if (!gmailAccount) {
    unresolved.AI_ASSISTANTS_E2E_GMAIL_TO = "no connected testing Gmail connected provider account";
    return { values, unresolved };
  }

  values.AI_ASSISTANTS_E2E_GMAIL_TO = parseEmail(
    gmailAccount.account_email,
    "Connected testing Gmail connected_provider_accounts.account_email",
  );

  if (!USABLE_CREDENTIAL_STATUSES.has(gmailAccount.credential_status ?? "")) {
    throw new Error(
      `Connected testing Gmail account ${gmailAccount.id} has credential_status=${JSON.stringify(gmailAccount.credential_status)}. Reconnect Gmail for testing.`,
    );
  }
  if (
    !gmailAccount.nango_provider_config_key?.trim() ||
    !gmailAccount.nango_connection_id?.trim()
  ) {
    throw new Error(
      `Connected testing Gmail account ${gmailAccount.id} has no Nango binding. Reconnect Gmail for testing.`,
    );
  }
  return { values, unresolved };
}

export async function resolveTestingLifecycleEnvFromDb(input: {
  env: MutableEnv;
  requiredEnv: readonly string[];
  profile: RuntimeProfile;
  profileEnv?: Record<string, string>;
  db?: TestingLifecycleEnvDb;
}): Promise<TestingLifecycleResolvedEnv> {
  const required = selectedHydratableEnv(input.requiredEnv);
  const missing = required.filter((name) => !nonEmpty(input.env[name]));
  if (missing.length === 0) return { values: {}, unresolved: {} };

  const db =
    input.db ??
    testingLifecycleEnvDbFromSupabase(
      createSupabaseServiceClient(
        supabaseConfigFromEnv({
          env: input.env,
          profile: input.profile,
          profileEnv: input.profileEnv,
        }),
      ),
    );
  const resolved = await loadTestingLifecycleEnvValuesFromDb(db);
  const values: Partial<Record<TestingLifecycleHydratableEnvName, string>> = {};
  const unresolved: Partial<Record<TestingLifecycleHydratableEnvName, string>> = {};

  for (const name of missing) {
    const value = nonEmpty(resolved.values[name]);
    if (value) {
      values[name] = value;
    } else {
      unresolved[name] = resolved.unresolved[name] ?? "testing DB did not provide a value";
    }
  }

  return { values, unresolved };
}

export function hydrateTestingLifecycleEnv(
  env: MutableEnv,
  resolved: TestingLifecycleResolvedEnv,
): TestingLifecycleEnvHydrationResult {
  const hydrated: TestingLifecycleHydratableEnvName[] = [];
  const unresolved: Partial<Record<TestingLifecycleHydratableEnvName, string>> = {};

  for (const name of TESTING_LIFECYCLE_HYDRATABLE_ENV) {
    const value = nonEmpty(resolved.values[name]);
    if (value) {
      env[name] = value;
      hydrated.push(name);
    } else if (resolved.unresolved[name]) {
      unresolved[name] = resolved.unresolved[name];
    }
  }

  return { hydrated, unresolved };
}

export function missingRequiredEnvMessage(input: {
  missing: readonly string[];
  hydration?: TestingLifecycleEnvHydrationResult;
}): string {
  const missing = unique(input.missing);
  const base = `Selected E2E tests require ${missing.join(", ")}. Set these env vars in your shell or e2e profile .env before running.`;
  const details = missing
    .map((name) => {
      const reason = input.hydration?.unresolved[name as TestingLifecycleHydratableEnvName];
      return reason ? `${name}: ${reason}` : null;
    })
    .filter((entry): entry is string => entry !== null);
  if (details.length === 0) return base;
  return `${base} Testing DB hydration could not resolve: ${details.join("; ")}.`;
}
