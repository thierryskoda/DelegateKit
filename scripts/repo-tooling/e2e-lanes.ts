import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "@ai-assistants/repo-layout";
import { readDotEnvFile } from "@ai-assistants/workspace-shared";
import { writeSecretFileAtomic } from "../profiles/profile-env-blocks";
import type {
  E2eLaneRuntime,
  E2eLaneRuntimeMetadata,
  E2eLaneSupabasePorts,
} from "./e2e-lane-runtime";

type E2eLaneId = "e2e-lane-1" | "e2e-lane-2";

export type E2eLaneConfig = {
  id: E2eLaneId;
  projectId: string;
  dockerContext: string;
  runtimeRoot: string;
  envPath: string;
  supabaseWorkdir: string;
  metadataPath: string;
  ports: E2eLaneSupabasePorts;
};

const LANES_ROOT = path.join(os.homedir(), ".ai-assistants-e2e-lanes");
const SOURCE_ENV_FILE = ".env.e2e";
const LANE_MANAGED_ENV_KEYS = new Set([
  "SUPABASE_LOCAL_WORKDIR",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
]);

const LANE_PORTS: Record<E2eLaneId, E2eLaneSupabasePorts> = {
  "e2e-lane-1": {
    shadow: 56_320,
    api: 56_321,
    db: 56_322,
    studio: 56_323,
    inbucket: 56_324,
    analytics: 56_327,
    pooler: 56_329,
  },
  "e2e-lane-2": {
    shadow: 56_400,
    api: 56_401,
    db: 56_402,
    studio: 56_403,
    inbucket: 56_404,
    analytics: 56_407,
    pooler: 56_409,
  },
};
const ENABLED_LANE_IDS = ["e2e-lane-1", "e2e-lane-2"] as const satisfies readonly E2eLaneId[];
const LANE_DOCKER_CONTEXTS = {
  "e2e-lane-1": "colima-e2e-lane-1",
  "e2e-lane-2": "colima-e2e-lane-2",
} as const satisfies Record<E2eLaneId, string>;

function e2eLaneConfigForId(root: string, id: E2eLaneId): E2eLaneConfig {
  const runtimeRoot = path.join(root, id);
  return {
    id,
    projectId: `code-${id}`,
    dockerContext: LANE_DOCKER_CONTEXTS[id],
    runtimeRoot,
    envPath: path.join(runtimeRoot, ".env"),
    supabaseWorkdir: runtimeRoot,
    metadataPath: path.join(runtimeRoot, "lane-runtime.json"),
    ports: LANE_PORTS[id],
  };
}

export function e2eLanesRoot(): string {
  mkdirSync(LANES_ROOT, { recursive: true, mode: 0o700 });
  return LANES_ROOT;
}

export function allE2eLaneConfigs(): readonly E2eLaneConfig[] {
  const root = e2eLanesRoot();
  return ENABLED_LANE_IDS.map((id) => e2eLaneConfigForId(root, id));
}

export function allKnownE2eLaneConfigs(): readonly E2eLaneConfig[] {
  const root = e2eLanesRoot();
  return (Object.keys(LANE_PORTS) as E2eLaneId[]).map((id) => e2eLaneConfigForId(root, id));
}

export function getE2eLaneConfig(laneId: string): E2eLaneConfig {
  const lane = allE2eLaneConfigs().find((candidate) => candidate.id === laneId);
  if (!lane) {
    throw new Error(
      `Unknown E2E lane ${JSON.stringify(laneId)}. Configured lanes: ${allE2eLaneConfigs()
        .map((candidate) => candidate.id)
        .join(", ")}.`,
    );
  }
  return lane;
}

export function validateE2eLaneConfig(): void {
  const seen = new Map<string, string>();
  for (const lane of allE2eLaneConfigs()) {
    const checks: Array<[string, string | number]> = [
      ["projectId", lane.projectId],
      ["dockerContext", lane.dockerContext],
      ["runtimeRoot", lane.runtimeRoot],
      ["envPath", lane.envPath],
      ["supabaseWorkdir", lane.supabaseWorkdir],
      ...Object.entries(lane.ports).map(
        ([name, port]) => [`port.${name}`, port] as [string, string | number],
      ),
    ];
    for (const [name, value] of checks) {
      const key = `${name}:${value}`;
      const owner = seen.get(key);
      if (owner) {
        throw new Error(`Duplicate E2E lane config value ${key} used by ${owner} and ${lane.id}.`);
      }
      seen.set(key, lane.id);
    }
  }
}

function sourceEnvPath(): string {
  return path.join(repoRoot(import.meta.url), SOURCE_ENV_FILE);
}

function sourceEnvText(): string {
  const source = sourceEnvPath();
  if (!existsSync(source)) {
    throw new Error(`Missing ${SOURCE_ENV_FILE}; E2E lanes need it as the source env.`);
  }
  return `${readFileSync(source, "utf8").trimEnd()}\n`;
}

