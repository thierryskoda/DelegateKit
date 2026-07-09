#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { runCliMain } from "@ai-assistants/workspace-shared";
import { runTestingDataAudit } from "./audit";
import { runTestingDataCleanup } from "./cleanup";
import { usage } from "./runtime";

export async function runTestingDataCli(argv = process.argv.slice(2)): Promise<void> {
  const subcommand = argv[0];
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    console.log(usage());
    return;
  }
  if (subcommand === "audit") {
    await runTestingDataAudit(argv);
    return;
  }
  if (subcommand === "cleanup") {
    await runTestingDataCleanup(argv);
    return;
  }
  throw new Error(`Unknown testing-data subcommand ${JSON.stringify(subcommand)}.\n\n${usage()}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runTestingDataCli());
}
