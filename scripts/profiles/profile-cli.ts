#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";

type ProfileCommand = "build" | "supabase" | "connect" | "learning-review" | "state-hygiene";

const commands = [
  "build",
  "supabase",
  "tailscale",
  "connect",
  "learning-review",
  "state-hygiene",
] as const;

function usage(): string {
  return [
      "Usage:",
      "  npm run profile -- build --profile=dev",
      "  npm run profile -- build --profile=e2e",
    "  npm run profile -- supabase start|status|reset|stop|env --profile=dev|e2e",
    "  npm run profile -- connect dev --profile=dev|e2e -- --port 5173",
    "  npm run profile -- learning-review run-cursor|replay-date --profile=dev|prod --profile-id <id>",
    "  npm run profile -- state-hygiene run --profile=dev|prod --profile-id <id>",
    "",
    "Use npm run tunnel -- dev|e2e status|env|up|down for local public callback tunnels.",
  ].join("\n");
}

function parseCommand(argv: readonly string[]): { command: ProfileCommand; args: string[] } {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    process.exit(0);
  }
  if (!commands.includes(command as ProfileCommand)) {
    throw new Error(`Unknown profile command ${JSON.stringify(command)}.\n\n${usage()}`);
  }
  return { command: command as ProfileCommand, args };
}

export async function runProfileCli(argv = process.argv.slice(2)): Promise<void> {
  const { command, args } = parseCommand(argv);
  if (command !== "learning-review" && (args.includes("--help") || args.includes("-h"))) {
    console.log(usage());
    return;
  }
  if (command === "build") {
    const { runProfileBuildCli } = await import("./build");
    await runProfileBuildCli(args);
    return;
  }
  if (command === "supabase") {
    const { runProfileSupabaseCli } = await import("./supabase");
    await runProfileSupabaseCli(args);
    return;
  }
  if (command === "learning-review") {
    const { runProfileLearningReviewCli } = await import("./learning-review");
    await runProfileLearningReviewCli(args);
    return;
  }
  if (command === "state-hygiene") {
    const { runProfileStateHygieneCli } = await import("./state-hygiene");
    await runProfileStateHygieneCli(args);
    return;
  }
  const { runProfileConnectCli } = await import("./connect");
  await runProfileConnectCli(args);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runProfileCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
