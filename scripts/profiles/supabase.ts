#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import path from "node:path";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { pathToFileURL } from "node:url";
import { createSupabaseServiceClient } from "@ai-assistants/control-db";
import {
  assertRuntimeProfile,
  isLocalSupabaseManagedProfile,
  profileEnvPath,
  profileRuntimeDir,
  repoRoot,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import { z } from "zod";
import { upsertManagedEnvBlock, writeSecretFileAtomic } from "./profile-env-blocks";
import { parseSubcommandCli } from "@ai-assistants/workspace-shared";
import { Client } from "pg";
import { stopKnownGoogleDriveSubscriptionsBeforeDevReset } from "../../apps/backend/src/ops-support/profile-runtime-maintenance";
import { formatBoundedCommandFailure, runBoundedCommand } from "../repo-tooling/bounded-command";
import { seedMissingClientProfiles } from "../clients/seed-missing-profiles";
import { formatSupabaseAuthAdminError } from "../clients/seed-profile-db";
import {
  readSupabaseLocalDatabaseUrl,
  readSupabaseLocalStatus,
  type SupabaseLocalStatus,
} from "./supabase-status";
import { compactProfileEnvFile, envForProfile } from "./profile";
import type { E2eLaneSupabasePorts } from "../repo-tooling/e2e-lane-runtime";

const SUPABASE_CLI = ["--yes", "supabase@2.98.1"] as const;
const SUPABASE_START_TIMEOUT_MS = 300_000;
const SUPABASE_DB_RESET_TIMEOUT_MS = 300_000;
const SUPABASE_STOP_TIMEOUT_MS = 45_000;
const SUPABASE_DEFAULT_TIMEOUT_MS = 60_000;
const E2E_SUPABASE_API_READY_MAX_ATTEMPTS = 12;
const E2E_SUPABASE_API_READY_RETRY_MS = 2_000;
const SUPABASE_AUTH_ADMIN_READY_MAX_ATTEMPTS = 18;
const SUPABASE_AUTH_ADMIN_READY_RETRY_MS = 1_000;
const SEED_MISSING_CLIENT_PROFILES_MAX_ATTEMPTS = 6;
const SEED_MISSING_CLIENT_PROFILES_RETRY_MS = 1_000;
const ENV_BLOCK_BEGIN = "# BEGIN AI ASSISTANTS LOCAL SUPABASE";
const ENV_BLOCK_END = "# END AI ASSISTANTS LOCAL SUPABASE";
const E2E_SUPABASE_PORTS: E2eLaneSupabasePorts = {
  api: 56321,
  db: 56322,
  shadow: 56320,
  pooler: 56329,
  studio: 56323,
  inbucket: 56324,
  analytics: 56327,
};

export type E2eSupabaseRuntimeOptions = {
  workdir: string;
  envPath: string;
  projectId: string;
  dockerContext: string;
  ports: E2eLaneSupabasePorts;
};

export type E2eSupabaseRuntimeResetResult = {
  status: SupabaseLocalStatus;
  fingerprint: string;
};

const supabaseCliSchema = z
  .object({
    action: z.enum(["start", "status", "stop", "reset", "env"]),
    profile: z.string().min(1),
  })
  .transform(({ action, profile }) => {
    assertRuntimeProfile(profile);
    return { action, profile: profile as RuntimeProfile };
  });

export function defaultSupabaseWorkdirForProfile(profile: RuntimeProfile): string {
  if (profile === "dev") return repoRoot(import.meta.url);
  if (profile === "e2e") return profileRuntimeDir("e2e");
  throw new Error(
    `Profile ${profile} is not managed by the local Supabase stack. Configure production Supabase outside the local profile launcher.`,
  );
}

function rewriteE2eSupabaseConfig(
  source: string,
  options: { projectId: string; ports: E2eLaneSupabasePorts } = {
    projectId: "code-e2e",
    ports: E2E_SUPABASE_PORTS,
  },
): string {
  return source
    .replace(/^project_id = ".*"$/m, `project_id = "${options.projectId}"`)
    .replace(/^port = 54321$/m, `port = ${options.ports.api}`)
    .replace(/^port = 54322$/m, `port = ${options.ports.db}`)
    .replace(/^shadow_port = 54320$/m, `shadow_port = ${options.ports.shadow}`)
    .replace(/^port = 54329$/m, `port = ${options.ports.pooler}`)
    .replace(/^port = 54323$/m, `port = ${options.ports.studio}`)
    .replace(/^port = 54324$/m, `port = ${options.ports.inbucket}`)
    .replace(/^port = 54327$/m, `port = ${options.ports.analytics}`)
    .replace(/(\[analytics\]\nenabled = )true/m, "$1false");
}

function writeFileIfChanged(filePath: string, text: string): boolean {
  const existing = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  if (existing === text) return false;
  writeFileSync(filePath, text, { mode: 0o600 });
  return true;
}

function syncE2eSupabaseProject(
  workdir: string,
  options: { projectId: string; ports: E2eLaneSupabasePorts } = {
    projectId: "code-e2e",
    ports: E2E_SUPABASE_PORTS,
  },
): boolean {
  const sourceRoot = path.join(repoRoot(import.meta.url), "supabase");
  const targetRoot = path.join(workdir, "supabase");
  mkdirSync(targetRoot, { recursive: true });

  let changed = false;
  changed =
    writeFileIfChanged(
      path.join(targetRoot, "config.toml"),
      rewriteE2eSupabaseConfig(readFileSync(path.join(sourceRoot, "config.toml"), "utf8"), options),
    ) || changed;
  changed =
    writeFileIfChanged(
      path.join(targetRoot, "seed.sql"),
      readFileSync(path.join(sourceRoot, "seed.sql"), "utf8"),
    ) || changed;

  const targetMigrations = path.join(targetRoot, "migrations");
  rmSync(targetMigrations, { recursive: true, force: true });
  cpSync(path.join(sourceRoot, "migrations"), targetMigrations, { recursive: true });
  changed = true;

  const sourceGitignore = path.join(sourceRoot, ".gitignore");
  if (existsSync(sourceGitignore)) {
    copyFileSync(sourceGitignore, path.join(targetRoot, ".gitignore"));
  }

  return changed;
}

function sourceSupabaseRoot(): string {
  return path.join(repoRoot(import.meta.url), "supabase");
}

function e2eSupabaseProjectFingerprintInput(options: E2eSupabaseRuntimeOptions): string[] {
  const sourceRoot = sourceSupabaseRoot();
  const migrationsDir = path.join(sourceRoot, "migrations");
  const migrationFiles = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  return [
    `supabase-cli=${SUPABASE_CLI.join(" ")}`,
    "supabase/config.toml",
    rewriteE2eSupabaseConfig(readFileSync(path.join(sourceRoot, "config.toml"), "utf8"), {
      projectId: options.projectId,
      ports: options.ports,
    }),
    "supabase/seed.sql",
    readFileSync(path.join(sourceRoot, "seed.sql"), "utf8"),
    ...migrationFiles.flatMap((fileName) => [
      `supabase/migrations/${fileName}`,
      readFileSync(path.join(migrationsDir, fileName), "utf8"),
    ]),
  ];
}

export function computeE2eSupabaseRuntimeFingerprint(options: E2eSupabaseRuntimeOptions): string {
  const hash = createHash("sha256");
  for (const part of e2eSupabaseProjectFingerprintInput(options)) {
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function syncE2eSupabaseRuntimeProject(options: E2eSupabaseRuntimeOptions): {
  workdir: string;
  changed: boolean;
} {
  return {
    workdir: options.workdir,
    changed: syncE2eSupabaseProject(options.workdir, {
      projectId: options.projectId,
      ports: options.ports,
    }),
  };
}

export function syncProfileSupabaseProject(profile: RuntimeProfile): {
  workdir: string;
  changed: boolean;
} {
  if (!isLocalSupabaseManagedProfile(profile)) {
    throw new Error(
      `Profile ${profile} is not managed by the repo-local Supabase stack. Configure production Supabase outside the local profile launcher.`,
    );
  }
  const workdir = defaultSupabaseWorkdirForProfile(profile);
  if (profile === "e2e") {
    return { workdir, changed: syncE2eSupabaseProject(workdir) };
  }
  return { workdir, changed: false };
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

function timedSyncStep<T>(label: string, run: () => T): T {
  const startedAt = Date.now();
  try {
    return run();
  } finally {
    console.log(`[supabase:timing] ${label} ${formatDuration(Date.now() - startedAt)}`);
  }
}

async function timedAsyncStep<T>(label: string, run: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    console.log(`[supabase:timing] ${label} ${formatDuration(Date.now() - startedAt)}`);
  }
}

function timeoutForSupabaseArgs(args: readonly string[]): number {
  if (args[0] === "start") return SUPABASE_START_TIMEOUT_MS;
  if (args[0] === "db" && args[1] === "reset") return SUPABASE_DB_RESET_TIMEOUT_MS;
  if (args[0] === "stop") return SUPABASE_STOP_TIMEOUT_MS;
  return SUPABASE_DEFAULT_TIMEOUT_MS;
}

function dockerEnvForContext(dockerContext: string | undefined): NodeJS.ProcessEnv | undefined {
  if (!dockerContext) return undefined;
  return {
    ...process.env,
    DOCKER_CONTEXT: dockerContext,
  };
}

function runSupabase(
  args: readonly string[],
  workdir: string,
  options: { dockerContext?: string } = {},
): void {
  const contextLabel = options.dockerContext ? ` DOCKER_CONTEXT=${options.dockerContext}` : "";
  console.log(
    `$${contextLabel} npx ${SUPABASE_CLI.join(" ")} ${args.join(" ")} --workdir ${workdir}`,
  );
  const maxAttempts = 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runBoundedCommand("npx", [...SUPABASE_CLI, ...args, "--workdir", workdir], {
      cwd: repoRoot(import.meta.url),
      maxBuffer: 20_000_000,
      timeoutMs: timeoutForSupabaseArgs(args),
      env: dockerEnvForContext(options.dockerContext),
    });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status === 0 && !result.timedOut) return;
    if (attempt < maxAttempts) {
      console.warn(
        `Supabase start failed (${result.timedOut ? "timeout" : `status ${result.status ?? "unknown"}`}); retrying (${attempt + 1}/${maxAttempts})...`,
      );
      sleepSync(2_000 * attempt);
      continue;
    }
    throw new Error(
      `Supabase CLI failed for ${args.join(" ")}:\n${formatBoundedCommandFailure(result)}`,
    );
  }
}

function upsertProfileEnvBlock(profile: RuntimeProfile, status: SupabaseLocalStatus): void {
  const envPath = profileEnvPath(profile);
  upsertSupabaseEnvBlockAtPath({
    envPath,
    profileLabel: profile,
    status,
    compactProfile,
  });
}

function compactProfile(profile: RuntimeProfile): void {
  compactProfileEnvFile(profile);
}

function upsertSupabaseEnvBlockAtPath(input: {
  envPath: string;
  profileLabel: string;
  status: SupabaseLocalStatus;
  compactProfile?: (profile: RuntimeProfile) => void;
}): void {
  const { envPath, status } = input;
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const next = upsertManagedEnvBlock({
    existingText: existing,
    blockBegin: ENV_BLOCK_BEGIN,
    blockEnd: ENV_BLOCK_END,
    blockBodyLines: [
      `# Managed by ${input.profileLabel} local Supabase start/reset.`,
      `SUPABASE_LOCAL_WORKDIR=${status.workdir}`,
      `SUPABASE_URL=${status.apiUrl}`,
      `SUPABASE_ANON_KEY=${status.anonKey}`,
      `SUPABASE_SERVICE_ROLE_KEY=${status.serviceRoleKey}`,
    ],
  });
  writeSecretFileAtomic(envPath, next);
  if (
    input.profileLabel === "dev" ||
    input.profileLabel === "e2e" ||
    input.profileLabel === "prod"
  ) {
    input.compactProfile?.(input.profileLabel);
  }
  console.log(`Updated ${envPath} with ${input.profileLabel} local Supabase connection values.`);
}

function printStatus(profile: RuntimeProfile, status: SupabaseLocalStatus): void {
  printStatusWithEnvPath(profile, status, profileEnvPath(profile));
}

function printStatusWithEnvPath(
  profile: RuntimeProfile,
  status: SupabaseLocalStatus,
  envPath: string,
): void {
  console.log(
    JSON.stringify(
      {
        profile,
        workdir: status.workdir,
        supabaseUrl: status.apiUrl,
        envPath,
        anonKey: "<set>",
        serviceRoleKey: "<set>",
      },
      null,
      2,
    ),
  );
}

function readProfileStatus(
  profile: RuntimeProfile,
  workdir: string,
  options: { dockerContext?: string } = {},
): SupabaseLocalStatus {
  const maxAttempts = 6;
  let lastMessage = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return readSupabaseLocalStatus(workdir, { dockerContext: options.dockerContext });
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : String(error);
      if (attempt < maxAttempts) {
        sleepSync(1_000 * attempt);
        continue;
      }
    }
  }
  throw new Error(
    `Profile ${profile} local Supabase is not running at ${workdir}. Run npm run profile -- supabase start --profile=${profile}, then retry. ${lastMessage}`,
  );
}

