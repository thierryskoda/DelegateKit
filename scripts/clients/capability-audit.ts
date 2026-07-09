#!/usr/bin/env tsx

import { createSupabaseServiceClient, requireSupabaseRows } from "@ai-assistants/control-db";
import {
  capabilityActivationPolicyForSlug,
  profileCapabilitySpec,
} from "@ai-assistants/capability-catalog";
import { assistantCapabilityForProfileSlug } from "@ai-assistants/assistant-capability-surface";
import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { profileContextCapabilitySlugsForAudit } from "../../apps/backend/src/ops-support/capability-audit";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";
import { isCapabilityOnlyProvider } from "@ai-assistants/connected-accounts";
import {
  loadClientRuntimeSources,
  loadClientSeed,
  type ClientRuntimeSource,
  type ClientSeedSource,
} from "./source";

type CapabilityAuditArgs = {
  profile: RuntimeProfile;
  clientId: string | null;
  json: boolean;
};

type ClientAudit = {
  clientId: string;
  runtimeProfile: RuntimeProfile;
  seedPath: string | null;
  enabledProfileCapabilities: string[];
  contextCapabilitySlugs: string[];
  enabledCapabilityLinks: { slug: string; provider: string; readiness: string | null }[];
  warnings: string[];
  failures: string[];
};

type CapabilityLinkAuditRow = {
  id: string;
  capability_slug: string;
  provider: string;
  status: string;
  readiness_status: string | null;
  readiness_last_error: string | null;
  connected_provider_account_id: string | null;
  config: unknown;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run clients -- capability-audit --profile=dev",
    "  npm run clients -- capability-audit --profile=prod",
    "  npm run clients -- capability-audit --profile=prod --client=testing",
    "",
    "Read-only audit for live client capability state.",
    "Checks source seed drift, catalog/plugin wiring, profile_context_get visibility, and required account-link readiness.",
    "",
    "Options:",
    "  --profile=dev|e2e|prod   Supabase/runtime profile to inspect (default: dev).",
    "  --client=<profile-id>    Limit audit to one runtime client.",
    "  --json                   Print machine-readable JSON.",
  ].join("\n");
}

const auditCliSchema = z
  .object({
    help: z.boolean().optional(),
    profile: z.string().optional(),
    client: z.string().optional(),
    json: z.boolean().optional(),
  })
  .transform((raw) => {
    const profile = raw.profile?.trim() || "dev";
    assertRuntimeProfile(profile);
    return {
      help: raw.help ?? false,
      profile,
      clientId: raw.client?.trim() || null,
      json: raw.json ?? false,
    };
  });

