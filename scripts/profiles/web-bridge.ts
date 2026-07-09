#!/usr/bin/env tsx

import http, {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import net from "node:net";
import type { Duplex } from "node:stream";
import { pathToFileURL } from "node:url";
import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { z } from "zod";
import { parseSubcommandCli, timedFetch } from "@ai-assistants/workspace-shared";
import { envForProfile } from "./profile";
import { localPortsForProfile } from "./profile-ports";

export const WEB_BRIDGE_HEALTH_PATH = "/__ai_assistants_bridge/health";
const WEB_BRIDGE_HEALTH_TIMEOUT_MS = 3_000;

type BridgeAction = "serve";

type BridgeUpstreams = {
  backend: URL;
  portal: URL;
  supabase: URL;
};

type WebBridgeConfig = {
  host: "127.0.0.1";
  port: number;
  profile: RuntimeProfile;
  supabaseAnonKey: string;
  upstreams: BridgeUpstreams;
};

type BridgeProxyRoute = {
  kind: "proxy";
  name: "backend" | "portal" | "supabaseAuth";
  targetUrl: URL;
};

type BridgeBlockedRoute = {
  kind: "blocked";
  message: string;
  status: number;
};

type BridgeRoute = BridgeProxyRoute | BridgeBlockedRoute;

type ParsedArgs = {
  action: BridgeAction;
  profile: RuntimeProfile;
};

const webBridgeCliSchema = z
  .object({
    action: z.literal("serve"),
    profile: z.string().min(1),
  })
  .transform(({ action, profile }) => {
    assertRuntimeProfile(profile);
    return { action, profile: profile as RuntimeProfile };
  });

function parseArgs(args: readonly string[]): ParsedArgs {
  return parseSubcommandCli(args, {
    options: { profile: { type: "string" } },
    subcommands: ["serve"],
    schema: webBridgeCliSchema,
  });
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required before starting the Connect web bridge.`);
  return value;
}

function parsePort(value: string, label: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65_000) {
    throw new Error(
      `${label} must be an integer TCP port between 1024 and 65000; got ${JSON.stringify(value)}.`,
    );
  }
  return port;
}

function requireLoopbackHttpUrl(raw: string, label: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:") {
    throw new Error(`${label} must be an http:// loopback URL; got ${JSON.stringify(raw)}.`);
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(`${label} must point at 127.0.0.1 or localhost; got ${JSON.stringify(raw)}.`);
  }
  url.hash = "";
  return url;
}

function bridgeConfigFromEnv(
  profile: RuntimeProfile,
  env: NodeJS.ProcessEnv,
): WebBridgeConfig {
  const ports = localPortsForProfile(profile);
  const bridgePortRaw =
    env.AI_ASSISTANTS_WEB_BRIDGE_PORT?.trim() || String(ports.webBridge);
  return {
    host: "127.0.0.1",
    port: parsePort(bridgePortRaw, "AI_ASSISTANTS_WEB_BRIDGE_PORT"),
    profile,
    supabaseAnonKey: requiredEnv(env, "SUPABASE_ANON_KEY"),
    upstreams: {
      backend: requireLoopbackHttpUrl(
        requiredEnv(env, "AI_ASSISTANTS_BACKEND_URL"),
        "AI_ASSISTANTS_BACKEND_URL",
      ),
      portal: requireLoopbackHttpUrl(
        env.AI_ASSISTANTS_CONNECT_LOCAL_URL?.trim() || `http://127.0.0.1:${ports.connect}`,
        "AI_ASSISTANTS_CONNECT_LOCAL_URL",
      ),
      supabase: requireLoopbackHttpUrl(requiredEnv(env, "SUPABASE_URL"), "SUPABASE_URL"),
    },
  };
}

function bridgeConfigFromProfile(profile: RuntimeProfile): WebBridgeConfig {
  return bridgeConfigFromEnv(profile, envForProfile(profile));
}

function targetUrl(base: URL, pathname: string, search: string): URL {
  return new URL(`${pathname}${search}`, base);
}

function routeBridgeRequest(
  rawUrl: string | undefined,
  upstreams: BridgeUpstreams,
): BridgeRoute {
  const incoming = new URL(rawUrl || "/", "http://ai-assistants.local");
  const { pathname, search } = incoming;

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    const backendPath = pathname === "/api" ? "/" : pathname.slice("/api".length);
    return {
      kind: "proxy",
      name: "backend",
      targetUrl: targetUrl(upstreams.backend, backendPath, search),
    };
  }

  if (pathname === "/oauth" || pathname.startsWith("/oauth/")) {
    return {
      kind: "proxy",
      name: "backend",
      targetUrl: targetUrl(upstreams.backend, pathname, search),
    };
  }

  if (pathname === "/supabase/auth/v1" || pathname.startsWith("/supabase/auth/v1/")) {
    const supabasePath = pathname.slice("/supabase".length);
    return {
      kind: "proxy",
      name: "supabaseAuth",
      targetUrl: targetUrl(upstreams.supabase, supabasePath, search),
    };
  }

  if (pathname === "/supabase" || pathname.startsWith("/supabase/")) {
    return {
      kind: "blocked",
      status: 403,
      message: "Only /supabase/auth/v1/* is exposed through the Connect web bridge.",
    };
  }

  return {
    kind: "proxy",
    name: "portal",
    targetUrl: targetUrl(upstreams.portal, pathname, search),
  };
}

