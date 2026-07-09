#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { repoRoot } from "@ai-assistants/repo-layout";
import { parseCliCommand, runCliMain } from "@ai-assistants/workspace-shared";
import { runNangoProfileBind } from "./bind-profile-nango";
import { runNangoProvisioningApply } from "./nango-provisioning-apply";
import { runNangoProvisioningDiff } from "./nango-provisioning-diff-cli";
import { runNangoProvisioningValidate } from "./nango-provisioning-validate";
import { runNangoOAuthProjectionBackfill } from "./nango-oauth-projection-backfill";
import { runNangoSync } from "./nango-sync";
import { runTestingDataCli } from "./testing-data/run-testing-data";
import { runTwilioCli } from "./twilio";
import { runWebhookSubscriptionsAudit } from "./webhook-subscriptions-audit";
import { runBoldSignDocumentOwnershipCli } from "./boldsign-document-ownership";
import { writeNangoOAuthProjectionBaseline } from "../repo-tooling/guards/deterministic/nango-oauth-projection-baseline";

type IntegrationProvider =
  | "boldsign-documents"
  | "nango"
  | "testing-data"
  | "twilio"
  | "webhook-subscriptions";
type NangoCommand =
  | "validate"
  | "diff"
  | "apply"
  | "bind"
  | "sync"
  | "oauth-projection"
  | "oauth-baseline";

const providers = [
  "boldsign-documents",
  "nango",
  "testing-data",
  "twilio",
  "webhook-subscriptions",
] as const;
const nangoCommands = [
  "validate",
  "diff",
  "apply",
  "bind",
  "sync",
  "oauth-projection",
  "oauth-baseline",
] as const;

function usage(): string {
  return [
    "Usage:",
    "  npm run integrations -- nango validate",
    "  npm run integrations -- nango diff --profile=dev [--format=json]",
    "  npm run integrations -- nango diff --profile=e2e [--format=json]",
    "  npm run integrations -- nango apply --profile=dev",
    "  npm run integrations -- nango apply --profile=e2e",
    "  npm run integrations -- nango bind check --profile=dev [--verify-nango]",
    "  npm run integrations -- nango bind apply --profile=e2e --mapping=scripts/integrations/testing-nango-bindings-e2e.local.json",
    "  npm run integrations -- nango bind prune-stale --profile=dev",
    "  npm run integrations -- nango oauth-projection check --profile=prod --profile-id=<profile-id>",
    "  npm run integrations -- nango oauth-projection check --profile=prod --all-profiles --provider-config-key=ai-assistants-outlook",
    "  npm run integrations -- nango oauth-projection apply --profile=prod --profile-id=<profile-id> --confirm-prod",
    "  npm run integrations -- nango oauth-baseline update",
    "  npm run integrations -- nango sync audit --profile=dev",
    "  npm run integrations -- nango sync apply --profile=e2e",
    "  npm run integrations -- nango sync audit --profile=prod",
    "  npm run integrations -- nango sync apply --profile=prod --confirm-prod",
    "  npm run integrations -- boldsign-documents audit --profile=dev [--profile-id=testing] [--query=text] [--limit=25]",
    "  npm run integrations -- boldsign-documents assign --profile=dev --profile-id=testing --document-id=<boldsign-id> --confirm-assign",
    "  npm run integrations -- twilio status --profile=dev",
    "  npm run integrations -- twilio numbers search --profile=dev --country=US --area-code=415 --voice --limit=5",
    "  npm run integrations -- twilio numbers purchase --profile=dev --phone-number=+15551234567 --voice-url=https://voice.example.com/voice/webhook --yes --write-env",
    "  npm run integrations -- twilio numbers configure --profile=dev --phone-number=+15551234567 --voice-url=https://voice.example.com/voice/webhook --yes",
    "  npm run integrations -- testing-data audit --profile=dev [--judge]",
    "  npm run integrations -- testing-data cleanup --profile=dev --report=tmp/integration-audits/<id>.json",
    "  npm run integrations -- webhook-subscriptions audit --profile=e2e",
    "",
    "nango diff: desired Nango integration config vs remote.",
    "nango oauth-baseline update: refreshes the committed OAuth manifest drift baseline after scoped oauth-projection review/backfill.",
    "nango sync audit|apply: checked-in binding mappings vs Supabase and live Nango inventory.",
  ].join("\n");
}

function parseProvider(argv: readonly string[]): {
  provider: IntegrationProvider | "help";
  args: string[];
} {
  const parsed = parseCliCommand(argv, { commands: providers, usage });
  if (parsed.command === "help") {
    console.log(usage());
  }
  return { provider: parsed.command, args: parsed.args };
}

function parseNangoCommand(argv: readonly string[]): {
  command: NangoCommand | "help";
  args: string[];
} {
  const parsed = parseCliCommand(argv, { commands: nangoCommands, usage });
  if (parsed.command === "help") console.log(usage());
  return parsed;
}

export async function runIntegrationsCli(argv = process.argv.slice(2)): Promise<void> {
  const { provider, args: providerArgs } = parseProvider(argv);
  if (provider === "help") return;

  if (provider === "testing-data") {
    await runTestingDataCli(providerArgs);
    return;
  }
  if (provider === "boldsign-documents") {
    await runBoldSignDocumentOwnershipCli(providerArgs);
    return;
  }
  if (provider === "webhook-subscriptions") {
    await runWebhookSubscriptionsAudit(providerArgs);
    return;
  }
  if (provider === "twilio") {
    await runTwilioCli(providerArgs);
    return;
  }

  const { command, args } = parseNangoCommand(providerArgs);
  if (command === "help") return;

  if (command === "validate") {
    runNangoProvisioningValidate();
    return;
  }
  if (command === "diff") {
    await runNangoProvisioningDiff(args);
    return;
  }
  if (command === "apply") {
    await runNangoProvisioningApply(args);
    return;
  }
  if (command === "sync") {
    await runNangoSync(args);
    return;
  }
  if (command === "oauth-projection") {
    await runNangoOAuthProjectionBackfill(args);
    return;
  }
  if (command === "oauth-baseline") {
    if (args.length !== 1 || args[0] !== "update") {
      throw new Error("Usage: npm run integrations -- nango oauth-baseline update");
    }
    await writeNangoOAuthProjectionBaseline(repoRoot(import.meta.url));
    return;
  }
  await runNangoProfileBind(args);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runIntegrationsCli());
}
