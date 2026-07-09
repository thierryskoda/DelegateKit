import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { formatUnknownError } from "@ai-assistants/errors";
import { repoRoot } from "@ai-assistants/repo-layout";
import {
  clientRuntimeSchema,
  clientSeedSchema,
  type ClientRuntime,
  type ClientSeed,
} from "./schema";

export type ClientRuntimeSource = {
  clientId: string;
  runtimePath: string;
  runtime: ClientRuntime;
  seedPath: string | null;
};

export type ClientSeedSource = ClientRuntimeSource & {
  seedPath: string;
  seed: ClientSeed;
};

export async function loadClientSeed(filePath: string): Promise<ClientSeed> {
  let rawSeed: unknown;
  try {
    const module = (await import(pathToFileURL(filePath).href)) as { default?: unknown };
    rawSeed = module.default;
  } catch (error) {
    throw new Error(`Could not import client seed ${filePath}: ${formatUnknownError(error)}`);
  }
  const parsed = clientSeedSchema.safeParse(rawSeed);
  if (!parsed.success)
    throw new Error(
      `Invalid client seed ${filePath}:\n${formatUnknownError(parsed.error, { mode: "block" })}`,
    );
  return parsed.data;
}

export async function loadClientRuntime(filePath: string): Promise<ClientRuntime> {
  let rawRuntime: unknown;
  try {
    const module = (await import(pathToFileURL(filePath).href)) as { default?: unknown };
    rawRuntime = module.default;
  } catch (error) {
    throw new Error(
      `Could not import client runtime config ${filePath}: ${formatUnknownError(error)}`,
    );
  }
  const parsed = clientRuntimeSchema.safeParse(rawRuntime);
  if (!parsed.success)
    throw new Error(
      `Invalid client runtime config ${filePath}:\n${formatUnknownError(parsed.error, { mode: "block" })}`,
    );
  return parsed.data;
}

export async function loadClientRuntimeSources(
  root = repoRoot(import.meta.url),
): Promise<ClientRuntimeSource[]> {
  const clientsDir = path.join(root, "clients");
  const sources: ClientRuntimeSource[] = [];
  for (const entry of readdirSync(clientsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.endsWith(".generated")) {
      continue;
    }
    const seedPath = path.join(clientsDir, entry.name, "seed.ts");
    const runtimePath = path.join(clientsDir, entry.name, "runtime.ts");
    if (!existsSync(runtimePath)) {
      throw new Error(`Client ${entry.name} is missing clients/${entry.name}/runtime.ts.`);
    }
    const runtime = await loadClientRuntime(runtimePath);
    if (runtime.profileId !== entry.name) {
      throw new Error(
        `clients/${entry.name}/runtime.ts profileId must be ${entry.name}; got ${JSON.stringify(runtime.profileId)}.`,
      );
    }
    sources.push({
      clientId: entry.name,
      runtimePath,
      runtime,
      seedPath: existsSync(seedPath) ? seedPath : null,
    });
  }
  return sources.sort((a, b) => a.clientId.localeCompare(b.clientId));
}

export async function loadClientSeedSources(
  root = repoRoot(import.meta.url),
): Promise<ClientSeedSource[]> {
  const runtimeSources = await loadClientRuntimeSources(root);
  const sources: ClientSeedSource[] = [];
  for (const source of runtimeSources) {
    if (!source.seedPath) continue;
    const seed = await loadClientSeed(source.seedPath);
    if (seed.profile.id !== source.clientId) {
      throw new Error(
        `clients/${source.clientId}/seed.ts profile.id must be ${source.clientId}; got ${JSON.stringify(seed.profile.id)}.`,
      );
    }
    if (seed.profile.id !== source.runtime.profileId) {
      throw new Error(
        `Client ${source.clientId} seed profile.id and runtime profileId must match; got ${seed.profile.id} and ${source.runtime.profileId}.`,
      );
    }
    sources.push({ ...source, seedPath: source.seedPath, seed });
  }
  return sources;
}
