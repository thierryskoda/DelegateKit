#!/usr/bin/env tsx

import { repoRoot } from "@ai-assistants/repo-layout";
import {
  assertNangoOAuthReadinessSemantics,
  assertNangoProvisioningCoversOAuthActivationPolicies,
} from "@ai-assistants/nango-provisioning";
import { z } from "zod";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import {
  assertNangoActionProvisioningRemoved,
  assertBackendNangoProxyCallsAreWrapped,
  assertBackendNangoTriggersAreRemoved,
  assertNangoEnvContract,
} from "./deterministic/nango-manifest-contract";
import { assertNangoOAuthProjectionBaselineCurrent } from "./deterministic/nango-oauth-projection-baseline";
import { assertNangoSyncInventoryPreservesMultipleProviderAccounts } from "./deterministic/nango-sync-inventory-contract";
import { assertLocalPackageGraphIsAcyclic } from "./deterministic/package-graph";
import { assertProviderToolTestCoverageLedgerComplete } from "./deterministic/provider-test-coverage";
import { assertToolHandlerOutputGuards } from "./deterministic/tool-handler-output";
import { assertSchemaContractSourceLayout } from "./deterministic/schema-contract-source-guard";
import { assertSourceGuard } from "./deterministic/source";
import { assertBackendServiceEnvSource } from "./deterministic/backend-service-env-source";
import { assertConnectWebEnvSource } from "./deterministic/connect-web-env-source";
import { assertTestPolicy } from "./deterministic/test-policy";
import { findToolInventoryDescriptionGaps, renderAggregateToolInventory } from "../tool-inventory";
import { printJson } from "./results";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  allAssistantCapabilityContracts,
  builtinToolContractsForInventory,
} from "@ai-assistants/assistant-capability-surface";

function usage(): string {
  return [
    "Usage: npm run guard -- source",
    "",
    "Deterministically validates test policy, source/runtime hygiene, source-tracked plugin manifests, typed runtime guidance, client seed/runtime availability, Nango OAuth provisioning manifest coverage, removed Nango action provisioning, backend Nango trigger call sites, and backend Nango proxy HTTP call sites.",
    "Related: npm run guard -- e2e-harness validates deterministic E2E harness invariants.",
  ].join("\n");
}

const RUNTIME_PREFIXES = [
  "agents/",
  "canvas/",
  "completions/",
  "credentials/",
  "cron/",
  "delivery-queue/",
  "devices/",
  "flows/",
  "identity/",
  "logs/",
  "media/",
  "memory/",
  "sandbox/",
  "subagents/",
  "tasks/",
  "telegram/",
  "tmp/",
  "workspaces/",
];

const RUNTIME_FILES = new Set([
  "exec-approvals.json",
  "build.log",
  "plugins/installs.json",
]);

const sourceGuardCliSchema = z
  .object({ help: z.boolean().optional() })
  .transform((v) => ({ help: v.help ?? false }));

export async function runSourceGuardCli(argv = process.argv.slice(2)): Promise<void> {
  const { help } = parseCli(argv, {
    options: { help: { type: "boolean", short: "h" } },
    schema: sourceGuardCliSchema,
  });
  if (help) {
    console.log(usage());
    return;
  }
  const root = repoRoot(import.meta.url);
  assertTestPolicy(root);
  assertPublicReleaseSanitization(root);
  assertSourceRuntimeRepoHygiene(root);
  assertLocalPackageGraphIsAcyclic(root);
  assertNangoProvisioningCoversOAuthActivationPolicies();
  assertNangoOAuthReadinessSemantics();
  assertNangoOAuthProjectionBaselineCurrent(root);
  assertNangoSyncInventoryPreservesMultipleProviderAccounts(root);
  assertNangoReadinessUsesEvidenceEvaluator(root);
  assertNangoReconciliationUsesConnectedAccountLifecycle(root);
  assertNangoActionProvisioningRemoved(root);
  assertBackendNangoTriggersAreRemoved(root);
  assertBackendNangoProxyCallsAreWrapped(root);
  assertNangoEnvContract(root);
  assertBackendServiceEnvSource(root);
  assertConnectWebEnvSource(root);
  assertProviderToolTestCoverageLedgerComplete();
  assertToolHandlerOutputGuards(root);
  assertSchemaContractSourceLayout(root);
  assertAstGrepSourceGuard(root);
  assertToolInventoryContractDescriptions();
  await assertToolInventoryCurrent(root);
  const result = await assertSourceGuard(root, { checkRendered: true });
  printJson({ ok: true, guard: "source", ...result });
}

