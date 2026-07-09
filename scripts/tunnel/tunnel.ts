#!/usr/bin/env tsx

import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  assertRuntimeProfile,
  isLocalSupabaseManagedProfile,
  repoRoot,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import { runProfileTailscaleCli } from "../profiles/tailscale";

type TunnelAction = "status" | "env" | "up" | "down";

function usage(): string {
  return [
    "Usage:",
    "  npm run tunnel -- dev status",
    "  npm run tunnel -- dev env",
    "  npm run tunnel -- dev up [--force]",
    "  npm run tunnel -- dev down [--force]",
    "  npm run tunnel -- e2e env",
    "  npm run tunnel -- e2e up [--force]",
    "",
    "Tunnel is for local Nango/OAuth/provider callbacks. Normal npm run start:dev does not need it.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): {
  action: TunnelAction;
  force: boolean;
  profile: RuntimeProfile;
} {
  const [profileRaw, actionRaw, ...rest] = argv;
  if (!profileRaw || profileRaw === "--help" || profileRaw === "-h") throw new Error(usage());
  if (!actionRaw) throw new Error(usage());
  assertRuntimeProfile(profileRaw);
  if (!isLocalSupabaseManagedProfile(profileRaw)) {
    throw new Error(`Tunnel is local-only for dev/e2e. Configure your own public domains for ${profileRaw}.`);
  }
  if (!["status", "env", "up", "down"].includes(actionRaw)) throw new Error(usage());
  return {
    action: actionRaw as TunnelAction,
    force: rest.includes("--force"),
    profile: profileRaw,
  };
}

function spawnBridge(profile: RuntimeProfile): ChildProcess {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/profiles/web-bridge.ts", "serve", `--profile=${profile}`],
    {
      cwd: repoRoot(import.meta.url),
      detached: process.platform !== "win32",
      env: process.env,
      stdio: "inherit",
    },
  );
  if (!child.pid) throw new Error("Failed to start local web bridge.");
  return child;
}

function stopBridge(child: ChildProcess): void {
  if (!child.pid) return;
  try {
    process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // Process may already be gone.
    }
  }
}

async function runTunnelCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const force = args.force ? ["--force"] : [];
  if (args.action === "status") {
    await runProfileTailscaleCli(["status", `--profile=${args.profile}`]);
    return;
  }
  if (args.action === "env") {
    await runProfileTailscaleCli(["env", `--profile=${args.profile}`]);
    return;
  }
  if (args.action === "down") {
    await runProfileTailscaleCli(["clear", `--profile=${args.profile}`, ...force]);
    return;
  }

  await runProfileTailscaleCli(["env", `--profile=${args.profile}`]);
  const bridge = spawnBridge(args.profile);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopBridge(bridge);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await runProfileTailscaleCli(["serve", `--profile=${args.profile}`, ...force]);
  console.log("\nTunnel is up. Keep this process running while testing callbacks. Press Ctrl-C to stop the local bridge.");
  await new Promise<void>((resolve, reject) => {
    bridge.once("error", reject);
    bridge.once("exit", (code, signal) => {
      if (shuttingDown) {
        resolve();
        return;
      }
      reject(new Error(`web bridge exited unexpectedly with ${signal ?? `code ${code ?? "unknown"}`}.`));
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runTunnelCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
