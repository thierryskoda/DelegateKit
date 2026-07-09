import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { isCapabilityOnlyProvider } from "@ai-assistants/connected-accounts";
import {
  assertKnownSlugProviderPair,
  requireCapabilityActivationPolicyForSlug,
  profileCapabilitySpec,
} from "@ai-assistants/capability-catalog";
import { nangoProviderConfigKeyForCapabilityProvider } from "@ai-assistants/nango-provisioning";
import {
  assistantScheduleSchema,
  type AssistantSchedule,
} from "@ai-assistants/scheduled-tasks-contracts/schemas";
import {
  profilePreferenceKeySchema,
  parseProfilePreferenceValue,
} from "../../apps/backend/src/ops-support/profile-preferences";
import type { WritePolicyRules } from "@ai-assistants/tool-contracts";
import type { RuntimeProfile } from "@ai-assistants/repo-layout";
import { validateProfileRuntime } from "../repo-tooling/build/profile-runtime-validation";
import { evaluateCapabilityActivation } from "@ai-assistants/capability-lifecycle";
import {
  computeNextScheduledTaskRunAt,
  createSeedProfileGuidance,
  enqueueBoldSignWebhookReconcile,
} from "../../apps/backend/src/ops-support/profile-seeding";
import {
  ensureManagedBackendSecretCapabilityAccount,
  managedBackendSecretProviderBindings,
} from "../../apps/backend/src/ops-support/managed-backend-secret-capabilities";
import { assistantCapabilityForProfileSlug } from "@ai-assistants/assistant-capability-surface";
import { formatUnknownError } from "@ai-assistants/errors";
import type {
  ClientAssistantWorkRoute,
  ClientChannel,
  ClientGuidance,
  ClientRuntime,
  ClientScheduledTask,
  ClientSeed,
  ClientWritePolicy,
} from "./schema";

type AuthUser = {
  id: string;
  email?: string;
};

type GroupedProfilePreferences = Record<string, Record<string, unknown>>;
const seedScheduledTaskSessionKeyPrefix = "onboarding";

export type ClientSeedOptions = {
  runtime: ClientRuntime;
  runtimeProfile: RuntimeProfile;
  db: SupabaseServiceClient;
  build: boolean;
  restart: boolean;
};

export type ClientSeedSummary = {
  status: "created" | "skipped";
  profileId: string;
  portalEmail: string;
  authUserId: string | null;
  runtimeProfiles: string[];
  capabilitySlugs: string[];
  channelCount: number;
  capabilitiesSeeded: number;
  guidanceSeeded: number;
  runtimeBuilt: boolean;
};

function portalPassword(input: ClientSeed, runtimeProfile: RuntimeProfile): string {
  if (runtimeProfile === "prod" && input.portalUser.email.endsWith(".local")) {
    throw new Error(
      `prod client seed for ${input.profile.id} requires a real portal email, got ${input.portalUser.email}.`,
    );
  }
  return input.portalUser.password;
}

function deterministicUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  const variant = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function seedScheduledTaskId(profileId: string, key: string): string {
  return deterministicUuid(`ai-assistants:onboarding:assistant-scheduled-task:${profileId}:${key}`);
}

function seedScheduledTaskSessionKey(profileId: string, key: string): string {
  return `${seedScheduledTaskSessionKeyPrefix}:${profileId}:${key}`;
}

function scheduleTimezone(schedule: AssistantSchedule): string | null {
  return schedule.kind === "cron" ? schedule.timezone : null;
}

function normalizeTelegramIdentity(raw: string, source: string): string {
  const value = raw
    .trim()
    .replace(/^telegram:/i, "")
    .replace(/^tg:/i, "");
  if (!/^\d+$/.test(value))
    throw new Error(`${source} must be a numeric Telegram user id; got ${JSON.stringify(raw)}.`);
  return value;
}

