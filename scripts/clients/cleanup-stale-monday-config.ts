#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import {
  createSupabaseServiceClient,
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";

type CleanupArgs = {
  profile: RuntimeProfile;
  apply: boolean;
};

type CapabilityLinkCleanupRow = Pick<
  TableRow<"capability_account_links">,
  | "capability_slug"
  | "config"
  | "id"
  | "label"
  | "profile_id"
  | "provider"
  | "readiness_status"
  | "status"
>;

type CleanupRowSummary = {
  id: string;
  profileId: string;
  capabilitySlug: string;
  provider: string;
  label: string;
  status: string;
  readinessStatus: string;
  currentConfigKeys: string[];
  staleMondayKeys: string[];
  nextConfigKeys: string[];
};

function usage(): string {
  return [
    "Usage:",
    "  npm run clients -- cleanup-stale-monday-config --profile=prod",
    "  npm run clients -- cleanup-stale-monday-config --profile=prod --apply",
    "",
    "Finds Monday capability links whose config still contains the removed top-level",
    "`monday` semantic-schema key. Dry-run is the default; --apply removes only that key.",
    "",
    "Options:",
    "  --profile=dev|e2e|prod   Supabase/runtime profile to inspect (default: dev).",
    "  --apply              Update matching rows instead of only printing a dry-run.",
  ].join("\n");
}

const cleanupCliSchema = z
  .object({
    apply: z.boolean().optional(),
    help: z.boolean().optional(),
    profile: z.string().optional(),
  })
  .transform((raw) => {
    const profile = raw.profile?.trim() || "dev";
    assertRuntimeProfile(profile);
    return {
      apply: raw.apply === true,
      help: raw.help ?? false,
      profile,
    };
  });

function parseArgs(argv: readonly string[]): CleanupArgs {
  const parsed = parseCli(argv, {
    options: {
      apply: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
    },
    schema: cleanupCliSchema,
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  return { apply: parsed.apply, profile: parsed.profile };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonObject(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  return value;
}

function sortedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort((a, b) => a.localeCompare(b));
}

function hasStaleMondayConfig(row: CapabilityLinkCleanupRow): boolean {
  const config = jsonObject(row.config, `capability_account_links.${row.id}.config`);
  return Object.hasOwn(config, "monday");
}

function cleanedConfig(row: CapabilityLinkCleanupRow): Record<string, unknown> {
  const config = jsonObject(row.config, `capability_account_links.${row.id}.config`);
  const { monday: _staleMonday, ...nextConfig } = config;
  return nextConfig;
}

function summarizeRow(row: CapabilityLinkCleanupRow): CleanupRowSummary {
  const config = jsonObject(row.config, `capability_account_links.${row.id}.config`);
  const staleMondayKeys = Object.hasOwn(config, "monday")
    ? mondayConfigKeySummary(config.monday)
    : [];
  return {
    id: row.id,
    profileId: row.profile_id,
    capabilitySlug: row.capability_slug,
    provider: row.provider,
    label: row.label,
    status: row.status,
    readinessStatus: row.readiness_status,
    currentConfigKeys: sortedKeys(config),
    staleMondayKeys,
    nextConfigKeys: sortedKeys(cleanedConfig(row)),
  };
}

function mondayConfigKeySummary(value: unknown): string[] {
  if (isRecord(value)) return sortedKeys(value);
  return [`<${value === null ? "null" : typeof value}>`];
}

async function loadStaleMondayConfigRows(
  db: SupabaseServiceClient,
): Promise<CapabilityLinkCleanupRow[]> {
  const result = await db
    .from("capability_account_links")
    .select("id,profile_id,capability_slug,provider,label,status,readiness_status,config")
    .eq("capability_slug", "monday")
    .order("profile_id")
    .order("label");
  const rows = requireSupabaseRows(
    "Load Monday capability links for stale config cleanup",
    result.data,
    result.error,
  );
  return rows.filter(hasStaleMondayConfig);
}

async function removeStaleMondayConfig(
  db: SupabaseServiceClient,
  row: CapabilityLinkCleanupRow,
): Promise<CapabilityLinkCleanupRow> {
  const result = await db
    .from("capability_account_links")
    .update({
      config: requireJsonObject(cleanedConfig(row), `capability_account_links.${row.id}.config`),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("profile_id", row.profile_id)
    .eq("capability_slug", row.capability_slug)
    .select("id,profile_id,capability_slug,provider,label,status,readiness_status,config")
    .single();
  return requireSupabaseData(
    `Remove stale config.monday from capability_account_links.${row.id}`,
    result.data,
    result.error,
  );
}

export async function runClientCleanupStaleMondayConfigCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv);
  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));
  const before = await loadStaleMondayConfigRows(db);
  const beforeSummaries = before.map(summarizeRow);

  console.log(
    JSON.stringify(
      {
        profile: args.profile,
        dryRun: !args.apply,
        matchedRows: beforeSummaries.length,
        rows: beforeSummaries,
      },
      null,
      2,
    ),
  );

  if (!args.apply) {
    console.log(
      beforeSummaries.length === 0
        ? "No stale config.monday keys found."
        : "Dry run only. Re-run with --apply to remove only config.monday from these rows.",
    );
    return;
  }

  const updated: CleanupRowSummary[] = [];
  for (const row of before) {
    updated.push(summarizeRow(await removeStaleMondayConfig(db, row)));
  }

  const after = await loadStaleMondayConfigRows(db);
  console.log(
    JSON.stringify(
      {
        profile: args.profile,
        updatedRows: updated.length,
        updated,
        remainingStaleRows: after.map(summarizeRow),
      },
      null,
      2,
    ),
  );

  if (after.length > 0) {
    throw new Error(`Expected zero stale config.monday rows; found ${after.length}.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCliMain(() => runClientCleanupStaleMondayConfigCli());
}