function assertPublicReleaseSanitization(root: string): void {
  const failures: string[] = [];
  const publicBindingPaths = [
    "scripts/integrations/testing-nango-bindings-dev.json",
    "scripts/integrations/testing-nango-bindings-e2e.json",
  ];
  for (const relativePath of publicBindingPaths) {
    if (existsSync(path.join(root, relativePath))) {
      failures.push(`${relativePath} must be replaced by an ignored *.local.json mapping.`);
    }
  }

  const privateFixturePrefixes = ["clients/testing/", "scripts/integrations/testing-data/", "tests/e2e/"];
  for (const relativePath of gitFiles(root)) {
    if (!privateFixturePrefixes.some((prefix) => relativePath.startsWith(prefix))) continue;
    const absolutePath = path.join(root, relativePath);
    if (!existsSync(absolutePath) || !/\.(json|md|ts|tsx)$/.test(relativePath)) continue;
    const source = readFileSync(absolutePath, "utf8");
    const consumerMailboxMatches = source.match(
      /[A-Z0-9._%+-]+@(gmail|hotmail|outlook|yahoo)\.[A-Z]{2,}/gi,
    );
    if (consumerMailboxMatches?.length) {
      failures.push(`${relativePath} contains consumer mailbox addresses; use reserved domains or private environment values.`);
    }
  }

  const fileAnalysisPath = "tests/e2e/capabilities/file-analysis-e2e.ts";
  const fileAnalysisSource = readFileSync(path.join(root, fileAnalysisPath), "utf8");
  if (/\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/.test(fileAnalysisSource)) {
    failures.push(`${fileAnalysisPath} contains a real-shaped Canadian postal address fixture.`);
  }

  const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");
  const requiredGitIgnoreEntries = [
    "scripts/integrations/*-nango-bindings-*.local.json",
    ".npmrc",
    ".envrc",
    ".dev.vars",
    "*.pem",
    "*.key",
    "/clients/*/",
  ];
  for (const entry of requiredGitIgnoreEntries) {
    if (!gitignore.split("\n").includes(entry)) failures.push(`.gitignore must include ${entry}.`);
  }

  const dockerignore = readFileSync(path.join(root, ".dockerignore"), "utf8");
  for (const entry of ["/.env*", "!/.env.example"]) {
    if (!dockerignore.split("\n").includes(entry))
      failures.push(`.dockerignore must include ${entry}.`);
  }

  if (failures.length > 0) {
    throw new Error(
      ["Public release sanitization failed.", ...failures.map((failure) => `- ${failure}`)].join(
        "\n",
      ),
    );
  }
}

