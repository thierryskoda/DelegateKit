#!/usr/bin/env tsx
/**
 * Reconcile checked-in Nango binding mappings, Supabase connected rows, and live Nango inventory.
 *
 * `audit` reports drift (missing Supabase binds, missing remote references, unbound Nango inventory).
 * `apply` runs bind prune-stale + bind apply, then audits remote Nango drift.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSupabaseServiceClient } from "@ai-assistants/control-db";
import { formatUnknownError } from "@ai-assistants/errors";
import {
  repoRoot,
  requiresProdConfirmation,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import {
  installBackendRuntimeEnvForProfile,
  mergeResolvedProfileEnvIntoProcess,
  runNangoProfileBind,
} from "./bind-profile-nango.js";
import { parseProfileNangoBindingsFile } from "./bind-profile-nango-schema.js";
import {
  auditNangoSupabaseSync,
  type NangoSyncAuditReport,
} from "./nango-sync-inventory.js";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config.js";
import { envForProfile } from "../profiles/profile.js";

import { defaultNangoBindingMappingPaths } from "./nango-binding-mapping-paths.js";

function usage(): string {
  return [
    "Usage:",
    "  npm run integrations -- nango sync audit --profile=dev",
    "  npm run integrations -- nango sync audit --profile=e2e",
    "  npm run integrations -- nango sync apply --profile=dev",
    "  npm run integrations -- nango sync audit --profile=prod",
    "  npm run integrations -- nango sync apply --profile=prod --confirm-prod",
    "",
    "Options:",
    "  --profile=dev|e2e|prod (required) Supabase + Nango secret from profile env",
    "  --mapping=<path>       JSON binding file. Repeatable.",
    "  --confirm-prod         Required with --profile=prod and apply",
    "",
    "Dev defaults: testing-nango-bindings-dev.local.json.",
    "E2E defaults: testing-nango-bindings-e2e.local.json.",
    "Live mapping files are local-only; copy testing-nango-bindings.example.json to start.",
    "apply runs bind prune-stale + bind apply, then audits remote Nango drift.",
    "Unbound, missing, or duplicate-looking remote Nango connections are reported for review, not auto-deleted.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): {
  profile: RuntimeProfile;
  mode: "audit" | "apply";
  mappingPaths: readonly string[];
  confirmProd: boolean;
} {
  const raw = parseCli(argv, {
    options: {
      profile: { type: "string" },
      mapping: { type: "string", multiple: true },
      "confirm-prod": { type: "boolean" },
    },
    allowPositionals: true,
    transform: ({ values, positionals }) => {
      if (positionals.length !== 1) {
        throw new Error(`Expected sync subcommand audit or apply.\n\n${usage()}`);
      }
      return { ...values, action: positionals[0] };
    },
    schema: z.object({
      profile: z.enum(["dev", "e2e", "prod"]),
      action: z.enum(["audit", "apply"]),
      mapping: z.array(z.string()).optional(),
      "confirm-prod": z.boolean().optional(),
    }),
  });

  const mappingArgs = (raw.mapping ?? [])
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const mappingPaths = (
    mappingArgs.length > 0 ? mappingArgs : defaultNangoBindingMappingPaths(raw.profile)
  ).map((mappingPath) =>
    path.isAbsolute(mappingPath) ? mappingPath : path.join(repoRoot(import.meta.url), mappingPath),
  );
  const confirmProd = raw["confirm-prod"] === true;
  if (raw.profile === "prod" && mappingPaths.length === 0) {
    throw new Error(
      `No prod binding mapping files were provided. Pass an ignored *.local.json mapping before running prod sync.`,
    );
  }
  if (raw.profile === "e2e" && mappingPaths.length === 0) {
    throw new Error(
      `No e2e binding mapping file was provided. Copy scripts/integrations/testing-nango-bindings.example.json to scripts/integrations/testing-nango-bindings-e2e.local.json or pass --mapping.`,
    );
  }
  if (requiresProdConfirmation(raw.profile) && raw.action === "apply" && !confirmProd) {
    throw new Error(`Refusing ${raw.profile} mutation without --confirm-prod.\n\n${usage()}`);
  }

  return {
    profile: raw.profile,
    mode: raw.action,
    mappingPaths,
    confirmProd,
  };
}

function readBindings(mappingPaths: readonly string[]) {
  const bindings = mappingPaths.flatMap((mappingPath) => {
    const raw = JSON.parse(readFileSync(mappingPath, "utf8")) as unknown;
    return parseProfileNangoBindingsFile(raw).bindings;
  });
  const scopedProfileIds = [...new Set(bindings.map((binding) => binding.profileId))].sort();
  if (scopedProfileIds.length === 0) {
    throw new Error(
      [
        "Nango sync mapping files produced no scoped profile ids.",
        "Add at least one binding entry or use a prod audit path that scopes profiles from client runtime source.",
      ].join(" "),
    );
  }
  return { bindings, scopedProfileIds };
}

function formatAuditReport(report: NangoSyncAuditReport) {
  return {
    ok: report.ok,
    scopedProfileIds: report.scopedProfileIds,
    inventoryCount: report.inventory.length,
    protectedConnectionIds: report.protectedConnectionIds,
    unboundBindingEntries: report.unboundBindingEntries.map((binding) => ({
      profileId: binding.profileId,
      capabilitySlug: binding.capabilitySlug,
      provider: binding.provider,
      nangoConnectionId: binding.nangoConnectionId,
    })),
    missingRemoteReferences: report.missingRemoteReferences,
    unboundRemoteConnections: report.unboundRemoteConnections,
    inventory: report.inventory.map((item) => ({
      profileId: item.profileId,
      providerConfigKey: item.providerConfigKey,
      connectionId: item.connectionId,
      hasAuthError: item.hasAuthError,
      updatedAt: item.updatedAt,
    })),
  };
}

async function runBindMaintenance(
  profile: RuntimeProfile,
  mappingPaths: readonly string[],
  confirmProd: boolean,
): Promise<void> {
  const mappingFlags = mappingPaths.flatMap((mappingPath) => ["--mapping", mappingPath]);
  const confirmFlags = confirmProd ? ["--confirm-prod"] : [];
  await runNangoProfileBind([
    "prune-stale",
    `--profile=${profile}`,
    ...confirmFlags,
    ...mappingFlags,
  ]);
  await runNangoProfileBind([
    "apply",
    `--profile=${profile}`,
    "--no-wait-for-setup",
    ...confirmFlags,
    ...mappingFlags,
  ]);
}

export async function runNangoSync(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(usage());
    return;
  }

  const args = parseArgs(argv);
  mergeResolvedProfileEnvIntoProcess(envForProfile(args.profile));
  installBackendRuntimeEnvForProfile(args.profile);

  let { bindings, scopedProfileIds } = readBindings(args.mappingPaths);
  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));

  if (args.mode === "apply") {
    await runBindMaintenance(args.profile, args.mappingPaths, args.confirmProd);
    ({ bindings, scopedProfileIds } = readBindings(args.mappingPaths));
  }

  const report = await auditNangoSupabaseSync({
    profile: args.profile,
    db,
    bindings,
    scopedProfileIds,
  });

  console.log(
    JSON.stringify(
      {
        profile: args.profile,
        mode: args.mode,
        mappings: args.mappingPaths,
        ...formatAuditReport(report),
      },
      null,
      2,
    ),
  );

  if (!report.ok) process.exitCode = 1;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runNangoSync().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.stack || error.message : formatUnknownError(error),
    );
    process.exitCode = 1;
  });
}
