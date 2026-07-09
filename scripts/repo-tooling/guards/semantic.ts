#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";

type SemanticCommand =
  | "all"
  | "fast"
  | "backend-prompt"
  | "plugin-boundaries"
  | "profile-learning-review-integration"
  | "profile-learning-reviewers"
  | "tool-contract-descriptions"
  | "runtime-guidance"
  | "prompt-health";

const commands = [
  "all",
  "fast",
  "backend-prompt",
  "plugin-boundaries",
  "profile-learning-review-integration",
  "profile-learning-reviewers",
  "tool-contract-descriptions",
  "runtime-guidance",
  "prompt-health",
] as const;

function usage(): string {
  return [
    "Usage:",
    "  npm run guard -- semantic all [--profile dev]",
    "  npm run guard -- semantic fast [--profile dev]",
    "  npm run guard -- semantic backend-prompt [--profile dev] [--client <id>] [--list]",
    "  npm run guard -- semantic plugin-boundaries [--profile dev] [--list]",
    "  npm run guard -- semantic profile-learning-review-integration [--profile dev] [--list]",
    "  npm run guard -- semantic profile-learning-reviewers [--profile dev] [--list]",
    "  npm run guard -- semantic tool-contract-descriptions [--profile dev] [--list]",
    "  npm run guard -- semantic runtime-guidance [--profile dev] [--list]",
    "  npm run guard -- semantic prompt-health [--profile dev] --judge <id>",
  ].join("\n");
}

function parseCommand(argv: readonly string[]): { command: SemanticCommand; args: string[] } {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    process.exit(0);
  }
  if (!commands.includes(command as SemanticCommand)) {
    throw new Error(`Unknown semantic guard command ${JSON.stringify(command)}.\n\n${usage()}`);
  }
  return { command: command as SemanticCommand, args };
}

export async function runSemanticGuardCli(argv = process.argv.slice(2)): Promise<void> {
  const { command, args } = parseCommand(argv);
  if (command === "all" || command === "fast") {
    const { runSemanticAllCli } = await import("./semantic/run-all");
    await runSemanticAllCli(args);
    return;
  }
  if (command === "plugin-boundaries") {
    const { runPluginBoundariesJudgeCli } = await import("./semantic/plugin-boundaries");
    await runPluginBoundariesJudgeCli(args);
    return;
  }
  if (command === "backend-prompt") {
    const { runBackendAssistantPromptJudgeCli } =
      await import("./semantic/backend-assistant-prompt");
    await runBackendAssistantPromptJudgeCli(args);
    return;
  }
  if (command === "profile-learning-reviewers") {
    const { runProfileLearningReviewersJudgeCli } =
      await import("./semantic/profile-learning-reviewers");
    await runProfileLearningReviewersJudgeCli(args);
    return;
  }
  if (command === "profile-learning-review-integration") {
    const { runProfileLearningReviewIntegrationJudgeCli } =
      await import("./semantic/profile-learning-review-integration");
    await runProfileLearningReviewIntegrationJudgeCli(args);
    return;
  }
  if (command === "tool-contract-descriptions") {
    const { runToolContractDescriptionsJudgeCli } =
      await import("./semantic/tool-contract-descriptions");
    await runToolContractDescriptionsJudgeCli(args);
    return;
  }
  if (command === "runtime-guidance") {
    const { runRuntimeGuidanceJudgeCli } = await import("./semantic/runtime-guidance");
    await runRuntimeGuidanceJudgeCli(args);
    return;
  }
  const { runPromptHealthJudgeCli } = await import("./semantic/prompt-health");
  await runPromptHealthJudgeCli(args);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runSemanticGuardCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
