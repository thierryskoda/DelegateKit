export const CODEX_SANDBOX_MODES = ["read-only", "workspace-write", "danger-full-access"] as const;
export type CodexSandboxMode = (typeof CODEX_SANDBOX_MODES)[number];

export const CODEX_COLOR_MODES = ["always", "never", "auto"] as const;
export type CodexColorMode = (typeof CODEX_COLOR_MODES)[number];

export const CODEX_LOCAL_PROVIDERS = ["lmstudio", "ollama"] as const;
export type CodexLocalProvider = (typeof CODEX_LOCAL_PROVIDERS)[number];

export type CodexAgentBaseOptions = {
  cliPath?: string;
  search?: boolean;
  baseArgs?: readonly string[];
};

export type CodexExecOptions = {
  prompt: string;
  configOverrides?: readonly string[];
  enableFeatures?: readonly string[];
  disableFeatures?: readonly string[];
  images?: readonly string[];
  cwd?: string;
  addDirs?: readonly string[];
  sandbox?: CodexSandboxMode;
  model?: string;
  oss?: boolean;
  localProvider?: CodexLocalProvider;
  profile?: string;
  fullAuto?: boolean;
  dangerouslyBypassApprovalsAndSandbox?: boolean;
  json?: boolean;
  color?: CodexColorMode;
  ephemeral?: boolean;
  ignoreUserConfig?: boolean;
  ignoreRules?: boolean;
  skipGitRepoCheck?: boolean;
  outputLastMessageFile?: string;
  outputSchemaFile?: string;
  extraArgs?: readonly string[];
};

export type CodexExecResumeOptions = CodexExecOptions & {
  sessionId?: string;
  last?: boolean;
};

export type CodexExecReviewOptions = {
  prompt?: string;
  configOverrides?: readonly string[];
  enableFeatures?: readonly string[];
  disableFeatures?: readonly string[];
  model?: string;
  fullAuto?: boolean;
  dangerouslyBypassApprovalsAndSandbox?: boolean;
  uncommitted?: boolean;
  base?: string;
  commit?: string;
  title?: string;
  json?: boolean;
  ephemeral?: boolean;
  ignoreUserConfig?: boolean;
  ignoreRules?: boolean;
  skipGitRepoCheck?: boolean;
  outputLastMessageFile?: string;
  extraArgs?: readonly string[];
};

const DEFAULT_CLI_PATH = "codex";

function assertNoExecSubcommand(args: readonly string[] | undefined, label: string): void {
  if (!args?.length) return;
  for (const arg of args) {
    if (arg === "exec" || arg === "e") {
      throw new Error(
        `${label} must not include the codex exec subcommand; it is added by the builder.`,
      );
    }
  }
}

function appendRepeatedFlag(
  args: string[],
  flag: string,
  values: readonly string[] | undefined,
): void {
  if (!values?.length) return;
  for (const value of values) {
    args.push(flag, value);
  }
}

function appendBaseOptions(args: string[], options: CodexAgentBaseOptions): void {
  if (options.baseArgs?.length) args.push(...options.baseArgs);
  if (options.search) args.push("--search");
}

function appendExecOptions(args: string[], options: CodexExecOptions): void {
  appendRepeatedFlag(args, "--config", options.configOverrides);
  appendRepeatedFlag(args, "--enable", options.enableFeatures);
  appendRepeatedFlag(args, "--disable", options.disableFeatures);
  appendRepeatedFlag(args, "--image", options.images);
  if (options.cwd) args.push("--cd", options.cwd);
  appendRepeatedFlag(args, "--add-dir", options.addDirs);
  if (options.sandbox) args.push("--sandbox", options.sandbox);
  if (options.model) args.push("--model", options.model);
  if (options.oss) args.push("--oss");
  if (options.localProvider) args.push("--local-provider", options.localProvider);
  if (options.profile) args.push("--profile", options.profile);
  if (options.fullAuto) args.push("--full-auto");
  if (options.dangerouslyBypassApprovalsAndSandbox) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  }
  if (options.json) args.push("--json");
  if (options.color) args.push("--color", options.color);
  if (options.ephemeral) args.push("--ephemeral");
  if (options.ignoreUserConfig) args.push("--ignore-user-config");
  if (options.ignoreRules) args.push("--ignore-rules");
  if (options.skipGitRepoCheck) args.push("--skip-git-repo-check");
  if (options.outputLastMessageFile)
    args.push("--output-last-message", options.outputLastMessageFile);
  if (options.outputSchemaFile) args.push("--output-schema", options.outputSchemaFile);
}

