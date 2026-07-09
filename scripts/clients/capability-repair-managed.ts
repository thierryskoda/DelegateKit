#!/usr/bin/env tsx

import {
  createSupabaseServiceClient,
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { profileCapabilitySpec } from "@ai-assistants/capability-catalog";
import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import {
  ensureManagedBackendSecretCapabilityAccount,
  managedBackendSecretProviderBindings,
  type ManagedBackendSecretProviderBindingSpec,
} from "../../apps/backend/src/ops-support/managed-backend-secret-capabilities";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";
import {
  loadClientRuntimeSources,
  loadClientSeed,
  type ClientRuntimeSource,
  type ClientSeedSource,
} from "./source";

type RepairArgs = {
  profile: RuntimeProfile;
  clientId: string;
  apply: boolean;
};

type RepairAction = {
  clientId: string;
  capabilitySlug: string;
  provider: string;
  action: "create_link" | "enable_link" | "bind_managed_account" | "already_ready" | "skipped";
  applied: boolean;
  detail: string;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run clients -- capability-repair-managed --profile=prod --client=testing",
    "  npm run clients -- capability-repair-managed --profile=prod --client=testing --apply",
    "",
    "Repairs managed backend-secret provider links only: BoldSign, Twilio Voice, and Twilio Messaging.",
    "Default mode is read-only dry-run. Use --apply for DB writes.",
  ].join("\n");
}

const argsSchema = z
  .object({
    help: z.boolean().optional(),
    profile: z.string().optional(),
    client: z.string().optional(),
    apply: z.boolean().optional(),
  })
  .transform((raw) => {
    const profile = raw.profile?.trim() || "dev";
    assertRuntimeProfile(profile);
    const clientId = raw.client?.trim();
    if (!clientId) throw new Error("--client=<profile-id> is required.");
    return {
      help: raw.help ?? false,
      profile,
      clientId,
      apply: raw.apply ?? false,
    };
  });

function parseArgs(argv: readonly string[]): RepairArgs {
  const parsed = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      client: { type: "string" },
      apply: { type: "boolean" },
    },
    schema: argsSchema,
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  return parsed;
}

async function loadSeedSource(source: ClientRuntimeSource): Promise<ClientSeedSource | null> {
  if (!source.seedPath) return null;
  const seed = await loadClientSeed(source.seedPath);
  return { ...source, seedPath: source.seedPath, seed };
}

function seedCapabilityForProvider(
  seedSource: ClientSeedSource | null,
  spec: ManagedBackendSecretProviderBindingSpec,
) {
  if (!seedSource) return null;
  const capabilitySpec = profileCapabilitySpec(spec.capabilitySlug);
  if (!capabilitySpec) throw new Error(`Unknown capability slug ${spec.capabilitySlug}.`);
  return (
    seedSource.seed.initialCapabilities.find((capability) => {
      const provider = capability.provider ?? capabilitySpec.defaultProvider;
      return (
        capability.slug === spec.capabilitySlug &&
        provider === spec.provider &&
        (capability.status ?? "enabled") === "enabled"
      );
    }) ?? null
  );
}

async function loadEnabledProfileCapability(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilitySlug: string;
}): Promise<TableRow<"profile_capabilities"> | null> {
  const result = await input.db
    .from("profile_capabilities")
    .select()
    .eq("profile_id", input.profileId)
    .eq("capability_slug", input.capabilitySlug)
    .eq("status", "enabled")
    .limit(2);
  const rows = requireSupabaseRows(
    `Load ${input.profileId} ${input.capabilitySlug} profile capability`,
    result.data,
    result.error,
  );
  if (rows.length > 1) {
    throw new Error(
      `Profile ${input.profileId} has multiple enabled ${input.capabilitySlug} profile capabilities.`,
    );
  }
  return rows[0] ?? null;
}

async function loadCapabilityLink(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilitySlug: string;
  provider: string;
}): Promise<TableRow<"capability_account_links"> | null> {
  const result = await input.db
    .from("capability_account_links")
    .select()
    .eq("profile_id", input.profileId)
    .eq("capability_slug", input.capabilitySlug)
    .eq("provider", input.provider)
    .limit(2);
  const rows = requireSupabaseRows(
    `Load ${input.profileId} ${input.capabilitySlug}:${input.provider} capability link`,
    result.data,
    result.error,
  );
  if (rows.length > 1) {
    throw new Error(
      `Profile ${input.profileId} has multiple ${input.capabilitySlug}:${input.provider} capability account links.`,
    );
  }
  return rows[0] ?? null;
}

