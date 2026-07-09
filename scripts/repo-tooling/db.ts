#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { repoRoot } from "@ai-assistants/repo-layout";

type DbCommand = "migrate" | "migrate-local" | "types";

const commands = ["migrate", "migrate-local", "types"] as const;
const SUPABASE_CLI = ["--yes", "supabase@2.98.1"] as const;

function usage(): string {
  return [
    "Usage:",
    "  npm run db -- migrate",
    "  npm run db -- migrate-local",
    "  npm run db -- types [--mode=local|linked] [--skip-db-types]",
  ].join("\n");
}

function parseCommand(argv: readonly string[]): { command: DbCommand; args: string[] } {
  const [command, ...args] = argv;
  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    process.exit(0);
  }
  if (!commands.includes(command as DbCommand)) {
    throw new Error(`Unknown db command ${JSON.stringify(command)}.\n\n${usage()}`);
  }
  return { command: command as DbCommand, args };
}

export async function runDbCli(argv = process.argv.slice(2)): Promise<void> {
  const { command, args } = parseCommand(argv);
  const root = repoRoot(import.meta.url);
  if (command === "migrate") {
    execFileSync("npx", [...SUPABASE_CLI, "db", "push", ...args], { cwd: root, stdio: "inherit" });
    return;
  }
  if (command === "migrate-local") {
    execFileSync("npx", [...SUPABASE_CLI, "db", "reset", "--local", ...args], {
      cwd: root,
      stdio: "inherit",
    });
    return;
  }
  const { runControlDbContractsCodegenCli } =
    await import("./codegen/generate-control-db-contracts");
  await runControlDbContractsCodegenCli(args.length > 0 ? args : ["--mode=local"]);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runDbCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
