#!/usr/bin/env tsx
import { pathToFileURL } from "node:url";
import {
  createSupabaseServiceClient,
  requireSupabaseRows,
  type SupabaseServiceClient,
} from "@ai-assistants/control-db";
import { evaluateNangoOAuthReadiness } from "@ai-assistants/nango-provisioning";
import { requiresProdConfirmation, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import {
  bindExistingNangoAuthConnection,
  createNangoAdminClient,
  normalizeNangoOAuthConnectionEvidence,
} from "../../apps/backend/src/ops-support/nango-auth";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";
import { envForProfile, runtimeRootForProfile } from "../profiles/profile";

function usage(): string {
  return [
    "Usage:",
    "  npm run integrations -- nango oauth-projection check --profile=prod --profile-id=<profile-id> --provider-config-key=ai-assistants-outlook",
    "  npm run integrations -- nango oauth-projection check --profile=prod --all-profiles --provider-config-key=ai-assistants-outlook",
    "  npm run integrations -- nango oauth-projection apply --profile=prod --profile-id=<profile-id> --provider-config-key=ai-assistants-outlook --provider-config-key=ai-assistants-microsoft-onedrive --confirm-prod",
    "",
    "Options:",
    "  --profile=dev|e2e|prod             Runtime profile whose env/Supabase/Nango keys are used.",
    "  --profile-id=<id>                  Control-plane profile id to inspect or repair. Repeatable.",
    "  --all-profiles                     Check all enabled Nango-backed profile links. Check-only; apply must stay profile-scoped.",
    "  --provider-config-key=<key>        Optional Nango provider config key filter. Repeatable.",
    "  --confirm-prod                     Required for prod apply.",
  ].join("\n");
}

const argsSchema = z.object({
  action: z.enum(["check", "apply"]),
  profile: z.enum(["dev", "e2e", "prod"]),
  "profile-id": z.array(z.string().trim().min(1)).optional(),
  "all-profiles": z.boolean().optional(),
  "provider-config-key": z.array(z.string().trim().min(1)).optional(),
  "confirm-prod": z.boolean().optional(),
});

type Args = z.infer<typeof argsSchema>;

function parseArgs(argv: readonly string[]): Args {
  return parseCli(argv, {
    options: {
      profile: { type: "string" },
      "profile-id": { type: "string", multiple: true },
      "all-profiles": { type: "boolean" },
      "provider-config-key": { type: "string", multiple: true },
      "confirm-prod": { type: "boolean" },
    },
    allowPositionals: true,
    transform: ({ values, positionals }) => {
      if (positionals.length !== 1) {
        throw new Error(`Expected oauth-projection subcommand check or apply.\n\n${usage()}`);
      }
      return { ...values, action: positionals[0] };
    },
    schema: argsSchema,
  });
}

type Candidate = {
  profileId: string;
  capabilityAccountLinkId: string;
  capabilitySlug: string;
  providerConfigKey: string;
  connectionId: string;
  accountId: string;
  beforeReadinessStatus: string;
  beforeReadinessBlockerCode: string | null;
};

function accountFromJoinedRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const account = row.connected_provider_accounts;
  return account && typeof account === "object" && !Array.isArray(account)
    ? (account as Record<string, unknown>)
    : null;
}

async function loadCandidates(
  db: SupabaseServiceClient,
  args: Args,
): Promise<Candidate[]> {
  let query = db
    .from("capability_account_links")
    .select(
      "id,profile_id,capability_slug,readiness_status,readiness_blocker_code,connected_provider_accounts!capability_account_links_connected_account_profile_fk(id,nango_provider_config_key,nango_connection_id)",
    )
    .eq("status", "enabled");
  if (!args["all-profiles"]) {
    query = query.in("profile_id", args["profile-id"] ?? []);
  }
  const result = await query;
  const rows = requireSupabaseRows("Load Nango OAuth projection backfill candidates", result.data, result.error);
  const providerFilter = new Set(args["provider-config-key"] ?? []);
  const deduped = new Map<string, Candidate>();
  for (const rawRow of rows as unknown as Record<string, unknown>[]) {
    const account = accountFromJoinedRow(rawRow);
    const providerConfigKey =
      typeof account?.nango_provider_config_key === "string"
        ? account.nango_provider_config_key.trim()
        : "";
    const connectionId =
      typeof account?.nango_connection_id === "string" ? account.nango_connection_id.trim() : "";
    const accountId = typeof account?.id === "string" ? account.id.trim() : "";
    if (!providerConfigKey || !connectionId || !accountId) continue;
    if (providerFilter.size > 0 && !providerFilter.has(providerConfigKey)) continue;
    const profileId = String(rawRow.profile_id);
    const key = `${profileId}\0${providerConfigKey}\0${connectionId}`;
    if (deduped.has(key)) continue;
    deduped.set(key, {
      profileId,
      capabilityAccountLinkId: String(rawRow.id),
      capabilitySlug: String(rawRow.capability_slug),
      providerConfigKey,
      connectionId,
      accountId,
      beforeReadinessStatus: String(rawRow.readiness_status),
      beforeReadinessBlockerCode:
        typeof rawRow.readiness_blocker_code === "string"
          ? rawRow.readiness_blocker_code
          : null,
    });
  }
  return [...deduped.values()].sort((a, b) =>
    `${a.profileId}:${a.providerConfigKey}`.localeCompare(`${b.profileId}:${b.providerConfigKey}`),
  );
}