async function createOrEnableCapabilityLink(input: {
  db: SupabaseServiceClient;
  profileId: string;
  profileCapability: TableRow<"profile_capabilities">;
  spec: ManagedBackendSecretProviderBindingSpec;
  seedSource: ClientSeedSource | null;
  apply: boolean;
}): Promise<{ link: TableRow<"capability_account_links"> | null; actions: RepairAction[] }> {
  const existing = await loadCapabilityLink({
    db: input.db,
    profileId: input.profileId,
    capabilitySlug: input.spec.capabilitySlug,
    provider: input.spec.provider,
  });
  const actions: RepairAction[] = [];
  if (existing) {
    if (existing.status !== "enabled") {
      actions.push({
        clientId: input.profileId,
        capabilitySlug: input.spec.capabilitySlug,
        provider: input.spec.provider,
        action: "enable_link",
        applied: input.apply,
        detail: `Enable existing capability account link ${existing.id}.`,
      });
      if (!input.apply) return { link: existing, actions };
      const update = await input.db
        .from("capability_account_links")
        .update({ status: "enabled", updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select()
        .single();
      return {
        link: requireSupabaseData(
          `Enable ${input.profileId} ${input.spec.provider} capability link`,
          update.data,
          update.error,
        ),
        actions,
      };
    }
    return { link: existing, actions };
  }

  const capabilitySpec = profileCapabilitySpec(input.spec.capabilitySlug);
  if (!capabilitySpec) throw new Error(`Unknown capability slug ${input.spec.capabilitySlug}.`);
  const seedCapability = seedCapabilityForProvider(input.seedSource, input.spec);
  actions.push({
    clientId: input.profileId,
    capabilitySlug: input.spec.capabilitySlug,
    provider: input.spec.provider,
    action: "create_link",
    applied: input.apply,
    detail: `Create enabled ${input.spec.capabilitySlug}:${input.spec.provider} capability account link.`,
  });
  if (!input.apply) return { link: null, actions };
  const insert = await input.db
    .from("capability_account_links")
    .insert({
      profile_id: input.profileId,
      profile_capability_id: input.profileCapability.id,
      capability_slug: input.spec.capabilitySlug,
      provider: input.spec.provider,
      label: seedCapability?.label ?? capabilitySpec.label,
      status: "enabled",
      required: seedCapability?.required ?? true,
      config: requireJsonObject(seedCapability?.config ?? {}, "managedCapabilityRepair.config"),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  return {
    link: requireSupabaseData(
      `Create ${input.profileId} ${input.spec.provider} capability link`,
      insert.data,
      insert.error,
    ),
    actions,
  };
}

async function repairManagedProvider(input: {
  db: SupabaseServiceClient;
  profileId: string;
  spec: ManagedBackendSecretProviderBindingSpec;
  seedSource: ClientSeedSource | null;
  apply: boolean;
}): Promise<RepairAction[]> {
  const profileCapability = await loadEnabledProfileCapability({
    db: input.db,
    profileId: input.profileId,
    capabilitySlug: input.spec.capabilitySlug,
  });
  if (!profileCapability) {
    return [
      {
        clientId: input.profileId,
        capabilitySlug: input.spec.capabilitySlug,
        provider: input.spec.provider,
        action: "skipped",
        applied: false,
        detail: `Profile capability ${input.spec.capabilitySlug} is not enabled.`,
      },
    ];
  }
  const { link, actions } = await createOrEnableCapabilityLink({
    db: input.db,
    profileId: input.profileId,
    profileCapability,
    spec: input.spec,
    seedSource: input.seedSource,
    apply: input.apply,
  });
  if (!link) return actions;
  if (
    link.connected_provider_account_id &&
    link.readiness_status === "ready" &&
    actions.length === 0
  ) {
    return [
      {
        clientId: input.profileId,
        capabilitySlug: input.spec.capabilitySlug,
        provider: input.spec.provider,
        action: "already_ready",
        applied: false,
        detail: `Capability link ${link.id} is already bound and ready.`,
      },
    ];
  }
  actions.push({
    clientId: input.profileId,
    capabilitySlug: input.spec.capabilitySlug,
    provider: input.spec.provider,
    action: "bind_managed_account",
    applied: input.apply,
    detail: `Bind ${input.spec.provider} link ${link.id} to managed backend-secret account and evaluate readiness.`,
  });
  if (input.apply) {
    await ensureManagedBackendSecretCapabilityAccount(input.db, {
      profileId: input.profileId,
      capabilityAccountLink: link,
      provider: input.spec.provider,
      providerAccountId: input.spec.providerAccountId,
      displayLabel: input.spec.displayLabel,
      managedCredential: input.spec.managedCredential,
      metadata: input.spec.metadata,
    });
  }
  return actions;
}

function printActions(actions: readonly RepairAction[]): void {
  for (const action of actions) {
    const mode = action.applied ? "APPLY" : "DRY";
    console.log(
      `${mode} ${action.clientId} ${action.capabilitySlug}:${action.provider} ${action.action} - ${action.detail}`,
    );
  }
  const applied = actions.filter((action) => action.applied).length;
  const dry = actions.length - applied;
  console.log(`Managed capability repair complete: ${actions.length} action(s), ${applied} applied, ${dry} dry-run.`);
}

export async function runClientCapabilityRepairManagedCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv);
  const runtimeSources = (await loadClientRuntimeSources()).filter((source) =>
    source.runtime.runtimeProfiles.includes(args.profile),
  );
  const source = runtimeSources.find((candidate) => candidate.clientId === args.clientId);
  if (!source) {
    throw new Error(`No client runtime source ${args.clientId} targets profile ${args.profile}.`);
  }
  const seedSource = await loadSeedSource(source);
  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));
  const actions: RepairAction[] = [];
  for (const spec of managedBackendSecretProviderBindings) {
    actions.push(
      ...(await repairManagedProvider({
        db,
        profileId: args.clientId,
        spec,
        seedSource,
        apply: args.apply,
      })),
    );
  }
  printActions(actions);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file://").href) {
  void runCliMain(() => runClientCapabilityRepairManagedCli());
}
