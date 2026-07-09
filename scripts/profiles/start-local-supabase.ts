import type { RuntimeProfile } from "@ai-assistants/repo-layout";
import { runProfileSupabaseCli } from "./supabase";

export async function startLocalSupabase(
  profile: RuntimeProfile,
  clean: boolean,
): Promise<void> {
  await runProfileSupabaseCli([clean ? "reset" : "start", `--profile=${profile}`]);
}