async function stopKnownDevWebhookSubscriptionsBeforeReset(
  profile: RuntimeProfile,
  status: SupabaseLocalStatus,
): Promise<void> {
  if (profile !== "dev") return;
  Object.assign(process.env, envForProfile(profile));
  const summary = await stopKnownGoogleDriveSubscriptionsBeforeDevReset(
    createSupabaseServiceClient({
      url: status.apiUrl,
      serviceRoleKey: status.serviceRoleKey,
    }),
  );
  console.log(
    `Stopped known dev Google Drive webhook subscriptions before reset: ${summary.stopped} stopped, ${summary.deleted} local row(s) deleted, ${summary.skipped} skipped.`,
  );
}

async function seedMissingClientProfilesWithRetry(input: {
  profile: RuntimeProfile;
  status: SupabaseLocalStatus;
}): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= SEED_MISSING_CLIENT_PROFILES_MAX_ATTEMPTS; attempt += 1) {
    try {
      await seedMissingClientProfiles({
        runtimeProfile: input.profile,
        supabaseUrl: input.status.apiUrl,
        db: createSupabaseServiceClient({
          url: input.status.apiUrl,
          serviceRoleKey: input.status.serviceRoleKey,
        }),
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < SEED_MISSING_CLIENT_PROFILES_MAX_ATTEMPTS) {
        await sleep(SEED_MISSING_CLIENT_PROFILES_RETRY_MS * attempt);
        continue;
      }
    }
  }
  throw lastError;
}

