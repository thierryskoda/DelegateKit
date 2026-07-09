#!/usr/bin/env tsx

import { existsSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "@ai-assistants/repo-layout";
import { format, resolveConfig } from "prettier";
import { z } from "zod";
import { clientRuntimeSchema, clientSeedSchema } from "./schema";

export function clientSeedJsonSchemaPath(root = repoRoot(import.meta.url)): string {
  return path.join(root, "clients", "seed.schema.generated.json");
}

export function clientRuntimeJsonSchemaPath(root = repoRoot(import.meta.url)): string {
  return path.join(root, "clients", "runtime.schema.generated.json");
}

function legacyClientJsonSchemaPath(root = repoRoot(import.meta.url)): string {
  return path.join(root, "clients", ["onboarding", "schema", "json"].join("."));
}

function previousGeneratedClientJsonSchemaPaths(root = repoRoot(import.meta.url)): string[] {
  return [
    path.join(root, "clients", "seed.schema.json"),
    path.join(root, "clients", "runtime.schema.json"),
  ];
}

export function clientSeedJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(clientSeedSchema, {
    io: "input",
    target: "draft-07",
  });

  return {
    ...schema,
    $comment:
      "Generated from scripts/clients/schema.ts by npm run clients -- schema. Do not edit by hand.",
    title: "AI Assistants Client Seed",
  };
}

export function clientRuntimeJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(clientRuntimeSchema, {
    io: "input",
    target: "draft-07",
  });

  return {
    ...schema,
    $comment:
      "Generated from scripts/clients/schema.ts by npm run clients -- schema. Do not edit by hand.",
    title: "AI Assistants Client Runtime Config",
  };
}

async function formatJsonSchema(
  filepath: string,
  schema: Record<string, unknown>,
): Promise<string> {
  const config = (await resolveConfig(filepath)) ?? {};
  return await format(JSON.stringify(schema), {
    ...config,
    filepath,
    parser: "json",
  });
}

export async function writeClientJsonSchemas(root = repoRoot(import.meta.url)): Promise<string[]> {
  const seedOutputPath = clientSeedJsonSchemaPath(root);
  const runtimeOutputPath = clientRuntimeJsonSchemaPath(root);
  writeFileSync(
    seedOutputPath,
    await formatJsonSchema(seedOutputPath, clientSeedJsonSchema()),
    "utf8",
  );
  writeFileSync(
    runtimeOutputPath,
    await formatJsonSchema(runtimeOutputPath, clientRuntimeJsonSchema()),
    "utf8",
  );
  const oldPath = legacyClientJsonSchemaPath(root);
  if (existsSync(oldPath)) await rm(oldPath);
  for (const previousPath of previousGeneratedClientJsonSchemaPaths(root)) {
    if (existsSync(previousPath)) await rm(previousPath);
  }
  return [seedOutputPath, runtimeOutputPath];
}

export async function runClientSchemaCli(): Promise<void> {
  const outputPaths = await writeClientJsonSchemas();
  for (const outputPath of outputPaths) {
    console.log(`Wrote ${path.relative(repoRoot(import.meta.url), outputPath)}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runClientSchemaCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