function assertNangoReadinessUsesEvidenceEvaluator(root: string): void {
  const checkedFiles = [
    "apps/backend/src/integrations/nango/nango-connection-readiness.ts",
    "apps/backend/src/product/profile-capabilities/profile-capability-overview.ts",
  ];
  const failures: string[] = [];
  for (const relativePath of checkedFiles) {
    const text = readFileSync(path.join(root, relativePath), "utf8");
    if (text.includes("missingRequiredOAuthScopes")) {
      failures.push(
        `${relativePath} must use evaluateNangoOAuthReadiness, not missingRequiredOAuthScopes.`,
      );
    }
    if (!text.includes("evaluateNangoOAuthReadiness")) {
      failures.push(`${relativePath} must use evaluateNangoOAuthReadiness.`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

function assertNangoReconciliationUsesConnectedAccountLifecycle(root: string): void {
  const relativePath = "apps/backend/src/integrations/nango/reconcile-auth-connection.ts";
  const text = readFileSync(path.join(root, relativePath), "utf8");
  const forbiddenTables = [
    "capability_account_links",
    "connected_provider_accounts",
    "provider_connect_intents",
  ];
  const failures = forbiddenTables
    .filter((table) => text.includes(`.from("${table}")`) || text.includes(`.from('${table}')`))
    .map(
      (table) =>
        `${relativePath} must not write or query ${table} directly; use product connected-account lifecycle helpers.`,
    );
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

function gitFiles(root: string): string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function collectFiles(root: string, relativeDir: string, out: string[], limit = 50): void {
  if (out.length >= limit) return;
  const dir = path.join(root, relativeDir);
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (out.length >= limit) return;
    const relative = path.join(relativeDir, entry);
    const absolute = path.join(root, relative);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      collectFiles(root, relative, out, limit);
    } else if (stat.isFile()) {
      out.push(relative.split(path.sep).join("/"));
    }
  }
}

function gitGrep(root: string, pattern: string): string {
  try {
    return execFileSync("git", ["grep", "-n", pattern, "--", ".", ":(exclude).agent/**"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if (error && typeof error === "object" && "status" in error) {
      const status = (error as { status?: unknown }).status;
      if (status === 1) return "";
    }
    throw error;
  }
}

function assertNoRuntimeTracked(root: string): void {
  const bad = gitFiles(root).filter(
    (file) =>
      (RUNTIME_FILES.has(file) || RUNTIME_PREFIXES.some((prefix) => file.startsWith(prefix))) &&
      existsSync(path.join(root, file)),
  );
  if (bad.length > 0) {
    throw new Error(
      `Runtime/generated files still exist in the source repo:\n${bad.map((file) => `  - ${file}`).join("\n")}`,
    );
  }
}

function assertNoRootRuntimeFilesOnDisk(root: string): void {
  const bad: string[] = [];
  for (const prefix of RUNTIME_PREFIXES) {
    if (prefix === "tmp/") continue;
    const relativeDir = prefix.replace(/\/$/, "");
    const absoluteDir = path.join(root, relativeDir);
    if (existsSync(absoluteDir) && statSync(absoluteDir).isDirectory()) bad.push(prefix);
    collectFiles(root, relativeDir, bad);
  }
  for (const file of RUNTIME_FILES) {
    const target = path.join(root, file);
    if (existsSync(target) && statSync(target).isFile()) bad.push(file);
  }
  if (bad.length > 0) {
    throw new Error(
      `Ignored runtime/generated files still exist under the source repo root:\n${bad.map((file) => `  - ${file}`).join("\n")}`,
    );
  }
}

function assertNoLegacyProfileJsonRuntimeConfigs(root: string): void {
  const tracked = gitFiles(root).filter(
    (file) => /^clients\/[^/]+\/[^/]+\.json$/.test(file) && existsSync(path.join(root, file)),
  );
  const onDisk: string[] = [];
  const clientsDir = path.join(root, "clients");
  if (existsSync(clientsDir)) {
    for (const clientDir of readdirSync(clientsDir)) {
      const absoluteClientDir = path.join(clientsDir, clientDir);
      if (!statSync(absoluteClientDir).isDirectory()) continue;
      for (const entry of readdirSync(absoluteClientDir)) {
        const relative = `clients/${clientDir}/${entry}`;
        if (entry.endsWith(".json")) onDisk.push(relative);
      }
    }
  }
  const bad = [...new Set([...tracked, ...onDisk])].sort();
  if (bad.length > 0) {
    throw new Error(
      `Client profile context forbids legacy runtime JSON configs under clients/; use typed seed.ts and runtime.ts source instead:\n${bad.map((file) => `  - ${file}`).join("\n")}`,
    );
  }
}

function assertNoStaleClientNaming(root: string): void {
  const stale = "context" + "/clients";
  const matches = gitGrep(root, stale);
  if (matches.trim()) throw new Error(`Stale ${stale} references remain:\n${matches}`);
}

function assertSourceRuntimeRepoHygiene(root: string): void {
  assertNoLegacyProfileJsonRuntimeConfigs(root);
  assertNoRuntimeTracked(root);
  const isManagedE2e = Boolean(process.env.AI_ASSISTANTS_E2E_RUN_ID?.trim());
  if (!isManagedE2e) {
    assertNoRootRuntimeFilesOnDisk(root);
  }
  assertNoStaleClientNaming(root);
}

function assertToolInventoryContractDescriptions(): void {
  const contractByName = new Map(
    [...allAssistantCapabilityContracts(), ...builtinToolContractsForInventory()].map(
      (contract) => [contract.name, contract],
    ),
  );
  const gaps = findToolInventoryDescriptionGaps([...contractByName.values()]);
  if (gaps.length === 0) return;
  throw new Error(
    [
      "Agent-visible tool inventory fields must have canonical schema descriptions.",
      ...gaps.map((gap) => `- ${gap.toolName} ${gap.kind} ${gap.path}`),
    ].join("\n"),
  );
}

function assertAstGrepSourceGuard(root: string): void {
  const sgBin = path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "sg.cmd" : "sg",
  );
  try {
    execFileSync(sgBin, ["scan", "--config", path.join(root, "sgconfig.yml")], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const output =
      error && typeof error === "object" && "stdout" in error
        ? String((error as { stdout?: unknown }).stdout ?? "")
        : "";
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : "";
    throw new Error(
      [
        "ast-grep source guard failed. Run npm exec -- sg scan --config sgconfig.yml.",
        output.trim(),
        stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
      { cause: error },
    );
  }
}

async function assertToolInventoryCurrent(root: string): Promise<void> {
  const expected = renderAggregateToolInventory({
    builtinContracts: builtinToolContractsForInventory(),
    assistantCapabilityContracts: allAssistantCapabilityContracts(),
  });
  const outputPath = path.join(root, "tool-inventory.generated.md");
  const actual = await readFile(outputPath, "utf8").catch(() => null);
  if (actual !== expected) {
    throw new Error(`${path.relative(root, outputPath)} is stale. Run npm run tools:inventory.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runSourceGuardCli());
}
