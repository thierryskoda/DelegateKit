#!/usr/bin/env tsx

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "@ai-assistants/repo-layout";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { toClientSnapshotSummary } from "../../apps/backend/src/ops-support/client-state";

type SnapshotSummaryArgs = {
  clientId: string | null;
  input:
    | {
        kind: "file";
        path: string;
      }
    | {
        kind: "directory";
        path: string;
      };
  output:
    | {
        kind: "file";
        path: string;
      }
    | {
        kind: "directory";
        path: string;
      };
};

const root = repoRoot(import.meta.url);
const defaultSnapshotDir = path.join(root, "clients", "client-state-snapshots.generated");
const defaultSummaryDir = path.join(root, "clients", "client-state-summaries.generated");

const snapshotFileSchema = z
  .object({
    schemaVersion: z.number(),
    runtimeProfile: z.string(),
    selectedClientId: z.string().nullable(),
    snapshots: z.record(z.string(), z.unknown()),
  })
  .passthrough();

function usage(): string {
  return [
    "Usage:",
    "  npm run clients -- snapshot-summary",
    "  npm run clients -- snapshot-summary --client=testing",
    "  npm run clients -- snapshot-summary --in-file=/tmp/client-state.generated.json --out-file=/tmp/client-state-summary.generated.json",
    "  npm run clients -- snapshot-summary --in-dir=/tmp/client-state --out-dir=/tmp/client-state-summaries",
    "",
    "Reads a full generated client-state snapshot and writes deterministic concise summaries.",
    "The summary keeps high-value client state and trims low-level payloads, raw provider state, and duplicated DB fields.",
    "",
    "Options:",
    "  --client=<profile-id>    Limit output to one client from the input snapshot(s).",
    "  --in-file=<path>        Full aggregate snapshot JSON input.",
    "  --in-dir=<path>         One full snapshot JSON file per client (default: clients/client-state-snapshots.generated).",
    "  --out-file=<path>       Output one aggregate summary JSON file.",
    "  --out-dir=<path>        Output one summary JSON file per client in this directory (default: clients/client-state-summaries.generated).",
  ].join("\n");
}

const summaryCliSchema = z
  .object({
    help: z.boolean().optional(),
    client: z.string().optional(),
    "in-file": z.string().optional(),
    "in-dir": z.string().optional(),
    "out-file": z.string().optional(),
    "out-dir": z.string().optional(),
  })
  .transform((raw) => {
    const inFile = raw["in-file"]?.trim();
    const inDir = raw["in-dir"]?.trim();
    const outFile = raw["out-file"]?.trim();
    const outDir = raw["out-dir"]?.trim();
    if (inFile && inDir) throw new Error("Pass only one of --in-file or --in-dir.");
    if (outFile && outDir) throw new Error("Pass only one of --out-file or --out-dir.");
    return {
      help: raw.help ?? false,
      clientId: raw.client?.trim() || null,
      input: inFile
        ? { kind: "file" as const, path: inFile }
        : { kind: "directory" as const, path: inDir || defaultSnapshotDir },
      output: outDir
        ? { kind: "directory" as const, path: outDir }
        : outFile
          ? { kind: "file" as const, path: outFile }
          : { kind: "directory" as const, path: defaultSummaryDir },
    };
  });

