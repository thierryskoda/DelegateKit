#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { parseCliCommand, runCliMain } from "@ai-assistants/workspace-shared";
import {
  runVerifyAll,
  runVerifyRuntime,
  runVerifySource,
  runVerifySourceFast,
} from "./verify-steps";

type VerifyCommand = "source" | "source-fast" | "runtime" | "all";

const commands = ["source", "source-fast", "runtime", "all"] as const;

function usage(): string {
  return [
    "Usage:",
    "  npm run verify:source",
    "  npm run verify:source-fast",
    "  npm run verify:runtime",
    "  npm run verify:all",
    "  npm run verify -- source|source-fast|runtime|all",
    "",
    "source: guards + knip (judge) + semantic + typecheck + test + build",
    "source-fast: guards + knip (no judge) + typecheck + test",
    "runtime: supabase + control DB + clients seed-missing + runtime + backend-prompt guards",
    "all: source + runtime",
  ].join("\n");
}

export async function runVerifyCli(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseCliCommand<VerifyCommand>(argv, { commands, usage });
  if (parsed.command === "help") {
    console.log(usage());
    return;
  }

  if (parsed.command === "source") {
    await runVerifySource();
    return;
  }
  if (parsed.command === "source-fast") {
    await runVerifySourceFast();
    return;
  }
  if (parsed.command === "runtime") {
    await runVerifyRuntime();
    return;
  }
  await runVerifyAll();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runVerifyCli());
}