async function waitForE2eSupabaseApiReadiness(input: {
  status: SupabaseLocalStatus;
  workdir: string;
  projectId: string;
}): Promise<void> {
  const db = createSupabaseServiceClient({
    url: input.status.apiUrl,
    serviceRoleKey: input.status.serviceRoleKey,
  });
  let lastMessage = "";
  for (let attempt = 1; attempt <= E2E_SUPABASE_API_READY_MAX_ATTEMPTS; attempt += 1) {
    const profilesResult = await db.from("profiles").select("id").limit(1);
    const assistantsResult = await db.from("assistants").select("assistant_id").limit(1);
    const capabilitiesResult = await db.from("profile_capabilities").select("id").limit(1);
    const channelsResult = await db.from("profile_channels").select("id").limit(1);
    const firstError =
      profilesResult.error ??
      assistantsResult.error ??
      capabilitiesResult.error ??
      channelsResult.error;
    if (!firstError) return;
    lastMessage = firstError.message;
    if (attempt < E2E_SUPABASE_API_READY_MAX_ATTEMPTS) {
      console.warn(
        `E2E Supabase API/schema cache is not ready for ${input.projectId} (${attempt}/${E2E_SUPABASE_API_READY_MAX_ATTEMPTS}): ${lastMessage}`,
      );
      await sleep(E2E_SUPABASE_API_READY_RETRY_MS);
    }
  }
  throw new Error(
    `E2E Supabase API/schema cache did not become ready for ${input.projectId} at ${input.status.apiUrl} after ${E2E_SUPABASE_API_READY_MAX_ATTEMPTS} attempts. workdir=${input.workdir}. Last error: ${lastMessage}`,
  );
}