function parseArgs(argv: readonly string[]): SnapshotSummaryArgs {
  const parsed = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      client: { type: "string" },
      "in-file": { type: "string" },
      "in-dir": { type: "string" },
      "out-file": { type: "string" },
      "out-dir": { type: "string" },
    },
    schema: summaryCliSchema,
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!path.isAbsolute(parsed.input.path)) {
    throw new Error(
      `--in-${parsed.input.kind === "file" ? "file" : "dir"} must be absolute; got ${JSON.stringify(parsed.input.path)}.`,
    );
  }
  if (!path.isAbsolute(parsed.output.path)) {
    throw new Error(
      `--out-${parsed.output.kind === "file" ? "file" : "dir"} must be absolute; got ${JSON.stringify(parsed.output.path)}.`,
    );
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function stringValue(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function summarizeClientSnapshot(input: {
  runtimeProfile: string;
  clientId: string;
  snapshot: unknown;
}): Record<string, unknown> {
  return toClientSnapshotSummary({
    runtimeProfile: input.runtimeProfile,
    snapshot: input.snapshot,
  });
}

function summaryFilePayload(input: {
  sourceSchemaVersion: number | null;
  runtimeProfile: string;
  selectedClientId: string | null;
  summaries: Record<string, Record<string, unknown>>;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    sourceSchemaVersion: input.sourceSchemaVersion,
    runtimeProfile: input.runtimeProfile,
    selectedClientId: input.selectedClientId,
    summaries: input.summaries,
  };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  return parsed;
}

async function loadSnapshotEntries(args: SnapshotSummaryArgs): Promise<{
  sourceSchemaVersion: number | null;
  runtimeProfile: string;
  selectedClientId: string | null;
  entries: [string, unknown][];
}> {
  if (args.input.kind === "file") {
    const snapshotFile = snapshotFileSchema.parse(await readJsonFile(args.input.path));
    const entries = Object.entries(snapshotFile.snapshots);
    const selectedEntries = args.clientId
      ? entries.filter(([clientId]) => clientId === args.clientId)
      : entries;
    if (args.clientId && selectedEntries.length === 0) {
      throw new Error(`No client ${args.clientId} exists in ${args.input.path}.`);
    }
    return {
      sourceSchemaVersion: snapshotFile.schemaVersion,
      runtimeProfile: snapshotFile.runtimeProfile,
      selectedClientId: args.clientId ?? snapshotFile.selectedClientId,
      entries: selectedEntries,
    };
  }

  const files = args.clientId
    ? [`${args.clientId}.json`]
    : (await readdir(args.input.path))
        .filter((file) => file.endsWith(".json"))
        .sort((a, b) => a.localeCompare(b));
  const entries: [string, unknown][] = [];
  let runtimeProfile: string | null = null;
  for (const file of files) {
    const clientId = path.basename(file, ".json");
    const snapshot = await readJsonFile(path.join(args.input.path, file));
    const snapshotRecord = recordOrEmpty(snapshot);
    const snapshotRuntimeProfile = stringValue(snapshotRecord, "runtimeProfile");
    if (snapshotRuntimeProfile) runtimeProfile ??= snapshotRuntimeProfile;
    entries.push([clientId, snapshot]);
  }
  if (args.clientId && entries.length === 0) {
    throw new Error(`No client ${args.clientId} exists in ${args.input.path}.`);
  }
  return {
    sourceSchemaVersion: null,
    runtimeProfile: runtimeProfile ?? "unknown",
    selectedClientId: args.clientId,
    entries,
  };
}

export async function runClientSnapshotSummaryCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const loaded = await loadSnapshotEntries(args);
  if (loaded.entries.length === 0) {
    throw new Error(`No client snapshots exist in ${args.input.path}.`);
  }

  const summaries: Record<string, Record<string, unknown>> = {};
  for (const [clientId, snapshot] of loaded.entries) {
    summaries[clientId] = summarizeClientSnapshot({
      runtimeProfile: loaded.runtimeProfile,
      clientId,
      snapshot,
    });
  }

  const written: string[] = [];
  if (args.output.kind === "directory") {
    await mkdir(args.output.path, { recursive: true });
    for (const [clientId] of loaded.entries) {
      const outPath = path.join(args.output.path, `${clientId}.json`);
      await writeFile(outPath, stableJson(summaries[clientId]), "utf8");
      written.push(outPath);
    }
  } else {
    await mkdir(path.dirname(args.output.path), { recursive: true });
    await writeFile(
      args.output.path,
      stableJson(
        summaryFilePayload({
          sourceSchemaVersion: loaded.sourceSchemaVersion,
          runtimeProfile: loaded.runtimeProfile,
          selectedClientId: loaded.selectedClientId,
          summaries,
        }),
      ),
      "utf8",
    );
    written.push(args.output.path);
  }

  console.log(
    [
      "",
      `Wrote ${written.length} client state summary snapshot(s):`,
      ...written.map((file) => `  - ${file}`),
      "",
    ].join("\n"),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCliMain(() => runClientSnapshotSummaryCli());
}
