import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseServiceClient, type SupabaseServiceClient } from "@ai-assistants/control-db";
import { mondayLiveArchiveItems } from "../../../apps/backend/src/ops-support/provider-cleanup";
import type {
  E2eFixtureManifestEvent,
  E2eFixtureManifestResource,
} from "../../../tests/e2e/helpers/fixtures/e2e-fixture-scope";

type CreatedManifestEvent = Extract<E2eFixtureManifestEvent, { event: "created" }>;

type CleanupManifestResource =
  | E2eFixtureManifestResource
  | {
      kind: string;
      label?: string;
      [key: string]: unknown;
    };

type CleanupCreatedManifestEvent = Omit<CreatedManifestEvent, "resource"> & {
  resource: CleanupManifestResource;
};

type CleanupManifestEvent =
  | CleanupCreatedManifestEvent
  | Extract<E2eFixtureManifestEvent, { event: "cleaned" }>;

export type StaleFixtureCandidate = {
  manifestPath: string;
  runId: string;
  label: string;
  createdAt: Date;
  resource: CleanupManifestResource;
};

export type CleanupStaleFixturesArgs = {
  execute: boolean;
  olderThanHours: number;
  runsDir: string;
};

export type CleanupStaleFixturesInput = Omit<CleanupStaleFixturesArgs, "execute">;

export type StaleFixtureCleanupHandlers = {
  archiveMondayItem: (
    resource: Extract<E2eFixtureManifestResource, { kind: "monday.item" }>,
  ) => Promise<void>;
  deleteProfileArtifact: (
    resource: Extract<E2eFixtureManifestResource, { kind: "profile.artifact" }>,
  ) => Promise<void>;
};

const DEFAULT_OLDER_THAN_HOURS = 24;
const DEFAULT_RUNS_DIR = "tmp/e2e/runs";
const MANIFEST_FILENAME = "fixture-manifest.jsonl";

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Fixture manifest field ${key} must be a non-empty string.`);
  }
  return value;
}

function parseResource(value: unknown): CleanupManifestResource {
  if (!value || typeof value !== "object") {
    throw new Error("Fixture manifest resource must be an object.");
  }
  const record = value as Record<string, unknown>;
  const kind = requiredString(record, "kind");
  const label = typeof record.label === "string" ? record.label : undefined;

  if (kind === "monday.item") {
    return {
      kind,
      providerConfigKey: requiredString(record, "providerConfigKey"),
      connectionId: requiredString(record, "connectionId"),
      boardId: requiredString(record, "boardId"),
      itemId: requiredString(record, "itemId"),
      label: requiredString(record, "label"),
    };
  }

  if (kind === "profile.artifact") {
    return {
      kind,
      profileId: requiredString(record, "profileId"),
      artifactId: requiredString(record, "artifactId"),
      storageBucket: requiredString(record, "storageBucket"),
      storageKey: requiredString(record, "storageKey"),
      label: requiredString(record, "label"),
    };
  }

  if (kind === "google-drive.file") {
    return {
      kind,
      connectedAccountId: requiredString(record, "connectedAccountId"),
      fileId: requiredString(record, "fileId"),
      name: requiredString(record, "name"),
      label: requiredString(record, "label"),
    };
  }

  return { ...record, kind, ...(label ? { label } : {}) };
}

function parseManifestEvent(value: unknown): CleanupManifestEvent {
  if (!value || typeof value !== "object") {
    throw new Error("Fixture manifest line must be an object.");
  }
  const record = value as Record<string, unknown>;
  const event = requiredString(record, "event");
  const runId = requiredString(record, "runId");
  const label = requiredString(record, "label");
  const at = requiredString(record, "at");

  if (event === "created") {
    return {
      event,
      runId,
      label,
      at,
      resource: parseResource(record.resource),
    };
  }

  if (event === "cleaned") {
    return { event, runId, label, at };
  }

  throw new Error(`Unsupported fixture manifest event ${JSON.stringify(event)}.`);
}

export function parseCleanupStaleFixturesArgs(argv: readonly string[]): CleanupStaleFixturesArgs {
  const args: CleanupStaleFixturesArgs = {
    execute: false,
    olderThanHours: DEFAULT_OLDER_THAN_HOURS,
    runsDir: DEFAULT_RUNS_DIR,
  };

  for (const arg of argv) {
    if (arg === "--execute") {
      args.execute = true;
      continue;
    }
    if (arg.startsWith("--older-than-hours=")) {
      const value = Number(arg.slice("--older-than-hours=".length));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--older-than-hours must be a non-negative number.");
      }
      args.olderThanHours = value;
      continue;
    }
    if (arg.startsWith("--runs-dir=")) {
      const value = arg.slice("--runs-dir=".length).trim();
      if (!value) throw new Error("--runs-dir must be non-empty.");
      args.runsDir = value;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new Error(
        [
          "Usage: tsx scripts/repo-tooling/e2e-fixtures/cleanup-stale-fixtures.ts [--execute] [--older-than-hours=24] [--runs-dir=tmp/e2e/runs]",
          "Dry-run is the default. Pass --execute to mutate live providers.",
        ].join("\n"),
      );
    }
    throw new Error(`Unknown argument ${arg}`);
  }

  return args;
}

export function findFixtureManifestPaths(runsDir: string): string[] {
  const out: string[] = [];
  if (!existsSync(runsDir)) return out;

  function visit(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name === MANIFEST_FILENAME) {
        out.push(fullPath);
      }
    }
  }

  visit(runsDir);
  return out.sort();
}

function appendCleanedEvent(candidate: StaleFixtureCandidate): void {
  appendFileSync(
    candidate.manifestPath,
    `\n${JSON.stringify({
      event: "cleaned",
      runId: candidate.runId,
      label: candidate.label,
      at: new Date().toISOString(),
    } satisfies Extract<E2eFixtureManifestEvent, { event: "cleaned" }>)}\n`,
    "utf8",
  );
}

export function readFixtureManifestEvents(manifestPath: string): CleanupManifestEvent[] {
  return readFileSync(manifestPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return parseManifestEvent(JSON.parse(line));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${manifestPath}:${index + 1}: ${message}`);
      }
    });
}

