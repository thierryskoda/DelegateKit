#!/usr/bin/env tsx

/**
 * Ensures local Supabase control-plane Postgres matches repo migrations under `supabase/migrations`.
 *
 * 1. Applies pending migrations (`supabase migration up --local`).
 * 2. Verifies every `.sql` migration file has a matching row in `schema_migrations`, and vice versa.
 *
 * Optional: set `SUPABASE_CONTROL_DB_SCHEMA_DRIFT_CHECK=1` to run `supabase db diff --local`
 * (~15–25s) and detect drift when a migration file was edited after it was already applied.
 *
 * 3. Regenerates control-plane DB contracts from the local DB
 * (Supabase types + generated row Zod schemas), same as `npm run db -- types`. Skip with `--skip-types` or
 * `SUPABASE_SKIP_CONTROL_DB_TYPES=1`.
 */

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { z } from "zod";
import { repoRoot } from "@ai-assistants/repo-layout";
import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { readSupabaseLocalDatabaseUrl } from "../../profiles/supabase-status";
import { syncProfileSupabaseProject } from "../../profiles/supabase";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { printJson, sameStringSet, sorted } from "./results";
import { generateControlDbContracts, rowContracts } from "../codegen/generate-control-db-contracts";
import { pathToFileURL } from "node:url";

const SUPABASE_CLI = ["--yes", "supabase@2.98.1"] as const;

const cliSchema = z
  .object({
    help: z.boolean().optional(),
    profile: z.string().optional(),
    "skip-up": z.boolean().optional(),
    "skip-types": z.boolean().optional(),
  })
  .transform((v) => ({
    help: v.help ?? false,
    profile: parseProfile(v.profile),
    skipMigrationUp: v["skip-up"] === true,
    skipTypes: v["skip-types"] === true,
  }));

function usage(): string {
  return [
    "Usage: npm run guard -- supabase-control-db -- [--skip-up] [--skip-types]",
    "",
    "After local Supabase is running, applies pending control-db migrations and verifies migration history.",
    "Then regenerates control-plane DB TypeScript types and row Zod schemas (same as npm run db -- types).",
    "Optional slow drift check: SUPABASE_CONTROL_DB_SCHEMA_DRIFT_CHECK=1 (runs supabase db diff --local).",
    "Skip typegen: SUPABASE_SKIP_CONTROL_DB_TYPES=1 or --skip-types.",
  ].join("\n");
}

function parseProfile(raw: string | undefined): RuntimeProfile {
  const profile = raw?.trim() || "dev";
  assertRuntimeProfile(profile);
  return profile;
}

function migrationVersionsFromDisk(migrationsDir: string): string[] {
  const entries = readdirSync(migrationsDir, { withFileTypes: true }).filter(
    (e) => e.isFile() && e.name.endsWith(".sql"),
  );
  const versions: string[] = [];
  for (const e of entries) {
    const match = e.name.match(/^(\d{14})_/);
    if (!match) {
      throw new Error(
        `Invalid migration filename (expected leading 14-digit timestamp): ${e.name}`,
      );
    }
    versions.push(match[1]!);
  }
  return sorted(new Set(versions));
}

function runMigrationUp(workdir: string): void {
  execFileSync("npx", [...SUPABASE_CLI, "migration", "up", "--local", "--workdir", workdir], {
    cwd: workdir,
    stdio: "inherit",
  });
}

async function queryAppliedVersions(workdir: string): Promise<string[]> {
  const pool = new Pool({ connectionString: readSupabaseLocalDatabaseUrl(workdir), max: 1 });
  try {
    const { rows } = await pool.query<{ version: string }>(
      "select version from supabase_migrations.schema_migrations order by version",
    );
    const versions = rows
      .map((r) => r.version)
      .filter((v): v is string => typeof v === "string" && /^\d{14}$/.test(v));
    return sorted(versions);
  } finally {
    await pool.end();
  }
}

async function withControlDbPool<T>(workdir: string, run: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: readSupabaseLocalDatabaseUrl(workdir), max: 1 });
  try {
    return await run(pool);
  } finally {
    await pool.end();
  }
}

async function queryPublicTables(workdir: string): Promise<string[]> {
  return withControlDbPool(workdir, async (pool) => {
    const { rows } = await pool.query<{ table_name: string }>(
      [
        "select table_name",
        "from information_schema.tables",
        "where table_schema = 'public'",
        "  and table_type = 'BASE TABLE'",
        "order by table_name",
      ].join("\n"),
    );
    return rows.map((row) => row.table_name);
  });
}