function sourceEnvAssignments(): Map<string, string> {
  const assignments = new Map<string, string>();
  for (const line of sourceEnvText().split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1]!;
    if (LANE_MANAGED_ENV_KEYS.has(key)) continue;
    assignments.set(key, trimmed);
  }
  return assignments;
}

function mergeSourceEnvAssignmentsIntoLane(existingText: string): string {
  const sourceAssignments = sourceEnvAssignments();
  const pending = new Set(sourceAssignments.keys());
  const nextLines: string[] = [];

  for (const line of existingText.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    const key = match?.[1];
    if (!key || !sourceAssignments.has(key)) {
      nextLines.push(line);
      continue;
    }
    if (!pending.has(key)) continue;
    nextLines.push(sourceAssignments.get(key)!);
    pending.delete(key);
  }

  const missingLines = [...pending].map((key) => sourceAssignments.get(key)!);
  const merged = [...nextLines, ...(missingLines.length > 0 ? ["", ...missingLines] : [])]
    .join("\n")
    .trimEnd();
  return `${merged}\n`;
}

function syncSourceEnvIntoLane(lane: E2eLaneConfig): void {
  const existing = existsSync(lane.envPath) ? readFileSync(lane.envPath, "utf8") : "";
  const next = existing.trim() ? mergeSourceEnvAssignmentsIntoLane(existing) : sourceEnvText();
  if (next === existing) return;
  writeSecretFileAtomic(lane.envPath, next);
}

function assertLaneEnvMatchesSource(lane: E2eLaneConfig): void {
  const sourceEnv = readDotEnvFile(sourceEnvPath());
  const laneEnv = readDotEnvFile(lane.envPath);
  const missingOrStale = Object.entries(sourceEnv)
    .filter(([key]) => !LANE_MANAGED_ENV_KEYS.has(key))
    .filter(([key, value]) => laneEnv[key] !== value)
    .map(([key]) => key)
    .sort((left, right) => left.localeCompare(right));

  if (missingOrStale.length === 0) return;
  throw new Error(
    [
      `E2E lane ${lane.id} env is missing or stale source key(s): ${missingOrStale.join(", ")}.`,
      `Source: ${sourceEnvPath()}`,
      `Lane: ${lane.envPath}`,
      "Lane-managed Supabase keys are intentionally excluded from this check.",
    ].join(" "),
  );
}

export function materializeE2eLaneRuntime(lane: E2eLaneConfig): E2eLaneRuntime {
  mkdirSync(lane.runtimeRoot, { recursive: true, mode: 0o700 });
  syncSourceEnvIntoLane(lane);
  assertLaneEnvMatchesSource(lane);
  const runtime = e2eRuntimeForLane(lane);
  const metadata = {
    kind: "ai-assistants.e2e.lane-runtime",
    runId: lane.id,
    projectId: lane.projectId,
    dockerContext: lane.dockerContext,
    runtimeRoot: lane.runtimeRoot,
    envPath: lane.envPath,
    supabaseWorkdir: lane.supabaseWorkdir,
    ports: lane.ports,
    createdAt: "2026-06-06T00:00:00.000Z",
    pid: process.pid,
    cwd: process.cwd(),
  } satisfies E2eLaneRuntimeMetadata;
  writeFileSync(lane.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
  return runtime;
}

export function e2eRuntimeForLane(lane: E2eLaneConfig): E2eLaneRuntime {
  return {
    runId: lane.id,
    shortId: lane.id,
    projectId: lane.projectId,
    dockerContext: lane.dockerContext,
    runtimeRoot: lane.runtimeRoot,
    envPath: lane.envPath,
    supabaseWorkdir: lane.supabaseWorkdir,
    ports: lane.ports,
    metadataPath: lane.metadataPath,
  };
}

export function envForE2eLaneRuntime(lane: E2eLaneConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...readDotEnvFile(lane.envPath),
    AI_ASSISTANTS_E2E_PROFILE_ENV_PATH: lane.envPath,
    AI_ASSISTANTS_E2E_PROFILE_RUNTIME_ROOT: lane.runtimeRoot,
    AI_ASSISTANTS_E2E_SUPABASE_WORKDIR: lane.supabaseWorkdir,
    AI_ASSISTANTS_E2E_SUPABASE_PROJECT_ID: lane.projectId,
    AI_ASSISTANTS_E2E_LANE_ID: lane.id,
    AI_ASSISTANTS_E2E_DOCKER_CONTEXT: lane.dockerContext,
    DOCKER_CONTEXT: lane.dockerContext,
    AI_ASSISTANTS_E2E_RUN_ID: lane.id,
    AI_ASSISTANTS_RUNTIME_DIR: lane.runtimeRoot,
  };
}
