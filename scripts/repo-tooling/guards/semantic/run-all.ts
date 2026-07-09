#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { z } from "zod";
import { parseCli } from "@ai-assistants/workspace-shared";
import { parseProfile } from "../cli";
import { REGISTERED_JUDGE_PROMPT_IDS } from "../../judges/registry";
import { runParallelTasks, type ScriptTask } from "../../run-group";

const CORE_GUARD_CONCURRENCY = 3;
const PROMPT_HEALTH_CONCURRENCY = 2;

type Args = {
  profile: RuntimeProfile;
  help: boolean;
};

const judgeAllCliSchema = z
  .object({
    help: z.boolean().optional(),
    profile: z.string().optional(),
  })
  .transform((v) => ({
    help: v.help ?? false,
    profile: parseProfile(v.profile ?? process.env.AI_ASSISTANTS_PROFILE),
  }));

function parseArgs(argv: readonly string[]): Args {
  return parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      profile: { type: "string" },
    },
    schema: judgeAllCliSchema,
  });
}

function usage(): string {
  return [
    "Usage: npm run guard -- semantic all [--profile dev]",
    "       npm run guard -- semantic fast [--profile dev]",
    "",
    "Runs every source-only startup-required LLM judge with deterministic cache keys.",
    "Use guard semantic backend-prompt separately for DB-backed assistant prompt quality.",
  ].join("\n");
}

function npmScriptTask(
  scriptName: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  label = scriptName,
): ScriptTask {
  return {
    label,
    command: "npm",
    args: ["run", "--silent", scriptName, "--", ...args],
    cwd: repoRoot(import.meta.url),
    env,
  };
}

export async function runSemanticAllCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const profileArgs = ["--profile", args.profile];
  const env = { ...process.env, AI_ASSISTANTS_PROFILE: args.profile };

  const coreTasks: ScriptTask[] = [
    npmScriptTask("guard", ["semantic", "plugin-boundaries", ...profileArgs], env),
    npmScriptTask("guard", ["semantic", "profile-learning-review-integration", ...profileArgs], env),
    npmScriptTask("guard", ["semantic", "profile-learning-reviewers", ...profileArgs], env),
    npmScriptTask("guard", ["semantic", "tool-contract-descriptions", ...profileArgs], env),
    npmScriptTask("guard", ["semantic", "runtime-guidance", ...profileArgs], env),
  ];
  await runParallelTasks("semantic core guards", coreTasks, {
    concurrency: CORE_GUARD_CONCURRENCY,
  });
  await runParallelTasks(
    "semantic prompt-health guards",
    REGISTERED_JUDGE_PROMPT_IDS.map((judgeId) =>
      npmScriptTask(
        "guard",
        ["semantic", "prompt-health", ...profileArgs, "--judge", judgeId],
        env,
        `guard semantic prompt-health:${judgeId}`,
      ),
    ),
    { concurrency: PROMPT_HEALTH_CONCURRENCY },
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runSemanticAllCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
