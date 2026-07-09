import { execFileSync } from "node:child_process";

type ProcessSignalTarget = {
  pid: number;
  processGroupId: number | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function processGroupId(pid: number): number | null {
  if (process.platform === "win32") return null;
  try {
    const text = execFileSync("ps", ["-o", "pgid=", "-p", String(pid)], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }).trim();
    const pgid = Number.parseInt(text, 10);
    return Number.isInteger(pgid) && pgid > 0 ? pgid : null;
  } catch {
    return null;
  }
}

function signalPidAndSafeProcessGroup(pid: number, signal: NodeJS.Signals): ProcessSignalTarget {
  if (process.platform === "win32") {
    try {
      process.kill(pid, signal);
    } catch {
      // Ignore ESRCH / EPERM during best-effort local cleanup.
    }
    return { pid, processGroupId: null };
  }

  const targetPgid = processGroupId(pid);
  const ownPgid = processGroupId(process.pid);
  if (targetPgid !== null && targetPgid !== ownPgid) {
    try {
      process.kill(-targetPgid, signal);
      return { pid, processGroupId: targetPgid };
    } catch {
      // Fall back to the direct child/listener PID below.
    }
  }

  try {
    process.kill(pid, signal);
  } catch {
    // Ignore ESRCH / EPERM during best-effort local cleanup.
  }
  return { pid, processGroupId: null };
}

export function signalProcessGroupOrPid(input: {
  pid?: number;
  processGroupId: number | null;
  signal: NodeJS.Signals;
}): void {
  if (process.platform !== "win32" && input.processGroupId !== null) {
    try {
      process.kill(-input.processGroupId, input.signal);
      return;
    } catch {
      // Fall back to the direct process PID below.
    }
  }
  if (typeof input.pid === "number") {
    try {
      process.kill(input.pid, input.signal);
    } catch {
      // Ignore ESRCH / EPERM during best-effort local cleanup.
    }
  }
}

function tcpListenerPidsOnPort(port: number): number[] {
  let text: string;
  try {
    text = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    }).trim();
  } catch (error: unknown) {
    const status =
      typeof error === "object" && error !== null && "status" in error
        ? (error as { status?: number }).status
        : undefined;
    if (status === 1) return [];
    throw error;
  }
  if (!text) return [];

  return [
    ...new Set(
      text
        .split(/\n/)
        .flatMap((line) => line.trim().split(/\s+/))
        .map((s) => Number.parseInt(s, 10))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
}

function tcpPortHasListener(port: number): boolean {
  return tcpListenerPidsOnPort(port).length > 0;
}

function processTargetAlive(target: ProcessSignalTarget): boolean {
  try {
    if (process.platform !== "win32" && target.processGroupId !== null) {
      process.kill(-target.processGroupId, 0);
      return true;
    }
    process.kill(target.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processTargetKey(target: ProcessSignalTarget): string {
  return target.processGroupId !== null ? `pgid:${target.processGroupId}` : `pid:${target.pid}`;
}

async function waitForProcessTargetsToExit(
  targets: readonly ProcessSignalTarget[],
  timeoutMs: number,
): Promise<ProcessSignalTarget[]> {
  const unique = [...new Map(targets.map((target) => [processTargetKey(target), target])).values()];
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const alive = unique.filter(processTargetAlive);
    if (alive.length === 0) return [];
    await sleep(100);
  }
  return unique.filter(processTargetAlive);
}

function signalProcessTargets(
  targets: readonly ProcessSignalTarget[],
  signal: NodeJS.Signals,
): void {
  for (const target of targets) {
    signalProcessGroupOrPid({
      pid: target.pid,
      processGroupId: target.processGroupId,
      signal,
    });
  }
}

function killTcpListenersOnPorts(
  ports: readonly number[],
  signal: NodeJS.Signals,
): ProcessSignalTarget[] {
  if (process.platform === "win32") return [];

  const unique = [...new Set(ports.filter((p) => Number.isInteger(p) && p >= 1 && p <= 65_535))];
  const targets: ProcessSignalTarget[] = [];
  for (const port of unique) {
    const pids = tcpListenerPidsOnPort(port);
    if (pids.length === 0) continue;

    console.log(`[start] Freeing TCP port ${port} (${signal} -> PID(s): ${pids.join(", ")})`);
    for (const pid of pids) {
      targets.push(signalPidAndSafeProcessGroup(pid, signal));
    }
  }
  return [...new Map(targets.map((target) => [processTargetKey(target), target])).values()];
}

async function waitForPortsWithoutListeners(
  ports: readonly number[],
  timeoutMs: number,
): Promise<number[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const busy = ports.filter((port) => tcpPortHasListener(port));
    if (busy.length === 0) return [];
    await sleep(100);
  }
  return ports.filter((port) => tcpPortHasListener(port));
}

export async function freePortsForStart(ports: readonly number[], context: string): Promise<void> {
  if (process.platform === "win32") {
    console.warn(
      `[start] ${context}: automatic port cleanup is skipped on Windows. If you see EADDRINUSE, close the process on that port or run Task Manager.`,
    );
    return;
  }

  const unique = [...new Set(ports.filter((p) => Number.isInteger(p) && p >= 1 && p <= 65_535))];
  const signaledTargets = killTcpListenersOnPorts(unique, "SIGTERM");
  let aliveTargets = await waitForProcessTargetsToExit(signaledTargets, 2_000);
  let stillBusy = await waitForPortsWithoutListeners(unique, 2_000);

  if (aliveTargets.length > 0 || stillBusy.length > 0) {
    signalProcessTargets(aliveTargets, "SIGKILL");
    const killedTargets = killTcpListenersOnPorts(stillBusy, "SIGKILL");
    aliveTargets = await waitForProcessTargetsToExit([...aliveTargets, ...killedTargets], 1_000);
    stillBusy = await waitForPortsWithoutListeners(stillBusy, 1_000);
  }

  if (aliveTargets.length > 0 || stillBusy.length > 0) {
    const portDetails = stillBusy
      .map((port) => {
        const pids = tcpListenerPidsOnPort(port);
        return `${port}${pids.length > 0 ? ` (PID(s): ${pids.join(", ")})` : ""}`;
      })
      .join(", ");
    const targetDetails = aliveTargets
      .map((target) =>
        target.processGroupId !== null
          ? `process group ${target.processGroupId}`
          : `PID ${target.pid}`,
      )
      .join(", ");
    const details = [portDetails, targetDetails].filter((part) => part.length > 0).join("; ");
    throw new Error(
      `${context}: TCP port cleanup did not finish: ${details}. Inspect listeners with: lsof -nP -iTCP:<port> -sTCP:LISTEN`,
    );
  }
}
