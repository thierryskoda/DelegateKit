#!/usr/bin/env tsx

import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  allE2eLaneConfigs,
  allKnownE2eLaneConfigs,
  e2eLanesRoot,
  getE2eLaneConfig,
} from "./e2e-lanes";
import { runE2eLaneDockerCommand, runRequiredE2eLaneDockerCommand } from "./e2e-lane-docker";
import { prepareE2eLane } from "./e2e-lane-prepare";
import {
  acquireE2eLaneLease,
  initializeE2eLanes,
  laneOwnerAlive,
  markLanePreparing,
  markLaneReadyAfterPrepare,
  readE2eLaneState,
  updateE2eLaneState,
  type E2eLaneLease,
} from "./e2e-lane-state";
import { stopE2eSupabaseRuntime } from "../profiles/supabase";
import { runBoundedCommand } from "./bounded-command";

type LaneCliArgs = {
  command:
    | "init"
    | "prepare"
    | "status"
    | "cleanup"
    | "validate-leasing-state"
    | "doctor-docker-contexts"
    | "print-colima-setup"
    | "validate-docker-context-routing"
    | "validate-concurrency";
  lane?: string;
  json: boolean;
  dryRun: boolean;
  includeOverCapacity: boolean;
};

function parseArgs(argv: readonly string[]): LaneCliArgs {
  const [commandArg, ...rest] = argv;
  const command = commandArg ?? "status";
  if (
    command !== "init" &&
    command !== "prepare" &&
    command !== "status" &&
    command !== "cleanup" &&
    command !== "validate-leasing-state" &&
    command !== "doctor-docker-contexts" &&
    command !== "print-colima-setup" &&
    command !== "validate-docker-context-routing" &&
    command !== "validate-concurrency"
  ) {
    if (command === "--help" || command === "-h") {
      console.log(usage());
      process.exit(0);
    }
    throw new Error(`Unknown e2e lanes command ${JSON.stringify(command)}.`);
  }
  let lane: string | undefined;
  let json = false;
  let dryRun = false;
  let includeOverCapacity = false;
  for (const arg of rest) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--include-over-capacity") {
      includeOverCapacity = true;
      continue;
    }
    if (arg.startsWith("--lane=")) {
      lane = arg.slice("--lane=".length);
      continue;
    }
    throw new Error(`Unknown argument ${JSON.stringify(arg)}.`);
  }
  return { command, lane, json, dryRun, includeOverCapacity };
}

function usage(): string {
  return [
    "Usage:",
    "  npm run e2e:lanes -- status [--json]",
    "  npm run e2e:lanes -- init [--dry-run]",
    "  npm run e2e:lanes -- prepare [--lane=e2e-lane-1]",
    "  npm run e2e:lanes -- cleanup [--lane=e2e-lane-1] [--dry-run]",
    "  npm run e2e:lanes -- validate-leasing-state",
    "  npm run e2e:lanes -- doctor-docker-contexts [--json]",
    "  npm run e2e:lanes -- print-colima-setup",
    "  npm run e2e:lanes -- validate-docker-context-routing",
    "  npm run e2e:lanes -- validate-concurrency [--include-over-capacity]",
  ].join("\n");
}

function dockerContextInspect(context: string) {
  return runBoundedCommand("docker", ["context", "inspect", context], {
    timeoutMs: 10_000,
    maxBuffer: 5_000_000,
  });
}

function dockerContextInfo(context: string) {
  return runBoundedCommand("docker", ["--context", context, "info", "--format", "json"], {
    timeoutMs: 15_000,
    maxBuffer: 5_000_000,
  });
}

