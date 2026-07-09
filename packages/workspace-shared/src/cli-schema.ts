import path from "node:path";
import { assertRuntimeProfile, type RuntimeProfile } from "@ai-assistants/repo-layout";

export function optionalProfileFlag(raw: unknown): RuntimeProfile | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") throw new Error("--profile must be a string.");
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  assertRuntimeProfile(trimmed);
  return trimmed;
}

export function optionalConfigPathFlag(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") throw new Error("--config must be a string path.");
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return path.resolve(trimmed);
}