async function assertControlDbSecurityPosture(workdir: string): Promise<void> {
  const failures = await withControlDbPool(workdir, async (pool) => {
    const messages: string[] = [];
    const tableGrants = await pool.query<{
      table_name: string;
      grantee: string;
      privilege_type: string;
    }>(
      [
        "select table_name, grantee, privilege_type",
        "from information_schema.role_table_grants",
        "where table_schema = 'public'",
        "  and grantee in ('anon', 'authenticated')",
        "  and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')",
        "order by table_name, grantee, privilege_type",
      ].join("\n"),
    );
    for (const row of tableGrants.rows) {
      messages.push(
        `public.${row.table_name} grants ${row.privilege_type} to ${row.grantee}; control tables must be service-role-only.`,
      );
    }

    const functionGrants = await pool.query<{ function_name: string; grantee: string }>(
      [
        "select routine_name as function_name, grantee",
        "from information_schema.role_routine_grants grants",
        "where grants.routine_schema = 'public'",
        "  and grants.grantee in ('anon', 'authenticated')",
        "  and not exists (",
        "    select 1",
        "    from pg_proc proc",
        "    join pg_namespace ns on ns.oid = proc.pronamespace",
        "    join pg_depend dep on dep.objid = proc.oid and dep.deptype = 'e'",
        "    join pg_extension ext on ext.oid = dep.refobjid",
        "    where ns.nspname = grants.routine_schema",
        "      and proc.proname = grants.routine_name",
        "      and ext.extname = 'vector'",
        "  )",
        "order by routine_name, grantee",
      ].join("\n"),
    );
    for (const row of functionGrants.rows) {
      messages.push(
        `public.${row.function_name} is executable by ${row.grantee}; internal RPCs must be service-role-only.`,
      );
    }

    const defaultAcl = await pool.query<{
      owner_role: string;
      object_type: string;
      grantee: string;
      privileges: string;
    }>(
      [
        "select",
        "  owner.rolname as owner_role,",
        "  acl.defaclobjtype::text as object_type,",
        "  grant_row.grantee::regrole::text as grantee,",
        "  grant_row.privilege_type as privileges",
        "from pg_default_acl acl",
        "join pg_namespace ns on ns.oid = acl.defaclnamespace",
        "join pg_roles owner on owner.oid = acl.defaclrole",
        "cross join lateral aclexplode(acl.defaclacl) as grant_row",
        "where ns.nspname = 'public'",
        "  and owner.rolname = 'postgres'",
        "  and grant_row.grantee::regrole::text in ('anon', 'authenticated')",
        "order by owner.rolname, acl.defaclobjtype::text, grantee, privileges",
      ].join("\n"),
    );
    for (const row of defaultAcl.rows) {
      messages.push(
        `public default privileges for ${row.owner_role}/${row.object_type} grant ${row.privileges} to ${row.grantee}.`,
      );
    }

    const rlsRows = await pool.query<{
      table_name: string;
      rls_enabled: boolean;
      rls_forced: boolean;
    }>(
      [
        "select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced",
        "from pg_class",
        "join pg_namespace on pg_namespace.oid = pg_class.relnamespace",
        "where pg_namespace.nspname = 'public'",
        "  and pg_class.relkind = 'r'",
        "order by relname",
      ].join("\n"),
    );
    for (const row of rlsRows.rows) {
      if (!row.rls_enabled || !row.rls_forced) {
        messages.push(
          `public.${row.table_name} must have RLS enabled and forced; got enabled=${row.rls_enabled} forced=${row.rls_forced}.`,
        );
      }
    }

    return messages;
  });

  if (failures.length > 0) {
    throw new Error(
      `Control DB security posture failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
  }
}

async function assertControlDbRowContractCoverage(workdir: string): Promise<void> {
  const publicTables = await queryPublicTables(workdir);
  const contractTables = sorted(new Set(rowContracts.map((contract) => contract.table)));
  if (!sameStringSet(publicTables, contractTables)) {
    throw new Error(
      [
        "Generated control-plane row contract table coverage does not match public tables.",
        `  Public tables:  ${JSON.stringify(publicTables)}`,
        `  Row contracts:  ${JSON.stringify(contractTables)}`,
      ].join("\n"),
    );
  }
}

async function assertControlDbIntegrityConstraints(workdir: string): Promise<void> {
  const requiredForeignKeys = [
    "assistant_scheduled_tasks_profile_id_profiles_id_fk",
    "assistant_work_items_origin_scheduled_task_profile_fk",
    "provider_webhook_subscriptions_connected_account_profile_fk",
    "provider_write_receipts_action_profile_fk",
    "provider_write_receipts_connected_account_profile_fk",
  ] as const;
  const requiredUniqueConstraints = [
    "assistant_scheduled_tasks_id_profile_unique",
    "connected_provider_accounts_id_profile_unique",
    "profile_actions_id_profile_unique",
    "capability_account_links_id_profile_unique",
  ] as const;

  const failures = await withControlDbPool(workdir, async (pool) => {
    const messages: string[] = [];
    const constraints = await pool.query<{ constraint_name: string; delete_rule: string }>(
      [
        "select tc.constraint_name, rc.delete_rule",
        "from information_schema.table_constraints tc",
        "left join information_schema.referential_constraints rc",
        "  on rc.constraint_schema = tc.constraint_schema",
        " and rc.constraint_name = tc.constraint_name",
        "where tc.table_schema = 'public'",
        "  and tc.constraint_type in ('FOREIGN KEY', 'UNIQUE')",
      ].join("\n"),
    );
    const byName = new Map(
      constraints.rows.map((row) => [row.constraint_name, row.delete_rule] as const),
    );
    for (const name of requiredForeignKeys) {
      if (!byName.has(name)) messages.push(`Missing required foreign key ${name}.`);
    }
    for (const name of requiredUniqueConstraints) {
      if (!byName.has(name)) messages.push(`Missing required unique constraint ${name}.`);
    }
    if (byName.get("assistant_scheduled_tasks_profile_id_profiles_id_fk") !== "CASCADE") {
      messages.push(
        "assistant_scheduled_tasks_profile_id_profiles_id_fk must use ON DELETE CASCADE.",
      );
    }
    return messages;
  });

  if (failures.length > 0) {
    throw new Error(
      `Control DB integrity constraint guard failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
  }
}

function resetCommand(profile: RuntimeProfile): string {
  return `npm run profile -- supabase reset --profile=${profile}`;
}

function assertNoSchemaDrift(workdir: string, profile: RuntimeProfile): void {
  const stdout = execFileSync(
    "npx",
    [...SUPABASE_CLI, "db", "diff", "--local", "--workdir", workdir],
    { cwd: workdir, encoding: "utf8", maxBuffer: 50_000_000 },
  );
  if (!/\bNo schema changes found\b/.test(stdout)) {
    throw new Error(
      [
        "Local database schema does not match migration files (drift).",
        "Common fixes:",
        `  ${resetCommand(profile)}   — reset local DB and reapply all migrations (wipes local data)`,
        "If you only added a new migration file:",
        "  npm run guard -- supabase-control-db already runs migration up; check migration SQL for errors.",
        "",
        "--- db diff output (excerpt) ---",
        stdout.slice(-4000),
      ].join("\n"),
    );
  }
}

export async function runSupabaseControlDbGuardCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      "skip-up": { type: "boolean" },
      "skip-types": { type: "boolean" },
    },
    schema: cliSchema,
  });
  if (args.help) {
    console.log(usage());
    return;
  }

  const root = repoRoot(import.meta.url);
  const { workdir } = syncProfileSupabaseProject(args.profile);
  const migrationsDir = path.join(workdir, "supabase", "migrations");

  const expected = migrationVersionsFromDisk(migrationsDir);
  if (expected.length === 0) {
    throw new Error(`No migration files found in ${migrationsDir}`);
  }

  if (!args.skipMigrationUp) {
    runMigrationUp(workdir);
  }

  const applied = await queryAppliedVersions(workdir);
  if (!sameStringSet(expected, applied)) {
    throw new Error(
      [
        "Control DB migration history does not match files in supabase/migrations.",
        `  Expected (from disk): ${JSON.stringify(expected)}`,
        `  Applied (database):    ${JSON.stringify(applied)}`,
        `Fix: ${resetCommand(args.profile)} — or resolve duplicate / missing migration versions.`,
      ].join("\n"),
    );
  }

  const driftCheck = process.env.SUPABASE_CONTROL_DB_SCHEMA_DRIFT_CHECK === "1";
  if (driftCheck) {
    console.log(
      "SUPABASE_CONTROL_DB_SCHEMA_DRIFT_CHECK=1: running supabase db diff --local (slow)...",
    );
    assertNoSchemaDrift(workdir, args.profile);
  }

  await assertControlDbSecurityPosture(workdir);
  await assertControlDbRowContractCoverage(workdir);
  await assertControlDbIntegrityConstraints(workdir);

  const skipTypes = args.skipTypes || process.env.SUPABASE_SKIP_CONTROL_DB_TYPES === "1";
  let controlDbTypesGenerated = false;
  if (!skipTypes) {
    await generateControlDbContracts({ root, workdir, mode: "local" });
    controlDbTypesGenerated = true;
  }

  printJson({
    ok: true,
    guard: "supabase-control-db",
    profile: args.profile,
    workdir,
    migrationVersions: expected,
    schemaDriftCheck: driftCheck,
    controlDbTypesGenerated,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runSupabaseControlDbGuardCli());
}
