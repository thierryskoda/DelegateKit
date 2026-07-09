#!/usr/bin/env tsx

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  createSupabaseServiceClient,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  parseProfilePreferenceValue,
  profilePreferenceKeySchema,
} from "../../apps/backend/src/ops-support/profile-preferences";
import {
  profileCapabilitySpec,
  requireCapabilityActivationPolicyForSlug,
} from "@ai-assistants/capability-catalog";
import { isCapabilityOnlyProvider } from "@ai-assistants/connected-accounts";
import { profileEnvPath, repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import {
  loadRuntimeProfileConfigsFromDb,
  type RuntimeProfileConfig,
} from "../repo-tooling/build/profile-db-config";
import { readDotEnvFile } from "@ai-assistants/workspace-shared";
import { profileAssistantBaseInstructions } from "../../apps/backend/src/ops-support/assistant-prompt";
import { seedMissingClientProfiles } from "./seed-missing-profiles";
import {
  loadClientRuntimeSources,
  loadClientSeedSources,
  type ClientRuntimeSource,
  type ClientSeedSource,
} from "./source";

type ActiveChannelRow = TableRow<"profile_channels">;

function parseOptions(args: readonly string[]): void {
  for (const arg of args) {
    throw new Error(`Unknown client validation option ${JSON.stringify(arg)}.`);
  }
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function uniqueSorted(values: readonly string[]): string[] {
  return sorted([...new Set(values)]);
}

function isClientSeedSource(source: ClientRuntimeSource): source is ClientSeedSource {
  return source.seedPath !== null && "seed" in source;
}

function assertSameSet(
  label: string,
  actual: readonly string[],
  expected: readonly string[],
): void {
  const cleanActual = sorted(actual);
  const cleanExpected = sorted(expected);
  if (JSON.stringify(cleanActual) !== JSON.stringify(cleanExpected)) {
    throw new Error(
      `${label} mismatch.\nExpected: ${cleanExpected.join(", ")}\nActual:   ${cleanActual.join(", ")}`,
    );
  }
}

function runtimeProfileById(
  profiles: readonly RuntimeProfileConfig[],
  profileId: string,
): RuntimeProfileConfig {
  const profile = profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error(`Runtime profile ${profileId} was not loaded.`);
  return profile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function seedTwilioMessagingRouteNumber(seed: ClientSeedSource["seed"], source: string): string | null {
  const messagingCapabilities = seed.initialCapabilities.filter((capability) => {
    if ((capability.status ?? "enabled") !== "enabled") return false;
    return capability.slug === "phone" && capability.provider === "twilio-messaging";
  });
  if (messagingCapabilities.length === 0) return null;
  if (messagingCapabilities.length > 1) {
    throw new Error(`${source}: declare at most one enabled phone:twilio-messaging capability.`);
  }
  const config = messagingCapabilities[0]?.config;
  const messaging = isRecord(config) && isRecord(config.messaging) ? config.messaging : {};
  const fromNumber = typeof messaging.fromNumber === "string" ? messaging.fromNumber.trim() : "";
  return fromNumber || "<backend TWILIO_FROM_NUMBER>";
}

function assertSeedTwilioMessagingRoutesUnambiguous(
  sources: readonly ClientSeedSource[],
): void {
  const routesByRuntime = new Map<string, Map<string, string[]>>();
  for (const source of sources) {
    const routeNumber = seedTwilioMessagingRouteNumber(source.seed, source.seedPath);
    if (!routeNumber) continue;
    for (const runtimeProfile of source.runtime.runtimeProfiles) {
      const runtimeRoutes = routesByRuntime.get(runtimeProfile) ?? new Map<string, string[]>();
      const profileIds = runtimeRoutes.get(routeNumber) ?? [];
      profileIds.push(source.seed.profile.id);
      runtimeRoutes.set(routeNumber, profileIds);
      routesByRuntime.set(runtimeProfile, runtimeRoutes);
    }
  }
  const errors: string[] = [];
  for (const [runtimeProfile, routes] of routesByRuntime) {
    for (const [routeNumber, profileIds] of routes) {
      if (profileIds.length <= 1) continue;
      errors.push(
        `${runtimeProfile}: Twilio SMS inbound route ${routeNumber} is shared by ${profileIds.join(", ")}. Set explicit unique capability.config.messaging.fromNumber values or enable SMS for only one profile.`,
      );
    }
  }
  if (errors.length) {
    throw new Error(`Client Twilio SMS route validation failed:\n${errors.join("\n")}`);
  }
}

function expectedProfilePreferences(seed: ClientSeedSource["seed"]) {
  const entries = new Map<string, unknown>();
  const set = (key: string, value: unknown) => {
    if (value !== undefined) entries.set(key, value);
  };

  set("assistant.name", seed.initialAssistantName);

  const grouped: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of entries) {
    const cleanKey = profilePreferenceKeySchema.parse(key);
    const [namespace, ...rest] = cleanKey.split(".");
    const localKey = rest.join(".");
    grouped[namespace!] ??= {};
    grouped[namespace!]![localKey] = parseProfilePreferenceValue(cleanKey, value);
  }
  return grouped;
}

function normalizeTelegram(raw: string): string {
  const value = raw
    .trim()
    .replace(/^telegram:/i, "")
    .replace(/^tg:/i, "");
  if (!/^\d+$/.test(value))
    throw new Error(
      `Telegram identity must be numeric in validation fixture; got ${JSON.stringify(raw)}.`,
    );
  return value;
}

function accountIdForChannel(channel: ActiveChannelRow): string {
  const config = isRecord(channel.delivery_config) ? channel.delivery_config : {};
  return typeof config.accountId === "string" && config.accountId.trim()
    ? config.accountId.trim()
    : "default";
}

async function assertDatabaseSeeded(
  db: SupabaseServiceClient,
  sources: readonly ClientSeedSource[],
): Promise<void> {
  const seedByProfileId = new Map(sources.map(({ seed }) => [seed.profile.id, seed]));
  const ids = [...seedByProfileId.keys()];
  const [
    profilesResult,
    assistantsResult,
    profileCapabilitiesResult,
    capabilityLinksResult,
    connectedAccountsResult,
    channelsResult,
  ] = await Promise.all([
    db.from("profiles").select().in("id", ids).order("id"),
    db.from("assistants").select().in("profile_id", ids).order("assistant_id"),
    db
      .from("profile_capabilities")
      .select()
      .in("profile_id", ids)
      .order("profile_id")
      .order("capability_slug"),
    db
      .from("capability_account_links")
      .select()
      .in("profile_id", ids)
      .order("profile_id")
      .order("capability_slug"),
    db
      .from("connected_provider_accounts")
      .select()
      .in("profile_id", ids)
      .order("profile_id")
      .order("provider")
      .order("provider_account_id"),
    db
      .from("profile_channels")
      .select()
      .in("profile_id", ids)
      .order("profile_id")
      .order("provider"),
  ]);
  const profiles = requireSupabaseRows(
    "Validate client seed profiles",
    profilesResult.data,
    profilesResult.error,
  );
  const assistants = requireSupabaseRows(
    "Validate client seed assistants",
    assistantsResult.data,
    assistantsResult.error,
  );
  const profileCapabilities = requireSupabaseRows(
    "Validate client seed profile capabilities",
    profileCapabilitiesResult.data,
    profileCapabilitiesResult.error,
  );
  const capabilityLinks = requireSupabaseRows(
    "Validate client seed capability account links",
    capabilityLinksResult.data,
    capabilityLinksResult.error,
  );
  const connectedAccounts = requireSupabaseRows(
    "Validate client seed connected provider accounts",
    connectedAccountsResult.data,
    connectedAccountsResult.error,
  );
  requireSupabaseRows(
    "Validate client seed profile channels",
    channelsResult.data,
    channelsResult.error,
  );

  assertSameSet(
    "Client seed DB profile ids",
    profiles.map((profile) => profile.id),
    ids,
  );
  for (const profile of profiles) {
    const seed = seedByProfileId.get(profile.id);
    if (!seed) throw new Error(`Unexpected DB profile ${profile.id}.`);
    if (profile.user_id !== seed.portalUser.id)
      throw new Error(
        `Profile ${profile.id} user_id should be ${seed.portalUser.id}; got ${profile.user_id}.`,
      );
    if (profile.display_name !== seed.profile.displayName)
      throw new Error(`Profile ${profile.id} display_name should be ${seed.profile.displayName}.`);
    if (profile.timezone !== seed.profile.timezone)
      throw new Error(`Profile ${profile.id} timezone should be ${seed.profile.timezone}.`);
    const expectedPreferences = expectedProfilePreferences(seed);
    if (stableJson(profile.preferences) !== stableJson(expectedPreferences)) {
      throw new Error(
        `Profile ${profile.id} preferences should match client seed.\nExpected: ${stableJson(expectedPreferences)}\nActual:   ${stableJson(profile.preferences)}`,
      );
    }
    const authUser = await db.auth.admin.getUserById(profile.user_id);
    if (authUser.error || !authUser.data.user)
      throw new Error(
        `Missing auth user for profile ${profile.id}: ${authUser.error?.message ?? "no user"}`,
      );
    if (authUser.data.user.email?.toLowerCase() !== seed.portalUser.email.toLowerCase()) {
      throw new Error(
        `Auth user ${profile.user_id} email should be ${seed.portalUser.email}; got ${authUser.data.user.email}.`,
      );
    }
  }

  for (const { seed } of sources) {
    const expectedAssistants = [seed.profile.id];
    assertSameSet(
      `${seed.profile.id} assistant ids`,
      assistants.filter((row) => row.profile_id === seed.profile.id).map((row) => row.assistant_id),
      expectedAssistants,
    );
    assertSameSet(
      `${seed.profile.id} capability slugs`,
      profileCapabilities
        .filter((row) => row.profile_id === seed.profile.id && row.status === "enabled")
        .map((row) => row.capability_slug),
      uniqueSorted(
        seed.initialCapabilities
          .filter((capability) => (capability.status ?? "enabled") === "enabled")
          .map((capability) => capability.slug),
      ),
    );
    const expectedAccountLinkKeys = seed.initialCapabilities
      .filter((capability) => {
        if ((capability.status ?? "enabled") !== "enabled") return false;
        const spec = profileCapabilitySpec(capability.slug);
        if (!spec) throw new Error(`Unknown capability slug ${capability.slug}.`);
        const provider = capability.provider ?? spec.defaultProvider;
        const policy = requireCapabilityActivationPolicyForSlug(capability.slug);
        return policy.credentialMode !== "none" && !isCapabilityOnlyProvider(provider);
      })
      .map((capability) => {
        const spec = profileCapabilitySpec(capability.slug);
        if (!spec) throw new Error(`Unknown capability slug ${capability.slug}.`);
        return `${capability.slug}:${capability.provider ?? spec.defaultProvider}`;
      });
    assertSameSet(
      `${seed.profile.id} capability account link slug/provider pairs`,
      capabilityLinks
        .filter((row) => row.profile_id === seed.profile.id && row.status === "enabled")
        .map((row) => `${row.capability_slug}:${row.provider}`),
      expectedAccountLinkKeys,
    );
    const linksForProfile = capabilityLinks.filter(
      (row) => row.profile_id === seed.profile.id && row.status === "enabled",
    );
    for (const link of linksForProfile) {
      const policy = requireCapabilityActivationPolicyForSlug(link.capability_slug);
      if (policy.credentialMode !== "backend_secret") continue;
      const accountId = link.connected_provider_account_id?.trim();
      if (!accountId) {
        throw new Error(
          `${seed.profile.id} ${link.capability_slug}:${link.provider} must be bound to a managed backend-secret connected provider account.`,
        );
      }
      const account = connectedAccounts.find((row) => row.id === accountId);
      if (!account) {
        throw new Error(
          `${seed.profile.id} ${link.capability_slug}:${link.provider} connected account ${accountId} was not loaded.`,
        );
      }
      if (
        account.provider !== link.provider ||
        account.connection_status !== "connected" ||
        account.credential_kind !== "backend_secret" ||
        account.credential_status !== "healthy"
      ) {
        throw new Error(
          `${seed.profile.id} ${link.capability_slug}:${link.provider} managed account ${account.id} is not a healthy backend-secret ${link.provider} account.`,
        );
      }
    }
  }
}

async function assertGeneratedRuntime(input: {
  db: SupabaseServiceClient;
  sources: readonly ClientRuntimeSource[];
  runtimeProfile: RuntimeProfile;
}): Promise<void> {
  const profiles = await loadRuntimeProfileConfigsFromDb(input.db, input.runtimeProfile);
  const runtimeByProfileId = new Map(
    input.sources.map(({ runtime }) => [runtime.profileId, runtime]),
  );
  const unexpectedProfiles = profiles.filter((profile) => !runtimeByProfileId.has(profile.id));
  if (unexpectedProfiles.length) {
    throw new Error(
      `${input.runtimeProfile} backend runtime profiles must all have matching runtime.ts source; unexpected: ${unexpectedProfiles.map((profile) => profile.id).join(", ")}.`,
    );
  }

  for (const runtimeProfile of profiles) {
    const profileId = runtimeProfile.id;
    const profile = runtimeProfileById(profiles, profileId);
    const instructions = profileAssistantBaseInstructions({
      profileId: profile.id,
      profileDisplayName: profile.displayName,
      assistantDisplayName: profile.assistantName,
      timezone: profile.timezone,
    });
    for (const expected of [
      profile.displayName,
      profile.assistantName,
      "Read tool results through canonical structured fields before replying: `data` and `error`.",
      "For ordinary direct messages, send a visible answer",
    ]) {
      if (!instructions.includes(expected)) {
        throw new Error(
          `${input.runtimeProfile} backend prompt for ${profileId} is missing required guidance: ${expected}`,
        );
      }
    }
    const runtime = runtimeByProfileId.get(profileId);
    if (!runtime) throw new Error(`${input.runtimeProfile} agent ${profileId} has no runtime.ts.`);
  }

  const profileIds = profiles.map((profile) => profile.id);
  if (!profileIds.length)
    throw new Error(`${input.runtimeProfile} validation expected at least one runtime profile.`);
  const channelsResult = await input.db
    .from("profile_channels")
    .select()
    .in("profile_id", profileIds)
    .eq("status", "active")
    .order("profile_id");
  const channels = requireSupabaseRows(
    `${input.runtimeProfile} active profile channels`,
    channelsResult.data,
    channelsResult.error,
  ).filter((channel) => process.env.AI_ASSISTANTS_E2E_RUN_ID?.trim() || channel.provider !== "e2e-test");
  for (const channel of channels) {
    const accountId = accountIdForChannel(channel);
    const peerId =
      channel.provider === "telegram"
        ? normalizeTelegram(channel.external_identity)
        : channel.external_identity.trim();
    if (!peerId)
      throw new Error(
        `${input.runtimeProfile} active channel ${channel.provider} has empty external_identity.`,
      );
    const profile = runtimeProfileById(profiles, channel.profile_id);
    const runtimeChannel = profile.channels.find(
      (entry) =>
        entry.provider === channel.provider &&
        entry.accountId === accountId &&
        entry.externalIdentity === channel.external_identity,
    );
    if (!runtimeChannel) {
      throw new Error(
        `${input.runtimeProfile} active channel ${channel.provider}:${peerId} was not loaded into backend runtime profile ${channel.profile_id}.`,
      );
    }
  }
}

async function clientProfileSnapshot(
  db: SupabaseServiceClient,
  profileIds: readonly string[],
): Promise<string> {
  const [
    profilesResult,
    assistantsResult,
    profileCapabilitiesResult,
    capabilityLinksResult,
    connectedAccountsResult,
    channelsResult,
    policiesResult,
    workRoutesResult,
    scheduledTasksResult,
  ] = await Promise.all([
    db.from("profiles").select().in("id", profileIds).order("id"),
    db
      .from("assistants")
      .select()
      .in("profile_id", profileIds)
      .order("profile_id")
      .order("assistant_id"),
    db
      .from("profile_capabilities")
      .select()
      .in("profile_id", profileIds)
      .order("profile_id")
      .order("capability_slug"),
    db
      .from("capability_account_links")
      .select()
      .in("profile_id", profileIds)
      .order("profile_id")
      .order("capability_slug")
      .order("provider"),
    db
      .from("connected_provider_accounts")
      .select()
      .in("profile_id", profileIds)
      .order("profile_id")
      .order("provider")
      .order("provider_account_id"),
    db.from("profile_channels").select().in("profile_id", profileIds).order("profile_id"),
    db.from("approval_policies").select().in("profile_id", profileIds).order("profile_id"),
    db
      .from("profile_assistant_work_routes")
      .select()
      .in("profile_id", profileIds)
      .order("profile_id")
      .order("event_type")
      .order("connected_provider_account_id", { nullsFirst: true }),
    db
      .from("assistant_scheduled_tasks")
      .select()
      .in("profile_id", profileIds)
      .order("profile_id")
      .order("id"),
  ]);

  return stableJson({
    profiles: requireSupabaseRows("Snapshot profiles", profilesResult.data, profilesResult.error),
    assistants: requireSupabaseRows(
      "Snapshot assistants",
      assistantsResult.data,
      assistantsResult.error,
    ),
    profileCapabilities: requireSupabaseRows(
      "Snapshot profile capabilities",
      profileCapabilitiesResult.data,
      profileCapabilitiesResult.error,
    ),
    capabilityLinks: requireSupabaseRows(
      "Snapshot capability account links",
      capabilityLinksResult.data,
      capabilityLinksResult.error,
    ),
    connectedAccounts: requireSupabaseRows(
      "Snapshot connected provider accounts",
      connectedAccountsResult.data,
      connectedAccountsResult.error,
    ),
    channels: requireSupabaseRows(
      "Snapshot profile channels",
      channelsResult.data,
      channelsResult.error,
    ),
    policies: requireSupabaseRows(
      "Snapshot approval policies",
      policiesResult.data,
      policiesResult.error,
    ),
    workRoutes: requireSupabaseRows(
      "Snapshot assistant work routes",
      workRoutesResult.data,
      workRoutesResult.error,
    ),
    scheduledTasks: requireSupabaseRows(
      "Snapshot scheduled tasks",
      scheduledTasksResult.data,
      scheduledTasksResult.error,
    ),
  });
}

async function assertSeedRerunSkipped(input: {
  db: SupabaseServiceClient;
  runtimeProfile: RuntimeProfile;
  supabaseUrl: string;
  profileIds: readonly string[];
}): Promise<void> {
  const before = await clientProfileSnapshot(input.db, input.profileIds);
  const rerun = await seedMissingClientProfiles({
    db: input.db,
    runtimeProfile: input.runtimeProfile,
    supabaseUrl: input.supabaseUrl,
  });
  const mutated = rerun.filter((result) => result.summary.status !== "skipped");
  if (mutated.length) {
    throw new Error(
      `Seed rerun must skip existing profiles; got non-skipped results for ${mutated.map((result) => result.source.clientId).join(", ")}.`,
    );
  }
  const after = await clientProfileSnapshot(input.db, input.profileIds);
  if (before !== after) {
    throw new Error("Seed rerun changed client DB rows; existing profiles must be ignored.");
  }
}

function ensureDevSupabaseEnvLoaded(): void {
  if (process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return;
  const envPath = profileEnvPath("dev");
  if (!existsSync(envPath)) {
    throw new Error(
      `Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment, or define them in ${envPath}.`,
    );
  }
  const profile = readDotEnvFile(envPath);
  for (const [key, value] of Object.entries(profile)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(`SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing after loading ${envPath}.`);
  }
}

export function assertProdRemoteSeedHardening(sources: readonly ClientSeedSource[]): void {
  const errors: string[] = [];
  for (const { runtimePath, seedPath, seed, runtime } of sources) {
    if (!runtime.runtimeProfiles.includes("prod")) continue;
    if (!seed.portalUser.password) {
      errors.push(`${seedPath}: prod seed requires portalUser.password.`);
    }
    if (seed.portalUser.email.endsWith(".local")) {
      errors.push(`${seedPath}: prod seed requires a real portal email.`);
    }
    if (runtime.defaultAssistant && !runtime.runtimeProfiles.includes("prod")) {
      errors.push(`${runtimePath}: prod default assistant must target prod.`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Client prod hardening failed:\n${errors.join("\n")}`);
  }
}

export async function validateClientSourceFiles(root = repoRoot(import.meta.url)): Promise<void> {
  const runtimeSources = await loadClientRuntimeSources(root);
  if (runtimeSources.length === 0) throw new Error("No client runtime sources found.");
  const seedSources = await loadClientSeedSources(root);
  assertProdRemoteSeedHardening(seedSources);
  assertSeedTwilioMessagingRoutesUnambiguous(seedSources);
}

export async function runClientValidateCli(argv = process.argv.slice(2)): Promise<void> {
  parseOptions(argv);
  const root = repoRoot(import.meta.url);
  await validateClientSourceFiles(root);
  ensureDevSupabaseEnvLoaded();

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  if (!supabaseUrl) throw new Error("SUPABASE_URL missing after loading dev Supabase env.");
  const db = createSupabaseServiceClient();
  const seeded = await seedMissingClientProfiles({
    db,
    runtimeProfile: "dev",
    supabaseUrl,
  });
  const selectedSources = seeded.map((result) => result.source);
  const createdSources: ClientSeedSource[] = [];
  for (const result of seeded) {
    if (result.summary.status !== "created") continue;
    if (!isClientSeedSource(result.source)) {
      throw new Error(`Created profile ${result.source.clientId} has no seed source.`);
    }
    createdSources.push(result.source);
  }
  if (createdSources.length) await assertDatabaseSeeded(db, createdSources);

  await assertGeneratedRuntime({
    db,
    sources: selectedSources,
    runtimeProfile: "dev",
  });
  await assertSeedRerunSkipped({
    db,
    runtimeProfile: "dev",
    supabaseUrl,
    profileIds: selectedSources.map(({ clientId }) => clientId),
  });

  console.log(`Client validation passed for ${seeded.length} dev client source(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runClientValidateCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