export function activeFixtureCandidatesFromEvents(
  manifestPath: string,
  events: readonly CleanupManifestEvent[],
): StaleFixtureCandidate[] {
  const active = new Map<string, StaleFixtureCandidate>();
  for (const event of events) {
    const key = `${event.runId}:${event.label}`;
    if (event.event === "created") {
      active.set(key, {
        manifestPath,
        runId: event.runId,
        label: event.label,
        createdAt: new Date(event.at),
        resource: event.resource,
      });
      continue;
    }
    active.delete(key);
  }
  return [...active.values()];
}

export function staleFixtureCandidates(input: {
  manifestPaths: readonly string[];
  olderThanHours: number;
  now?: Date;
}): StaleFixtureCandidate[] {
  const now = input.now ?? new Date();
  const cutoffMs = now.getTime() - input.olderThanHours * 60 * 60 * 1000;
  return input.manifestPaths
    .flatMap((manifestPath) =>
      activeFixtureCandidatesFromEvents(manifestPath, readFixtureManifestEvents(manifestPath)),
    )
    .filter((candidate) => candidate.createdAt.getTime() <= cutoffMs)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function isAlreadyGoneMondayError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(already archived|not found|does not exist|invalid item|item.*deleted)\b/i.test(
    message,
  );
}

function isMondayItemResource(
  resource: CleanupManifestResource,
): resource is Extract<E2eFixtureManifestResource, { kind: "monday.item" }> {
  return (
    resource.kind === "monday.item" &&
    typeof resource.providerConfigKey === "string" &&
    typeof resource.connectionId === "string" &&
    typeof resource.boardId === "string" &&
    typeof resource.itemId === "string" &&
    typeof resource.label === "string"
  );
}

function isProfileArtifactResource(
  resource: CleanupManifestResource,
): resource is Extract<E2eFixtureManifestResource, { kind: "profile.artifact" }> {
  return (
    resource.kind === "profile.artifact" &&
    typeof resource.profileId === "string" &&
    typeof resource.artifactId === "string" &&
    typeof resource.storageBucket === "string" &&
    typeof resource.storageKey === "string" &&
    typeof resource.label === "string"
  );
}