function dockerContextNames(): readonly string[] {
  const result = runBoundedCommand("docker", ["context", "ls", "--format", "{{.Name}}"], {
    timeoutMs: 10_000,
    maxBuffer: 1_000_000,
  });
  if (result.status !== 0 || result.timedOut) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function colimaProfileForDockerContext(context: string): string | null {
  if (!context.startsWith("colima-")) return null;
  return context.slice("colima-".length);
}

function colimaStatus(profile: string) {
  return runBoundedCommand("colima", ["status", "--profile", profile], {
    timeoutMs: 10_000,
    maxBuffer: 1_000_000,
  });
}

function commandExists(command: string): boolean {
  const pathEnv = process.env.PATH ?? "";
  return pathEnv.split(path.delimiter).some((dir) => existsSync(path.join(dir, command)));
}

function parseDockerContextEndpoint(inspectStdout: string): string | null {
  try {
    const parsed = JSON.parse(inspectStdout) as unknown;
    if (!Array.isArray(parsed)) return null;
    const first = parsed[0] as { Endpoints?: { docker?: { Host?: unknown } } } | undefined;
    const host = first?.Endpoints?.docker?.Host;
    return typeof host === "string" ? host : null;
  } catch {
    return null;
  }
}

function parseDockerInfoSummary(stdout: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const info = parsed as Record<string, unknown>;
    return {
      id: info.ID,
      serverVersion: info.ServerVersion,
      operatingSystem: info.OperatingSystem,
      ncpu: info.NCPU,
      memTotal: info.MemTotal,
      dockerRootDir: info.DockerRootDir,
    };
  } catch {
    return null;
  }
}

function statusSummary() {
  const state = readE2eLaneState();
  return {
    ok: state.lanes.every((lane) => lane.state !== "quarantined" && lane.state !== "dirty"),
    root: e2eLanesRoot(),
    capacity: state.lanes.length,
    updatedAt: state.updatedAt,
    byState: state.lanes.reduce<Record<string, number>>((counts, lane) => {
      counts[lane.state] = (counts[lane.state] ?? 0) + 1;
      return counts;
    }, {}),
    lanes: state.lanes.map((lane) => {
      const config = getE2eLaneConfig(lane.laneId);
      return {
        ...lane,
        ports: config.ports,
        dockerContext: config.dockerContext,
        runtimeRoot: config.runtimeRoot,
        supabaseWorkdir: config.supabaseWorkdir,
        envPath: config.envPath,
        ownerAlive: laneOwnerAlive(lane),
        recommendation:
          lane.state === "ready"
            ? "leaseable"
            : lane.state === "quarantined" || lane.state === "dirty"
              ? `run npm run e2e:lanes -- cleanup --lane=${lane.laneId}, then npm run e2e:lanes -- prepare --lane=${lane.laneId}`
              : `run npm run e2e:lanes -- prepare --lane=${lane.laneId}`,
      };
    }),
  };
}

function dockerContextSetupCommand(context: string): string {
  const profile = colimaProfileForDockerContext(context);
  if (!profile)
    return `Create Docker context ${context} and make sure docker --context ${context} info works.`;
  return `colima start --profile ${profile} --cpu 4 --memory 6 --disk 60`;
}

function printColimaSetup(): void {
  const lanes = allKnownE2eLaneConfigs().map((lane) => ({
    laneId: lane.id,
    projectId: lane.projectId,
    dockerContext: lane.dockerContext,
    ports: lane.ports,
    startCommand: dockerContextSetupCommand(lane.dockerContext),
    verifyCommand: `docker --context ${lane.dockerContext} info`,
  }));
  print({
    ok: true,
    note: "Run these commands outside repo automation to create isolated local Docker daemons. Docker Desktop desktop-linux is acceptable for one-lane fallback only; two-lane local E2E requires distinct Docker contexts.",
    installColima: "brew install colima docker",
    lanes,
    verifyAll: [
      "docker context ls",
      "npm run e2e:lanes -- doctor-docker-contexts --json",
      "npm run e2e:lanes -- prepare",
    ],
  });
}

