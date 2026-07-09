#!/usr/bin/env tsx
/**
 * For each mapping entry: ensure the control-plane `capability_account_links` row exists (upsert by
 * profile + plugin + provider, enabled, merged config including Nango integration id), then bind
 * `connected_provider_accounts` to the given Nango remote connection UUID for live E2E / local users.
 * Source of truth: profile Nango bindings JSON files (profile defaults, or --mapping=).
 *
 * Requires --profile=dev|e2e|prod for Supabase + Nango secret resolution (see nango-provisioning-runtime).
 * Requires exactly one of --check (validate only) or --apply (mutate DB). The target `profiles` row
 * must already exist (this script does not create profiles).
 *
 * Prod mutations require --confirm-prod (same policy as `npm run integrations -- nango apply`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createSupabaseServiceClient,
  requireSupabaseData,
  type Json,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  profileCapabilitySpec,
  type ProfileCapabilitySpec,
} from "@ai-assistants/capability-catalog";
import { nangoProviderConfigKeyForCapabilityProvider } from "@ai-assistants/nango-provisioning";
import { formatUnknownError } from "@ai-assistants/errors";
import {
  profileRuntimeDir,
  repoRoot,
  requiresProdConfirmation,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import { parseCli, timedFetch } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import {
  classifyNangoConnectionHealth,
  type NangoConnectionHealth,
} from "./bind-profile-nango-health.js";
import {
  parseProfileNangoBindingsFile,
  profileNangoBindingIdentity,
  removeProfileNangoBindings,
  stringifyProfileNangoBindingsFile,
  type ProfileNangoBindingEntry,
} from "./bind-profile-nango-schema.js";
import {
  bindExistingNangoAuthConnection,
  requireNangoProviderConfigKeyForCapabilityLink,
} from "../../apps/backend/src/ops-support/nango-auth";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config.js";
import { envForProfile } from "../profiles/profile.js";
import { nangoApiBaseUrl, resolveNangoSecretKey } from "./nango-provisioning-runtime.js";
import { defaultNangoBindingMappingPaths } from "./nango-binding-mapping-paths.js";

const NANGO_BIND_HTTP_TIMEOUT_MS = 30_000;

function usage(): string {
  return [
    "Usage:",
    "  npm run integrations -- nango bind check --profile=dev",
    "  npm run integrations -- nango bind check --profile=e2e",
    "  npm run integrations -- nango bind apply --profile=dev",
    "  npm run integrations -- nango bind apply --profile=e2e --mapping=scripts/integrations/testing-nango-bindings-e2e.local.json",
    "  npm run integrations -- nango bind prune-stale --profile=dev",
    "",
    "Options:",
    "  --profile=dev|e2e|prod (required) Supabase + Nango secret from profile env",
    "  --mapping=<path>      JSON file. Repeatable. Defaults are profile-specific.",
    "  --capability=<slug>   Limit to one capability slug. Repeatable with matching --provider.",
    "  --provider=<id>       Limit to one provider id. Repeatable with matching --capability.",
    "  --verify-nango         After resolve, GET connection from Nango API (extra network call)",
    "  --no-wait-for-setup    Do not execute queued setup jobs after bind apply",
    "  --confirm-prod         Required with --profile=prod and mutating apply/prune-stale",
    "",
    "Each binding entry:",
    '  { "profileId": "testing", "capabilitySlug": "microsoft-onedrive", "provider": "microsoft-onedrive",',
    '    "nangoConnectionId": "<uuid>",',
    '    "providerAccountId": "<optional string; defaults to nangoConnectionId>",',
    '    "accountEmail": "<optional>", "displayLabel": "<optional>" }',
  ].join("\n");
}

function parseArgs(argv: readonly string[]): {
  profile: RuntimeProfile;
  mode: "check" | "apply";
  mappingPaths: readonly string[];
  bindingFilters: readonly { capabilitySlug: string; provider: string }[];
  verifyNango: boolean;
  pruneStale: boolean;
  waitForSetup: boolean;
  confirmProd: boolean;
} {
  const raw = parseCli(argv, {
    options: {
      profile: { type: "string" },
      mapping: { type: "string", multiple: true },
      capability: { type: "string", multiple: true },
      provider: { type: "string", multiple: true },
      "verify-nango": { type: "boolean" },
      "no-wait-for-setup": { type: "boolean" },
      "confirm-prod": { type: "boolean" },
    },
    allowPositionals: true,
    transform: ({ values, positionals }) => {
      if (positionals.length !== 1) {
        throw new Error(`Expected bind subcommand check, apply, or prune-stale.\n\n${usage()}`);
      }
      return { ...values, action: positionals[0] };
    },
    schema: z.object({
      profile: z.enum(["dev", "e2e", "prod"]),
      action: z.enum(["check", "apply", "prune-stale"]),
      mapping: z.array(z.string()).optional(),
      capability: z.array(z.string()).optional(),
      provider: z.array(z.string()).optional(),
      "verify-nango": z.boolean().optional(),
      "no-wait-for-setup": z.boolean().optional(),
      "confirm-prod": z.boolean().optional(),
    }),
  });
  const profile = raw.profile;
  const mappingArgs = (raw.mapping ?? []).map((a) => a.trim()).filter((a) => a.length > 0);
  const mappingPaths =
    mappingArgs.length > 0 ? mappingArgs : [...defaultNangoBindingMappingPaths(profile)];
  const capabilityFilters = (raw.capability ?? []).map((a) => a.trim()).filter(Boolean);
  const providerFilters = (raw.provider ?? []).map((a) => a.trim()).filter(Boolean);
  if (capabilityFilters.length !== providerFilters.length) {
    throw new Error("--capability and --provider filters must be passed in matching pairs.");
  }
  const bindingFilters = capabilityFilters.map((capabilitySlug, index) => ({
    capabilitySlug,
    provider: providerFilters[index]!,
  }));
  const verifyNango = raw["verify-nango"] === true;
  const pruneStale = raw.action === "prune-stale";
  const mode = raw.action === "check" ? "check" : "apply";
  const waitForSetup = raw.action === "apply" && raw["no-wait-for-setup"] !== true;
  const confirmProd = raw["confirm-prod"] === true;
  if (requiresProdConfirmation(profile) && mode === "apply" && !confirmProd) {
    throw new Error(`Refusing ${profile} mutation without --confirm-prod.\n\n${usage()}`);
  }
  return {
    profile,
    mode,
    mappingPaths: mappingPaths.map((mappingPath) =>
      path.isAbsolute(mappingPath)
        ? mappingPath
        : path.join(repoRoot(import.meta.url), mappingPath),
    ),
    bindingFilters,
    verifyNango,
    pruneStale,
    waitForSetup,
    confirmProd,
  };
}

export function mergeResolvedProfileEnvIntoProcess(
  resolvedEnv: NodeJS.ProcessEnv,
  targetEnv: NodeJS.ProcessEnv = process.env,
): void {
  for (const [key, value] of Object.entries(resolvedEnv)) {
    if (value !== undefined) targetEnv[key] = value;
  }
}

export function installBackendRuntimeEnvForProfile(
  profile: RuntimeProfile,
  targetEnv: NodeJS.ProcessEnv = process.env,
): void {
  const preparedE2eRuntimeRoot =
    profile === "e2e" ? targetEnv.AI_ASSISTANTS_E2E_PROFILE_RUNTIME_ROOT?.trim() : "";
  targetEnv.AI_ASSISTANTS_PROFILE = profile;
  targetEnv.AI_ASSISTANTS_RUNTIME_DIR = preparedE2eRuntimeRoot || profileRuntimeDir(profile);
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Could not read JSON at ${filePath}: ${formatUnknownError(error)}`);
  }
}

async function requireProfileExists(db: SupabaseServiceClient, profileId: string): Promise<void> {
  const result = await db.from("profiles").select("id").eq("id", profileId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new Error(
      `No profile with id ${JSON.stringify(profileId)}. Seed or create the profile before binding integrations.`,
    );
  }
}

async function resolveCapabilityAccountLinkForNangoBinding(
  db: SupabaseServiceClient,
  binding: ProfileNangoBindingEntry,
  spec: ProfileCapabilitySpec,
): Promise<TableRow<"capability_account_links"> | null> {
  const accountsForRemote = await db
    .from("connected_provider_accounts")
    .select()
    .eq("profile_id", binding.profileId)
    .eq("nango_connection_id", binding.nangoConnectionId);
  if (accountsForRemote.error) throw accountsForRemote.error;
  for (const account of accountsForRemote.data ?? []) {
    const linkResult = await db
      .from("capability_account_links")
      .select()
      .eq("connected_provider_account_id", account.id)
      .eq("profile_id", binding.profileId)
      .eq("capability_slug", binding.capabilitySlug)
      .eq("provider", binding.provider)
      .eq("status", "enabled")
      .maybeSingle();
    if (linkResult.error) throw linkResult.error;
    if (linkResult.data) return linkResult.data;
  }

  if (binding.capabilityAccountLinkId) {
    const byId = await db
      .from("capability_account_links")
      .select()
      .eq("profile_id", binding.profileId)
      .eq("id", binding.capabilityAccountLinkId)
      .eq("status", "enabled")
      .maybeSingle();
    if (byId.error) throw byId.error;
    return byId.data ?? null;
  }

  let query = db
    .from("capability_account_links")
    .select()
    .eq("profile_id", binding.profileId)
    .eq("capability_slug", binding.capabilitySlug)
    .eq("provider", binding.provider)
    .eq("status", "enabled");
  const label = binding.capabilityAccountLinkLabel?.trim();
  if (label) query = query.eq("label", label);
  const result = await query.order("created_at");
  if (result.error) throw result.error;
  const links = result.data ?? [];
  if (links.length === 1) return links[0] ?? null;
  if (links.length === 0) return null;

  for (const link of links) {
    const connectedProviderAccountId = link.connected_provider_account_id?.trim();
    if (!connectedProviderAccountId) continue;
    const accountResult = await db
      .from("connected_provider_accounts")
      .select("nango_connection_id")
      .eq("id", connectedProviderAccountId)
      .maybeSingle();
    if (accountResult.error) throw accountResult.error;
    if (accountResult.data?.nango_connection_id?.trim() === binding.nangoConnectionId) {
      return link;
    }
  }

  const defaultLinks = links.filter((link) => link.is_default);
  if (defaultLinks.length === 1) return defaultLinks[0] ?? null;

  const catalogLabelMatches = links.filter((link) => link.label === spec.label);
  if (catalogLabelMatches.length === 1) return catalogLabelMatches[0] ?? null;

  const summary = links.map((link) => `${link.label} (${link.id})`).join(", ");
  throw new Error(
    `Multiple enabled capability account links for ${binding.profileId} ${binding.capabilitySlug}/${binding.provider}. ` +
      `Set capabilityAccountLinkId or capabilityAccountLinkLabel on the Nango binding, or disable stale links. Found: ${summary}`,
  );
}

function mergeInstanceConfigWithDerivedNangoKey(
  existingConfig: unknown,
  derivedNangoIntegrationId: string,
): Json {
  const base =
    existingConfig !== null && typeof existingConfig === "object" && !Array.isArray(existingConfig)
      ? { ...(existingConfig as Record<string, unknown>) }
      : {};
  const existingKey = base.nangoProviderConfigKey;
  if (typeof existingKey !== "string" || existingKey.trim().length === 0) {
    base.nangoProviderConfigKey = derivedNangoIntegrationId;
  }
  return base as Json;
}

async function upsertProfileCapabilityForBinding(
  db: SupabaseServiceClient,
  binding: ProfileNangoBindingEntry,
  existingRequired: boolean,
): Promise<TableRow<"profile_capabilities">> {
  const now = new Date().toISOString();
  const result = await db
    .from("profile_capabilities")
    .upsert(
      {
        profile_id: binding.profileId,
        capability_slug: binding.capabilitySlug,
        status: "enabled",
        required: existingRequired,
        config: {},
        updated_at: now,
      },
      { onConflict: "profile_id,capability_slug" },
    )
    .select()
    .single();
  return requireSupabaseData(
    "Upsert profile capability (bind-profile-nango)",
    result.data,
    result.error,
  );
}

async function upsertEnabledCapabilityAccountLinkForBinding(
  db: SupabaseServiceClient,
  binding: ProfileNangoBindingEntry,
  spec: ProfileCapabilitySpec,
  derivedNangoIntegrationId: string,
): Promise<TableRow<"capability_account_links">> {
  const existing = await resolveCapabilityAccountLinkForNangoBinding(db, binding, spec);
  const profileCapability = await upsertProfileCapabilityForBinding(
    db,
    binding,
    existing?.required ?? false,
  );
  const mergedConfig = mergeInstanceConfigWithDerivedNangoKey(
    existing?.config,
    derivedNangoIntegrationId,
  );
  const label =
    binding.capabilityAccountLinkLabel?.trim() ||
    (existing?.label?.trim() ? existing.label.trim() : spec.label);
  const now = new Date().toISOString();
  const result = await db
    .from("capability_account_links")
    .upsert(
      {
        profile_id: binding.profileId,
        profile_capability_id: profileCapability.id,
        capability_slug: binding.capabilitySlug,
        provider: binding.provider,
        label,
        status: "enabled",
        required: existing?.required ?? false,
        config: mergedConfig,
        updated_at: now,
      },
      { onConflict: "profile_capability_id,provider,label" },
    )
    .select()
    .single();
  return requireSupabaseData(
    "Upsert capability account link (bind-profile-nango)",
    result.data,
    result.error,
  );
}

async function listConnectedAccountsForLink(
  db: SupabaseServiceClient,
  capabilityAccountLinkId: string,
): Promise<TableRow<"connected_provider_accounts">[]> {
  const linkResult = await db
    .from("capability_account_links")
    .select("connected_provider_account_id")
    .eq("id", capabilityAccountLinkId)
    .maybeSingle();
  if (linkResult.error) throw linkResult.error;
  const connectedProviderAccountId = linkResult.data?.connected_provider_account_id?.trim();
  if (!connectedProviderAccountId) return [];
  const accountResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", connectedProviderAccountId)
    .maybeSingle();
  if (accountResult.error) throw accountResult.error;
  return accountResult.data ? [accountResult.data as TableRow<"connected_provider_accounts">] : [];
}

function assertAtMostOneConnected(rows: readonly TableRow<"connected_provider_accounts">[]): void {
  const connected = rows.filter((r) => r.connection_status === "connected");
  if (connected.length > 1) {
    throw new Error(
      `Capability account link has ${connected.length} connected connected_provider_accounts; expected at most one. Fix DB manually.`,
    );
  }
}

function isConnectedNangoRowForRemote(
  row: TableRow<"connected_provider_accounts">,
  expectedRemote: string,
  expectedIntegrationKey: string,
): boolean {
  return (
    row.connection_status === "connected" &&
    row.credential_status !== "revoked" &&
    row.nango_connection_id?.trim() === expectedRemote &&
    row.nango_provider_config_key?.trim() === expectedIntegrationKey
  );
}

async function verifyNangoConnectionExists(input: {
  profile: RuntimeProfile;
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
}): Promise<void> {
  const remote = await inspectNangoConnection(input);
  if (remote.status === "missing_from_nango") {
    throw new Error(`Nango connection is missing: ${remote.detail}`);
  }
  if (remote.status === "request_failed") {
    throw new Error(`Nango GET connection failed (${remote.httpStatus}): ${remote.detail}`);
  }
}

async function inspectNangoConnection(input: {
  profile: RuntimeProfile;
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
}): Promise<NangoConnectionHealth> {
  const env = envForProfile(input.profile);
  const baseUrl = nangoApiBaseUrl(env);
  const secret = resolveNangoSecretKey(input.profile, env);
  const url = new URL(
    `${baseUrl.replace(/\/+$/, "")}/connection/${encodeURIComponent(input.nangoConnectionId)}`,
  );
  url.searchParams.set("provider_config_key", input.nangoProviderConfigKey);
  const res = await timedFetch.fetch(url, {
    timeoutMs: NANGO_BIND_HTTP_TIMEOUT_MS,
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  return classifyNangoConnectionHealth({ httpStatus: res.status, bodyText: text });
}

async function nangoConnectionExists(input: {
  profile: RuntimeProfile;
  nangoProviderConfigKey: string;
  nangoConnectionId: string;
}): Promise<{ exists: true } | { exists: false; detail: string }> {
  const remote = await inspectNangoConnection(input);
  if (remote.status === "missing_from_nango") return { exists: false, detail: remote.detail };
  if (remote.status === "request_failed") {
    throw new Error(`Nango GET connection failed (${remote.httpStatus}): ${remote.detail}`);
  }
  return { exists: true };
}

type BindingFile = {
  mappingPath: string;
  bindings: ProfileNangoBindingEntry[];
};

function filterBindingsByCapabilityProvider(
  bindings: readonly ProfileNangoBindingEntry[],
  filters: readonly { capabilitySlug: string; provider: string }[],
): ProfileNangoBindingEntry[] {
  if (filters.length === 0) return [...bindings];
  const allowed = new Set(filters.map((filter) => `${filter.capabilitySlug}:${filter.provider}`));
  return bindings.filter((binding) => allowed.has(`${binding.capabilitySlug}:${binding.provider}`));
}

type StaleBindingResult = {
  mappingPath: string;
  binding: ProfileNangoBindingEntry;
  nangoProviderConfigKey: string;
  detail: string;
  disconnectedRows: number;
};

async function disconnectStaleProviderConnectionRows(input: {
  db: SupabaseServiceClient;
  binding: ProfileNangoBindingEntry;
  nangoProviderConfigKey: string;
}): Promise<number> {
  const result = await input.db
    .from("connected_provider_accounts")
    .update({
      connection_status: "disconnected",
      credential_status: "revoked",
      nango_connection_id: null,
      nango_provider_config_key: null,
      connected_at: null,
      last_error: `stale Nango connection ${input.binding.nangoConnectionId} pruned from checked-in binding`,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", input.binding.profileId)
    .eq("nango_connection_id", input.binding.nangoConnectionId)
    .eq("nango_provider_config_key", input.nangoProviderConfigKey)
    .select("id");
  if (result.error) throw result.error;
  return result.data?.length ?? 0;
}

async function pruneStaleNangoBindings(input: {
  db: SupabaseServiceClient;
  profile: RuntimeProfile;
  mode: "check" | "apply";
  files: readonly BindingFile[];
}): Promise<{
  activeFiles: BindingFile[];
  stale: StaleBindingResult[];
}> {
  const stale: StaleBindingResult[] = [];
  for (const file of input.files) {
    for (const binding of file.bindings) {
      const nangoProviderConfigKey = nangoProviderConfigKeyForCapabilityProvider(
        binding.capabilitySlug,
        binding.provider,
      );
      if (!nangoProviderConfigKey?.trim()) {
        throw new Error(
          `No canonical Nango integration id for plugin ${binding.capabilitySlug} + provider ${binding.provider}. Check the integration provisioning manifest.`,
        );
      }
      const remote = await nangoConnectionExists({
        profile: input.profile,
        nangoProviderConfigKey,
        nangoConnectionId: binding.nangoConnectionId,
      });
      if (remote.exists) continue;
      const disconnectedRows =
        input.mode === "apply"
          ? await disconnectStaleProviderConnectionRows({
              db: input.db,
              binding,
              nangoProviderConfigKey,
            })
          : 0;
      stale.push({
        mappingPath: file.mappingPath,
        binding,
        nangoProviderConfigKey,
        detail: remote.detail,
        disconnectedRows,
      });
    }
  }

  const staleBindings = stale.map((item) => item.binding);
  const activeFiles = input.files.map((file) => ({
    mappingPath: file.mappingPath,
    bindings: removeProfileNangoBindings(file.bindings, staleBindings),
  }));

  if (input.mode === "apply" && stale.length > 0) {
    for (const file of activeFiles) {
      const original = input.files.find((candidate) => candidate.mappingPath === file.mappingPath);
      if (!original) throw new Error(`Missing original mapping file ${file.mappingPath}.`);
      if (original.bindings.length === file.bindings.length) continue;
      writeFileSync(file.mappingPath, stringifyProfileNangoBindingsFile(file.bindings));
    }
  }

  return { activeFiles, stale };
}

async function assertPostBindingInvariant(
  db: SupabaseServiceClient,
  capabilityAccountLinkId: string,
  expectedRemote: string,
  expectedIntegrationKey: string,
): Promise<void> {
  const rows = await listConnectedAccountsForLink(db, capabilityAccountLinkId);
  assertAtMostOneConnected(rows);
  const connected = rows.filter((r) => r.connection_status === "connected");
  if (connected.length !== 1) {
    throw new Error(`Expected exactly one connected row after bind; found ${connected.length}.`);
  }
  const row = connected[0];
  if (!isConnectedNangoRowForRemote(row, expectedRemote, expectedIntegrationKey)) {
    throw new Error(
      `Post-bind invariant failed: connection ${row.id} status=${row.connection_status} credential=${row.credential_status} nango_remote=${row.nango_connection_id} nango_integration=${row.nango_provider_config_key}`,
    );
  }
}

function isNangoBindableIntegration(
  binding: ProfileNangoBindingEntry,
  spec: ProfileCapabilitySpec,
): boolean {
  if (spec.kind === "external_integration") return true;
  if (
    (binding.capabilitySlug === "gmail" && binding.provider === "gmail") ||
    (binding.capabilitySlug === "outlook-mail" && binding.provider === "outlook-mail")
  )
    return true;
  return false;
}

async function processBinding(input: {
  db: SupabaseServiceClient;
  profile: RuntimeProfile;
  binding: ProfileNangoBindingEntry;
  mode: "check" | "apply";
  verifyNango: boolean;
}): Promise<{
  status: "ok" | "would_bind";
  detail: string;
  capabilityAccountLinkId: string | null;
}> {
  const { binding, db, mode, profile, verifyNango } = input;
  const spec = profileCapabilitySpec(binding.capabilitySlug);
  if (!spec) {
    throw new Error(
      `Unknown capabilitySlug ${JSON.stringify(binding.capabilitySlug)}. Not in PROFILE_CAPABILITY_CATALOG.`,
    );
  }
  if (!isNangoBindableIntegration(binding, spec)) {
    throw new Error(
      `Binding only supports Nango-backed OAuth integrations; ${binding.capabilitySlug} (kind ${JSON.stringify(spec.kind)}) is not supported by this script.`,
    );
  }

  await requireProfileExists(db, binding.profileId);

  const derivedNangoIntegrationId = nangoProviderConfigKeyForCapabilityProvider(
    binding.capabilitySlug,
    binding.provider,
  );
  if (!derivedNangoIntegrationId?.trim()) {
    throw new Error(
      `No canonical Nango integration id for plugin ${binding.capabilitySlug} + provider ${binding.provider}. Check the integration provisioning manifest.`,
    );
  }

  let link = await resolveCapabilityAccountLinkForNangoBinding(db, binding, spec);

  if (mode === "apply") {
    link = await upsertEnabledCapabilityAccountLinkForBinding(
      db,
      binding,
      spec,
      derivedNangoIntegrationId,
    );
  }

  if (!link || link.status !== "enabled") {
    if (verifyNango) {
      await verifyNangoConnectionExists({
        profile,
        nangoProviderConfigKey: derivedNangoIntegrationId,
        nangoConnectionId: binding.nangoConnectionId,
      });
    }
    if (mode === "check") {
      const triple = `${binding.profileId} ${binding.capabilitySlug} ${binding.provider}`;
      const head = !link
        ? `would upsert enabled capability_account_links for ${triple}`
        : `would enable capability_account_links ${link.id} (${triple})`;
      return {
        status: "would_bind",
        detail: `${head}, then bind remote=${binding.nangoConnectionId}`,
        capabilityAccountLinkId: link?.id ?? null,
      };
    }
    throw new Error(
      `Expected enabled capability account link for ${binding.profileId} ${binding.capabilitySlug} ${binding.provider} after apply.`,
    );
  }

  const enabledLink = link;

  const nangoProviderConfigKey = requireNangoProviderConfigKeyForCapabilityLink(enabledLink);

  if (verifyNango) {
    await verifyNangoConnectionExists({
      profile,
      nangoProviderConfigKey,
      nangoConnectionId: binding.nangoConnectionId,
    });
  }

  const rows = await listConnectedAccountsForLink(db, enabledLink.id);
  assertAtMostOneConnected(rows);
  const connected = rows.filter((r) => r.connection_status === "connected");
  const alreadyBoundRemote =
    connected.length === 1 &&
    isConnectedNangoRowForRemote(connected[0], binding.nangoConnectionId, nangoProviderConfigKey);

  if (mode === "check") {
    if (alreadyBoundRemote) {
      return {
        status: "would_bind",
        detail: `would refresh activation for already bound link=${enabledLink.id} connection=${connected[0].id}`,
        capabilityAccountLinkId: enabledLink.id,
      };
    }
    if (connected.length === 1) {
      const c = connected[0];
      return {
        status: "would_bind",
        detail: `would replace connected row ${c.id} (remote=${c.nango_connection_id}, integration=${c.nango_provider_config_key}) with remote=${binding.nangoConnectionId}`,
        capabilityAccountLinkId: enabledLink.id,
      };
    }
    return {
      status: "would_bind",
      detail: `would insert connected row for link=${enabledLink.id} remote=${binding.nangoConnectionId} integration=${nangoProviderConfigKey}`,
      capabilityAccountLinkId: enabledLink.id,
    };
  }

  if (alreadyBoundRemote) {
    return {
      status: "ok",
      detail: `already bound link=${enabledLink.id} connection=${connected[0]!.id}`,
      capabilityAccountLinkId: enabledLink.id,
    };
  }

  const lifecycleResult = await bindExistingNangoAuthConnection({
    db,
    capabilityAccountLinkId: enabledLink.id,
    profileId: binding.profileId,
    providerConfigKey: nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
  });

  await assertPostBindingInvariant(
    db,
    enabledLink.id,
    binding.nangoConnectionId,
    nangoProviderConfigKey,
  );

  return {
    status: "ok",
    detail: `reconciled link=${enabledLink.id} connection=${lifecycleResult.connectedAccount.id}`,
    capabilityAccountLinkId: enabledLink.id,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadReadinessState(
  db: SupabaseServiceClient,
  capabilityAccountLinkId: string,
): Promise<TableRow<"capability_account_links"> | null> {
  const result = await db
    .from("capability_account_links")
    .select()
    .eq("id", capabilityAccountLinkId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ?? null;
}

async function drainQueuedSetupJobs(input: {
  db: SupabaseServiceClient;
  capabilityAccountLinkIds: readonly string[];
  timeoutMs?: number;
}): Promise<Array<{ capabilityAccountLinkId: string; status: string; jobId: string | null }>> {
  const ids = [...new Set(input.capabilityAccountLinkIds.filter((id) => id.trim().length > 0))];
  if (ids.length === 0) return [];

  const deadline = Date.now() + (input.timeoutMs ?? 300_000);
  const completed = new Map<string, { status: string; jobId: string | null }>();

  while (completed.size < ids.length) {
    if (Date.now() > deadline) {
      const pending = ids.filter((id) => !completed.has(id));
      throw new Error(`Timed out waiting for capability setup jobs: ${pending.join(", ")}`);
    }

    for (const capabilityAccountLinkId of ids) {
      if (completed.has(capabilityAccountLinkId)) continue;
      const readiness = await loadReadinessState(input.db, capabilityAccountLinkId);
      if (!readiness) {
        throw new Error(
          `Capability account link ${capabilityAccountLinkId} has no readiness state after binding.`,
        );
      }
      if (readiness.readiness_status === "ready") {
        completed.set(capabilityAccountLinkId, {
          status: readiness.readiness_status,
          jobId: readiness.readiness_latest_backend_job_id,
        });
        continue;
      }
      if (
        readiness.readiness_status === "blocked" ||
        readiness.readiness_status === "error" ||
        readiness.readiness_status === "not_connected"
      ) {
        throw new Error(
          `Capability account link ${capabilityAccountLinkId} finished ${readiness.readiness_status}: ${readiness.readiness_last_error ?? readiness.readiness_blocker_code ?? "no details"}`,
        );
      }
    }

    if (completed.size < ids.length) await sleep(1_000);
  }

  return ids.map((capabilityAccountLinkId) => ({
    capabilityAccountLinkId,
    ...completed.get(capabilityAccountLinkId)!,
  }));
}

export async function runNangoProfileBind(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(usage());
    return;
  }
  const args = parseArgs(argv);
  mergeResolvedProfileEnvIntoProcess(envForProfile(args.profile));
  installBackendRuntimeEnvForProfile(args.profile);
  const bindingFiles = args.mappingPaths.map((mappingPath) => {
    const raw = readJsonFile(mappingPath);
    return { mappingPath, bindings: parseProfileNangoBindingsFile(raw).bindings };
  });
  const pruneResult = args.pruneStale
    ? await pruneStaleNangoBindings({
        db: createSupabaseServiceClient(supabaseConfigFromProfile(args.profile)),
        profile: args.profile,
        mode: args.mode,
        files: bindingFiles,
      })
    : { activeFiles: bindingFiles, stale: [] };
  const rawBindings = filterBindingsByCapabilityProvider(
    pruneResult.activeFiles.flatMap((file) => file.bindings),
    args.bindingFilters,
  );
  const parsed = parseProfileNangoBindingsFile({ bindings: rawBindings });

  if (parsed.bindings.length === 0 && pruneResult.stale.length === 0) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          message: "No bindings in mapping file; nothing to do.",
          mappings: args.mappingPaths,
          filters: args.bindingFilters,
          pruneStale: args.pruneStale,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (args.pruneStale) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          profile: args.profile,
          mode: args.mode,
          mappings: args.mappingPaths,
          filters: args.bindingFilters,
          pruneStale: args.pruneStale,
          stale: pruneResult.stale.map((r) => ({
            mapping: r.mappingPath,
            profileId: r.binding.profileId,
            capabilitySlug: r.binding.capabilitySlug,
            provider: r.binding.provider,
            nangoConnectionId: r.binding.nangoConnectionId,
            nangoProviderConfigKey: r.nangoProviderConfigKey,
            status: args.mode === "apply" ? "pruned_stale" : "would_prune_stale",
            disconnectedRows: r.disconnectedRows,
            detail: r.detail,
          })),
          results: [],
        },
        null,
        2,
      ),
    );
    return;
  }

  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));

  const results: Array<{
    binding: ProfileNangoBindingEntry;
    outcome: { status: string; detail: string; capabilityAccountLinkId: string | null };
  }> = [];

  for (const binding of parsed.bindings) {
    let outcome: Awaited<ReturnType<typeof processBinding>>;
    try {
      outcome = await processBinding({
        db,
        profile: args.profile,
        binding,
        mode: args.mode,
        verifyNango: args.verifyNango,
      });
    } catch (error) {
      throw new Error(
        [
          `Nango bind ${args.mode} failed for ${profileNangoBindingIdentity(binding)}.`,
          `profile=${args.profile}`,
          `connection=${binding.nangoConnectionId}`,
          formatUnknownError(error),
        ].join(" "),
        { cause: error },
      );
    }
    results.push({ binding, outcome });
  }

  const setup =
    args.waitForSetup && args.mode === "apply"
      ? await drainQueuedSetupJobs({
          db,
          capabilityAccountLinkIds: results.flatMap((r) =>
            r.outcome.capabilityAccountLinkId ? [r.outcome.capabilityAccountLinkId] : [],
          ),
        })
      : [];

  console.log(
    JSON.stringify(
      {
        ok: true,
        profile: args.profile,
        mode: args.mode,
        mappings: args.mappingPaths,
        filters: args.bindingFilters,
        pruneStale: args.pruneStale,
        waitForSetup: args.waitForSetup,
        setup,
        stale: pruneResult.stale.map((r) => ({
          mapping: r.mappingPath,
          profileId: r.binding.profileId,
          capabilitySlug: r.binding.capabilitySlug,
          provider: r.binding.provider,
          nangoConnectionId: r.binding.nangoConnectionId,
          nangoProviderConfigKey: r.nangoProviderConfigKey,
          status: args.mode === "apply" ? "pruned_stale" : "would_prune_stale",
          disconnectedRows: r.disconnectedRows,
          detail: r.detail,
        })),
        results: results.map((r) => ({
          profileId: r.binding.profileId,
          capabilitySlug: r.binding.capabilitySlug,
          provider: r.binding.provider,
          nangoConnectionId: r.binding.nangoConnectionId,
          ...r.outcome,
        })),
      },
      null,
      2,
    ),
  );
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
  runNangoProfileBind().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
