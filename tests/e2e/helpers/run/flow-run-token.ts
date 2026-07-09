import { randomUUID } from "node:crypto";

/** Stable correlation token for E2E markers (short, URL-safe). */
export function newFlowRunToken(): string {
  const raw = randomUUID().replace(/-/g, "");
  return `cf${raw.slice(0, 14)}`;
}