function validateDockerContextRouting(): void {
  const lanes = allE2eLaneConfigs().map((lane) => {
    const inspect = dockerContextInspect(lane.dockerContext);
    const endpoint =
      inspect.status === 0 && !inspect.timedOut ? parseDockerContextEndpoint(inspect.stdout) : null;
    return {
      laneId: lane.id,
      projectId: lane.projectId,
      dockerContext: lane.dockerContext,
      endpoint,
      ok: Boolean(endpoint),
      inspect: {
        status: inspect.status,
        timedOut: inspect.timedOut,
        stderr: inspect.stderr.trim(),
      },
    };
  });
  const endpoints = lanes
    .map((lane) => lane.endpoint)
    .filter((endpoint): endpoint is string => Boolean(endpoint));
  const uniqueEndpoints = new Set(endpoints);
  const report = {
    ok: lanes.every((lane) => lane.ok) && uniqueEndpoints.size === lanes.length,
    capacity: lanes.length,
    lanes,
    uniqueEndpointCount: uniqueEndpoints.size,
  };
  print(report);
  if (!report.ok) process.exitCode = 1;
}

type ConcurrentE2eResult = {
  file: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  laneId: string | null;
};

function appendCapped(existing: string, chunk: string): string {
  const next = existing + chunk;
  const maxChars = 120_000;
  return next.length <= maxChars ? next : next.slice(next.length - maxChars);
}

async function runConcurrentE2eFile(file: string): Promise<ConcurrentE2eResult> {
  return await new Promise((resolve) => {
    const child = spawn("npm", ["run", "e2e", "--", file, "--no-wait"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output = appendCapped(output, chunk);
    });
    child.stderr.on("data", (chunk: string) => {
      output = appendCapped(output, chunk);
    });
    child.on("close", (status, signal) => {
      const laneMatch = output.match(/\[e2e\] Using fixed E2E lane: (?<laneId>e2e-lane-[12])/);
      resolve({
        file,
        status,
        signal,
        output,
        laneId: laneMatch?.groups?.laneId ?? null,
      });
    });
  });
}

async function validateOverCapacityAcquire(): Promise<{
  ok: boolean;
  firstLane: string;
  secondLane: string;
  overCapacityMessage: string;
}> {
  const leases: E2eLaneLease[] = [];
  let overCapacityMessage = "";
  try {
    const first = await acquireE2eLaneLease({ wait: false });
    leases.push(first);
    const second = await acquireE2eLaneLease({ wait: false });
    leases.push(second);
    const unexpected = await acquireE2eLaneLease({ wait: false });
    leases.push(unexpected);
  } catch (error) {
    overCapacityMessage = error instanceof Error ? error.message : String(error);
  } finally {
    await Promise.all(leases.map((lease) => lease.releaseReady()));
  }
  const [first, second] = leases;
  if (!first || !second) {
    throw new Error(
      `Expected two ready E2E lanes before validating over-capacity. Acquired ${leases.length}. Last error: ${overCapacityMessage}`,
    );
  }
  return {
    ok:
      first.lane.id !== second.lane.id &&
      overCapacityMessage.includes("No ready E2E lane") &&
      overCapacityMessage.includes(first.lane.id) &&
      overCapacityMessage.includes(second.lane.id),
    firstLane: first.lane.id,
    secondLane: second.lane.id,
    overCapacityMessage,
  };
}

async function validateConcurrency(input: { includeOverCapacity: boolean }): Promise<void> {
  const files = [
    "tests/e2e/others/e2e-worker-lane-leasing-e2e.ts",
    "tests/e2e/others/e2e-worker-lane-clean-state-e2e.ts",
  ] as const;
  const results = await Promise.all(files.map((file) => runConcurrentE2eFile(file)));
  const laneIds = results
    .map((result) => result.laneId)
    .filter((laneId): laneId is string => Boolean(laneId));
  const finalStatus = statusSummary();
  const overCapacity = input.includeOverCapacity ? await validateOverCapacityAcquire() : null;
  const report = {
    ok:
      results.every((result) => result.status === 0 && result.laneId) &&
      new Set(laneIds).size === results.length &&
      finalStatus.byState.ready === finalStatus.capacity &&
      (!overCapacity || overCapacity.ok),
    results: results.map((result) => ({
      file: result.file,
      status: result.status,
      signal: result.signal,
      laneId: result.laneId,
      tail: result.output.slice(-4_000),
    })),
    finalStatus,
    overCapacity,
  };
  print(report);
  if (!report.ok) process.exitCode = 1;
}

