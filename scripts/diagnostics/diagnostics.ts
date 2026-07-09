#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { parseCliCommand, runCliMain } from "@ai-assistants/workspace-shared";

type DiagnosticsCommand =
  | "query"
  | "prune"
  | "profile-learning-review-scout"
  | "helpfulness-flow"
  | "trace-improvement-flow"
  | "client-improvement-lab"
  | "codex-client-improvement-lab"
  | "daily-codex-improvement-review";

const commands = [
  "query",
  "prune",
  "profile-learning-review-scout",
  "helpfulness-flow",
  "trace-improvement-flow",
  "client-improvement-lab",
  "codex-client-improvement-lab",
  "daily-codex-improvement-review",
] as const;

function usage(): string {
  return [
    "Usage:",
    "  npm run diagnostics -- query [--profile dev|--runtime-root /abs/path] [--since 1h] [--format=markdown]",
    "  npm run diagnostics -- prune [--profile dev] [--days 30]",
    "  npm run diagnostics -- profile-learning-review-scout [--profile dev] [--profile-id <id>]",
    "  npm run diagnostics -- helpfulness-flow [--snapshot /abs/path/client-summary.json] [--format=markdown|json]",
    "  npm run diagnostics -- trace-improvement-flow [--snapshot /abs/path/client-summary.json] [--format=markdown|json]",
    "  npm run diagnostics -- client-improvement-lab --snapshot /abs/path/client-summary.json [--dry-run] [--format=markdown|json]",
    "  npm run diagnostics -- codex-client-improvement-lab --snapshot /abs/path/client-summary.json [--dry-run] [--format=markdown|json]",
    "  npm run diagnostics -- daily-codex-improvement-review [--dry-run] [--format=markdown|json]",
  ].join("\n");
}

function parseCommand(argv: readonly string[]): { command: DiagnosticsCommand; args: string[] } {
  const parsed = parseCliCommand(argv, { commands, usage });
  if (parsed.command === "help") {
    console.log(usage());
    return { command: "prune", args: ["--help"] };
  }
  return { command: parsed.command, args: parsed.args };
}

export async function runDiagnosticsCli(argv = process.argv.slice(2)): Promise<void> {
  const { command, args } = parseCommand(argv);
  if (command === "query") {
    const { runDiagnosticsQuery } = await import("./query");
    await runDiagnosticsQuery(args);
    return;
  }
  if (command === "profile-learning-review-scout") {
    const { runProfileLearningReviewScoutCli } = await import("./profile-learning-review-scout");
    await runProfileLearningReviewScoutCli(args);
    return;
  }
  if (command === "helpfulness-flow") {
    const { runHelpfulnessFlowCli } = await import("./helpfulness-flow");
    await runHelpfulnessFlowCli(args);
    return;
  }
  if (command === "trace-improvement-flow") {
    const { runTraceImprovementFlowCli } = await import("./trace-improvement-flow");
    await runTraceImprovementFlowCli(args);
    return;
  }
  if (command === "client-improvement-lab") {
    const { runClientImprovementLabCli } = await import("./client-improvement-lab");
    await runClientImprovementLabCli(args);
    return;
  }
  if (command === "codex-client-improvement-lab") {
    const { runCodexClientImprovementLabCli } = await import("./codex-client-improvement-lab");
    await runCodexClientImprovementLabCli(args);
    return;
  }
  if (command === "daily-codex-improvement-review") {
    const { runDailyCodexImprovementReviewCli } = await import("./daily-codex-improvement-review");
    await runDailyCodexImprovementReviewCli(args);
    return;
  }
  const { runDiagnosticsPrune } = await import("./prune");
  await runDiagnosticsPrune(args);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runDiagnosticsCli());
}