function normalizeImessageIdentity(raw: string, source: string): string {
  const value = raw.trim();
  if (!value) throw new Error(`${source} must be a non-empty iMessage sender handle.`);
  return value;
}

function normalizeChannel(channel: ClientChannel): ClientChannel {
  if (channel.provider === "telegram") {
    return {
      ...channel,
      externalIdentity: normalizeTelegramIdentity(
        channel.externalIdentity,
        "channels.telegram.externalIdentity",
      ),
    };
  }
  if (channel.provider === "imessage") {
    return {
      ...channel,
      externalIdentity: normalizeImessageIdentity(
        channel.externalIdentity,
        "channels.imessage.externalIdentity",
      ),
    };
  }
  const exhaustive: never = channel.provider;
  throw new Error(`Unsupported channel provider ${exhaustive}.`);
}

function desiredChannels(input: ClientSeed): ClientChannel[] {
  const channels = input.initialChannels.map(normalizeChannel);
  const seen = new Set<string>();
  for (const channel of channels) {
    const key = `${channel.provider}:${channel.externalIdentity}`;
    if (seen.has(key)) throw new Error(`Duplicate normalized channel identity ${key}.`);
    seen.add(key);
  }
  return channels;
}

function channelsForRuntimeProfile(
  input: ClientSeed,
  runtimeProfile: RuntimeProfile,
): ClientChannel[] {
  const channels = desiredChannels(input);
  if (runtimeProfile === "prod") {
    return channels.filter((channel) => channel.provider !== "imessage");
  }
  return channels;
}

function defaultWritePolicyRules(): WritePolicyRules {
  return { defaultMode: "auto_execute", actions: {} };
}

function mergeWritePolicyRules(
  base: WritePolicyRules,
  overrides: ClientWritePolicy,
): WritePolicyRules {
  return {
    defaultMode: overrides.defaultMode,
    actions: { ...base.actions, ...overrides.actions },
  };
}

function preferenceEntries(input: ClientSeed): GroupedProfilePreferences {
  const entries = new Map<string, unknown>();
  const set = (key: string, value: unknown) => {
    if (value !== undefined) entries.set(key, value);
  };

  set("assistant.name", input.initialAssistantName);

  const grouped: GroupedProfilePreferences = {};
  for (const [key, value] of entries.entries()) {
    const cleanKey = profilePreferenceKeySchema.parse(key);
    const [namespace, ...rest] = cleanKey.split(".");
    const localKey = rest.join(".");
    grouped[namespace!] ??= {};
    grouped[namespace!]![localKey] = parseProfilePreferenceValue(cleanKey, value);
  }
  return grouped;
}

function validateLocalTopology(input: ClientSeed): void {
  for (const capability of input.initialCapabilities)
    assistantCapabilityForProfileSlug(capability.slug);
}

function profileMetadata(input: ClientSeed): Record<string, unknown> {
  return input.profile.metadata;
}

function errorField(error: unknown, key: string): string | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

export function formatSupabaseAuthAdminError(error: unknown): string {
  const fields = [
    errorField(error, "name"),
    errorField(error, "message"),
    errorField(error, "status"),
    errorField(error, "code"),
    errorField(error, "error"),
    errorField(error, "error_description"),
  ].filter((value): value is string => Boolean(value));
  const uniqueFields = [...new Set(fields)];
  if (uniqueFields.length) return uniqueFields.join(" ");
  return formatUnknownError(error);
}

function isAuthUserNotFound(error: unknown): boolean {
  const status = errorField(error, "status");
  const code = errorField(error, "code")?.toLowerCase() ?? "";
  const message = errorField(error, "message")?.toLowerCase() ?? "";
  return status === "404" || code.includes("not_found") || message.includes("not found");
}

async function listAuthUsersPage(
  db: SupabaseServiceClient,
  input: { page: number; perPage: number },
): Promise<AuthUser[]> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const result = await db.auth.admin.listUsers(input);
    if (!result.error) {
      return result.data.users.map((user) => ({ id: user.id, email: user.email ?? "" }));
    }
    lastError = result.error;
    await delay(Math.min(250 * attempt, 1_500));
  }
  throw new Error(`List Supabase auth users: ${formatSupabaseAuthAdminError(lastError)}`);
}