export function createDefaultCleanupHandlers(
  db: SupabaseServiceClient,
): StaleFixtureCleanupHandlers {
  return {
    archiveMondayItem: async (resource) => {
      try {
        await mondayLiveArchiveItems({
          providerConfigKey: resource.providerConfigKey,
          connectionId: resource.connectionId,
          targets: [{ providerItemId: resource.itemId }],
        });
      } catch (error) {
        if (isAlreadyGoneMondayError(error)) return;
        throw error;
      }
    },
    deleteProfileArtifact: async (resource) => {
      const deleted = await db.from("artifacts").delete().eq("id", resource.artifactId);
      if (deleted.error) {
        throw new Error(`Delete artifact ${resource.artifactId} failed: ${deleted.error.message}`);
      }
      const removed = await db.storage.from(resource.storageBucket).remove([resource.storageKey]);
      if (removed.error) {
        throw new Error(
          `Remove storage object ${resource.storageKey} failed: ${removed.error.message}`,
        );
      }
    },
  };
}

export async function cleanupStaleFixtureCandidate(
  candidate: StaleFixtureCandidate,
  handlers: StaleFixtureCleanupHandlers,
): Promise<"cleaned" | "skipped"> {
  if (isMondayItemResource(candidate.resource)) {
    await handlers.archiveMondayItem(candidate.resource);
    appendCleanedEvent(candidate);
    return "cleaned";
  }
  if (isProfileArtifactResource(candidate.resource)) {
    await handlers.deleteProfileArtifact(candidate.resource);
    appendCleanedEvent(candidate);
    return "cleaned";
  }
  return "skipped";
}

function findStaleFixtureCandidates(input: CleanupStaleFixturesInput): StaleFixtureCandidate[] {
  const manifestPaths = findFixtureManifestPaths(input.runsDir);
  return staleFixtureCandidates({
    manifestPaths,
    olderThanHours: input.olderThanHours,
  });
}

export async function previewStaleFixtureCleanup(
  input: CleanupStaleFixturesInput,
): Promise<{ candidates: StaleFixtureCandidate[]; cleaned: number; skipped: number }> {
  const candidates = findStaleFixtureCandidates(input);
  if (candidates.length === 0) {
    console.log(`[e2e fixtures] no stale active fixtures older than ${input.olderThanHours}h`);
    return { candidates, cleaned: 0, skipped: 0 };
  }

  for (const candidate of candidates) {
    const resourceLabel = candidate.resource.label ?? candidate.label;
    console.log(`[e2e fixtures] dry-run ${candidate.resource.kind}: ${resourceLabel}`);
  }

  return { candidates, cleaned: 0, skipped: 0 };
}

export async function executeStaleFixtureCleanup(
  input: CleanupStaleFixturesInput,
  handlers: StaleFixtureCleanupHandlers,
): Promise<{ candidates: StaleFixtureCandidate[]; cleaned: number; skipped: number }> {
  const candidates = findStaleFixtureCandidates(input);
  let cleaned = 0;
  let skipped = 0;

  if (candidates.length === 0) {
    console.log(`[e2e fixtures] no stale active fixtures older than ${input.olderThanHours}h`);
    return { candidates, cleaned, skipped };
  }

  for (const candidate of candidates) {
    const resourceLabel = candidate.resource.label ?? candidate.label;
    const result = await cleanupStaleFixtureCandidate(candidate, handlers);
    if (result === "cleaned") {
      cleaned += 1;
      console.log(`[e2e fixtures] cleaned ${candidate.resource.kind}: ${resourceLabel}`);
    } else {
      skipped += 1;
      console.warn(
        `[e2e fixtures] skipped unknown fixture resource kind: ${candidate.resource.kind}`,
      );
    }
  }

  return { candidates, cleaned, skipped };
}

async function main(): Promise<void> {
  const args = parseCleanupStaleFixturesArgs(process.argv.slice(2));
  const input: CleanupStaleFixturesInput = {
    olderThanHours: args.olderThanHours,
    runsDir: args.runsDir,
  };
  const result = args.execute
    ? await executeStaleFixtureCleanup(
        input,
        createDefaultCleanupHandlers(createSupabaseServiceClient()),
      )
    : await previewStaleFixtureCleanup(input);
  console.log(
    `[e2e fixtures] candidates=${result.candidates.length} cleaned=${result.cleaned} skipped=${result.skipped} mode=${args.execute ? "execute" : "dry-run"}`,
  );
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entrypoint && fileURLToPath(import.meta.url) === entrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