function parseArgs(argv: readonly string[]): CapabilityAuditArgs {
  const parsed = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      client: { type: "string" },
      json: { type: "boolean" },
    },
    schema: auditCliSchema,
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  return parsed;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = sortedUnique(left);
  const b = sortedUnique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function setDiff(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return sortedUnique(left.filter((value) => !rightSet.has(value)));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function twilioMessagingRouteNumber(link: CapabilityLinkAuditRow): string {
  const config = record(link.config);
  const messaging = record(config.messaging);
  return stringField(messaging, "fromNumber") ?? "<backend TWILIO_FROM_NUMBER>";
}

function credentialModeForPair(pair: string): "backend_secret" | "oauth" | "none" | "unknown" {
  const [slug] = pair.split(":");
  if (!slug) return "unknown";
  return capabilityActivationPolicyForSlug(slug)?.credentialMode ?? "unknown";
}

function formatMissingPairs(pairs: readonly string[]): string[] {
  const backendSecret = pairs.filter((pair) => credentialModeForPair(pair) === "backend_secret");
  const oauth = pairs.filter((pair) => credentialModeForPair(pair) === "oauth");
  const other = pairs.filter((pair) => !backendSecret.includes(pair) && !oauth.includes(pair));
  return [
    ...(backendSecret.length
      ? [`Missing managed backend-secret capability links: ${backendSecret.join(", ")}.`]
      : []),
    ...(oauth.length ? [`Missing OAuth capability account links: ${oauth.join(", ")}.`] : []),
    ...(other.length ? [`Missing capability account links: ${other.join(", ")}.`] : []),
  ];
}

async function loadSeedSource(source: ClientRuntimeSource): Promise<ClientSeedSource | null> {
  if (!source.seedPath) return null;
  const seed = await loadClientSeed(source.seedPath);
  return { ...source, seedPath: source.seedPath, seed };
}

function expectedSeedCapabilitySlugs(seedSource: ClientSeedSource | null): string[] | null {
  if (!seedSource) return null;
  return sortedUnique(
    seedSource.seed.initialCapabilities
      .filter((capability) => (capability.status ?? "enabled") === "enabled")
      .map((capability) => capability.slug),
  );
}

function requiredSeedAccountLinkProviderPairs(seedSource: ClientSeedSource): string[] {
  const pairs: string[] = [];
  for (const capability of seedSource.seed.initialCapabilities) {
    if ((capability.status ?? "enabled") !== "enabled") continue;
    const spec = profileCapabilitySpec(capability.slug);
    const policy = capabilityActivationPolicyForSlug(capability.slug);
    if (!spec || !policy) continue;
    const provider = capability.provider ?? spec.defaultProvider;
    if (policy.credentialMode === "none") continue;
    if (isCapabilityOnlyProvider(provider)) continue;
    pairs.push(`${capability.slug}:${provider}`);
  }
  return sortedUnique(pairs);
}

function requiredDefaultAccountLinkProviderPairs(slugs: readonly string[]): string[] {
  const pairs: string[] = [];
  for (const slug of slugs) {
    const spec = profileCapabilitySpec(slug);
    const policy = capabilityActivationPolicyForSlug(slug);
    if (!spec || !policy) continue;
    if (policy.credentialMode === "none") continue;
    if (isCapabilityOnlyProvider(spec.defaultProvider)) continue;
    pairs.push(`${slug}:${spec.defaultProvider}`);
  }
  return sortedUnique(pairs);
}

async function auditClient(input: {
  db: ReturnType<typeof createSupabaseServiceClient>;
  runtimeProfile: RuntimeProfile;
  source: ClientRuntimeSource;
}): Promise<ClientAudit> {
  const seedSource = await loadSeedSource(input.source);
  const expectedSeedSlugs = expectedSeedCapabilitySlugs(seedSource);
  const [profileCapabilitiesResult, linksResult] = await Promise.all([
    input.db
      .from("profile_capabilities")
      .select("id,capability_slug,status")
      .eq("profile_id", input.source.clientId)
      .eq("status", "enabled")
      .order("capability_slug"),
    input.db
      .from("capability_account_links")
      .select(
        "id,capability_slug,provider,status,readiness_status,readiness_last_error,connected_provider_account_id,config",
      )
      .eq("profile_id", input.source.clientId)
      .eq("status", "enabled")
      .order("capability_slug")
      .order("provider"),
  ]);
  const profileCapabilities = requireSupabaseRows(
    `Audit ${input.source.clientId} profile_capabilities`,
    profileCapabilitiesResult.data,
    profileCapabilitiesResult.error,
  );
  const links = requireSupabaseRows(
    `Audit ${input.source.clientId} capability_account_links`,
    linksResult.data,
    linksResult.error,
  ) as CapabilityLinkAuditRow[];
  const contextCapabilitySlugs = sortedUnique(
    await profileContextCapabilitySlugsForAudit(input.db, input.source.clientId),
  );
  const enabledProfileCapabilities = sortedUnique(
    profileCapabilities.map((row) => row.capability_slug),
  );
  const linkPairs = sortedUnique(links.map((link) => `${link.capability_slug}:${link.provider}`));
  const failures: string[] = [];
  const warnings: string[] = [];

  for (const slug of enabledProfileCapabilities) {
    if (!profileCapabilitySpec(slug)) failures.push(`Unknown capability slug ${slug}.`);
    if (!capabilityActivationPolicyForSlug(slug))
      failures.push(`Missing activation policy for capability ${slug}.`);
    try {
      assistantCapabilityForProfileSlug(slug);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`Capability ${slug} has no local plugin mapping: ${message}`);
    }
  }

  if (expectedSeedSlugs) {
    if (!sameSet(enabledProfileCapabilities, expectedSeedSlugs)) {
      const missing = setDiff(expectedSeedSlugs, enabledProfileCapabilities);
      const extra = setDiff(enabledProfileCapabilities, expectedSeedSlugs);
      if (missing.length) failures.push(`Missing seed-backed capabilities: ${missing.join(", ")}.`);
      if (extra.length) failures.push(`Extra capabilities not in seed: ${extra.join(", ")}.`);
    }
  } else {
    warnings.push("No seed.ts baseline; audited live DB/runtime state only.");
  }

  const missingFromContext = setDiff(enabledProfileCapabilities, contextCapabilitySlugs);
  if (missingFromContext.length) {
    failures.push(`profile_context_get projection omits: ${missingFromContext.join(", ")}.`);
  }

  const requiredPairs = seedSource
    ? requiredSeedAccountLinkProviderPairs(seedSource)
    : requiredDefaultAccountLinkProviderPairs(enabledProfileCapabilities);
  const missingPairs = setDiff(requiredPairs, linkPairs);
  if (missingPairs.length) {
    failures.push(...formatMissingPairs(missingPairs));
  }
  for (const link of links) {
    const policy = capabilityActivationPolicyForSlug(link.capability_slug);
    if (policy?.credentialMode === "backend_secret" && !link.connected_provider_account_id) {
      failures.push(
        `${link.capability_slug}:${link.provider} managed backend-secret link is not bound to a connected provider account.`,
      );
    }
    if (link.readiness_status !== "ready") {
      failures.push(
        `${link.capability_slug}:${link.provider} readiness is ${link.readiness_status ?? "unknown"}${
          link.readiness_last_error ? ` (${link.readiness_last_error})` : ""
        }.`,
      );
    }
  }
  const twilioMessagingLinks = links.filter(
    (link) =>
      link.capability_slug === "phone" &&
      link.provider === "twilio-messaging" &&
      link.status === "enabled",
  );
  const twilioRoutes = new Map<string, string[]>();
  for (const link of twilioMessagingLinks) {
    const number = twilioMessagingRouteNumber(link);
    const ids = twilioRoutes.get(number) ?? [];
    ids.push(link.id);
    twilioRoutes.set(number, ids);
  }
  for (const [number, ids] of twilioRoutes) {
    if (ids.length <= 1) continue;
    failures.push(
      `Ambiguous Twilio SMS inbound route for ${number}: ${ids.length} enabled phone:twilio-messaging links match.`,
    );
  }

  return {
    clientId: input.source.clientId,
    runtimeProfile: input.runtimeProfile,
    seedPath: seedSource?.seedPath ?? null,
    enabledProfileCapabilities,
    contextCapabilitySlugs,
    enabledCapabilityLinks: links.map((link) => ({
      slug: link.capability_slug,
      provider: link.provider,
      readiness: link.readiness_status,
    })),
    warnings,
    failures,
  };
}

