import { execFileSync } from "node:child_process";
import {
  createSupabaseServiceClient,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type SupabaseServiceConfig,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  isProductionLikeProfile,
  repoRoot,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import { envForProfile } from "../../profiles/profile";
import { readSupabaseLocalStatus } from "../../profiles/supabase-status";
import { assistantCapabilityForProfileSlug } from "@ai-assistants/assistant-capability-surface";
import { loadClientRuntimeSources } from "../../clients/source";

type RuntimeProfileAssistant = {
  assistantId: string;
};

type RuntimeProfileChannel = {
  provider: string;
  externalIdentity: string;
  accountId: string;
};

export type RuntimeProfileConfig = {
  id: string;
  displayName: string;
  assistantName: string;
  timezone: string;
  status: string;
  defaultAssistant: boolean;
  assistants: RuntimeProfileAssistant[];
  capabilitySlugs: string[];
  channels: RuntimeProfileChannel[];
};

function parseSupabaseEnvOutput(output: string): Record<string, string> {
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2]]),
  );
}

export function supabaseConfigFromProfile(profile: RuntimeProfile): SupabaseServiceConfig {
  const profileEnv = envForProfile(profile);
  const url = profileEnv.SUPABASE_URL?.trim();
  const serviceRoleKey = profileEnv.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && serviceRoleKey) return { url, serviceRoleKey };
  if (url || serviceRoleKey) {
    throw new Error(
      `Profile ${profile} must set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or neither.`,
    );
  }
  const localWorkdir = profileEnv.SUPABASE_LOCAL_WORKDIR?.trim();
  if (localWorkdir) {
    try {
      const status = readSupabaseLocalStatus(localWorkdir);
      return { url: status.apiUrl, serviceRoleKey: status.serviceRoleKey };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Profile ${profile} points SUPABASE_LOCAL_WORKDIR at ${localWorkdir}, but local Supabase is not running. Run npm run profile -- supabase start --profile=${profile}, then retry. ${message}`,
      );
    }
  }
  if (profile !== "dev") {
    throw new Error(
      `Profile ${profile} requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in its profile .env. For e2e, run npm run profile -- supabase start --profile=e2e first.`,
    );
  }

  try {
    const status = execFileSync("npx", ["--yes", "supabase@2.98.1", "status", "-o", "env"], {
      cwd: repoRoot(import.meta.url),
      encoding: "utf8",
      maxBuffer: 5_000_000,
    });
    const parsed = parseSupabaseEnvOutput(status);
    if (!parsed.API_URL || !parsed.SERVICE_ROLE_KEY) {
      throw new Error("Supabase status output did not include API_URL and SERVICE_ROLE_KEY.");
    }
    return { url: parsed.API_URL, serviceRoleKey: parsed.SERVICE_ROLE_KEY };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Dev profile needs a running local Supabase stack. Run npm run db -- migrate-local, then retry. ${message}`,
    );
  }
}

function jsonRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function channelAccountId(row: TableRow<"profile_channels">): string {
  const config = jsonRecord(row.delivery_config, `profile_channels.${row.id}.delivery_config`);
  const accountId = config.accountId;
  return typeof accountId === "string" && accountId.trim() ? accountId.trim() : "default";
}

function assistantNameFromPreferences(row: TableRow<"profiles">): string {
  const preferences = jsonRecord(row.preferences, `profiles.${row.id}.preferences`);
  const assistant = jsonRecord(preferences.assistant, `profiles.${row.id}.preferences.assistant`);
  const name = assistant.name;
  if (typeof name !== "string" || !name.trim()) {
    throw new Error(`Profile ${row.id} preferences.assistant.name must be a non-empty string.`);
  }
  return name.trim();
}

function assertKnownCapabilityPlugins(profileId: string, capabilitySlugs: readonly string[]): void {
  for (const slug of capabilitySlugs) {
    assistantCapabilityForProfileSlug(slug);
  }
  const duplicate = capabilitySlugs.find((slug, index) => capabilitySlugs.indexOf(slug) !== index);
  if (duplicate)
    throw new Error(`Profile ${profileId} has duplicate capability slug ${duplicate}.`);
}

/** Matches `profile_channels_provider_check` in control-plane migrations. */
const ALLOWED_GENERATED_CHANNEL_PROVIDERS = new Set([
  "telegram",
  "webchat",
  "e2e-test",
  "imessage",
]);

