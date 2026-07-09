import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  allE2eLaneConfigs,
  e2eLanesRoot,
  e2eRuntimeForLane,
  materializeE2eLaneRuntime,
  validateE2eLaneConfig,
  type E2eLaneConfig,
} from "./e2e-lanes";
import { withRepoLock } from "./repo-lock";

const E2E_LANE_LOCK = "e2e-worker-lanes";
const HEARTBEAT_MS = 5_000;
const ACQUIRE_POLL_MS = 2_000;
const ACQUIRE_TIMEOUT_MS = 20 * 60_000;
const WAIT_LOG_MS = 30_000;

const laneStateNameSchema = z.enum([
  "missing",
  "stopped",
  "starting",
  "resetting",
  "ready",
  "leased",
  "dirty",
  "quarantined",
]);

const laneRecordSchema = z.object({
  laneId: z.string().min(1),
  projectId: z.string().min(1),
  dockerContext: z.string().min(1).optional(),
  state: laneStateNameSchema,
  generation: z.number().int().nonnegative(),
  leaseToken: z.string().min(1).optional(),
  ownerPid: z.number().int().optional(),
  ownerCommand: z.string().optional(),
  leasedAt: z.string().optional(),
  heartbeatAt: z.string().optional(),
  lastPrepareAt: z.string().optional(),
  lastResetAt: z.string().optional(),
  preparedFingerprint: z.string().min(1).optional(),
  lastResetMode: z.enum(["full", "data"]).optional(),
  lastDiagnosticsPath: z.string().optional(),
  quarantineReason: z.string().optional(),
  updatedAt: z.string().min(1),
});

const laneStateFileSchema = z.object({
  kind: z.literal("ai-assistants.e2e.worker-lanes"),
  version: z.literal(1),
  updatedAt: z.string().min(1),
  lanes: z.array(laneRecordSchema),
});

export type E2eLaneRecord = z.infer<typeof laneRecordSchema>;
export type E2eLaneStateFile = z.infer<typeof laneStateFileSchema>;