function routeBridgeUpgrade(
  rawUrl: string | undefined,
  upstreams: BridgeUpstreams,
): BridgeRoute {
  const route = routeBridgeRequest(rawUrl, upstreams);
  if (route.kind === "blocked" || route.name === "portal") return route;
  return {
    kind: "blocked",
    status: 400,
    message: "Only Connect portal websocket upgrades are supported through the Connect web bridge.",
  };
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload)}\n`);
}

function proxyRequestHeaders(
  incoming: IncomingHttpHeaders,
  target: URL,
  routeName: BridgeProxyRoute["name"],
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = { ...incoming };
  delete headers.connection;
  delete headers.host;
  delete headers["proxy-authenticate"];
  delete headers["proxy-authorization"];
  delete headers.te;
  delete headers.trailer;
  delete headers["transfer-encoding"];
  delete headers.upgrade;

  headers.host = target.host;
  headers["x-ai-assistants-bridge-target"] = routeName;
  if (incoming.host) headers["x-forwarded-host"] = incoming.host;
  if (!headers["x-forwarded-proto"]) headers["x-forwarded-proto"] = "http";
  return headers;
}

function proxyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  route: BridgeProxyRoute,
): void {
  const upstream = http.request(
    route.targetUrl,
    {
      headers: proxyRequestHeaders(req.headers, route.targetUrl, route.name),
      method: req.method,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    json(res, 502, {
      ok: false,
      error: `Connect web bridge could not reach ${route.name} at ${route.targetUrl.origin}.`,
      detail: error instanceof Error ? error.message : String(error),
    });
  });

  req.pipe(upstream);
}

function renderUpgradeRequest(req: IncomingMessage, route: BridgeProxyRoute): string {
  const headers = proxyRequestHeaders(req.headers, route.targetUrl, route.name);
  headers.connection = "Upgrade";
  headers.upgrade = req.headers.upgrade || "websocket";

  const lines = [
    `${req.method || "GET"} ${route.targetUrl.pathname}${route.targetUrl.search} HTTP/${req.httpVersion}`,
  ];
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) lines.push(`${name}: ${item}`);
    } else if (value !== undefined) {
      lines.push(`${name}: ${value}`);
    }
  }
  return `${lines.join("\r\n")}\r\n\r\n`;
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  const body = `${JSON.stringify({ ok: false, error: message })}\n`;
  socket.end(
    [
      `HTTP/1.1 ${status} ${status === 403 ? "Forbidden" : "Bad Request"}`,
      "content-type: application/json; charset=utf-8",
      `content-length: ${Buffer.byteLength(body)}`,
      "connection: close",
      "",
      body,
    ].join("\r\n"),
  );
}

function proxyUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  route: BridgeProxyRoute,
): void {
  const upstream = net.connect(Number(route.targetUrl.port || 80), route.targetUrl.hostname);
  upstream.on("connect", () => {
    upstream.write(renderUpgradeRequest(req, route));
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", (error) => {
    rejectUpgrade(
      socket,
      502,
      `Connect web bridge could not open websocket upstream: ${error.message}`,
    );
  });
  socket.on("error", () => upstream.destroy());
}

async function checkHttp(
  name: string,
  url: URL,
  headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  try {
    const response = await timedFetch.fetch(url, {
      timeoutMs: WEB_BRIDGE_HEALTH_TIMEOUT_MS,
      headers,
    });
    return { name, ok: response.ok, status: response.status, url: url.toString() };
  } catch (error) {
    return {
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      url: url.toString(),
    };
  }
}

async function bridgeHealth(config: WebBridgeConfig): Promise<Record<string, unknown>> {
  const upstreams = [
    await checkHttp("portal", new URL("/", config.upstreams.portal)),
    await checkHttp("backend", new URL("/health", config.upstreams.backend)),
    await checkHttp("supabaseAuth", new URL("/auth/v1/settings", config.upstreams.supabase), {
      apikey: config.supabaseAnonKey,
    }),
  ];
  return {
    ok: upstreams.every((item) => item.ok === true),
    profile: config.profile,
    bridge: { host: config.host, port: config.port },
    upstreams,
  };
}

function createWebBridgeServer(config: WebBridgeConfig): Server {
  const server = http.createServer(async (req, res) => {
    if (new URL(req.url || "/", "http://ai-assistants.local").pathname === WEB_BRIDGE_HEALTH_PATH) {
      const payload = await bridgeHealth(config);
      json(res, payload.ok === true ? 200 : 503, payload);
      return;
    }

    const route = routeBridgeRequest(req.url, config.upstreams);
    if (route.kind === "blocked") {
      json(res, route.status, { ok: false, error: route.message });
      return;
    }
    proxyHttpRequest(req, res, route);
  });

  server.on("upgrade", (req, socket, head) => {
    const route = routeBridgeUpgrade(req.url, config.upstreams);
    if (route.kind === "blocked") {
      rejectUpgrade(socket, route.status, route.message);
      return;
    }
    proxyUpgrade(req, socket, head, route);
  });

  return server;
}

async function serve(config: WebBridgeConfig): Promise<void> {
  const server = createWebBridgeServer(config);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve());
  });
  console.log(
    `Connect web bridge for ${config.profile} listening on http://${config.host}:${config.port}`,
  );
  const keepAlive = setInterval(() => {
    // Keep the CLI process alive after startup; launch managers own shutdown.
  }, 60_000);
  await new Promise<void>((resolve) => {
    server.once("close", () => {
      clearInterval(keepAlive);
      resolve();
    });
  });
}

async function main(): Promise<void> {
  const { action, profile } = parseArgs(process.argv.slice(2));
  if (action === "serve") {
    await serve(bridgeConfigFromProfile(profile));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