function assertProfileTopology(profile: RuntimeProfileConfig): void {
  if (profile.status !== "active") throw new Error(`Profile ${profile.id} is not active.`);
  assertKnownCapabilityPlugins(profile.id, profile.capabilitySlugs);

  if (profile.assistants.length !== 1)
    throw new Error(
      `Profile ${profile.id} must have exactly one assistant; found ${profile.assistants.length}.`,
    );
  if (profile.assistants[0].assistantId !== profile.id) {
    throw new Error(
      `Profile ${profile.id} assistant id must be ${profile.id}; got ${profile.assistants[0].assistantId}.`,
    );
  }

  for (const channel of profile.channels) {
    if (!ALLOWED_GENERATED_CHANNEL_PROVIDERS.has(channel.provider)) {
      throw new Error(
        `Profile ${profile.id} has unsupported generated channel provider ${channel.provider}.`,
      );
    }
  }
}

export async function loadRuntimeProfileConfigsFromDb(
  db: SupabaseServiceClient,
  profile: RuntimeProfile,
): Promise<RuntimeProfileConfig[]> {
  const clientSources = await loadClientRuntimeSources();
  const runtimeByProfileId = new Map(
    clientSources
      .filter(({ runtime }) => runtime.runtimeProfiles.includes(profile))
      .map(({ runtime }) => [runtime.profileId, runtime]),
  );
  if (!runtimeByProfileId.size) {
    throw new Error(`No client runtime configs target runtime profile ${profile}.`);
  }

  const profilesResult = await db.from("profiles").select().eq("status", "active").order("id");
  const activeProfiles = requireSupabaseRows(
    "Load active runtime profiles",
    profilesResult.data,
    profilesResult.error,
  );
  const profiles = activeProfiles.filter((row) => runtimeByProfileId.has(row.id));
  if (!profiles.length) {
    throw new Error(
      `No active DB profiles match client runtime configs for runtime profile ${profile}. Run npm run clients -- seed-missing --profile=${profile} or activate a matching profile.`,
    );
  }
  const defaultProfileIds = profiles
    .filter((row) => runtimeByProfileId.get(row.id)?.defaultAssistant)
    .map((row) => row.id);
  if (defaultProfileIds.length !== 1) {
    throw new Error(
      `Runtime profile ${profile} must have exactly one active client runtime defaultAssistant; found ${defaultProfileIds.length}: ${defaultProfileIds.join(", ") || "<none>"}.`,
    );
  }

  const profileIds = profiles.map((row) => row.id);
  const [assistantsResult, capabilitiesResult, channelsResult] = await Promise.all([
    db.from("assistants").select().in("profile_id", profileIds).order("assistant_id"),
    db
      .from("profile_capabilities")
      .select()
      .in("profile_id", profileIds)
      .eq("status", "enabled")
      .order("capability_slug"),
    db
      .from("profile_channels")
      .select()
      .in("profile_id", profileIds)
      .eq("status", "active")
      .order("provider"),
  ]);

  const assistants = requireSupabaseRows(
    "Load runtime profile assistants",
    assistantsResult.data,
    assistantsResult.error,
  );
  const capabilities = requireSupabaseRows(
    "Load runtime profile capabilities",
    capabilitiesResult.data,
    capabilitiesResult.error,
  );
  const channels = requireSupabaseRows(
    "Load runtime profile channels",
    channelsResult.data,
    channelsResult.error,
  );
  const excludeImessageChannels = isProductionLikeProfile(profile);
  const includeE2eTestChannels = Boolean(process.env.AI_ASSISTANTS_E2E_RUN_ID?.trim());
  const out = profiles.map((profile) => {
    const runtime = runtimeByProfileId.get(profile.id);
    if (!runtime) throw new Error(`Runtime source missing for profile ${profile.id}.`);
    const config: RuntimeProfileConfig = {
      id: profile.id,
      displayName: profile.display_name,
      assistantName: assistantNameFromPreferences(profile),
      timezone: profile.timezone,
      status: profile.status,
      defaultAssistant: runtime.defaultAssistant,
      assistants: assistants
        .filter((assistant) => assistant.profile_id === profile.id)
        .map((assistant) => ({
          assistantId: assistant.assistant_id,
        })),
      capabilitySlugs: capabilities
        .filter((capability) => capability.profile_id === profile.id)
        .map((capability) => capability.capability_slug),
      channels: channels
        .filter((channel) => channel.profile_id === profile.id)
        .filter((channel) => !(excludeImessageChannels && channel.provider === "imessage"))
        .filter((channel) => includeE2eTestChannels || channel.provider !== "e2e-test")
        .map((channel) => ({
          provider: channel.provider,
          externalIdentity: channel.external_identity,
          accountId: channelAccountId(channel),
        })),
    };
    assertProfileTopology(config);
    return config;
  });

  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadRuntimeProfileConfigs(
  profile: RuntimeProfile,
): Promise<RuntimeProfileConfig[]> {
  return await loadRuntimeProfileConfigsFromDb(
    createSupabaseServiceClient(supabaseConfigFromProfile(profile)),
    profile,
  );
}
