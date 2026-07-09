#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { parseCliCommand, runCliMain } from "@ai-assistants/workspace-shared";

type ClientsCommand =
  | "capability-audit"
  | "capability-repair-managed"
  | "cleanup-stale-monday-config"
  | "guidance-backfill"
  | "seed"
  | "seed-missing"
  | "schema"
  | "snapshot"
  | "snapshot-summary"
  | "validate";

const commands = [
  "capability-audit",
  "capability-repair-managed",
  "cleanup-stale-monday-config",
  "guidance-backfill",
  "seed",
  "seed-missing",
  "schema",
  "snapshot",
  "snapshot-summary",
  "validate",
] as const;

function usage(): string {
  return [
    "Usage:",
    "  npm run clients -- capability-audit [--profile=dev|e2e|prod] [--client=<profile-id>] [--json]",
    "  npm run clients -- capability-repair-managed [--profile=dev|e2e|prod] --client=<profile-id> [--apply]",
    "  npm run clients -- seed clients/acme/seed.ts [--profile=dev|e2e|prod]",
    "  npm run clients -- seed-missing [--profile=dev|e2e|prod] [--no-build]",
    "  npm run clients -- guidance-backfill [--profile=dev|e2e|prod] [--client=<profile-id>] [--apply]",
    "  npm run clients -- cleanup-stale-monday-config --profile=prod [--apply]",
    "  npm run clients -- snapshot [--profile=dev|e2e|prod] [--client=<profile-id>]",
    "  npm run clients -- snapshot-summary [--client=<profile-id>] [--in-file=<path>] [--out-file=<path>|--out-dir=<path>]",
    "  npm run clients -- schema",
    "  npm run clients -- validate",
  ].join("\n");
}

function parseCommand(argv: readonly string[]): {
  command: ClientsCommand | "help";
  args: string[];
} {
  const parsed = parseCliCommand(argv, { commands, usage });
  if (parsed.command === "help") {
    console.log(usage());
    return { command: "validate", args: ["--help"] };
  }
  return parsed;
}

export async function runClientsCli(argv = process.argv.slice(2)): Promise<void> {
  const { command, args } = parseCommand(argv);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return;
  }
  if (command === "seed") {
    const { runClientSeedCli } = await import(new URL("./seed-profile.ts", import.meta.url).href);
    await runClientSeedCli(args);
    return;
  }
  if (command === "capability-audit") {
    const { runClientCapabilityAuditCli } = await import(
      new URL("./capability-audit.ts", import.meta.url).href
    );
    await runClientCapabilityAuditCli(args);
    return;
  }
  if (command === "capability-repair-managed") {
    const { runClientCapabilityRepairManagedCli } = await import(
      new URL("./capability-repair-managed.ts", import.meta.url).href
    );
    await runClientCapabilityRepairManagedCli(args);
    return;
  }
  if (command === "seed-missing") {
    const { runClientSeedMissingCli } = await import(
      new URL("./seed-missing-cli.ts", import.meta.url).href
    );
    await runClientSeedMissingCli(args);
    return;
  }
  if (command === "schema") {
    const { runClientSchemaCli } = await import(
      new URL("./generate-json-schema.ts", import.meta.url).href
    );
    await runClientSchemaCli();
    return;
  }
  if (command === "snapshot") {
    const { runClientSnapshotCli } = await import(new URL("./snapshot.ts", import.meta.url).href);
    await runClientSnapshotCli(args);
    return;
  }
  if (command === "snapshot-summary") {
    const { runClientSnapshotSummaryCli } = await import(
      new URL("./snapshot-summary.ts", import.meta.url).href
    );
    await runClientSnapshotSummaryCli(args);
    return;
  }
  if (command === "guidance-backfill") {
    const { runProfileGuidanceBackfillCli } = await import(
      new URL("./backfill-profile-guidance.ts", import.meta.url).href
    );
    await runProfileGuidanceBackfillCli(args);
    return;
  }
  if (command === "cleanup-stale-monday-config") {
    const { runClientCleanupStaleMondayConfigCli } = await import(
      new URL("./cleanup-stale-monday-config.ts", import.meta.url).href
    );
    await runClientCleanupStaleMondayConfigCli(args);
    return;
  }
  const { runClientValidateCli } = await import(
    new URL("./validate-clients.ts", import.meta.url).href
  );
  await runClientValidateCli(args);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runClientsCli());
}
