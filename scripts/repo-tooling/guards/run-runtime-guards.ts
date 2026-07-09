#!/usr/bin/env tsx

import { z } from "zod";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { parseProfile } from "./cli";
import { assertRuntimeGuard } from "./deterministic/runtime";
import { printJson } from "./results";
import { pathToFileURL } from "node:url";

function usage(): string {
  return [
    "Usage: npm run guard -- runtime -- [--profile=dev] [--keep-runtime-root]",
    "",
    "Deterministically validates generated runtime workspace context and backend guidance for DB-backed profile configs.",
  ].join("\n");
}

const runtimeGuardCliSchema = z
  .object({
    help: z.boolean().optional(),
    profile: z.string().optional(),
    "keep-runtime-root": z.boolean().optional(),
  })
  .transform((v) => ({
    profile: parseProfile(v.profile ?? process.env.AI_ASSISTANTS_PROFILE),
    keepRuntimeRoot: v["keep-runtime-root"] === true,
    help: v.help ?? false,
  }));

function parseArgs(argv: readonly string[]): {
  profile: ReturnType<typeof parseProfile>;
  keepRuntimeRoot: boolean;
  help: boolean;
} {
  return parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
      "keep-runtime-root": { type: "boolean" },
    },
    schema: runtimeGuardCliSchema,
  });
}

export async function runRuntimeGuardCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  const result = await assertRuntimeGuard({
    profile: args.profile,
    keepRuntimeRoot: args.keepRuntimeRoot,
  });
  printJson({ ok: true, guard: "runtime", ...result });
  if (result.runtimeRoot) console.log(`Kept runtime guard root at ${result.runtimeRoot}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runRuntimeGuardCli());
}