async function waitForSupabaseAuthAdminReadiness(input: {
  status: SupabaseLocalStatus;
  workdir: string;
  label: string;
}): Promise<void> {
  const db = createSupabaseServiceClient({
    url: input.status.apiUrl,
    serviceRoleKey: input.status.serviceRoleKey,
  });
  let lastMessage = "";
  for (let attempt = 1; attempt <= SUPABASE_AUTH_ADMIN_READY_MAX_ATTEMPTS; attempt += 1) {
    const result = await db.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (!result.error) return;
    lastMessage = formatSupabaseAuthAdminError(result.error);
    if (attempt < SUPABASE_AUTH_ADMIN_READY_MAX_ATTEMPTS) {
      console.warn(
        `Supabase Auth admin API is not ready for ${input.label} (${attempt}/${SUPABASE_AUTH_ADMIN_READY_MAX_ATTEMPTS}): ${lastMessage}`,
      );
      await sleep(SUPABASE_AUTH_ADMIN_READY_RETRY_MS);
    }
  }
  throw new Error(
    `Supabase Auth admin API did not become ready for ${input.label} at ${input.status.apiUrl} after ${SUPABASE_AUTH_ADMIN_READY_MAX_ATTEMPTS} attempts. workdir=${input.workdir}. Last error: ${lastMessage}`,
  );
}