function appendReviewOptions(args: string[], options: CodexExecReviewOptions): void {
  appendRepeatedFlag(args, "--config", options.configOverrides);
  appendRepeatedFlag(args, "--enable", options.enableFeatures);
  appendRepeatedFlag(args, "--disable", options.disableFeatures);
  if (options.model) args.push("--model", options.model);
  if (options.fullAuto) args.push("--full-auto");
  if (options.dangerouslyBypassApprovalsAndSandbox) {
    args.push("--dangerously-bypass-approvals-and-sandbox");
  }
  if (options.uncommitted) args.push("--uncommitted");
  if (options.base) args.push("--base", options.base);
  if (options.commit) args.push("--commit", options.commit);
  if (options.title) args.push("--title", options.title);
  if (options.json) args.push("--json");
  if (options.ephemeral) args.push("--ephemeral");
  if (options.ignoreUserConfig) args.push("--ignore-user-config");
  if (options.ignoreRules) args.push("--ignore-rules");
  if (options.skipGitRepoCheck) args.push("--skip-git-repo-check");
  if (options.outputLastMessageFile)
    args.push("--output-last-message", options.outputLastMessageFile);
}

function assertPrompt(prompt: string): void {
  if (!prompt || !prompt.trim()) {
    throw new Error("Codex exec prompt must be a non-empty string");
  }
}

export function buildCodexExecCommand(
  baseOptions: CodexAgentBaseOptions,
  invocation: CodexExecOptions,
): string[] {
  assertPrompt(invocation.prompt);
  assertNoExecSubcommand(baseOptions.baseArgs, "baseArgs");
  assertNoExecSubcommand(invocation.extraArgs, "extraArgs");

  const command = [baseOptions.cliPath ?? DEFAULT_CLI_PATH];
  const args: string[] = [];
  appendBaseOptions(args, baseOptions);
  args.push("exec");
  appendExecOptions(args, invocation);
  if (invocation.extraArgs?.length) args.push(...invocation.extraArgs);
  args.push(invocation.prompt);
  return [...command, ...args];
}

export function buildCodexExecResumeCommand(
  baseOptions: CodexAgentBaseOptions,
  invocation: CodexExecResumeOptions,
): string[] {
  assertPrompt(invocation.prompt);
  assertNoExecSubcommand(baseOptions.baseArgs, "baseArgs");
  assertNoExecSubcommand(invocation.extraArgs, "extraArgs");
  if (invocation.sessionId && invocation.last) {
    throw new Error("Codex exec resume accepts either sessionId or last, not both.");
  }

  const command = [baseOptions.cliPath ?? DEFAULT_CLI_PATH];
  const args: string[] = [];
  appendBaseOptions(args, baseOptions);
  args.push("exec", "resume");
  appendExecOptions(args, invocation);
  if (invocation.last) args.push("--last");
  if (invocation.sessionId) args.push(invocation.sessionId);
  if (invocation.extraArgs?.length) args.push(...invocation.extraArgs);
  args.push(invocation.prompt);
  return [...command, ...args];
}

export function buildCodexExecReviewCommand(
  baseOptions: CodexAgentBaseOptions,
  invocation: CodexExecReviewOptions,
): string[] {
  assertNoExecSubcommand(baseOptions.baseArgs, "baseArgs");
  assertNoExecSubcommand(invocation.extraArgs, "extraArgs");
  if (invocation.base && invocation.commit) {
    throw new Error("Codex exec review accepts either base or commit, not both.");
  }

  const command = [baseOptions.cliPath ?? DEFAULT_CLI_PATH];
  const args: string[] = [];
  appendBaseOptions(args, baseOptions);
  args.push("exec", "review");
  appendReviewOptions(args, invocation);
  if (invocation.extraArgs?.length) args.push(...invocation.extraArgs);
  if (invocation.prompt?.trim()) args.push(invocation.prompt);
  return [...command, ...args];
}