function printText(audits: readonly ClientAudit[]): void {
  const failureCount = audits.reduce((sum, audit) => sum + audit.failures.length, 0);
  const warningCount = audits.reduce((sum, audit) => sum + audit.warnings.length, 0);
  for (const audit of audits) {
    const status = audit.failures.length ? "FAIL" : "OK";
    console.log(`${status} ${audit.clientId} (${audit.runtimeProfile})`);
    console.log(`  capabilities: ${audit.enabledProfileCapabilities.join(", ") || "<none>"}`);
    if (audit.warnings.length) {
      for (const warning of audit.warnings) console.log(`  warning: ${warning}`);
    }
    if (audit.failures.length) {
      for (const failure of audit.failures) console.log(`  failure: ${failure}`);
    }
  }
  console.log(
    `Capability audit complete: ${audits.length} client(s), ${failureCount} failure(s), ${warningCount} warning(s).`,
  );
}

export async function runClientCapabilityAuditCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const runtimeSources = (await loadClientRuntimeSources()).filter((source) =>
    source.runtime.runtimeProfiles.includes(args.profile),
  );
  const selectedSources = args.clientId
    ? runtimeSources.filter((source) => source.clientId === args.clientId)
    : runtimeSources;
  if (args.clientId && selectedSources.length === 0) {
    throw new Error(`No client runtime source ${args.clientId} targets profile ${args.profile}.`);
  }
  if (selectedSources.length === 0) {
    throw new Error(`No client runtime sources target profile ${args.profile}.`);
  }

  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));
  const audits = [];
  for (const source of selectedSources) {
    audits.push(await auditClient({ db, runtimeProfile: args.profile, source }));
  }
  if (args.json) {
    console.log(JSON.stringify({ audits }, null, 2));
  } else {
    printText(audits);
  }
  const failures = audits.flatMap((audit) =>
    audit.failures.map((failure) => `${audit.clientId}: ${failure}`),
  );
  if (failures.length) {
    throw new Error(
      `Capability audit failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}`,
    );
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file://").href) {
  void runCliMain(() => runClientCapabilityAuditCli());
}