async function connectLocalPostgres(input: {
  workdir: string;
  dockerContext?: string;
}): Promise<Client> {
  const client = new Client({
    connectionString: readSupabaseLocalDatabaseUrl(input.workdir, {
      dockerContext: input.dockerContext,
    }),
  });
  await client.connect();
  return client;
}

async function listE2eResetTables(client: Client): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(
    [
      "select format('%I.%I', namespace.nspname, relation.relname) as table_name",
      "from pg_class relation",
      "join pg_namespace namespace on namespace.oid = relation.relnamespace",
      "where namespace.nspname in ('public', 'auth', 'storage')",
      "  and relation.relkind in ('r', 'p')",
      "  and not (namespace.nspname = 'auth' and relation.relname = 'schema_migrations')",
      "  and (",
      "    namespace.nspname <> 'storage'",
      "    or relation.relname in ('buckets', 'objects', 's3_multipart_uploads', 's3_multipart_uploads_parts')",
      "  )",
      "  and not exists (",
      "    select 1",
      "    from pg_depend dependency",
      "    join pg_extension extension on extension.oid = dependency.refobjid",
      "    where dependency.objid = relation.oid",
      "      and dependency.deptype = 'e'",
      "  )",
      "order by namespace.nspname, relation.relname",
    ].join("\n"),
  );
  return result.rows.map((row) => row.table_name);
}

