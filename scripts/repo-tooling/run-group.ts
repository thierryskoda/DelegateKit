import { spawn, type ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";

export type ScriptTask = {
  label: string;
  command: string;
  args?: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
};

export type ScriptTaskResult = {
  label: string;
  durationMs: number;
};

type ScriptTaskFailure = ScriptTaskResult & {
  command: string;
  args: readonly string[];
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

export type RunGroupOutput = {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
};

class ScriptTaskError extends Error {
  readonly failure: ScriptTaskFailure;

  constructor(failure: ScriptTaskFailure) {
    const commandText = [failure.command, ...failure.args].join(" ");
    const outcome = failure.signal
      ? `signal ${failure.signal}`
      : `exit code ${failure.exitCode ?? "unknown"}`;
    super(
      `${failure.label} failed after ${formatDuration(failure.durationMs)}: ${commandText} (${outcome})`,
    );
    this.name = "ScriptTaskError";
    this.failure = failure;
  }
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function writeLine(stream: NodeJS.WritableStream, line: string): void {
  stream.write(`${line}\n`);
}

function prefixOutput(label: string, input: Readable | null, output: NodeJS.WritableStream): void {
  if (!input) return;
  let buffer = "";
  input.setEncoding("utf8");
  input.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length > 0) writeLine(output, `[${label}] ${line}`);
    }
  });
  input.on("end", () => {
    if (buffer.length > 0) writeLine(output, `[${label}] ${buffer}`);
  });
}

function taskArgs(task: ScriptTask): readonly string[] {
  return task.args ?? [];
}

function commandText(task: ScriptTask): string {
  return [task.command, ...taskArgs(task)].join(" ");
}

function runScriptTask(
  task: ScriptTask,
  output: RunGroupOutput = {},
): { child: ChildProcess; done: Promise<ScriptTaskResult> } {
  const stdout = output.stdout ?? process.stdout;
  const stderr = output.stderr ?? process.stderr;
  const startedAt = Date.now();

  writeLine(stderr, `\n==> ${task.label}: ${commandText(task)}`);
  const child = spawn(task.command, [...taskArgs(task)], {
    cwd: task.cwd,
    env: task.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  prefixOutput(task.label, child.stdout, stdout);
  prefixOutput(task.label, child.stderr, stderr);

  const done = new Promise<ScriptTaskResult>((resolve, reject) => {
    child.once("error", (error) => {
      const durationMs = Date.now() - startedAt;
      reject(
        new ScriptTaskError({
          label: task.label,
          command: task.command,
          args: taskArgs(task),
          durationMs,
          exitCode: null,
          signal: null,
        }),
      );
      child.removeAllListeners("exit");
      if (error instanceof Error) {
        writeLine(stderr, `[${task.label}] ${error.message}`);
      }
    });
    child.once("exit", (exitCode, signal) => {
      const durationMs = Date.now() - startedAt;
      if (exitCode === 0) {
        writeLine(stderr, `==> ${task.label} done in ${formatDuration(durationMs)}`);
        resolve({ label: task.label, durationMs });
        return;
      }
      reject(
        new ScriptTaskError({
          label: task.label,
          command: task.command,
          args: taskArgs(task),
          durationMs,
          exitCode,
          signal: signal as NodeJS.Signals | null,
        }),
      );
    });
  });

  return { child, done };
}

export async function runParallelTasks(
  label: string,
  tasks: readonly ScriptTask[],
  options: RunGroupOutput & { concurrency?: number } = {},
): Promise<ScriptTaskResult[]> {
  const stderr = options.stderr ?? process.stderr;
  const concurrency = options.concurrency ?? tasks.length;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`${label}: concurrency must be a positive integer.`);
  }

  writeLine(stderr, `\n==> ${label}: ${tasks.length} parallel task(s), concurrency ${concurrency}`);
  const startedAt = Date.now();
  const results: ScriptTaskResult[] = [];
  const running = new Set<ChildProcess>();
  let nextIndex = 0;
  let failed = false;

  return await new Promise<ScriptTaskResult[]>((resolve, reject) => {
    const stopRunning = () => {
      for (const child of running) {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
      }
    };

    const launchMore = () => {
      if (failed) return;
      while (running.size < concurrency && nextIndex < tasks.length) {
        const task = tasks[nextIndex]!;
        nextIndex += 1;
        const { child, done } = runScriptTask(task, options);
        running.add(child);
        done
          .then((result) => {
            running.delete(child);
            results.push(result);
            if (results.length === tasks.length) {
              writeLine(
                stderr,
                `==> ${label} complete in ${formatDuration(Date.now() - startedAt)}`,
              );
              resolve(results);
              return;
            }
            launchMore();
          })
          .catch((error: unknown) => {
            running.delete(child);
            if (failed) return;
            failed = true;
            stopRunning();
            reject(error);
          });
      }
    };

    if (tasks.length === 0) {
      writeLine(stderr, `==> ${label} complete in ${formatDuration(Date.now() - startedAt)}`);
      resolve([]);
      return;
    }

    launchMore();
  });
}
