import { existsSync } from "node:fs";
import type { CodexAgentBaseOptions, CodexSandboxMode } from "./builders.js";

export const CODEX_AGENT_HEADLESS_SANDBOX: CodexSandboxMode = "workspace-write";
const CODEX_APP_CLI_PATH = "/Applications/Codex.app/Contents/Resources/codex";

/**
 * Builds base options from CODEX_CLI.
 * Per-run sandbox defaults live in invocation options because Codex applies them to `exec`.
 */
export function codexAgentHeadlessBaseOptionsFromEnv(): CodexAgentBaseOptions {
  const cliPath =
    process.env.CODEX_CLI?.trim() ||
    (existsSync(CODEX_APP_CLI_PATH) ? CODEX_APP_CLI_PATH : undefined);
  return {
    ...(cliPath ? { cliPath } : {}),
  };
}