async function assertE2eResetTablesAreEmpty(
  client: Client,
  tables: readonly string[],
): Promise<void> {
  if (tables.length === 0) return;
  const statements = tables.map(
    (tableName) =>
      `select ${client.escapeLiteral(tableName)} as table_name, count(*)::int as row_count from ${tableName}`,
  );
  const result = await client.query<{ table_name: string; row_count: number }>(
    statements.join("\nunion all\n"),
  );
  const nonEmpty = result.rows.filter((row) => row.row_count > 0);
  if (nonEmpty.length === 0) return;
  throw new Error(
    `E2E data reset left row(s) behind: ${nonEmpty
      .map((row) => `${row.table_name}=${row.row_count}`)
      .join(", ")}`,
  );
}

async function truncateE2eResetTables(client: Client): Promise<void> {
  const tables = await listE2eResetTables(client);
  if (tables.length === 0) {
    throw new Error("E2E data reset found no local Supabase tables to truncate.");
  }
  await client.query("begin");
  try {
    await client.query(`truncate table ${tables.join(", ")} cascade`);
    await assertE2eResetTablesAreEmpty(client, tables);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function resetE2eSupabaseRuntimeDataOnly(
  options: E2eSupabaseRuntimeOptions,
): Promise<E2eSupabaseRuntimeResetResult> {
  const { workdir, changed } = timedSyncStep("reset.sync_supabase_project", () =>
    syncE2eSupabaseRuntimeProject(options),
  );
  if (changed) {
    console.log(`Synced e2e lane Supabase config into ${workdir}.`);
  }
  const fingerprint = computeE2eSupabaseRuntimeFingerprint(options);
  timedSyncStep("reset.supabase_start", () =>
    runSupabase(["start"], workdir, { dockerContext: options.dockerContext }),
  );
  const status = timedSyncStep("reset.read_status", () =>
    readProfileStatus("e2e", workdir, { dockerContext: options.dockerContext }),
  );
  const client = await connectLocalPostgres({
    workdir,
    dockerContext: options.dockerContext,
  });
  try {
    await timedAsyncStep("reset.supabase_data_truncate", () => truncateE2eResetTables(client));
  } finally {
    await client.end();
  }
  await timedAsyncStep("reset.wait_for_api_schema", () =>
    waitForE2eSupabaseApiReadiness({
      status,
      workdir,
      projectId: options.projectId,
    }),
  );
  timedSyncStep("reset.write_env", () =>
    upsertSupabaseEnvBlockAtPath({
      envPath: options.envPath,
      profileLabel: `e2e lane ${options.projectId}`,
      status,
    }),
  );
  await timedAsyncStep("reset.wait_for_auth_admin", () =>
    waitForSupabaseAuthAdminReadiness({
      status,
      workdir,
      label: `e2e lane ${options.projectId}`,
    }),
  );
  await timedAsyncStep("reset.seed_missing_client_profiles", () =>
    seedMissingClientProfilesWithRetry({ profile: "e2e", status }),
  );
  await timedAsyncStep("reset.wait_for_api_schema_after_seed", () =>
    waitForE2eSupabaseApiReadiness({
      status,
      workdir,
      projectId: options.projectId,
    }),
  );
  printStatusWithEnvPath("e2e", status, options.envPath);
  return { status, fingerprint };
}

export async function runProfileSupabaseCli(argv = process.argv.slice(2)): Promise<void> {
  const { action, profile } = parseSubcommandCli(argv, {
    options: { profile: { type: "string" } },
    subcommands: ["start", "status", "stop", "reset", "env"],
    schema: supabaseCliSchema,
  });
  const { workdir, changed } = timedSyncStep(`${action}.sync_supabase_project`, () =>
    syncProfileSupabaseProject(profile),
  );

  if (changed) {
    console.log(`Synced ${profile} Supabase config into ${workdir}.`);
  }

  if (action === "start") {
    timedSyncStep("start.supabase_start", () => runSupabase(["start"], workdir));
    const status = timedSyncStep("start.read_status", () => readProfileStatus(profile, workdir));
    timedSyncStep("start.write_env", () => upsertProfileEnvBlock(profile, status));
    printStatus(profile, status);
    return;
  }

  if (action === "reset") {
    timedSyncStep("reset.supabase_start", () => runSupabase(["start"], workdir));
    const preResetStatus = timedSyncStep("reset.read_status_before_reset", () =>
      readProfileStatus(profile, workdir),
    );
    await timedAsyncStep("reset.stop_dev_webhook_subscriptions", () =>
      stopKnownDevWebhookSubscriptionsBeforeReset(profile, preResetStatus),
    );
    timedSyncStep("reset.supabase_db_reset", () => runSupabase(["db", "reset"], workdir));
    const status = timedSyncStep("reset.read_status_after_reset", () =>
      readProfileStatus(profile, workdir),
    );
    timedSyncStep("reset.write_env", () => upsertProfileEnvBlock(profile, status));
    await timedAsyncStep("reset.wait_for_auth_admin", () =>
      waitForSupabaseAuthAdminReadiness({ status, workdir, label: profile }),
    );
    await timedAsyncStep("reset.seed_missing_client_profiles", () =>
      seedMissingClientProfilesWithRetry({ profile, status }),
    );
    printStatus(profile, status);
    return;
  }

  if (action === "stop") {
    runSupabase(["stop"], workdir);
    return;
  }

  const status = readProfileStatus(profile, workdir);
  if (action === "env") upsertProfileEnvBlock(profile, status);
  printStatus(profile, status);
}

export async function resetE2eSupabaseRuntime(
  options: E2eSupabaseRuntimeOptions,
): Promise<E2eSupabaseRuntimeResetResult> {
  const { workdir, changed } = timedSyncStep("reset.sync_supabase_project", () =>
    syncE2eSupabaseRuntimeProject(options),
  );
  if (changed) {
    console.log(`Synced e2e lane Supabase config into ${workdir}.`);
  }
  const fingerprint = computeE2eSupabaseRuntimeFingerprint(options);
  timedSyncStep("reset.supabase_start", () =>
    runSupabase(["start"], workdir, { dockerContext: options.dockerContext }),
  );
  timedSyncStep("reset.supabase_db_reset", () =>
    runSupabase(["db", "reset"], workdir, { dockerContext: options.dockerContext }),
  );
  const status = timedSyncStep("reset.read_status", () =>
    readProfileStatus("e2e", workdir, { dockerContext: options.dockerContext }),
  );
  await timedAsyncStep("reset.wait_for_api_schema", () =>
    waitForE2eSupabaseApiReadiness({
      status,
      workdir,
      projectId: options.projectId,
    }),
  );
  timedSyncStep("reset.write_env", () =>
    upsertSupabaseEnvBlockAtPath({
      envPath: options.envPath,
      profileLabel: `e2e lane ${options.projectId}`,
      status,
    }),
  );
  await timedAsyncStep("reset.wait_for_auth_admin", () =>
    waitForSupabaseAuthAdminReadiness({
      status,
      workdir,
      label: `e2e lane ${options.projectId}`,
    }),
  );
  await timedAsyncStep("reset.seed_missing_client_profiles", () =>
    seedMissingClientProfilesWithRetry({ profile: "e2e", status }),
  );
  await timedAsyncStep("reset.wait_for_api_schema_after_seed", () =>
    waitForE2eSupabaseApiReadiness({
      status,
      workdir,
      projectId: options.projectId,
    }),
  );
  printStatusWithEnvPath("e2e", status, options.envPath);
  return { status, fingerprint };
}

export function stopE2eSupabaseRuntime(options: { workdir: string; dockerContext?: string }): void {
  runSupabase(["stop", "--no-backup"], options.workdir, {
    dockerContext: options.dockerContext,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProfileSupabaseCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
