#!/usr/bin/env tsx

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  connectPublicConfigPath,
  type ConnectPublicConfig,
} from "@ai-assistants/connect-api-contracts/public-config";
import { repoRoot } from "@ai-assistants/repo-layout";
import { parseConnectWebEnv } from "@ai-assistants/workspace-shared/env";
import { buildConnectPublicConfig } from "./connect-public-config";

function readArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(prefix));
  if (equalsArg) return equalsArg.slice(prefix.length);
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function contentType(filePath: string): string {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

export function startConnectStaticServer(input: {
  port: number;
  root?: string;
  serviceName?: string;
  config?: ConnectPublicConfig;
}): void {
  const root = input.root ?? path.join(repoRoot(import.meta.url), "dist", "apps", "connect");
  const indexPath = path.join(root, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(
      "Connect build output is missing. Run npm run build before starting connect-web.",
    );
  }
  const publicConfig = input.config ?? buildConnectPublicConfig();
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: input.serviceName ?? "connect-web" }));
      return;
    }
    if (url.pathname === connectPublicConfigPath) {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(publicConfig));
      return;
    }
    const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const candidate = path.join(root, requested === "/" ? "index.html" : requested);
    const filePath = existsSync(candidate) && statSync(candidate).isFile() ? candidate : indexPath;
    res.writeHead(200, { "content-type": contentType(filePath) });
    createReadStream(filePath).pipe(res);
  });
  server.listen(input.port, "0.0.0.0", () => {
    console.log(`Connect static server listening on 0.0.0.0:${input.port}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const env = parseConnectWebEnv();
  const port = Number(readArg("port", String(env.port)));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `--port must be an integer TCP port; got ${JSON.stringify(readArg("port", ""))}.`,
    );
  }
  startConnectStaticServer({ port });
}