function doctorDockerContexts(): void {
  const lanes = allE2eLaneConfigs().map((lane) => {
    const inspect = dockerContextInspect(lane.dockerContext);
    const endpoint =
      inspect.status === 0 && !inspect.timedOut ? parseDockerContextEndpoint(inspect.stdout) : null;
    const info =
      inspect.status === 0 && !inspect.timedOut ? dockerContextInfo(lane.dockerContext) : null;
    const profile = colimaProfileForDockerContext(lane.dockerContext);
    const colima =
      profile && inspect.status !== 0
        ? colimaStatus(profile)
        : profile
          ? colimaStatus(profile)
          : null;
    const dockerResponsive = info ? info.status === 0 && !info.timedOut : false;
    return {
      laneId: lane.id,
      projectId: lane.projectId,
      dockerContext: lane.dockerContext,
      expectedSetupCommand: dockerContextSetupCommand(lane.dockerContext),
      contextExists: inspect.status === 0 && !inspect.timedOut,
      dockerResponsive,
      endpoint,
      dockerInfo: info && dockerResponsive ? parseDockerInfoSummary(info.stdout) : null,
      inspect: {
        status: inspect.status,
        timedOut: inspect.timedOut,
        stderr: inspect.stderr.trim(),
      },
      colima:
        profile && colima
          ? {
              profile,
              installed: commandExists("colima"),
              status: colima.status,
              timedOut: colima.timedOut,
              stdout: colima.stdout.trim(),
              stderr: colima.stderr.trim(),
            }
          : null,
    };
  });
  const report = {
    ok: lanes.every((lane) => lane.contextExists && lane.dockerResponsive),
    root: e2eLanesRoot(),
    capacity: lanes.length,
    lanes,
  };
  print(report);
  if (!report.ok) process.exitCode = 1;
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function dockerContainerIdsForLaneProject(
  lane: ReturnType<typeof getE2eLaneConfig>,
): readonly string[] {
  const ids = new Set<string>();
  for (const label of ["com.supabase.cli.project", "com.docker.compose.project"]) {
    const result = runE2eLaneDockerCommand(
      lane,
      ["ps", "-aq", "--filter", `label=${label}=${lane.projectId}`],
      { timeoutMs: 20_000, maxBuffer: 5_000_000 },
    );
    if (result.status !== 0 || result.timedOut) continue;
    for (const line of result.stdout.split("\n")) {
      const id = line.trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

function dockerContainerIdsForProjectInContext(
  projectId: string,
  context: string,
): readonly string[] {
  const ids = new Set<string>();
  for (const label of ["com.supabase.cli.project", "com.docker.compose.project"]) {
    const result = runBoundedCommand(
      "docker",
      ["--context", context, "ps", "-aq", "--filter", `label=${label}=${projectId}`],
      { timeoutMs: 10_000, maxBuffer: 1_000_000 },
    );
    if (result.status !== 0 || result.timedOut) continue;
    for (const line of result.stdout.split("\n")) {
      const id = line.trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

async function portIsAvailable(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function assertLanePreparePreflight(
  lane: ReturnType<typeof getE2eLaneConfig>,
): Promise<void> {
  const inspect = dockerContextInspect(lane.dockerContext);
  if (inspect.status !== 0 || inspect.timedOut) {
    throw new Error(
      `E2E lane ${lane.id} requires Docker context ${lane.dockerContext}. ${dockerContextSetupCommand(
        lane.dockerContext,
      )}. Run npm run e2e:lanes -- doctor-docker-contexts --json for details.`,
    );
  }
  const info = dockerContextInfo(lane.dockerContext);
  if (info.status !== 0 || info.timedOut) {
    throw new Error(
      `E2E lane ${lane.id} Docker context ${lane.dockerContext} is not responsive. Run npm run e2e:lanes -- doctor-docker-contexts --json.`,
    );
  }

  const wrongContextContainers = dockerContextNames()
    .filter((context) => context !== lane.dockerContext)
    .flatMap((context) =>
      dockerContainerIdsForProjectInContext(lane.projectId, context).map((containerId) => ({
        context,
        containerId,
      })),
    );
  if (wrongContextContainers.length > 0) {
    throw new Error(
      `E2E lane ${lane.id} project ${lane.projectId} has containers on the wrong Docker context: ${JSON.stringify(
        wrongContextContainers,
      )}. Clean the stale context before preparing this lane.`,
    );
  }

  const laneContainerIds = dockerContainerIdsForLaneProject(lane);

  const busyPorts: number[] = [];
  for (const port of Object.values(lane.ports)) {
    if (!(await portIsAvailable(port))) busyPorts.push(port);
  }
  if (busyPorts.length > 0 && laneContainerIds.length === 0) {
    throw new Error(
      `E2E lane ${lane.id} host ports are busy but no lane containers were found in Docker context ${lane.dockerContext}: ${busyPorts.join(
        ", ",
      )}. Free those ports or clean the stale owner before prepare.`,
    );
  }
}

function removeDockerContainersForLaneProject(lane: ReturnType<typeof getE2eLaneConfig>): number {
  const containerIds = dockerContainerIdsForLaneProject(lane);
  if (containerIds.length === 0) return 0;
  runRequiredE2eLaneDockerCommand(lane, ["rm", "-f", ...containerIds], {
    timeoutMs: 45_000,
    maxBuffer: 5_000_000,
  });
  return containerIds.length;
}

async function init(dryRun: boolean): Promise<void> {
  if (dryRun) {
    print({ ok: true, dryRun, lanes: allE2eLaneConfigs() });
    return;
  }
  await initializeE2eLanes();
  print(statusSummary());
}

async function prepare(laneId: string | undefined, dryRun: boolean): Promise<void> {
  const lanes = laneId ? [getE2eLaneConfig(laneId)] : allE2eLaneConfigs();
  await initializeE2eLanes();
  for (const lane of lanes) {
    await assertLanePreparePreflight(lane);
    if (dryRun) {
      console.log(
        `[e2e:lanes] dry-run prepare preflight passed for ${lane.id} (${lane.projectId})`,
      );
      continue;
    }
    console.log(`[e2e:lanes] preparing ${lane.id} (${lane.projectId})`);
    await prepareE2eLane(lane);
  }
  print(statusSummary());
}

async function cleanup(input: { laneId?: string; dryRun: boolean }): Promise<void> {
  const lanes = input.laneId ? [getE2eLaneConfig(input.laneId)] : allE2eLaneConfigs();
  const cleaned: string[] = [];
  let removedContainers = 0;
  for (const lane of lanes) {
    const record = readE2eLaneState().lanes.find((candidate) => candidate.laneId === lane.id);
    if (
      record &&
      (record.state === "leased" || record.state === "starting" || record.state === "resetting") &&
      laneOwnerAlive(record)
    ) {
      throw new Error(
        `Refusing to clean active E2E lane ${lane.id} in state ${record.state} owned by pid ${record.ownerPid}.`,
      );
    }
    if (!input.dryRun) {
      if (existsSync(lane.supabaseWorkdir)) {
        try {
          stopE2eSupabaseRuntime({
            workdir: lane.supabaseWorkdir,
            dockerContext: lane.dockerContext,
          });
        } catch {
          // Cleanup is allowed to continue when the lane is already stopped.
        }
      }
      removedContainers += removeDockerContainersForLaneProject(lane);
      rmSync(lane.runtimeRoot, { recursive: true, force: true });
      await updateE2eLaneState((state) => ({
        state: {
          ...state,
          lanes: state.lanes.map((candidate) =>
            candidate.laneId === lane.id
              ? {
                  ...candidate,
                  state: "missing",
                  leaseToken: undefined,
                  ownerPid: undefined,
                  ownerCommand: undefined,
                  heartbeatAt: undefined,
                  quarantineReason: undefined,
                  lastDiagnosticsPath: undefined,
                  updatedAt: new Date().toISOString(),
                }
              : candidate,
          ),
        },
        result: undefined,
      }));
    }
    cleaned.push(lane.id);
  }
  print({ ok: true, dryRun: input.dryRun, cleaned, removedContainers, status: statusSummary() });
}

async function validateLeasingState(): Promise<void> {
  await initializeE2eLanes();
  const originalState = readE2eLaneState();
  const activeLanes = originalState.lanes.filter(
    (lane) => lane.state === "leased" || lane.state === "starting" || lane.state === "resetting",
  );
  if (activeLanes.length > 0) {
    throw new Error(
      `Refusing to validate leasing state while lanes are active: ${activeLanes
        .map(
          (lane) => `${lane.laneId}:${lane.state}${lane.ownerPid ? ` pid ${lane.ownerPid}` : ""}`,
        )
        .join(", ")}.`,
    );
  }
  let firstLane = "";
  let secondLane = "";
  let overCapacityMessage = "";
  try {
    await updateE2eLaneState((state) => ({
      state: {
        ...state,
        lanes: state.lanes.map((lane) => ({
          ...lane,
          state: "ready",
          updatedAt: new Date().toISOString(),
        })),
      },
      result: undefined,
    }));
    const first = await acquireE2eLaneLease({ wait: false });
    const second = await acquireE2eLaneLease({ wait: false });
    firstLane = first.lane.id;
    secondLane = second.lane.id;
    if (first.lane.id === second.lane.id) {
      throw new Error("Expected two acquire attempts to lease different lane ids.");
    }
    const initializedWhileLeased = await initializeE2eLanes();
    const initializedStates = new Map(
      initializedWhileLeased.lanes.map((lane) => [lane.laneId, lane.state]),
    );
    if (
      initializedStates.get(first.lane.id) !== "leased" ||
      initializedStates.get(second.lane.id) !== "leased"
    ) {
      throw new Error("Expected initializeE2eLanes to preserve active leased lane state.");
    }
    let prepareRefusedActiveLane = false;
    try {
      await markLanePreparing(first.lane);
    } catch {
      prepareRefusedActiveLane = true;
    }
    if (!prepareRefusedActiveLane) {
      throw new Error("Expected active leased lane prepare to be refused.");
    }
    try {
      await acquireE2eLaneLease({ wait: false });
    } catch (error) {
      overCapacityMessage = error instanceof Error ? error.message : String(error);
    }
    if (!overCapacityMessage.includes("No ready E2E lane")) {
      throw new Error(`Expected clear over-capacity message, received: ${overCapacityMessage}`);
    }
    await first.markDirty("validate-leasing-state simulated dead owner");
    await second.quarantine("validate-leasing-state cleanup");
    let fencingWorked = false;
    try {
      await markLaneReadyAfterPrepare(first.lane, first.generation);
    } catch {
      fencingWorked = true;
    }
    if (!fencingWorked) throw new Error("Expected stale fencing token to be rejected.");
  } finally {
    await updateE2eLaneState((state) => ({
      state: {
        ...state,
        lanes: originalState.lanes,
      },
      result: undefined,
    }));
  }
  print({ ok: true, firstLane, secondLane, overCapacityMessage });
}

export async function runE2eLanesCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.command === "init") return await init(args.dryRun);
  if (args.command === "prepare") return await prepare(args.lane, args.dryRun);
  if (args.command === "status") return print(statusSummary());
  if (args.command === "doctor-docker-contexts") return doctorDockerContexts();
  if (args.command === "print-colima-setup") return printColimaSetup();
  if (args.command === "validate-docker-context-routing") return validateDockerContextRouting();
  if (args.command === "validate-concurrency")
    return await validateConcurrency({ includeOverCapacity: args.includeOverCapacity });
  if (args.command === "cleanup") return await cleanup({ laneId: args.lane, dryRun: args.dryRun });
  return await validateLeasingState();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runE2eLanesCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
