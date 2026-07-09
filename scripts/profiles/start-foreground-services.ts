import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { parseConnectWebEnv } from "@ai-assistants/workspace-shared/env";
import { localPortsForProfile, supabaseStudioLocalUrl } from "./profile-ports";
import { freePortsForStart, signalProcessGroupOrPid } from "./start-port-cleanup";

type ManagedProcess = {
  child: ChildProcess;
  processGroupId: number | null;
  label: string;
};

function prefixOutput(label: string, stream: Readable | null): void {
  if (!stream) return;
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length > 0) console.log(`[${label}] ${line}`);
    }
  });
  stream.on("end", () => {
    if (buffer.length > 0) console.log(`[${label}] ${buffer}`);
  });
}

function spawnNpmScript(
  label: string,
  scriptName: string,
  env: NodeJS.ProcessEnv,
  scriptArgs: readonly string[] = [],
): ManagedProcess {
  const child = spawn(
    "npm",
    ["run", "--silent", scriptName, ...(scriptArgs.length ? ["--", ...scriptArgs] : [])],
    {
      cwd: repoRoot(import.meta.url),
      detached: process.platform !== "win32",
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  prefixOutput(label, child.stdout);
  prefixOutput(label, child.stderr);
  return {
    child,
    label,
    processGroupId: process.platform !== "win32" ? (child.pid ?? null) : null,
  };
}

function spawnProfileScript(
  label: string,
  scriptPath: string,
  env: NodeJS.ProcessEnv,
  scriptArgs: readonly string[],
): ManagedProcess {
  const root = repoRoot(import.meta.url);
  const child = spawn(process.execPath, ["--import", "tsx", scriptPath, ...scriptArgs], {
    cwd: root,
    detached: process.platform !== "win32",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  prefixOutput(label, child.stdout);
  prefixOutput(label, child.stderr);
  return {
    child,
    label,
    processGroupId: process.platform !== "win32" ? (child.pid ?? null) : null,
  };
}

function stopProcess(processInfo: ManagedProcess, signal: NodeJS.Signals): void {
  signalProcessGroupOrPid({
    pid: processInfo.child.pid,
    processGroupId: processInfo.processGroupId,
    signal,
  });
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required before starting the dev foreground stack.`);
  return value;
}

function connectRuntimeEnv(env: NodeJS.ProcessEnv, backendLocalUrl: string): NodeJS.ProcessEnv {
  const connectEnv = {
    ...env,
    BACKEND_PUBLIC_URL: backendLocalUrl,
    SUPABASE_PUBLIC_URL: requiredEnv(env, "SUPABASE_URL"),
    VITE_CONNECT_HMR_HOST: env.VITE_CONNECT_HMR_HOST?.trim() || "127.0.0.1",
  };
  parseConnectWebEnv(connectEnv);
  return connectEnv;
}

export async function runForegroundServices(
  profile: RuntimeProfile,
  env: NodeJS.ProcessEnv,
  options: { mode: "parity" | "watch" } = { mode: "parity" },
): Promise<void> {
  const ports = localPortsForProfile(profile);
  const portalPort = ports.connect;
  const backendPort = Number(env.BACKEND_PORT ?? ports.backend);
  if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65_535) {
    throw new Error(
      `BACKEND_PORT must be an integer TCP port; got ${JSON.stringify(env.BACKEND_PORT)}.`,
    );
  }
  await freePortsForStart(
    [portalPort, backendPort, ports.webBridge],
    `Foreground ${profile} stack`,
  );
  const backendLocalUrl = `http://127.0.0.1:${backendPort}`;
  const serviceEnv: NodeJS.ProcessEnv = {
    ...env,
    BACKEND_PORT: String(backendPort),
    PORT: String(portalPort),
    AI_ASSISTANTS_CONNECT_LOCAL_URL: `http://127.0.0.1:${portalPort}`,
    AI_ASSISTANTS_BACKEND_URL: backendLocalUrl,
    AI_ASSISTANTS_PROFILE: profile,
  };
  const root = repoRoot(import.meta.url);
  if (options.mode === "parity") {
    execFileSync("npm", ["run", "build", "--workspace", "@ai-assistants/connect"], {
      cwd: root,
      env: serviceEnv,
      stdio: "inherit",
    });
  }
  const portalEnv = connectRuntimeEnv(serviceEnv, backendLocalUrl);

  const services =
    options.mode === "watch"
      ? [
          spawnNpmScript("backend", "backend:dev", serviceEnv),
          spawnNpmScript("worker", "backend:worker:dev", serviceEnv),
          spawnProfileScript("web-bridge", "scripts/profiles/web-bridge.ts", serviceEnv, [
            "serve",
            `--profile=${profile}`,
          ]),
          spawnNpmScript("portal", "profile", portalEnv, [
            "connect",
            "dev",
            `--profile=${profile}`,
            "--",
            "--port",
            String(portalPort),
          ]),
        ]
      : [
          spawnNpmScript("backend", "backend:serve", serviceEnv),
          spawnNpmScript("worker", "backend:worker", serviceEnv),
          spawnProfileScript("web-bridge", "scripts/profiles/web-bridge.ts", serviceEnv, [
            "serve",
            `--profile=${profile}`,
          ]),
          spawnProfileScript("portal", "scripts/profiles/connect-static.ts", portalEnv, [
            "--port",
            String(portalPort),
          ]),
        ];

  let shuttingDown = false;
  const stopAll = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nStopping ${profile} stack (${signal})...`);
    for (const service of services) stopProcess(service, signal);
  };

  console.log(
    [
      "",
      `${profile} stack processes are starting (${options.mode}).`,
      "Press Ctrl-C to stop backend, worker, web bridge, and portal.",
      `Backend API:      ${backendLocalUrl}`,
      `Connect portal:   http://127.0.0.1:${portalPort}`,
      `Supabase Studio:  ${supabaseStudioLocalUrl(profile)}`,
      options.mode === "watch"
        ? "Connect mode:     Vite dev server"
        : "Connect mode:     built static server",
      "",
    ].join("\n"),
  );

  process.once("SIGINT", () => stopAll("SIGINT"));
  process.once("SIGTERM", () => stopAll("SIGTERM"));

  await new Promise<void>((resolve, reject) => {
    let remaining = services.length;
    for (const service of services) {
      service.child.once("error", (error) => {
        stopAll("SIGTERM");
        reject(error);
      });
      service.child.once("exit", (code, signal) => {
        remaining -= 1;
        if (!shuttingDown && (signal === "SIGINT" || signal === "SIGTERM")) {
          stopAll(signal);
          if (remaining === 0) resolve();
          return;
        }
        if (!shuttingDown) {
          stopAll("SIGTERM");
          reject(
            new Error(
              `${service.label} exited unexpectedly with ${signal ?? `code ${code ?? "unknown"}`}.`,
            ),
          );
          return;
        }
        if (remaining === 0) resolve();
      });
    }
  });
}