async function getAuthUserById(db: SupabaseServiceClient, id: string): Promise<AuthUser | null> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const result = await db.auth.admin.getUserById(id);
    if (!result.error) {
      const user = result.data.user;
      return user ? { id: user.id, email: user.email ?? "" } : null;
    }
    if (isAuthUserNotFound(result.error)) return null;
    lastError = result.error;
    await delay(Math.min(250 * attempt, 1_500));
  }
  throw new Error(`Get Supabase auth user ${id}: ${formatSupabaseAuthAdminError(lastError)}`);
}

async function findAuthUserByEmail(
  db: SupabaseServiceClient,
  email: string,
): Promise<AuthUser | null> {
  const matches: AuthUser[] = [];
  const target = email.toLowerCase();
  for (let page = 1; page <= 100; page += 1) {
    const users = await listAuthUsersPage(db, { page, perPage: 1000 });
    for (const user of users) {
      if (user.email?.toLowerCase() === target) matches.push({ id: user.id, email: user.email });
    }
    if (users.length < 1000) break;
  }
  if (matches.length > 1)
    throw new Error(
      `Multiple auth users exist for ${email}. Resolve duplicates before seeding this client.`,
    );
  return matches[0] ?? null;
}

async function ensureAuthUserForSeed(
  db: SupabaseServiceClient,
  input: ClientSeed,
  runtimeProfile: RuntimeProfile,
): Promise<AuthUser> {
  const targetEmail = input.portalUser.email.toLowerCase();
  const existingById = input.portalUser.id ? await getAuthUserById(db, input.portalUser.id) : null;
  const existingByEmail =
    existingById?.email?.toLowerCase() === targetEmail
      ? existingById
      : await findAuthUserByEmail(db, input.portalUser.email);
  if (existingById && existingByEmail && existingById.id !== existingByEmail.id) {
    throw new Error(
      `portalUser.email ${input.portalUser.email} already belongs to auth user ${existingByEmail.id}, not ${existingById.id}.`,
    );
  }
  const existing = existingById ?? existingByEmail;
  if (existing && input.portalUser.id && existing.id !== input.portalUser.id) {
    throw new Error(
      `portalUser.id ${input.portalUser.id} does not match existing auth user ${existing.id} for ${input.portalUser.email}.`,
    );
  }

  const password = portalPassword(input, runtimeProfile);
  const metadata = {
    display_name: input.profile.displayName,
    ai_assistants_profile_id: input.profile.id,
    ...input.portalUser.metadata,
  };

  if (existing) {
    const result = await db.auth.admin.updateUserById(existing.id, {
      email: input.portalUser.email,
      ...(password ? { password } : {}),
      user_metadata: metadata,
      email_confirm: true,
    });
    if (result.error)
      throw new Error(
        `Update auth user ${existing.id}: ${formatSupabaseAuthAdminError(result.error)}`,
      );
    if (!result.data.user)
      throw new Error(`Update auth user ${existing.id}: Supabase returned no user.`);
    return { id: result.data.user.id, email: result.data.user.email ?? input.portalUser.email };
  }

  const result = await db.auth.admin.createUser({
    ...(input.portalUser.id ? { id: input.portalUser.id } : {}),
    email: input.portalUser.email,
    password,
    user_metadata: metadata,
    email_confirm: true,
  });
  if (result.error)
    throw new Error(
      `Create auth user ${input.portalUser.email}: ${formatSupabaseAuthAdminError(result.error)}`,
    );
  if (!result.data.user)
    throw new Error(`Create auth user ${input.portalUser.email}: Supabase returned no user.`);
  return { id: result.data.user.id, email: result.data.user.email ?? input.portalUser.email };
}

