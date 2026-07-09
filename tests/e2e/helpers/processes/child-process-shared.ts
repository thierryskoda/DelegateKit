import type { ChildProcess } from "node:child_process";

/** Keep error attachments bounded when subprocess stdout/stderr is huge. */
export function truncateChildLogs(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(value.length - maxLength);
}

export function killChildProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      const code =
        error instanceof Error && "code" in error
          ? (error as NodeJS.ErrnoException).code
          : undefined;
      if (code === "ESRCH") return;
    }
  }
  child.kill(signal);
}

export async function waitForChildProcessExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      killChildProcessGroup(child, "SIGKILL");
      resolve();
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
