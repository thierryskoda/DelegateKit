#!/usr/bin/env tsx
import { pathToFileURL } from "node:url";
import { createSupabaseServiceClient, requireSupabaseRows } from "@ai-assistants/control-db";
import { type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";
import { envForProfile } from "../profiles/profile";
import {
  installBackendRuntimeEnvForProfile,
  mergeResolvedProfileEnvIntoProcess,
} from "./bind-profile-nango";

const E2E_HOST = "e2e-assistant.example.com";
const DEV_OR_PROD_HOST_PATTERNS = [/dev-assistant/i, /prod-assistant/i];
const URL_STATE_KEYS = ["webhookUrl", "webhook_url", "url", "watchAddress", "notificationUrl"] as const;

type WebhookSubscriptionAuditRow = {
  id: string;
  profileId: string;
  provider: string;
  adapter: string;
  resourceType: string;
  resourceId: string;
  externalSubscriptionId: string | null;
  callbackUrls: readonly string[];
  flags: readonly string[];
};

const argsSchema = z.object({
  action: z.enum(["audit"]),
  profile: z.enum(["dev", "e2e", "prod"]),
});

function usage(): string {
  return [
    "Usage:",
    "  npm run integrations -- webhook-subscriptions audit --profile=e2e",
    "  npm run integrations -- webhook-subscriptions audit --profile=prod",
    "",
    "Reports provider webhook subscription callback URL evidence from provider_state.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): z.infer<typeof argsSchema> {
  return parseCli(argv, {
    options: { profile: { type: "string" } },
    allowPositionals: true,
    transform: ({ values, positionals }) => {
      if (positionals.length !== 1) {
        throw new Error(`Expected webhook-subscriptions subcommand audit.\n\n${usage()}`);
      }
      return { ...values, action: positionals[0] };
    },
    schema: argsSchema,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractCallbackUrls(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const urls: string[] = [];
  for (const key of URL_STATE_KEYS) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) urls.push(candidate.trim());
  }
  return [...new Set(urls)].sort();
}

function hostForUrl(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isDevOrProdUrl(value: string): boolean {
  const host = hostForUrl(value);
  return host ? DEV_OR_PROD_HOST_PATTERNS.some((pattern) => pattern.test(host)) : false;
}

function isE2eUrl(value: string): boolean {
  return hostForUrl(value) === E2E_HOST;
}

function flagsForRow(profile: RuntimeProfile, row: WebhookSubscriptionAuditRow): string[] {
  const flags: string[] = [];
  if (profile === "e2e" && row.profileId === "testing") {
    for (const url of row.callbackUrls) {
      if (isDevOrProdUrl(url)) flags.push(`testing-e2e-callback-points-at-dev-or-prod:${url}`);
    }
  }
  if (profile === "prod") {
    const resourceEvidence = [
      row.profileId,
      row.resourceId,
      row.externalSubscriptionId ?? "",
      ...row.callbackUrls,
    ].join(" ");
    if (/\be2e\b|e2e-assistant|testing/i.test(resourceEvidence)) {
      flags.push("prod-subscription-references-e2e-or-testing-resource");
    }
    for (const url of row.callbackUrls) {
      if (isE2eUrl(url)) flags.push(`prod-callback-points-at-e2e:${url}`);
    }
  }
  return flags;
}

export async function runWebhookSubscriptionsAudit(argv = process.argv.slice(2)): Promise<void> {
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(usage());
    return;
  }

  const args = parseArgs(argv);
  mergeResolvedProfileEnvIntoProcess(envForProfile(args.profile));
  installBackendRuntimeEnvForProfile(args.profile);
  const db = createSupabaseServiceClient(supabaseConfigFromProfile(args.profile));
  const result = await db
    .from("provider_webhook_subscriptions")
    .select("id,profile_id,provider_key,adapter_key,resource_type,resource_id,external_subscription_id,provider_state")
    .order("profile_id")
    .order("provider_key")
    .order("resource_type");
  const rows = requireSupabaseRows(
    "Audit provider webhook subscriptions",
    result.data,
    result.error,
  );

  const subscriptions = rows.map((row): WebhookSubscriptionAuditRow => {
    const base = {
      id: row.id,
      profileId: row.profile_id,
      provider: row.provider_key,
      adapter: row.adapter_key,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      externalSubscriptionId: row.external_subscription_id,
      callbackUrls: extractCallbackUrls(row.provider_state),
      flags: [],
    } satisfies WebhookSubscriptionAuditRow;
    return { ...base, flags: flagsForRow(args.profile, base) };
  });

  const flagged = subscriptions.filter((row) => row.flags.length > 0);
  console.log(
    JSON.stringify(
      {
        ok: flagged.length === 0,
        profile: args.profile,
        subscriptions,
        flagged,
      },
      null,
      2,
    ),
  );
  if (flagged.length > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runWebhookSubscriptionsAudit());
}