async function assertProfileOwnershipCanBeCreated(
  db: SupabaseServiceClient,
  profileId: string,
  authUserId: string,
): Promise<void> {
  const [profileResult, profileForUserResult] = await Promise.all([
    db.from("profiles").select().eq("id", profileId).maybeSingle(),
    db.from("profiles").select().eq("user_id", authUserId).maybeSingle(),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (profileForUserResult.error) throw profileForUserResult.error;
  if (profileResult.data && profileResult.data.user_id !== authUserId) {
    throw new Error(
      `Profile ${profileId} already belongs to auth user ${profileResult.data.user_id}, not ${authUserId}.`,
    );
  }
  if (profileForUserResult.data && profileForUserResult.data.id !== profileId) {
    throw new Error(
      `Auth user ${authUserId} already owns profile ${profileForUserResult.data.id}, not ${profileId}.`,
    );
  }
}

async function insertProfile(
  db: SupabaseServiceClient,
  input: ClientSeed,
  authUserId: string,
  preferences: GroupedProfilePreferences,
): Promise<TableRow<"profiles">> {
  await assertProfileOwnershipCanBeCreated(db, input.profile.id, authUserId);
  const result = await db
    .from("profiles")
    .insert({
      id: input.profile.id,
      user_id: authUserId,
      display_name: input.profile.displayName,
      timezone: input.profile.timezone,
      status: input.profile.status,
      metadata: requireJsonObject(profileMetadata(input), "profile.metadata"),
      preferences: requireJsonObject(preferences, "profile.preferences"),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  return requireSupabaseData(`Insert profile ${input.profile.id}`, result.data, result.error);
}

async function insertProfileCapabilityRow(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilitySlug: string;
    required: boolean;
    status: string;
  },
): Promise<TableRow<"profile_capabilities">> {
  const result = await db
    .from("profile_capabilities")
    .insert({
      profile_id: input.profileId,
      capability_slug: input.capabilitySlug,
      status: input.status,
      required: input.required,
      config: {},
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  return requireSupabaseData(
    `Insert profile capability ${input.capabilitySlug}`,
    result.data,
    result.error,
  );
}

async function insertCapabilities(
  db: SupabaseServiceClient,
  input: ClientSeed,
): Promise<TableRow<"capability_account_links">[]> {
  for (const capability of input.initialCapabilities) {
    const spec = profileCapabilitySpec(capability.slug);
    if (!spec) throw new Error(`Unknown capability slug ${capability.slug}.`);
    const provider = capability.provider ?? spec.defaultProvider;
    assertKnownSlugProviderPair(capability.slug, provider);
  }

  const rows: TableRow<"capability_account_links">[] = [];
  const capabilityRowsBySlug = new Map<string, TableRow<"profile_capabilities">>();
  for (const capability of input.initialCapabilities) {
    const spec = profileCapabilitySpec(capability.slug);
    if (!spec) throw new Error(`Unknown capability slug ${capability.slug}.`);
    const status = capability.status ?? "enabled";
    const profileCapability =
      capabilityRowsBySlug.get(capability.slug) ??
      (await insertProfileCapabilityRow(db, {
        profileId: input.profile.id,
        capabilitySlug: capability.slug,
        required: capability.required,
        status,
      }));
    capabilityRowsBySlug.set(capability.slug, profileCapability);
  }

  for (const capability of input.initialCapabilities) {
    assistantCapabilityForProfileSlug(capability.slug);
    const spec = profileCapabilitySpec(capability.slug);
    if (!spec) throw new Error(`Unknown capability slug ${capability.slug}.`);
    const provider = capability.provider ?? spec.defaultProvider;
    assertKnownSlugProviderPair(capability.slug, provider);
    const policy = requireCapabilityActivationPolicyForSlug(capability.slug);
    const profileCapability = capabilityRowsBySlug.get(capability.slug);
    if (!profileCapability) {
      throw new Error(`Profile capability row missing for ${capability.slug}.`);
    }
    if (policy.credentialMode === "none" || isCapabilityOnlyProvider(provider)) {
      continue;
    }
    const label = capability.label ?? spec.label;
    const slotStatus = capability.status ?? "enabled";
    const seedConfig = requireJsonObject(
      capability.config,
      `capability.${capability.slug}.config`,
    ) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...seedConfig };
    const existingNangoKey = merged.nangoProviderConfigKey;
    const hasExplicitNangoKey =
      typeof existingNangoKey === "string" && existingNangoKey.trim().length > 0;
    if (!hasExplicitNangoKey) {
      const derived = nangoProviderConfigKeyForCapabilityProvider(capability.slug, provider);
      if (derived) merged.nangoProviderConfigKey = derived;
    }
    const config = requireJsonObject(merged, `capability.${capability.slug}.config`);
    const result = await db
      .from("capability_account_links")
      .insert({
        profile_id: input.profile.id,
        profile_capability_id: profileCapability.id,
        capability_slug: capability.slug,
        provider,
        label,
        status: slotStatus,
        required: capability.required,
        config,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    rows.push(
      requireSupabaseData(`Insert capability ${capability.slug}`, result.data, result.error),
    );
  }
  return rows;
}

async function insertManagedBackendSecretConnections(
  db: SupabaseServiceClient,
  input: ClientSeed,
  capabilityAccountLinks: readonly TableRow<"capability_account_links">[],
): Promise<void> {
  for (const managed of managedBackendSecretProviderBindings) {
    const link = capabilityAccountLinks.find(
      (candidate) =>
        candidate.capability_slug === managed.capabilitySlug &&
        candidate.provider === managed.provider &&
        candidate.status === "enabled",
    );
    if (!link) continue;
    const connectedAccount = await ensureManagedBackendSecretCapabilityAccount(db, {
      profileId: input.profile.id,
      capabilityAccountLink: link,
      provider: managed.provider,
      providerAccountId: managed.providerAccountId,
      displayLabel: managed.displayLabel,
      managedCredential: managed.managedCredential,
      metadata: managed.metadata,
    });
    if (managed.provider === "boldsign") {
      await enqueueBoldSignWebhookReconcile(db, {
        profileId: input.profile.id,
        capabilityAccountLinkId: link.id,
        connectedProviderAccountId: connectedAccount.id,
      });
    }
  }
}

async function evaluateNoCredentialCapabilityActivations(
  db: SupabaseServiceClient,
  input: ClientSeed,
  capabilityAccountLinks: readonly TableRow<"capability_account_links">[],
): Promise<void> {
  for (const link of capabilityAccountLinks) {
    if (link.status !== "enabled") continue;
    const policy = requireCapabilityActivationPolicyForSlug(link.capability_slug);
    if (policy.credentialMode !== "none") continue;
    if (policy.setupBlocker !== null) continue;

    await evaluateCapabilityActivation(db, {
      profileId: input.profile.id,
      capabilityAccountLinkId: link.id,
      trigger: "manual_retry",
    });
  }
}

async function insertAssistants(db: SupabaseServiceClient, input: ClientSeed): Promise<void> {
  const main = await db.from("assistants").insert({
    assistant_id: input.profile.id,
    profile_id: input.profile.id,
    updated_at: new Date().toISOString(),
  });
  requireSupabaseData("Insert assistant", main.data ?? [], main.error);
}

async function ensureAssistantMapping(db: SupabaseServiceClient, input: ClientSeed): Promise<void> {
  const existing = await db
    .from("assistants")
    .select("assistant_id,profile_id")
    .eq("assistant_id", input.profile.id)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.profile_id !== input.profile.id) {
      throw new Error(
        `Assistant ${input.profile.id} is mapped to profile ${existing.data.profile_id}, expected ${input.profile.id}.`,
      );
    }
    return;
  }

  await insertAssistants(db, input);
}

async function insertChannels(
  db: SupabaseServiceClient,
  input: ClientSeed,
  channels: readonly ClientChannel[],
): Promise<void> {
  for (const channel of channels) {
    const existing = await db
      .from("profile_channels")
      .select()
      .eq("provider", channel.provider)
      .eq("external_identity", channel.externalIdentity)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data && existing.data.profile_id !== input.profile.id) {
      throw new Error(
        `${channel.provider} identity ${channel.externalIdentity} already belongs to profile ${existing.data.profile_id}.`,
      );
    }

    const deliveryConfig = {
      ...channel.deliveryConfig,
      ...(channel.accountId === "default" ? {} : { accountId: channel.accountId }),
    };
    const result = await db.from("profile_channels").insert({
      profile_id: input.profile.id,
      provider: channel.provider,
      external_identity: channel.externalIdentity,
      delivery_config: requireJsonObject(
        deliveryConfig,
        `channel.${channel.provider}.deliveryConfig`,
      ),
      status: channel.status,
      updated_at: new Date().toISOString(),
    });
    requireSupabaseData(`Insert ${channel.provider} channel`, result.data ?? [], result.error);
  }
}

async function insertWritePolicy(
  db: SupabaseServiceClient,
  input: ClientSeed,
  rules: WritePolicyRules,
): Promise<void> {
  const result = await db.from("approval_policies").insert({
    profile_id: input.profile.id,
    rules: requireJsonObject(rules, "initialWritePolicy.rules"),
    updated_at: new Date().toISOString(),
  });
  requireSupabaseData("Insert write policy", result.data ?? [], result.error);
}

async function insertAssistantWorkRoutes(
  db: SupabaseServiceClient,
  input: ClientSeed,
  routes: readonly ClientAssistantWorkRoute[],
): Promise<void> {
  const now = new Date().toISOString();
  if (!routes.length) return;

  const result = await db.from("profile_assistant_work_routes").insert(
    routes.map((route) => ({
      profile_id: input.profile.id,
      event_type: route.eventType,
      ...(route.connectedProviderAccountId === undefined
        ? {}
        : { connected_provider_account_id: route.connectedProviderAccountId }),
      config: requireJsonObject(
        route.config,
        `initialAssistantWorkRoutes.${route.eventType}.config`,
      ),
      managed_by: "onboarding",
      created_at: now,
      updated_at: now,
    })),
  );
  requireSupabaseData("Insert assistant work routes", result.data ?? [], result.error);
}

async function insertSeedScheduledTask(
  db: SupabaseServiceClient,
  input: ClientSeed,
  task: ClientScheduledTask,
  now: Date,
): Promise<string> {
  const schedule = assistantScheduleSchema.parse(task.schedule);
  const taskId = seedScheduledTaskId(input.profile.id, task.key);
  const sourceSessionKey = seedScheduledTaskSessionKey(input.profile.id, task.key);
  const timezone = scheduleTimezone(schedule);
  const desired = {
    status: task.status,
    title: task.title.trim(),
    instructions: task.instructions.trim(),
    schedule,
    timezone,
    sourceSessionKey,
  } satisfies {
    status: "active" | "paused";
    title: string;
    instructions: string;
    schedule: AssistantSchedule;
    timezone: string | null;
    sourceSessionKey: string;
  };
  const nextRunAt =
    desired.status === "active" ? computeNextScheduledTaskRunAt(schedule, now) : null;

  const insertResult = await db.from("assistant_scheduled_tasks").insert({
    id: taskId,
    profile_id: input.profile.id,
    status: desired.status,
    title: desired.title,
    instructions: desired.instructions,
    schedule: requireJsonObject(schedule, `initialScheduledTasks.${task.key}.schedule`),
    timezone,
    next_run_at: nextRunAt,
    revision: 1,
    created_by_agent_id: "onboarding",
    created_by_session_key: sourceSessionKey,
    created_by_session_id: null,
    created_by_tool_call_id: null,
  });
  requireSupabaseData(
    `Insert seed scheduled task ${task.key}`,
    insertResult.data ?? [],
    insertResult.error,
  );
  return taskId;
}

async function insertScheduledTasks(
  db: SupabaseServiceClient,
  input: ClientSeed,
  tasks: readonly ClientScheduledTask[],
): Promise<void> {
  const now = new Date();
  for (const task of tasks) {
    await insertSeedScheduledTask(db, input, task, now);
  }
}

async function insertInitialGuidance(
  db: SupabaseServiceClient,
  input: ClientSeed,
  guidanceRows: readonly ClientGuidance[],
): Promise<number> {
  for (const guidance of guidanceRows) {
    await createSeedProfileGuidance(db, {
      profileId: input.profile.id,
      guidance,
    });
  }
  return guidanceRows.length;
}

async function buildRuntimeProfile(profile: RuntimeProfile): Promise<void> {
  await validateProfileRuntime({ profile });
}

async function profileExists(db: SupabaseServiceClient, profileId: string): Promise<boolean> {
  const result = await db.from("profiles").select("id").eq("id", profileId).maybeSingle();
  if (result.error) throw result.error;
  return Boolean(result.data);
}

export async function seedClientProfileIfMissing(
  input: ClientSeed,
  options: ClientSeedOptions,
): Promise<ClientSeedSummary> {
  if (options.runtime.profileId !== input.profile.id) {
    throw new Error(
      `Client seed ${input.profile.id} does not match runtime profileId ${options.runtime.profileId}.`,
    );
  }
  if (!options.runtime.runtimeProfiles.includes(options.runtimeProfile)) {
    throw new Error(
      `Profile ${input.profile.id} is not configured for runtime profile ${options.runtimeProfile}.`,
    );
  }
  const db = options.db;
  if (await profileExists(db, input.profile.id)) {
    await ensureAssistantMapping(db, input);
    return {
      status: "skipped",
      profileId: input.profile.id,
      portalEmail: input.portalUser.email,
      authUserId: null,
      runtimeProfiles: options.runtime.runtimeProfiles,
      capabilitySlugs: input.initialCapabilities.map((capability) => capability.slug),
      channelCount: 0,
      capabilitiesSeeded: 0,
      guidanceSeeded: 0,
      runtimeBuilt: false,
    };
  }

  validateLocalTopology(input);
  const channels = channelsForRuntimeProfile(input, options.runtimeProfile);
  const preferences = preferenceEntries(input);
  const writePolicyRules = mergeWritePolicyRules(
    defaultWritePolicyRules(),
    input.initialWritePolicy,
  );
  const auth = await ensureAuthUserForSeed(db, input, options.runtimeProfile);
  await insertProfile(db, input, auth.id, preferences);
  const capabilities = await insertCapabilities(db, input);
  await insertManagedBackendSecretConnections(db, input, capabilities);
  await evaluateNoCredentialCapabilityActivations(db, input, capabilities);
  await insertAssistants(db, input);
  await insertChannels(db, input, channels);
  await insertWritePolicy(db, input, writePolicyRules);
  await insertAssistantWorkRoutes(db, input, input.initialAssistantWorkRoutes);
  await insertScheduledTasks(db, input, input.initialScheduledTasks);
  const guidanceSeeded = await insertInitialGuidance(db, input, input.initialGuidance);
  if (options.build || options.restart) await buildRuntimeProfile(options.runtimeProfile);

  return {
    status: "created",
    profileId: input.profile.id,
    portalEmail: input.portalUser.email,
    authUserId: auth.id,
    runtimeProfiles: options.runtime.runtimeProfiles,
    capabilitySlugs: input.initialCapabilities.map((capability) => capability.slug),
    channelCount: channels.length,
    capabilitiesSeeded: input.initialCapabilities.length,
    guidanceSeeded,
    runtimeBuilt: options.build || options.restart,
  };
}
