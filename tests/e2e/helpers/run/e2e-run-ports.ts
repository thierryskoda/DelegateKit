import { randomUUID } from "node:crypto";
import net from "node:net";

export const RUN_ID_RE = /^[a-z0-9][a-z0-9-]{2,80}$/;
export const AGENT_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export function sanitizeId(value: string, label: string, pattern: RegExp): string {
  const trimmed = value.trim();
  if (!pattern.test(trimmed)) {
    throw new Error(`${label} must match ${String(pattern)}; got ${JSON.stringify(value)}.`);
  }
  return trimmed;
}

export function generatedRunId(label: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  const safeLabel = label
    .replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase()
    .slice(0, 24)
    .replace(/^-+|-+$/g, "");
  const labelSegment = safeLabel ? `-${safeLabel}` : "";
  return `e2e-${stamp}${labelSegment}-${randomUUID().slice(0, 8)}`;
}

async function isPortFree(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

export async function allocateFreePort(label: string): Promise<number> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const port = 20_000 + Math.floor(Math.random() * 40_000);
    if (await isPortFree(port)) return port;
  }
  throw new Error(`Could not allocate a free E2E ${label} port after 80 attempts.`);
}