async function dryRunCandidate(candidate: Candidate): Promise<Record<string, unknown>> {
  const nango = createNangoAdminClient();
  const connectionRecord = await nango.getConnection(
    candidate.providerConfigKey,
    candidate.connectionId,
    false,
    true,
  );
  const evidence = normalizeNangoOAuthConnectionEvidence({
    connectionRecord,
    providerConfigKey: candidate.providerConfigKey,
    connectionId: candidate.connectionId,
    fetchedAt: new Date().toISOString(),
  });
  const readiness = evaluateNangoOAuthReadiness({
    providerConfigKey: candidate.providerConfigKey,
    grantedScopes: evidence.grantedScopes,
    refreshCapable: evidence.refreshCapable,
    credentialStatus: evidence.credentialStatus,
    nangoErrorTypes: evidence.nangoErrorTypes,
  });
  return {
    ...candidate,
    dryRun: true,
    grantedScopesCount: evidence.grantedScopes.length,
    refreshCapable: evidence.refreshCapable,
    credentialStatus: evidence.credentialStatus,
    nangoErrorTypes: evidence.nangoErrorTypes,
    ready: readiness.ready,
    missingGrantedScopes: readiness.missingGrantedScopes,
    missingRefreshToken: readiness.missingRefreshToken,
    hasAuthError: readiness.hasAuthError,
  };
}

async function applyCandidate(
  db: SupabaseServiceClient,
  candidate: Candidate,
): Promise<Record<string, unknown>> {
  const lifecycleResult = await bindExistingNangoAuthConnection({
    db,
    profileId: candidate.profileId,
    providerConfigKey: candidate.providerConfigKey,
    connectionId: candidate.connectionId,
    capabilityAccountLinkId: candidate.capabilityAccountLinkId,
  });
  const account = lifecycleResult.connectedAccount;
  const metadata = account.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
    ? (account.metadata as Record<string, unknown>)
    : {};
  const oauth = metadata.oauth && typeof metadata.oauth === "object" && !Array.isArray(metadata.oauth)
    ? (metadata.oauth as Record<string, unknown>)
    : {};
  return {
    ...candidate,
    dryRun: false,
    accountId: account.id,
    credentialStatus: account.credential_status,
    connectionStatus: account.connection_status,
    grantedScopesCount: Array.isArray(account.scopes) ? account.scopes.length : null,
    refreshCapable: oauth.refreshCapable === true,
  };
}

export async function runNangoOAuthProjectionBackfill(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv);
  const profileIds = args["profile-id"] ?? [];
  const allProfiles = args["all-profiles"] === true;
  if (allProfiles === (profileIds.length > 0)) {
    throw new Error(`Pass exactly one of --profile-id=<id> or --all-profiles.\n\n${usage()}`);
  }
  if (args.action === "apply" && allProfiles) {
    throw new Error(
      `Refusing all-profile oauth-projection apply. Run all-profile check, review rows, then apply with explicit --profile-id values.\n\n${usage()}`,
    );
  }
  if (requiresProdConfirmation(args.profile as RuntimeProfile) && args.action === "apply" && !args["confirm-prod"]) {
    throw new Error(`Refusing prod mutation without --confirm-prod.\n\n${usage()}`);
  }
  Object.assign(process.env, envForProfile(args.profile));
  process.env.AI_ASSISTANTS_RUNTIME_DIR = process.env.AI_ASSISTANTS_RUNTIME_DIR?.trim() || runtimeRootForProfile(args.profile);
  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));
  const candidates = await loadCandidates(db, args);
  const results: Record<string, unknown>[] = [];
  for (const candidate of candidates) {
    results.push(
      args.action === "apply"
        ? await applyCandidate(db, candidate)
        : await dryRunCandidate(candidate),
    );
  }
  console.log(
    JSON.stringify(
      {
        action: args.action,
        profile: args.profile,
        candidateCount: candidates.length,
        results,
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runNangoOAuthProjectionBackfill());
}
