import type { RuntimeProfile } from "@ai-assistants/repo-layout";
import { assertRuntimeGuard } from "./deterministic/runtime";
import { runBackendAssistantPromptJudgeCli } from "./semantic/backend-assistant-prompt";
import { runSemanticAllCli } from "./semantic/run-all";
import { runKnipGuardCli } from "./run-knip-guard";
import { runSourceGuardCli } from "./run-source-guards";
import { runSupabaseControlDbGuardCli } from "./supabase-local-control-db";

export async function runGuardSource(): Promise<void> {
  await runSourceGuardCli([]);
}

export async function runGuardKnip(options: { judge?: boolean } = {}): Promise<void> {
  const argv = options.judge === false ? ["--no-judge"] : [];
  await runKnipGuardCli(argv);
}

export async function runGuardSemanticAll(profile: RuntimeProfile): Promise<void> {
  await runSemanticAllCli(["--profile", profile]);
}

export async function runGuardRuntime(profile: RuntimeProfile): Promise<void> {
  await assertRuntimeGuard({ profile });
}

export async function runGuardBackendPrompt(profile: RuntimeProfile): Promise<void> {
  await runBackendAssistantPromptJudgeCli(["--profile", profile]);
}

export async function runGuardSupabaseControlDb(profile: RuntimeProfile): Promise<void> {
  await runSupabaseControlDbGuardCli(["--profile", profile]);
}
