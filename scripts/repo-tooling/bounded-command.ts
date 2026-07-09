import { spawnSync } from "node:child_process";

export type BoundedCommandResult = {
  command: string;
  args: readonly string[];
  cwd?: string;
  durationMs: number;
  status: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
};

export type BoundedCommandOptions = {
  cwd?: string;
  timeoutMs: number;
  maxBuffer?: number;
  input?: string;
  env?: NodeJS.ProcessEnv;
};

class BoundedCommandError extends Error {
  readonly result: BoundedCommandResult;

  constructor(message: string, result: BoundedCommandResult) {
    super(message);
    this.name = "BoundedCommandError";
    this.result = result;
  }
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n...[truncated ${text.length - maxChars} chars]`;
}

function formatBoundedCommand(result: BoundedCommandResult): string {
  const status = result.timedOut
    ? `timed out after ${result.durationMs}ms`
    : `status ${result.status ?? "unknown"}${result.signal ? ` signal ${result.signal}` : ""}`;
  return `${result.command} ${result.args.join(" ")} (${status}, cwd=${result.cwd ?? process.cwd()})`;
}

export function formatBoundedCommandFailure(result: BoundedCommandResult): string {
  const parts = [formatBoundedCommand(result)];
  const stdout = truncate(result.stdout.trim(), 4_000);
  const stderr = truncate(result.stderr.trim(), 4_000);
  if (stdout) parts.push(`stdout:\n${stdout}`);
  if (stderr) parts.push(`stderr:\n${stderr}`);
  return parts.join("\n");
}

export function runBoundedCommand(
  command: string,
  args: readonly string[],
  options: BoundedCommandOptions,
): BoundedCommandResult {
  const startedAt = Date.now();
  const result = spawnSync(command, [...args], {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
    env: options.env,
    timeout: options.timeoutMs,
    killSignal: "SIGTERM",
    shell: false,
    maxBuffer: options.maxBuffer ?? 10_000_000,
  });
  const durationMs = Date.now() - startedAt;
  const timedOut = result.error instanceof Error && result.error.message.includes("ETIMEDOUT");
  return {
    command,
    args,
    cwd: options.cwd,
    durationMs,
    status: result.status,
    signal: result.signal,
    timedOut,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export function runRequiredBoundedCommand(
  command: string,
  args: readonly string[],
  options: BoundedCommandOptions,
): BoundedCommandResult {
  const result = runBoundedCommand(command, args, options);
  if (result.status === 0 && !result.timedOut) return result;
  throw new BoundedCommandError(formatBoundedCommandFailure(result), result);
}
