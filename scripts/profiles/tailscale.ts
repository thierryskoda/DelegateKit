#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  assertRuntimeProfile,
  isLocalSupabaseManagedProfile,
  profileEnvPath,
  type RuntimeProfile,
} from "@ai-assistants/repo-layout";
import { z } from "zod";
import { writeSecretFileAtomic } from "./profile-env-blocks";
import { parseSubcommandCli, timedFetch } from "@ai-assistants/workspace-shared";
import { readDotEnvFile } from "@ai-assistants/workspace-shared";
import { localPortsForProfile, publicBaseUrlForProfile } from "./profile-ports";
import { WEB_BRIDGE_HEALTH_PATH } from "./web-bridge";

export type TailscaleStatus = {
  BackendState?: string;
  Health?: string[];
  Self?: {
    DNSName?: string;
  };
  TailscaleIPs?: string[];
};

export type ServeStatus = {
  Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>;
};

const tailscaleStatusSchema = z
  .object({
    BackendState: z.string().optional(),
    Health: z.array(z.string()).optional(),
    Self: z.object({ DNSName: z.string().optional() }).optional(),
    TailscaleIPs: z.array(z.string()).optional(),
  })
  .passthrough();

const serveStatusSchema = z
  .object({
    Web: z
      .record(
        z.string(),
        z.object({
          Handlers: z
            .record(z.string(), z.object({ Proxy: z.string().optional() }).passthrough())
            .optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

type EnvEntries = Record<string, string>;

const ENV_BLOCK_BEGIN = "# BEGIN AI ASSISTANTS TAILSCALE WEB BRIDGE";
const ENV_BLOCK_END = "# END AI ASSISTANTS TAILSCALE WEB BRIDGE";
const HTTPS_PORT = 443;
const LOCAL_BRIDGE_HEALTH_TIMEOUT_MS = 3_000;

const tailscaleCliSchema = z
  .object({
    action: z.enum(["status", "serve", "clear", "env"]),
    profile: z.string().min(1),
    force: z.boolean().optional(),
  })
  .transform(({ action, profile, force }) => {
    assertRuntimeProfile(profile);
    return { action, profile: profile as RuntimeProfile, force: force ?? false };
  });

function commandExists(command: string): boolean {
  try {
    execFileSync("bash", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runText(command: string, args: readonly string[]): string {
  return execFileSync(command, args, { encoding: "utf8" });
}

function runInherited(command: string, args: readonly string[]): void {
  console.log(`$ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { stdio: "inherit" });
}

function readTailscaleStatus(): TailscaleStatus {
  return tailscaleStatusSchema.parse(
    JSON.parse(runText("tailscale", ["status", "--json"])) as unknown,
  );
}

function readServeStatus(): ServeStatus {
  return serveStatusSchema.parse(
    JSON.parse(runText("tailscale", ["serve", "status", "--json"])) as unknown,
  );
}

function assertTailscaleRunning(status: TailscaleStatus): void {
  if (status.BackendState !== "Running") {
    const health = status.Health?.length ? ` Health: ${status.Health.join(" ")}` : "";
    throw new Error(
      `Tailscale is not Running (BackendState=${status.BackendState ?? "unknown"}).${health}`,
    );
  }
}

export function tailscaleServeBaseUrlFromStatus(status: TailscaleStatus): string {
  const dns = status.Self?.DNSName?.replace(/\.$/, "").trim();
  if (!dns)
    throw new Error(
      "Tailscale status did not include Self.DNSName. Enable MagicDNS before exposing the Connect web bridge.",
    );
  return `https://${dns}`;
}

export function managedBridgeEnvEntries(input: {
  bridgePort: number;
  publicBaseUrl: string;
  supabaseAnonKey: string;
}): EnvEntries {
  const baseUrl = input.publicBaseUrl.replace(/\/+$/, "");
  const dns = new URL(baseUrl).hostname;
  return {
    CONNECT_PUBLIC_URL: baseUrl,
    BACKEND_PUBLIC_URL: `${baseUrl}/api`,
    SUPABASE_PUBLIC_URL: `${baseUrl}/supabase`,
    OAUTH_PUBLIC_URL: baseUrl,
    VITE_CONNECT_HMR_HOST: dns,
    AI_ASSISTANTS_WEB_BRIDGE_PORT: String(input.bridgePort),
  };
}

function managedEnvBlock(entries: EnvEntries): string {
  return [
    ENV_BLOCK_BEGIN,
    "# Managed by npm run tunnel -- <profile> env for public Connect portal access.",
    ...Object.entries(entries).map(([key, value]) => `${key}=${value}`),
    ENV_BLOCK_END,
  ].join("\n");
}

function disableManagedEnvKeysOutsideBlock(
  existing: string,
  managedKeys: ReadonlySet<string>,
): string {
  let insideManagedBlock = false;
  return existing
    .split("\n")
    .map((line) => {
      if (line === ENV_BLOCK_BEGIN) insideManagedBlock = true;
      if (line === ENV_BLOCK_END) {
        insideManagedBlock = false;
        return line;
      }
      if (insideManagedBlock) return line;

      const key = /^([A-Z0-9_]+)=/.exec(line)?.[1];
      if (!key || !managedKeys.has(key)) return line;
      return `# ${line}`;
    })
    .join("\n");
}

export function mergeManagedBridgeEnvBlock(existing: string, entries: EnvEntries): string {
  const block = managedEnvBlock(entries);
  const managedKeys = new Set(Object.keys(entries));
  const existingWithoutDuplicateKeys = disableManagedEnvKeysOutsideBlock(existing, managedKeys);
  const pattern = new RegExp(`${ENV_BLOCK_BEGIN}[\\s\\S]*?${ENV_BLOCK_END}`);
  const next = pattern.test(existingWithoutDuplicateKeys)
    ? existingWithoutDuplicateKeys.replace(pattern, block)
    : [existingWithoutDuplicateKeys.trimEnd(), block].filter(Boolean).join("\n\n");
  return `${next.trimEnd()}\n`;
}

function upsertManagedEnvBlock(profile: RuntimeProfile, entries: EnvEntries): void {
  const envPath = profileEnvPath(profile);
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  writeSecretFileAtomic(envPath, mergeManagedBridgeEnvBlock(existing, entries));
  console.log(`Updated ${envPath} with ${profile} public web bridge URLs.`);
}

function bridgePortFromEnv(profile: RuntimeProfile, entries: Record<string, string>): number {
  const raw = entries.AI_ASSISTANTS_WEB_BRIDGE_PORT?.trim();
  if (!raw) return localPortsForProfile(profile).webBridge;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65_000) {
    throw new Error(
      `AI_ASSISTANTS_WEB_BRIDGE_PORT must be an integer TCP port between 1024 and 65000; got ${JSON.stringify(raw)}.`,
    );
  }
  return port;
}

function requireSupabaseAnonKey(entries: Record<string, string>, profile: RuntimeProfile): string {
  const value = entries.SUPABASE_ANON_KEY?.trim();
  if (!value) {
    throw new Error(
      `SUPABASE_ANON_KEY is required in ${profileEnvPath(profile)}. Run npm run profile -- supabase start --profile=${profile} before npm run tunnel -- ${profile} env.`,
    );
  }
  return value;
}

function expectedProxyForBridgePort(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function webEndpointForHttps443(
  status: ServeStatus,
): { endpoint: string; handlers: Record<string, { Proxy?: string }> } | null {
  for (const [endpoint, entry] of Object.entries(status.Web ?? {})) {
    if (!endpoint.endsWith(`:${HTTPS_PORT}`)) continue;
    return { endpoint, handlers: entry.Handlers ?? {} };
  }
  return null;
}

export function serveStatusSummary(status: ServeStatus, bridgePort: number) {
  const expectedProxy = expectedProxyForBridgePort(bridgePort);
  const endpoint = webEndpointForHttps443(status);
  const rootProxy = endpoint?.handlers["/"]?.Proxy ?? null;
  const handlerPaths = endpoint ? Object.keys(endpoint.handlers).sort() : [];
  return {
    configured: rootProxy === expectedProxy && handlerPaths.length === 1,
    endpoint: endpoint?.endpoint ?? null,
    expectedProxy,
    handlerPaths,
    rootProxy,
  };
}

async function localBridgeHealth(port: number): Promise<Record<string, unknown>> {
  const url = `http://127.0.0.1:${port}${WEB_BRIDGE_HEALTH_PATH}`;
  try {
    const response = await timedFetch.fetch(url, { timeoutMs: LOCAL_BRIDGE_HEALTH_TIMEOUT_MS });
    return {
      ok: response.ok,
      status: response.status,
      url,
      body: await response.json().catch(() => null),
    };
  } catch (error) {
    return { ok: false, url, error: error instanceof Error ? error.message : String(error) };
  }
}

function envConsistency(
  profileEnv: Record<string, string>,
  expected: EnvEntries,
): Record<string, unknown> {
  const mismatches = Object.entries(expected)
    .filter(([key, value]) => profileEnv[key]?.trim() !== value)
    .map(([key, value]) => ({ key, expected: value, actual: profileEnv[key] ?? null }));
  return { ok: mismatches.length === 0, mismatches };
}

async function printStatus(input: {
  bridgePort: number;
  expectedEnv: EnvEntries;
  profile: RuntimeProfile;
  profileEnv: Record<string, string>;
  publicBaseUrl: string;
  serveStatus: ServeStatus;
  tailscale: TailscaleStatus;
  tailscaleServeBaseUrl: string | null;
}): Promise<void> {
  const serve = serveStatusSummary(input.serveStatus, input.bridgePort);
  console.log(
    JSON.stringify(
      {
        profile: input.profile,
        tailscale: {
          backendState: input.tailscale.BackendState ?? null,
          dnsName: input.tailscale.Self?.DNSName ?? null,
          health: input.tailscale.Health ?? [],
          ips: input.tailscale.TailscaleIPs ?? [],
        },
        publicBaseUrl: input.publicBaseUrl,
        tailscaleServeBaseUrl: input.tailscaleServeBaseUrl,
        bridge: await localBridgeHealth(input.bridgePort),
        serve,
        env: envConsistency(input.profileEnv, input.expectedEnv),
      },
      null,
      2,
    ),
  );
}

function assertSafeToOverwriteServe(status: ServeStatus, bridgePort: number, force: boolean): void {
  const summary = serveStatusSummary(status, bridgePort);
  if (!summary.endpoint || summary.configured) return;

  const details = `HTTPS ${HTTPS_PORT} currently has handlers ${summary.handlerPaths.join(", ") || "<none>"} with root proxy ${summary.rootProxy ?? "<none>"}.`;
  if (!force) {
    throw new Error(
      `Refusing to overwrite unrelated Tailscale Serve config. ${details} Re-run with --force if intentional.`,
    );
  }
}

function assertSafeToClearServe(status: ServeStatus, bridgePort: number, force: boolean): boolean {
  const summary = serveStatusSummary(status, bridgePort);
  if (!summary.endpoint) return false;
  if (summary.configured) return true;
  if (!force) {
    throw new Error(
      `Refusing to clear unrelated Tailscale Serve config on HTTPS ${HTTPS_PORT}. ` +
        `Handlers: ${summary.handlerPaths.join(", ") || "<none>"}, root proxy: ${summary.rootProxy ?? "<none>"}. Re-run with --force if intentional.`,
    );
  }
  return true;
}

export async function runProfileTailscaleCli(argv = process.argv.slice(2)): Promise<void> {
  const { action, profile, force } = parseSubcommandCli(argv, {
    options: {
      profile: { type: "string" },
      force: { type: "boolean" },
    },
    subcommands: ["status", "serve", "clear", "env"],
    schema: tailscaleCliSchema,
  });
  if (!isLocalSupabaseManagedProfile(profile)) {
    throw new Error(
      `Tailscale web bridge is local-only for dev. Configure your own public domains for ${profile}.`,
    );
  }

  if (!commandExists("tailscale")) {
    throw new Error(
      "tailscale command not found. Install and log in to Tailscale before exposing a local assistant profile.",
    );
  }

  const profileEnv = readDotEnvFile(profileEnvPath(profile));
  const bridgePort = bridgePortFromEnv(profile, profileEnv);
  const tailscale = readTailscaleStatus();
  const serveStatus = readServeStatus();
  const publicBaseUrl = publicBaseUrlForProfile(profile);
  const expectedEnv = managedBridgeEnvEntries({
    bridgePort,
    publicBaseUrl,
    supabaseAnonKey: profileEnv.SUPABASE_ANON_KEY?.trim() || "",
  });
  let tailscaleServeBaseUrl: string | null = null;
  try {
    tailscaleServeBaseUrl = tailscaleServeBaseUrlFromStatus(tailscale);
  } catch {
    // status can still report public env consistency; serve fails before configuring anything.
  }

  if (action === "status") {
    await printStatus({
      bridgePort,
      expectedEnv,
      profile,
      profileEnv,
      publicBaseUrl,
      serveStatus,
      tailscale,
      tailscaleServeBaseUrl,
    });
    return;
  }

  if (action === "clear") {
    if (!assertSafeToClearServe(serveStatus, bridgePort, force)) {
      console.log(`${profile} Tailscale Serve is already clear for HTTPS ${HTTPS_PORT}.`);
      return;
    }
    runInherited("tailscale", ["serve", `--https=${HTTPS_PORT}`, "off"]);
    return;
  }

  if (action === "env") {
    const supabaseAnonKey = requireSupabaseAnonKey(profileEnv, profile);
    const entries = managedBridgeEnvEntries({
      bridgePort,
      publicBaseUrl,
      supabaseAnonKey,
    });
    upsertManagedEnvBlock(profile, entries);
    await printStatus({
      bridgePort,
      expectedEnv: entries,
      profile,
      profileEnv: { ...profileEnv, ...entries },
      publicBaseUrl,
      serveStatus,
      tailscale,
      tailscaleServeBaseUrl,
    });
    return;
  }

  assertTailscaleRunning(tailscale);
  tailscaleServeBaseUrl = tailscaleServeBaseUrlFromStatus(tailscale);
  const supabaseAnonKey = requireSupabaseAnonKey(profileEnv, profile);
  const entries = managedBridgeEnvEntries({
    bridgePort,
    publicBaseUrl,
    supabaseAnonKey,
  });
  assertSafeToOverwriteServe(serveStatus, bridgePort, force);
  upsertManagedEnvBlock(profile, entries);
  runInherited("tailscale", [
    "serve",
    "--bg",
    "--yes",
    `--https=${HTTPS_PORT}`,
    expectedProxyForBridgePort(bridgePort),
  ]);
  await printStatus({
    bridgePort,
    expectedEnv: entries,
    profile,
    profileEnv: { ...profileEnv, ...entries },
    publicBaseUrl,
    serveStatus: readServeStatus(),
    tailscale,
    tailscaleServeBaseUrl,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runProfileTailscaleCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