export type E2eLaneLease = {
  lane: E2eLaneConfig;
  runtime: ReturnType<typeof e2eRuntimeForLane>;
  leaseToken: string;
  generation: number;
  preparedFingerprint?: string;
  heartbeat: () => void;
  markResetComplete: (metadata?: {
    preparedFingerprint?: string;
    resetMode?: "full" | "data";
  }) => Promise<void>;
  releaseReady: () => Promise<void>;
  markDirty: (reason: string) => Promise<void>;
  quarantine: (reason: string, diagnosticsPath?: string) => Promise<void>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function commandLabel(): string {
  return process.argv.join(" ");
}

function statePath(): string {
  const root = e2eLanesRoot();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return path.join(root, "lane-state.json");
}

function processIsAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function emptyState(): E2eLaneStateFile {
  return {
    kind: "ai-assistants.e2e.worker-lanes",
    version: 1,
    updatedAt: nowIso(),
    lanes: [],
  };
}

function defaultRecord(lane: E2eLaneConfig): E2eLaneRecord {
  return {
    laneId: lane.id,
    projectId: lane.projectId,
    dockerContext: lane.dockerContext,
    state: existsSync(lane.metadataPath) ? "stopped" : "missing",
    generation: 0,
    updatedAt: nowIso(),
  };
}

export function readE2eLaneState(): E2eLaneStateFile {
  validateE2eLaneConfig();
  const filePath = statePath();
  if (!existsSync(filePath)) return hydrateConfiguredLanes(emptyState());
  try {
    return hydrateConfiguredLanes(
      laneStateFileSchema.parse(JSON.parse(readFileSync(filePath, "utf8"))),
    );
  } catch (error) {
    throw new Error(
      `Malformed E2E lane state file at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function writeE2eLaneState(state: E2eLaneStateFile): void {
  writeFileSync(statePath(), `${JSON.stringify({ ...state, updatedAt: nowIso() }, null, 2)}\n`, {
    mode: 0o600,
  });
}

function hydrateConfiguredLanes(state: E2eLaneStateFile): E2eLaneStateFile {
  const lanesById = new Map(state.lanes.map((lane) => [lane.laneId, lane]));
  return {
    ...state,
    lanes: allE2eLaneConfigs().map((lane) => {
      const record = lanesById.get(lane.id);
      if (!record) return defaultRecord(lane);
      if (record.projectId !== lane.projectId || record.dockerContext !== lane.dockerContext) {
        return defaultRecord(lane);
      }
      return { ...record, dockerContext: lane.dockerContext };
    }),
  };
}

function recoverDeadLeases(state: E2eLaneStateFile): E2eLaneStateFile {
  return {
    ...state,
    lanes: state.lanes.map((record) => {
      if (record.state !== "leased" || processIsAlive(record.ownerPid)) return record;
      return {
        ...record,
        state: "dirty",
        leaseToken: undefined,
        ownerPid: undefined,
        ownerCommand: undefined,
        leasedAt: undefined,
        heartbeatAt: undefined,
        quarantineReason: `Owner pid ${record.ownerPid ?? "<unknown>"} died before releasing lane.`,
        updatedAt: nowIso(),
      };
    }),
  };
}

export async function updateE2eLaneState<T>(
  update: (state: E2eLaneStateFile) => { state: E2eLaneStateFile; result: T },
): Promise<T> {
  return await withRepoLock(E2E_LANE_LOCK, async () => {
    const current = recoverDeadLeases(readE2eLaneState());
    const { state, result } = update(current);
    writeE2eLaneState(state);
    return result;
  });
}

export async function initializeE2eLanes(): Promise<E2eLaneStateFile> {
  return await updateE2eLaneState((state) => {
    for (const lane of allE2eLaneConfigs()) materializeE2eLaneRuntime(lane);
    const nextState: E2eLaneStateFile = {
      ...state,
      lanes: allE2eLaneConfigs().map((lane) => {
        const existing = state.lanes.find((record) => record.laneId === lane.id);
        const record = existing ?? defaultRecord(lane);
        return {
          ...record,
          laneId: lane.id,
          projectId: lane.projectId,
          dockerContext: lane.dockerContext,
          state: record.state === "missing" ? "stopped" : record.state,
          updatedAt: nowIso(),
        };
      }),
    };
    return {
      state: nextState,
      result: nextState,
    };
  });
}

function leaseRecord(record: E2eLaneRecord): E2eLaneRecord {
  return {
    ...record,
    state: "leased",
    generation: record.generation + 1,
    leaseToken: randomUUID(),
    ownerPid: process.pid,
    ownerCommand: commandLabel(),
    leasedAt: nowIso(),
    heartbeatAt: nowIso(),
    quarantineReason: undefined,
    updatedAt: nowIso(),
  };
}

function assertLease(
  record: E2eLaneRecord,
  lease: Pick<E2eLaneLease, "generation" | "leaseToken" | "lane">,
): void {
  if (record.generation !== lease.generation || record.leaseToken !== lease.leaseToken) {
    throw new Error(`E2E lane lease fencing token no longer matches for ${lease.lane.id}.`);
  }
}

export async function acquireE2eLaneLease(input: { wait: boolean }): Promise<E2eLaneLease> {
  const startedAt = Date.now();
  let lastWaitLogAt = 0;
  while (true) {
    const leasedRecord = await updateE2eLaneState((state) => {
      const index = state.lanes.findIndex((lane) => lane.state === "ready");
      if (index < 0) return { state, result: null };
      const next = leaseRecord(state.lanes[index]!);
      const lanes = [...state.lanes];
      lanes[index] = next;
      return { state: { ...state, lanes }, result: next };
    });
    if (leasedRecord) return createLease(leasedRecord);
    const snapshot = readE2eLaneState();
    if (!input.wait || Date.now() - startedAt > ACQUIRE_TIMEOUT_MS) {
      throw new Error(formatNoReadyLaneMessage(snapshot));
    }
    if (Date.now() - lastWaitLogAt >= WAIT_LOG_MS) {
      console.warn(formatNoReadyLaneMessage(snapshot, Date.now() - startedAt));
      lastWaitLogAt = Date.now();
    }
    await new Promise((resolve) => setTimeout(resolve, ACQUIRE_POLL_MS));
  }
}

function createLease(record: E2eLaneRecord): E2eLaneLease {
  const lane = allE2eLaneConfigs().find((candidate) => candidate.id === record.laneId);
  if (!lane) throw new Error(`Lane record ${record.laneId} is not configured.`);
  const runtime = e2eRuntimeForLane(lane);
  let timer: NodeJS.Timeout | null = setInterval(() => {
    void updateLeaseRecord(
      { lane, leaseToken: record.leaseToken!, generation: record.generation },
      (current) => ({
        ...current,
        heartbeatAt: nowIso(),
        updatedAt: nowIso(),
      }),
    ).catch(() => undefined);
  }, HEARTBEAT_MS);
  timer.unref();

  const stopHeartbeat = (): void => {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  };

  const lease: E2eLaneLease = {
    lane,
    runtime,
    leaseToken: record.leaseToken!,
    generation: record.generation,
    preparedFingerprint: record.preparedFingerprint,
    heartbeat: () => {
      void updateLeaseRecord(lease, (current) => ({
        ...current,
        heartbeatAt: nowIso(),
        updatedAt: nowIso(),
      }));
    },
    markResetComplete: async (metadata = {}) => {
      await updateLeaseRecord(lease, (current) => ({
        ...current,
        lastResetAt: nowIso(),
        preparedFingerprint: metadata.preparedFingerprint ?? current.preparedFingerprint,
        lastResetMode: metadata.resetMode ?? current.lastResetMode,
        updatedAt: nowIso(),
      }));
    },
    releaseReady: async () => {
      stopHeartbeat();
      await updateLeaseRecord(lease, (current) => ({
        ...current,
        state: "ready",
        leaseToken: undefined,
        ownerPid: undefined,
        ownerCommand: undefined,
        leasedAt: undefined,
        heartbeatAt: undefined,
        updatedAt: nowIso(),
      }));
    },
    markDirty: async (reason: string) => {
      stopHeartbeat();
      await updateLeaseRecord(lease, (current) => ({
        ...current,
        state: "dirty",
        quarantineReason: reason,
        leaseToken: undefined,
        ownerPid: undefined,
        ownerCommand: undefined,
        leasedAt: undefined,
        heartbeatAt: undefined,
        updatedAt: nowIso(),
      }));
    },
    quarantine: async (reason: string, diagnosticsPath?: string) => {
      stopHeartbeat();
      await updateLeaseRecord(lease, (current) => ({
        ...current,
        state: "quarantined",
        quarantineReason: reason,
        lastDiagnosticsPath: diagnosticsPath ?? current.lastDiagnosticsPath,
        leaseToken: undefined,
        ownerPid: undefined,
        ownerCommand: undefined,
        leasedAt: undefined,
        heartbeatAt: undefined,
        updatedAt: nowIso(),
      }));
    },
  };
  return lease;
}

async function updateLeaseRecord(
  lease: Pick<E2eLaneLease, "generation" | "leaseToken" | "lane">,
  update: (record: E2eLaneRecord) => E2eLaneRecord,
): Promise<void> {
  await updateE2eLaneState((state) => {
    const index = state.lanes.findIndex((record) => record.laneId === lease.lane.id);
    if (index < 0) return { state, result: undefined };
    assertLease(state.lanes[index]!, lease);
    const lanes = [...state.lanes];
    lanes[index] = update(state.lanes[index]!);
    return { state: { ...state, lanes }, result: undefined };
  });
}

export async function markLanePreparing(lane: E2eLaneConfig): Promise<number> {
  return await updateE2eLaneState((state) => {
    const index = state.lanes.findIndex((record) => record.laneId === lane.id);
    const current = state.lanes[index] ?? defaultRecord(lane);
    if (
      current.state === "leased" ||
      current.state === "starting" ||
      current.state === "resetting"
    ) {
      throw new Error(
        `Refusing to prepare active E2E lane ${lane.id} in state ${current.state}. Owner pid: ${
          current.ownerPid ?? "<none>"
        }.`,
      );
    }
    const generation = current.generation + 1;
    const lanes = [...state.lanes];
    lanes[index] = {
      ...current,
      laneId: lane.id,
      projectId: lane.projectId,
      state: "resetting",
      generation,
      leaseToken: randomUUID(),
      ownerPid: process.pid,
      ownerCommand: commandLabel(),
      heartbeatAt: nowIso(),
      updatedAt: nowIso(),
    };
    return { state: { ...state, lanes }, result: generation };
  });
}

export async function markLaneReadyAfterPrepare(
  lane: E2eLaneConfig,
  generation: number,
  metadata: { preparedFingerprint?: string; resetMode?: "full" | "data" } = {},
): Promise<void> {
  await updateE2eLaneState((state) => {
    const index = state.lanes.findIndex((record) => record.laneId === lane.id);
    const current = state.lanes[index];
    if (!current || current.generation !== generation || current.state !== "resetting") {
      throw new Error(`Stale prepare process cannot mark ${lane.id} ready.`);
    }
    const lanes = [...state.lanes];
    lanes[index] = {
      ...current,
      state: "ready",
      leaseToken: undefined,
      ownerPid: undefined,
      ownerCommand: undefined,
      heartbeatAt: undefined,
      lastPrepareAt: nowIso(),
      lastResetAt: nowIso(),
      preparedFingerprint: metadata.preparedFingerprint ?? current.preparedFingerprint,
      lastResetMode: metadata.resetMode ?? current.lastResetMode,
      quarantineReason: undefined,
      updatedAt: nowIso(),
    };
    return { state: { ...state, lanes }, result: undefined };
  });
}

export async function markLaneQuarantined(
  lane: E2eLaneConfig,
  reason: string,
  diagnosticsPath?: string,
): Promise<void> {
  await updateE2eLaneState((state) => {
    const index = state.lanes.findIndex((record) => record.laneId === lane.id);
    const current = state.lanes[index] ?? defaultRecord(lane);
    const lanes = [...state.lanes];
    lanes[index] = {
      ...current,
      state: "quarantined",
      quarantineReason: reason,
      lastDiagnosticsPath: diagnosticsPath ?? current.lastDiagnosticsPath,
      leaseToken: undefined,
      ownerPid: undefined,
      ownerCommand: undefined,
      heartbeatAt: undefined,
      updatedAt: nowIso(),
    };
    return { state: { ...state, lanes }, result: undefined };
  });
}

function formatNoReadyLaneMessage(state: E2eLaneStateFile, elapsedMs?: number): string {
  const states = state.lanes.reduce<Record<string, number>>((counts, lane) => {
    counts[lane.state] = (counts[lane.state] ?? 0) + 1;
    return counts;
  }, {});
  const owners = state.lanes
    .filter((lane) => lane.state === "leased")
    .map(
      (lane) =>
        `${lane.laneId} pid=${lane.ownerPid ?? "<none>"} alive=${processIsAlive(lane.ownerPid)} command=${lane.ownerCommand ?? "<unknown>"}`,
    );
  return `[e2e] No ready E2E lane${elapsedMs === undefined ? "" : ` after ${Math.round(elapsedMs / 1_000)}s`}. Capacity=${state.lanes.length}, states=${JSON.stringify(states)}. Active owners: ${owners.join("; ") || "none"}. Run: npm run e2e:lanes -- prepare`;
}

export function laneOwnerAlive(record: E2eLaneRecord): boolean {
  return processIsAlive(record.ownerPid);
}
