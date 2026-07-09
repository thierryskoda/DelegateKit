import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CODEX_AGENT_DEFAULT_TIMEOUT_MS = 240_000;

function codexFailureMessage(input: {
  cmd: string;
  args: readonly string[];
  code?: unknown;
  signal?: unknown;
  killed?: unknown;
  stdout?: unknown;
  stderr?: unknown;
}): string {
  const status = [
    input.code !== undefined ? `code=${JSON.stringify(input.code)}` : "",
    input.signal !== undefined ? `signal=${JSON.stringify(input.signal)}` : "",
    input.killed !== undefined ? `killed=${JSON.stringify(input.killed)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const stdout =
    typeof input.stdout === "string" && input.stdout.trim()
      ? `\nstdout:\n${input.stdout.trim()}`
      : "";
  const stderr =
    typeof input.stderr === "string" && input.stderr.trim()
      ? `\nstderr:\n${input.stderr.trim()}`
      : "";
  const timeoutHint =
    input.killed === true && (input.code === 143 || input.signal === "SIGTERM")
      ? "\nHint: exit 143 / SIGTERM often means the Node exec timeout was hit; raise timeoutMs or split the Codex workload."
      : "";
  const redactedArgs = input.args.map((arg, index) =>
    index === input.args.length - 1 && arg !== "-" ? "<prompt>" : arg,
  );
  return `Codex command failed: ${[input.cmd, ...redactedArgs].join(" ")}${status ? `\n${status}` : ""}${timeoutHint}${stdout}${stderr}`;
}

async function spawnCodexArgv(
  repoRoot: string,
  argv: readonly string[],
  timeoutMs: number,
  stdin: string,
): Promise<string> {
  const [cmd, ...args] = argv;
  if (!cmd) throw new Error("Codex command argv must not be empty.");
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let killed = false;
    const timeout = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (cause) => {
      clearTimeout(timeout);
      reject(
        new Error(
          codexFailureMessage({
            cmd,
            args,
            killed,
            stdout,
            stderr,
          }),
          { cause },
        ),
      );
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          codexFailureMessage({
            cmd,
            args,
            code: code ?? undefined,
            signal: signal ?? undefined,
            killed,
            stdout,
            stderr,
          }),
        ),
      );
    });
    child.stdin.end(stdin);
  });
}

export async function execCodexArgv(
  repoRoot: string,
  argv: string[],
  timeoutMs: number,
  stdin?: string,
): Promise<string> {
  const [cmd, ...args] = argv;
  if (!cmd) throw new Error("Codex command argv must not be empty.");
  if (stdin !== undefined) return spawnCodexArgv(repoRoot, argv, timeoutMs, stdin);
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
      timeout: timeoutMs,
    });
    return stdout;
  } catch (cause) {
    const error = cause as Error & {
      stdout?: unknown;
      stderr?: unknown;
      code?: unknown;
      signal?: unknown;
      killed?: unknown;
    };
    throw new Error(
      codexFailureMessage({
        cmd,
        args,
        code: error.code,
        signal: error.signal,
        killed: error.killed,
        stdout: error.stdout,
        stderr: error.stderr,
      }),
      { cause },
    );
  }
}
