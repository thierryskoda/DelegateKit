#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { parseCliCommand, runCliMain } from "@ai-assistants/workspace-shared";

type GuardCommand =
  | "source"
  | "knip"
  | "semantic"
  | "runtime"
  | "supabase-control-db"
  | "e2e-harness";

const commands = [
  "source",
  "knip",
  "semantic",
  "runtime",
  "supabase-control-db",
  "e2e-harness",
] as const;

function usage(): string {
  return [
    "Usage:",
    "  npm run guard -- source",
    "  npm run guard -- knip [--profile=dev|e2e|prod]",
    "  npm run guard -- semantic all|fast|backend-prompt|plugin-boundaries|profile-learning-review-integration|profile-learning-reviewers|tool-contract-descriptions|runtime-guidance|prompt-health",
    "  npm run guard -- runtime [--profile=dev|e2e] [--keep-runtime-root]",
    "  npm run guard -- supabase-control-db [--profile=dev|e2e] [--skip-up] [--skip-types]",
    "  npm run guard -- e2e-harness",
  ].join("\n");
}

export async function runGuardCli(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseCliCommand<GuardCommand>(argv, { commands, usage });
  if (parsed.command === "help") {
    console.log(usage());
    return;
  }

  if (parsed.command === "source") {
    const { runSourceGuardCli } = await import("./run-source-guards");
    await runSourceGuardCli(parsed.args);
    return;
  }
  if (parsed.command === "knip") {
    const { runKnipGuardCli } = await import("./run-knip-guard");
    await runKnipGuardCli(parsed.args);
    return;
  }
  if (parsed.command === "semantic") {
    const { runSemanticGuardCli } = await import("./semantic");
    await runSemanticGuardCli(parsed.args);
    return;
  }
  if (parsed.command === "runtime") {
    const { runRuntimeGuardCli } = await import("./run-runtime-guards");
    await runRuntimeGuardCli(parsed.args);
    return;
  }
  if (parsed.command === "e2e-harness") {
    const { runE2eHarnessGuardCli } = await import("./run-e2e-harness-guard");
    await runE2eHarnessGuardCli(parsed.args);
    return;
  }

  const { runSupabaseControlDbGuardCli } = await import("./supabase-local-control-db");
  await runSupabaseControlDbGuardCli(parsed.args);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runGuardCli());
}
