#!/usr/bin/env tsx

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { TOOL_RUNTIME_GUIDANCE_PREFIXES } from "@ai-assistants/runtime-guidance";
import { repoRoot } from "@ai-assistants/repo-layout";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import ts from "typescript";
import { z } from "zod";
import { extractRunDir } from "../e2e-sweep/e2e-sweep-scope";
import { resolveE2eSetupScope } from "../e2e-test-scope";
import {
  allTestingScenarios,
  highValueTestingScenarios,
  TESTING_SCENARIO_EXPECTATIONS,
  type TestingScenario,
} from "../../../tests/e2e/scenarios/scenarios";
import {
  createE2eFixtureScope,
  type E2eFixtureManifestEvent,
  type E2eFixtureManifestResource,
} from "../../../tests/e2e/helpers/fixtures/e2e-fixture-scope";
import { cloneE2eRuntimeState } from "../../../tests/e2e/helpers/run/e2e-runtime-state";
import {
  activeFixtureCandidatesFromEvents,
  executeStaleFixtureCleanup,
  parseCleanupStaleFixturesArgs,
  previewStaleFixtureCleanup,
  staleFixtureCandidates,
  type StaleFixtureCleanupHandlers,
} from "../e2e-fixtures/cleanup-stale-fixtures";
import { assertCapabilityE2eToolCoverage } from "./capability-e2e-tool-coverage";
import { printJson } from "./results";

const TESTING_SCENARIO_BY_ID_RE = /testingScenarioById\("(?<id>TS-(?:HV|MV|LV)-\d{3})"\)/g;
const HIGH_VALUE_TEST_ID_RE = /\bTS-HV-\d{3}\b/g;
const SCENARIO_E2E_FILE_RE = /^ts-(?<value>hv|mv|lv)-(?<number>\d{3})-.+-e2e\.ts$/;
const SCENARIO_JUDGE_E2E_RE =
  /\b(expectTestingJudgePass|runE2eJudgeOnTurn|runE2eJudgeAssertPass|runE2eJudgeOnTranscriptSummaries)\b/;
const TDD_RED_TARGET_RE =
  /\bthrow new Error\(\s*`\$\{SCENARIO\.id\}: TDD target not implemented\. Missing product path: [^`]+`\s*,?\s*\)/s;
const CREATED_AT = "2026-05-24T12:00:00.000Z";
const CLEANED_AT = "2026-05-24T12:05:00.000Z";
const STATIC_GUARD_TEST_RE = /^test\(["']guard:/m;
const GUIDANCE_BACKED_TOOL_NAME_RE = new RegExp(
  `\\b(?:${TOOL_RUNTIME_GUIDANCE_PREFIXES.map(([prefix]) =>
    prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|")})[a-z0-9_]+\\b`,
);
const DIRECT_TOOL_ASSERTION_RE =
  /\b(?:assertBackendToolOkForName|assertBackendToolOkResultsForName|requireToolCall)\s*\(/;
const CONTEXT_COVERAGE_ASSERTION_RE =
  /\b(?:expectTurnContextJudgePass|expectTurnContextJudgePassForTrajectoryPath|expectWorkItemGuidanceMarkdownJudgePass|expectTurnContextAndRequiredToolCalls|expectTurnContextAndOneOfToolCallGroups|expectTurnContextAndProviderReadFamilies)\s*\(/;
const CONTEXT_COVERAGE_ASSERTION_EXEMPTION_RE = /context coverage assertion exempt/i;
const SEMANTIC_PROSE_REGEX_ASSERTION_RE =
  /\bassert\.(?:match|doesNotMatch)\(\s*[^,\n]*(?:outboundText|bodyText|noteText|purpose|openingLine|summary)\b[\s\S]{0,240}?\/[a-z][^/\n]*\/[a-z]*/i;
const SEMANTIC_PROSE_REGEX_EXEMPTION_RE = /semantic prose regex exempt/i;
const BANNED_SCENARIO_CLIENT_VISIBLE_SUBSTRINGS = [
  "@example.com",
  "@example.test",
  "example.test",
  "client.local",
  "AI Assistants E2E",
  "Temporary E2E",
  "E2E Signer",
  "Acme Corp",
  "Acme Deal",
  "[test ref:",
  "Token:",
] as const;
const BANNED_SCENARIO_CLIENT_VISIBLE_PATTERNS: readonly {
  label: string;
  pattern: RegExp;
}[] = BANNED_SCENARIO_CLIENT_VISIBLE_SUBSTRINGS.map((value) => ({
  label: value,
  pattern:
    value === "Token:"
      ? /(^|[^A-Za-z])Token:/
      : new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
}));
const ALLOWED_CACHED_SCENARIO_PROMPT_REALISM_FILES = new Set([
  "ts-hv-043-guidance-prompt-injection-e2e.ts",
]);
const COACHED_SCENARIO_PROMPT_PATTERNS: readonly {
  label: string;
  pattern: RegExp;
  hint: string;
}[] = [
  {
    label: "artifact mechanics",
    pattern: /\b(?:artifactId|artifact id|artifact link|created artifact|saved PDF artifact|PDF artifact|artifact details)\b/i,
    hint: "Move artifact transport expectations to tool assertions or judge criteria.",
  },
  {
    label: "raw media protocol",
    pattern: /\b(?:MEDIA line|PDF media reference|media reference|delivery URL)\b/i,
    hint: "Assert native attachment delivery with expectOutboundMediaDelivery.",
  },
  {
    label: "internal paths or hashes",
    pattern: /\b(?:file path|sha256|hash|internal IDs?|backend ids?|setup labels?)\b/i,
    hint: "Keep no-internals expectations in safe-reply assertions or judges.",
  },
  {
    label: "tooling terminology",
    pattern: /\b(?:tool names?|work_item|work item id|session key|raw diagnostics|implementation details?)\b/i,
    hint: "Do not expose implementation vocabulary in simulated user messages.",
  },
  {
    label: "PDF-reader implementation instruction",
    pattern: /\bpass the returned PDF media reference directly to the PDF reader\b/i,
    hint: "Let runtime guidance and tool assertions own PDF handling details.",
  },
  {
    label: "provider exclusion coaching",
    pattern: /\b(?:not Outlook or Microsoft mail|do not use Outlook or Microsoft mail|Gmail only|Google Calendar only|Use Google Calendar only)\b/i,
    hint: "Use natural provider names and prove routing through tool-call assertions.",
  },
] as const;

type TestingScenarioE2eFile = {
  name: string;
  source: string;
};

type ScenarioProviderSurfaceClassification =
  | {
      status: "provider_sandbox";
      file: string;
      providerMarkers: readonly string[];
      sandboxMarkers: readonly string[];
    }
  | {
      status: "no_provider_surface";
      file: string;
    }
  | {
      status: "invalid";
      file: string;
      reasons: readonly string[];
      providerMarkers: readonly string[];
      sandboxMarkers: readonly string[];
    };

type SourcePattern = {
  label: string;
  test: (source: string) => boolean;
};

function extractFunctionBody(source: string, functionName: string): string {
  const functionStart = source.search(
    new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`),
  );
  assert.notEqual(functionStart, -1, `Expected function ${functionName} to exist.`);
  const bodyStart = source.indexOf("{", functionStart);
  assert.notEqual(bodyStart, -1, `Expected function ${functionName} to have a body.`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart + 1, index);
    }
  }
  throw new Error(`Expected function ${functionName} body to close.`);
}

function assertSourceIncludesOrdered(
  source: string,
  needles: readonly string[],
  message: string,
): void {
  let searchFrom = 0;
  for (const needle of needles) {
    const foundAt = source.indexOf(needle, searchFrom);
    assert.notEqual(foundAt, -1, `${message} Missing ordered source: ${needle}`);
    searchFrom = foundAt + needle.length;
  }
}

const e2eHarnessGuardCliSchema = z
  .object({ help: z.boolean().optional() })
  .transform((value) => ({ help: value.help ?? false }));

function usage(): string {
  return [
    "Usage: npm run guard -- e2e-harness",
    "",
    "Validates deterministic E2E harness invariants: testing scenario catalog coverage, tool-call assertions, and fixture cleanup safety.",
  ].join("\n");
}

export async function runE2eHarnessGuardCli(argv = process.argv.slice(2)): Promise<void> {
  const { help } = parseCli(argv, {
    options: { help: { type: "boolean", short: "h" } },
    schema: e2eHarnessGuardCliSchema,
  });
  if (help) {
    console.log(usage());
    return;
  }

  const root = repoRoot(import.meta.url);
  assertE2eSweepRunDirExtraction(root);
  assertE2eRuntimeClonePolicy();
  assertE2eCommandBoundary(root);
  assertE2eWorkerLaneLeaseContract(root);
  assertE2eSetupScopeResolution();
  assertNoE2eRuntimeDevReferences(root);
  assertWebhookE2eRouteShape(root);
  assertScenarioProviderSandboxCoverage(root);
  assertScenarioSandboxHelpersAvoidLiveProviderAccess(root);
  assertScenarioExternalProviderCleanupPressure(root);
  assertTestingSandboxAccountsAvoidNangoIdentifiers(root);
  assertProviderSandboxFixtureTyping(root);
  assertProviderCapabilityE2esAssertLiveMode(root);
  assertTestingScenarioCatalogCoverage(root);
  assertTestingScenarioExpectationMetadata(root);
  assertNoStaticGuardTestsInE2e(root);
  assertScenarioSourcesAvoidFakeClientFields(root);
  assertScenarioChannelMessagesAvoidCoachedPrompts(root);
  assertScenarioSourcesAvoidSemanticProseRegexAssertions(root);
  assertScenarioDirectToolAssertionsHaveContextCoverage(root);
  assertCapabilityE2eToolCoverage(root);
  await assertTestingSeedDisablesProviderWebhookSubscriptions(root);
  await withMutedFixtureLogs(async () => {
    await assertFixtureScopeManifestSafety();
    await assertStaleFixtureCleanupSafety();
  });
  printJson({ ok: true, guard: "e2e-harness" });
}

function assertE2eSetupScopeResolution(): void {
  assert.deepEqual(
    resolveE2eSetupScope(["tests/e2e/scenarios/scenarios.ts"]),
    {
      kind: "sandbox-only",
    },
  );
  assert.deepEqual(resolveE2eSetupScope(["./tests/e2e/capabilities/gmail-e2e.ts"]), {
    kind: "live-bindings",
    bindings: [{ capabilitySlug: "gmail", provider: "gmail" }],
  });
  assert.deepEqual(resolveE2eSetupScope(["tests/e2e/capabilities/public-web-e2e.ts"]), {
    kind: "sandbox-only",
  });
  assert.deepEqual(resolveE2eSetupScope(["tests/e2e/capabilities/**/*-e2e.ts"]), {
    kind: "live-bindings",
    bindings: [],
  });
}

async function withMutedFixtureLogs<T>(run: () => Promise<T>): Promise<T> {
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await run();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
}

function assertE2eWorkerLaneLeaseContract(root: string): void {
  const laneStateSource = readFileSync(
    path.join(root, "scripts/repo-tooling/e2e-lane-state.ts"),
    "utf8",
  );
  const lanePrepareSource = readFileSync(
    path.join(root, "scripts/repo-tooling/e2e-lane-prepare.ts"),
    "utf8",
  );
  const laneConfigSource = readFileSync(
    path.join(root, "scripts/repo-tooling/e2e-lanes.ts"),
    "utf8",
  );
  const laneRuntimeSource = readFileSync(
    path.join(root, "scripts/repo-tooling/e2e-lane-runtime.ts"),
    "utf8",
  );
  const laneDockerSource = readFileSync(
    path.join(root, "scripts/repo-tooling/e2e-lane-docker.ts"),
    "utf8",
  );
  const runnerSource = readFileSync(
    path.join(root, "scripts/repo-tooling/run-e2e-tests.ts"),
    "utf8",
  );
  const supabaseSource = readFileSync(path.join(root, "scripts/profiles/supabase.ts"), "utf8");
  const diagnosticsSource = readFileSync(
    path.join(root, "scripts/repo-tooling/e2e-infra-diagnostics.ts"),
    "utf8",
  );
  const lanesCliSource = readFileSync(
    path.join(root, "scripts/repo-tooling/e2e-lanes-cli.ts"),
    "utf8",
  );
  const scopeSource = readFileSync(
    path.join(root, "scripts/repo-tooling/e2e-test-scope.ts"),
    "utf8",
  );
  const prepareE2eLaneBody = extractFunctionBody(lanePrepareSource, "prepareE2eLane");
  const fullResetAndBuildLaneBody = extractFunctionBody(
    lanePrepareSource,
    "fullResetAndBuildE2eLaneRuntime",
  );
  const dataResetAndBuildLaneBody = extractFunctionBody(
    lanePrepareSource,
    "dataResetAndBuildE2eLaneRuntime",
  );
  const resetLeasedLaneBody = extractFunctionBody(lanePrepareSource, "resetLeasedE2eLaneBeforeRun");
  const releaseLeasedLaneBody = extractFunctionBody(
    lanePrepareSource,
    "releaseLeasedE2eLaneAfterRun",
  );
  assert.equal(
    laneConfigSource.includes(".ai-assistants-e2e-lanes") &&
      laneConfigSource.includes("e2e-lane-1") &&
      laneConfigSource.includes("e2e-lane-2"),
    true,
    "E2E lanes must use fixed checked-in lane ids and a dedicated lane root.",
  );
  assert.equal(
    laneConfigSource.includes("dockerContext") &&
      laneConfigSource.includes("colima-e2e-lane-1") &&
      laneConfigSource.includes("colima-e2e-lane-2") &&
      laneConfigSource.includes("DOCKER_CONTEXT: lane.dockerContext") &&
      laneConfigSource.includes("AI_ASSISTANTS_E2E_DOCKER_CONTEXT"),
    true,
    "E2E lanes must declare per-lane Docker contexts and pass them to child process env.",
  );
  assert.equal(
    laneRuntimeSource.includes('kind: "ai-assistants.e2e.lane-runtime"') &&
      laneConfigSource.includes("lane-runtime.json"),
    true,
    "Active E2E lanes must use lane-runtime metadata.",
  );
  assert.equal(
    laneDockerSource.includes("DOCKER_CONTEXT") &&
      laneDockerSource.includes("runE2eLaneDockerCommand"),
    true,
    "E2E lane Docker commands must target the lane Docker context without changing global Docker state.",
  );
  assert.equal(
    laneStateSource.includes('"ready"') &&
      laneStateSource.includes('"leased"') &&
      laneStateSource.includes('"dirty"') &&
      laneStateSource.includes('"quarantined"'),
    true,
    "E2E lane state must include ready, leased, dirty, and quarantined lifecycle states.",
  );
  assert.equal(
    laneStateSource.includes("processIsAlive(record.ownerPid)") &&
      laneStateSource.includes('state: "dirty"'),
    true,
    "Dead E2E lane owners must transition leased lanes to dirty, not ready.",
  );
  assert.equal(
    laneStateSource.includes("assertLease") && laneStateSource.includes("leaseToken"),
    true,
    "E2E lane release/quarantine must use fencing tokens so stale owners cannot mutate a new lease.",
  );
  assert.equal(
    runnerSource.includes("acquireE2eLaneLease") && runnerSource.includes("envForE2eLaneRuntime"),
    true,
    "npm run e2e must lease a ready fixed lane and pass lane env to child tests.",
  );
  assert.equal(
    runnerSource.includes("resetLeasedE2eLaneBeforeRun") &&
      runnerSource.includes("releaseLeasedE2eLaneAfterRun") &&
      fullResetAndBuildLaneBody.includes("resetE2eSupabaseRuntime") &&
      fullResetAndBuildLaneBody.includes("buildE2eLaneRuntime") &&
      dataResetAndBuildLaneBody.includes("resetE2eSupabaseRuntimeDataOnly") &&
      dataResetAndBuildLaneBody.includes("buildE2eLaneRuntime") &&
      laneStateSource.includes("preparedFingerprint") &&
      laneStateSource.includes("lastResetMode") &&
      prepareE2eLaneBody.includes("fullResetAndBuildE2eLaneRuntime(lane)") &&
      resetLeasedLaneBody.includes("computeE2eSupabaseRuntimeFingerprint") &&
      resetLeasedLaneBody.includes("lease.preparedFingerprint === expectedFingerprint") &&
      resetLeasedLaneBody.includes("dataResetAndBuildE2eLaneRuntime(lease.lane") &&
      resetLeasedLaneBody.includes("fullResetAndBuildE2eLaneRuntime(lease.lane") &&
      resetLeasedLaneBody.includes("markResetComplete") &&
      releaseLeasedLaneBody.includes("releaseReady") &&
      !releaseLeasedLaneBody.includes("fullResetAndBuildE2eLaneRuntime") &&
      !releaseLeasedLaneBody.includes("dataResetAndBuildE2eLaneRuntime") &&
      !lanePrepareSource.includes("resetLeasedE2eLaneToReady"),
    true,
    "npm run e2e must fast-reset matching prepared lanes, full-reset stale lanes, and release with metadata only after tests.",
  );
  assert.equal(
    lanePrepareSource.includes("stableLockHash(lane.dockerContext)") &&
      !lanePrepareSource.includes("const E2E_LANE_SUPABASE_OPERATION_LOCK"),
    true,
    "E2E lane lifecycle locks must be scoped per Docker context, not global across all lanes.",
  );
  assert.equal(
    supabaseSource.includes("dockerContext") &&
      supabaseSource.includes("DOCKER_CONTEXT") &&
      supabaseSource.includes("dockerEnvForContext"),
    true,
    "E2E Supabase start/reset/stop must run with the configured lane Docker context.",
  );
  assert.equal(
    diagnosticsSource.includes("input.runtime.dockerContext") &&
      diagnosticsSource.includes("DOCKER_CONTEXT"),
    true,
    "E2E infrastructure diagnostics must inspect the same Docker context as the lane runtime.",
  );
  assert.equal(
    lanesCliSource.includes("doctor-docker-contexts") &&
      lanesCliSource.includes("print-colima-setup") &&
      lanesCliSource.includes("assertLanePreparePreflight"),
    true,
    "E2E lane CLI must include Docker context doctor/setup/preflight commands.",
  );
  assert.equal(
    [
      laneConfigSource,
      laneDockerSource,
      lanePrepareSource,
      runnerSource,
      supabaseSource,
      diagnosticsSource,
      lanesCliSource,
    ].some((source) => source.includes("docker context use")),
    false,
    "E2E lane scripts must not mutate global Docker CLI context with docker context use.",
  );
  assert.equal(
    [runnerSource, lanePrepareSource].some((source) =>
      source.includes("resetLeasedE2eLaneToReady"),
    ) ||
      runnerSource.includes("createE2eDynamicRuntime") ||
      runnerSource.includes("withE2eRuntimeStartupCapacity") ||
      runnerSource.includes("resetE2eSupabaseRuntime"),
    false,
    "npm run e2e must not create dynamic runtimes, use startup locks, or use release-time Supabase reset helpers.",
  );
  assert.equal(
    runnerSource.includes(".quarantine(") &&
      runnerSource.includes("collectE2eInfrastructureDiagnostics"),
    true,
    "E2E setup failures must collect diagnostics and quarantine uncertain lanes.",
  );
  assert.equal(
    runnerSource.includes("E2E_NODE_TEST_TIMEOUT_MS") &&
      runnerSource.includes("childTimedOut") &&
      runnerSource.includes('phase: "test-timeout"'),
    true,
    "npm run e2e must bound the child node --test process and quarantine lanes after child test timeouts.",
  );
  assert.equal(
    scopeSource.includes("e2e-worker-lane-leasing-e2e.ts") &&
      scopeSource.includes("e2e-worker-lane-clean-state-e2e.ts") &&
      scopeSource.includes("SANDBOX_ONLY_E2E_FILES"),
    true,
    "The worker lane E2Es must skip global live Nango binding; they only validate harness leasing.",
  );
  assert.equal(
    scopeSource.includes("LIVE_BINDING_E2E_FILES") &&
      runnerSource.includes("--capability=") &&
      runnerSource.includes("--provider="),
    true,
    "Single capability E2Es must scope live Nango binding to the required capability/provider pair.",
  );
}

function testingScenarioFiles(root: string): readonly TestingScenarioE2eFile[] {
  const scenarioDir = path.join(root, "tests/e2e/scenarios");
  const files: TestingScenarioE2eFile[] = [];
  for (const entry of readdirSync(scenarioDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith("-e2e.ts")) continue;
    files.push({
      name: entry.name,
      source: readFileSync(path.join(scenarioDir, entry.name), "utf8"),
    });
  }
  return files;
}

function e2eFiles(root: string): readonly TestingScenarioE2eFile[] {
  const e2eDir = path.join(root, "tests/e2e");
  const files: TestingScenarioE2eFile[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith("-e2e.ts")) continue;
      files.push({
        name: path.relative(e2eDir, absolutePath),
        source: readFileSync(absolutePath, "utf8"),
      });
    }
  };
  visit(e2eDir);
  return files;
}

function e2eSourceFiles(root: string): readonly TestingScenarioE2eFile[] {
  const e2eDir = path.join(root, "tests/e2e");
  const files: TestingScenarioE2eFile[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !/\.(?:md|ts|tsx|json)$/.test(entry.name)) continue;
      files.push({
        name: path.relative(e2eDir, absolutePath),
        source: readFileSync(absolutePath, "utf8"),
      });
    }
  };
  visit(e2eDir);
  return files;
}

function e2eSourceFilesUnder(
  root: string,
  relativeDir: string,
): readonly TestingScenarioE2eFile[] {
  const sourceDir = path.join(root, relativeDir);
  const files: TestingScenarioE2eFile[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !/\.(?:ts|tsx|json)$/.test(entry.name)) continue;
      files.push({
        name: path.relative(path.join(root, "tests/e2e"), absolutePath),
        source: readFileSync(absolutePath, "utf8"),
      });
    }
  };
  visit(sourceDir);
  return files;
}

function assertNoE2eRuntimeDevReferences(root: string): void {
  const banned = [
    "startDevSupabase",
    "resolveDevSupabaseContext",
    "loadDevProfileEnv",
    "useDevDb",
    "shared dev Supabase",
    "testing-nango-bindings-dev",
  ] as const;
  const failures = e2eSourceFiles(root).flatMap(({ name, source }) =>
    banned
      .filter((needle) => source.includes(needle))
      .map((needle) => `${name}: contains ${needle}`),
  );
  assert.deepEqual(
    failures,
    [],
    `E2E runtime helpers must not point at dev-specific Supabase/env/Nango paths:\n${failures.join("\n")}`,
  );
}

function assertE2eCommandBoundary(root: string): void {
  const e2eRunSource = readFileSync(path.join(root, "tests/e2e/helpers/run/e2e-run.ts"), "utf8");
  const runnerSource = readFileSync(
    path.join(root, "scripts/repo-tooling/run-e2e-tests.ts"),
    "utf8",
  );
  const prepareCommandBody = extractFunctionBody(runnerSource, "prepareE2eCommand");
  const releaseRuntimeLeaseBody = extractFunctionBody(runnerSource, "releaseRuntimeLease");
  assert.equal(
    /runProfileSupabaseCli\(\s*\[\s*["']reset["']/.test(e2eRunSource),
    false,
    "createE2eRun must not reset Supabase; fixed E2E lanes own runtime preparation.",
  );
  assert.equal(
    /runProfileSupabaseCli\(\s*\[\s*["']reset["']\s*,\s*["']--profile=e2e["']\s*\]/.test(
      runnerSource,
    ),
    false,
    "npm run e2e must not reset the canonical e2e Supabase profile.",
  );
  assert.equal(
    runnerSource.includes("acquireE2eLaneLease"),
    true,
    "npm run e2e must acquire a fixed E2E worker lane.",
  );
  assert.equal(
    prepareCommandBody.includes("resetLeasedE2eLaneBeforeRun") &&
      prepareCommandBody.includes("e2e.lane_pre_run_reset"),
    true,
    "npm run e2e must reset the leased fixed lane before spawning tests.",
  );
  assertSourceIncludesOrdered(
    prepareCommandBody,
    [
      "resetLeasedE2eLaneBeforeRun",
      'setupScope.kind === "live-bindings"',
      "runNangoProfileBind",
      "buildAndValidateProfile",
    ],
    "npm run e2e must reset the leased lane before live bindings and profile build.",
  );
  assert.equal(
    releaseRuntimeLeaseBody.includes("resetLeasedE2eLaneBeforeRun") ||
      releaseRuntimeLeaseBody.includes("resetAndBuildE2eLaneRuntime") ||
      runnerSource.includes("resetLeasedE2eLaneToReady") ||
      runnerSource.includes("Reset and released E2E lane"),
    false,
    "npm run e2e must not reset the lane during post-test release.",
  );
  assert.equal(
    runnerSource.includes("createE2eDynamicRuntime") ||
      runnerSource.includes("withE2eRuntimeStartupCapacity"),
    false,
    "npm run e2e must not create dynamic runtimes or use the old runtime startup coordinator.",
  );
  assert.equal(
    runnerSource.includes("AI_ASSISTANTS_E2E_PROFILE_ENV_PATH") ||
      runnerSource.includes("envForE2eLaneRuntime"),
    true,
    "npm run e2e must pass the fixed E2E lane env path/root to child tests.",
  );
  assert.equal(
    runnerSource.includes("withE2eCommandPrepLock"),
    false,
    "npm run e2e must not use the old global prep lock; fixed lanes are prepared outside test startup.",
  );
  assert.equal(
    runnerSource.includes("AI_ASSISTANTS_E2E_RUNNER_PREPARED"),
    true,
    "npm run e2e must set AI_ASSISTANTS_E2E_RUNNER_PREPARED for child tests.",
  );
  assert.equal(
    prepareCommandBody.includes('setupScope.kind === "live-bindings"') &&
      /runNangoProfileBind\(\s*\[\s*["']apply["']\s*,\s*["']--profile=e2e["']\s*,\s*["']--no-wait-for-setup["']\s*,\s*\.\.\.filterArgs\s*\]/.test(
        prepareCommandBody,
      ),
    true,
    "npm run e2e must apply checked-in e2e Nango bindings only for live-binding setup scope and pass capability/provider filters when resolved.",
  );
  assert.equal(
    e2eRunSource.includes("AI_ASSISTANTS_E2E_RUNNER_PREPARED"),
    true,
    "createE2eRun must fail fast when invoked outside npm run e2e.",
  );
}

function assertWebhookE2eRouteShape(root: string): void {
  const directApplyImportRe =
    /import\s+(?:\{[^}]*\bapply[A-Za-z0-9]+Webhook\b[^}]*\}|[^;]*\bapply[A-Za-z0-9]+Webhook\b[^;]*)\s+from\s+["'][^"']+apps\/backend\/src\/(?:capabilities|product|integrations)[^"']+["']/s;
  const failures = e2eFiles(root)
    .filter(
      ({ name }) =>
        name.includes("webhook") ||
        name === "scenarios/ts-hv-038-provider-event-reliability-e2e.ts",
    )
    .filter(({ source }) => directApplyImportRe.test(source))
    .map(({ name }) => name);
  assert.deepEqual(
    failures,
    [],
    `Default webhook E2Es must post synthetic payloads through backend HTTP routes, not import applyXWebhook handlers directly:\n${failures.join("\n")}`,
  );
}

const liveProviderScenarioPatterns: readonly SourcePattern[] = [
  {
    label: "requireSingleTestingNangoConnection",
    test: (source) => source.includes("requireSingleTestingNangoConnection"),
  },
  {
    label: "requireTestingNangoConnectionIds",
    test: (source) => source.includes("requireTestingNangoConnectionIds"),
  },
  {
    label: "requireTestingProvidersLive",
    test: (source) => source.includes("requireTestingProvidersLive"),
  },
  {
    label: "requireGoogleDriveNango",
    test: (source) => source.includes("requireGoogleDriveNango"),
  },
  {
    label: "execute*NangoProxyOperation",
    test: (source) => /\bexecute[A-Za-z0-9]+NangoProxyOperation\b/.test(source),
  },
  { label: "getTestingNango", test: (source) => source.includes("getTestingNango") },
  { label: "mondayLive*", test: (source) => /\bmondayLive[A-Za-z0-9_]*\b/.test(source) },
  { label: "boldsignApi", test: (source) => source.includes("boldsignApi") },
  { label: "BOLDSIGN_API_KEY", test: (source) => source.includes("BOLDSIGN_API_KEY") },
] as const;

const providerSurfaceScenarioPatterns: readonly SourcePattern[] = [
  { label: "CONNECTED provider readiness", test: (source) => source.includes("CONNECTED.") },
  {
    label: "testing provider capability readiness",
    test: (source) =>
      /\brequireTestingCapabilit(?:y|ies)Connected\b/.test(source) ||
      source.includes("testing-capability-readiness"),
  },
  { label: "provider sandbox tables", test: (source) => source.includes("provider_sandbox_") },
  {
    label: "provider sandbox runtime",
    test: (source) => source.includes("enableAllTestingProviderSandboxes"),
  },
  {
    label: "composite deal sandbox fixture",
    test: (source) => source.includes("seedDealBriefSandboxForE2e"),
  },
  {
    label: "provider sandbox seed helper",
    test: (source) => /seed(?:Gmail|Google|Monday|BoldSign)[A-Za-z0-9_]*SandboxForE2e/.test(source),
  },
  {
    label: "provider tool contracts",
    test: (source) =>
      /@ai-assistants\/(?:gmail|google-drive|google-calendar|monday|boldsign|outlook-mail|outlook-calendar|microsoft-onedrive|microsoft-sharepoint|microsoft-todo)-contracts\/contracts/.test(
        source,
      ),
  },
  {
    label: "provider tool names",
    test: (source) =>
      /\b(?:gmail|google_drive|google_calendar|monday|boldsign|outlook_mail|outlook_calendar|microsoft_onedrive|microsoft_sharepoint|microsoft_todo)_[a-z0-9_]+\b/.test(
        source,
      ),
  },
  { label: "synthetic provider webhook", test: (source) => source.includes("/webhooks/nango") },
] as const;

const scenarioSandboxSetupPatterns: readonly SourcePattern[] = [
  {
    label: "enableAllTestingProviderSandboxes",
    test: (source) => source.includes("enableAllTestingProviderSandboxes("),
  },
  {
    label: "seedDealBriefSandboxForE2e",
    test: (source) => source.includes("seedDealBriefSandboxForE2e("),
  },
] as const;

function matchingPatternLabels(
  source: string,
  patterns: readonly SourcePattern[],
): readonly string[] {
  return patterns.filter((pattern) => pattern.test(source)).map((pattern) => pattern.label);
}

function classifyScenarioProviderSurface(
  file: TestingScenarioE2eFile,
): ScenarioProviderSurfaceClassification {
  const liveMarkers = matchingPatternLabels(file.source, liveProviderScenarioPatterns);
  const providerMarkers = matchingPatternLabels(file.source, providerSurfaceScenarioPatterns);
  const sandboxMarkers = matchingPatternLabels(file.source, scenarioSandboxSetupPatterns);
  const reasons = [
    ...liveMarkers.map((marker) => `contains live provider helper ${marker}`),
    ...(providerMarkers.length > 0 && sandboxMarkers.length === 0
      ? ["has provider surface without approved sandbox setup"]
      : []),
  ];
  if (reasons.length > 0) {
    return {
      status: "invalid",
      file: file.name,
      reasons,
      providerMarkers,
      sandboxMarkers,
    };
  }
  if (providerMarkers.length > 0) {
    return {
      status: "provider_sandbox",
      file: file.name,
      providerMarkers,
      sandboxMarkers,
    };
  }
  return { status: "no_provider_surface", file: file.name };
}

function assertScenarioProviderSandboxCoverage(root: string): void {
  const classifications = testingScenarioFiles(root).map(classifyScenarioProviderSurface);
  const failures = classifications.flatMap((classification) => {
    if (classification.status !== "invalid") return [];
    return [
      [
        `${classification.file}: ${classification.reasons.join("; ")}`,
        `  provider markers: ${classification.providerMarkers.join(", ") || "(none)"}`,
        `  sandbox markers: ${classification.sandboxMarkers.join(", ") || "(none)"}`,
      ].join("\n"),
    ];
  });
  assert.deepEqual(
    failures,
    [],
    `Scenario E2Es must be either provider-free or explicitly provider-sandboxed:\n${failures.join(
      "\n",
    )}`,
  );
}

function scenarioSandboxHelperFiles(root: string): readonly TestingScenarioE2eFile[] {
  const fixtureDir = path.join(root, "tests/e2e/helpers/fixtures");
  const names = readdirSync(fixtureDir)
    .filter((name) => name.endsWith("-sandbox-seed.ts") || name === "deal-brief-sandbox.ts")
    .sort();
  return names.map((name) => ({
    name: path.join("helpers/fixtures", name),
    source: readFileSync(path.join(fixtureDir, name), "utf8"),
  }));
}

function assertScenarioSandboxHelpersAvoidLiveProviderAccess(root: string): void {
  const liveHelperPatterns: readonly SourcePattern[] = [
    ...liveProviderScenarioPatterns,
    { label: "requireMondayNango", test: (source) => source.includes("requireMondayNango") },
    {
      label: "googleDriveToolContracts",
      test: (source) => source.includes("googleDriveToolContracts"),
    },
    {
      label: "approveAndExecuteProfileAction",
      test: (source) => source.includes("approveAndExecuteProfileAction"),
    },
    {
      label: "live Google Drive seed helper",
      test: (source) => /\bseedGoogleDrive(?:File|Folder)ForE2e\b/.test(source),
    },
    {
      label: "live Monday seed helper",
      test: (source) => /\bseedMonday(?:Lead|Subitems|Column)ForE2e\b/.test(source),
    },
    {
      label: "external cleanup helper",
      test: (source) => /\bcleanup(?:Sent|Created|Cancel)[A-Za-z0-9_]*\b/.test(source),
    },
  ] as const;
  const failures = scenarioSandboxHelperFiles(root).flatMap(({ name, source }) =>
    matchingPatternLabels(source, liveHelperPatterns).map(
      (label) => `${name}: scenario sandbox helper references live-provider path ${label}`,
    ),
  );
  assert.deepEqual(
    failures,
    [],
    `Scenario sandbox helper modules must not import or delegate through live-provider fixture paths:\n${failures.join(
      "\n",
    )}`,
  );
}

function assertScenarioExternalProviderCleanupPressure(root: string): void {
  const externalCleanupPatterns: readonly SourcePattern[] = [
    {
      label: "cleanupSentGmailMessage",
      test: (source) => source.includes("cleanupSentGmailMessage"),
    },
    {
      label: "cleanupSentOutlookMessage",
      test: (source) => source.includes("cleanupSentOutlookMessage"),
    },
    {
      label: "cleanupCreatedDriveResources",
      test: (source) => source.includes("cleanupCreatedDriveResources"),
    },
    {
      label: "cleanupCreatedMicrosoftOnedriveResources",
      test: (source) => source.includes("cleanupCreatedMicrosoftOnedriveResources"),
    },
    {
      label: "mondayLiveArchiveItems",
      test: (source) => source.includes("mondayLiveArchiveItems"),
    },
    {
      label: "mondayLiveDeleteColumn",
      test: (source) => source.includes("mondayLiveDeleteColumn"),
    },
    {
      label: "BoldSign live cancel cleanup",
      test: (source) => source.includes("cleanupCancelData"),
    },
  ] as const;
  const failures = testingScenarioFiles(root).flatMap(({ name, source }) =>
    matchingPatternLabels(source, externalCleanupPatterns).map(
      (label) => `${name}: contains external provider cleanup helper ${label}`,
    ),
  );
  assert.deepEqual(
    failures,
    [],
    `Scenario E2Es must not own live external provider cleanup; keep that pressure in capability E2Es:\n${failures.join(
      "\n",
    )}`,
  );
}

function assertTestingSandboxAccountsAvoidNangoIdentifiers(root: string): void {
  const source = readFileSync(
    path.join(root, "scripts/repo-tooling/e2e-provider-sandbox.ts"),
    "utf8",
  );
  assert.equal(
    source.includes('credential_kind: "backend_secret"'),
    true,
    "Testing provider sandbox accounts must use backend_secret credentials, not Nango OAuth credentials.",
  );
  assert.equal(
    source.includes("nango_connection_id: null"),
    true,
    "Testing provider sandbox accounts must not store Nango connection ids.",
  );
  assert.equal(
    source.includes("nango_provider_config_key: null"),
    true,
    "Testing provider sandbox accounts must not store Nango provider config keys.",
  );
}

function assertProviderSandboxFixtureTyping(root: string): void {
  const sandboxOperationFixturesPath = path.join(
    root,
    "apps/backend/src/integrations/provider-sandbox/operation-fixtures.ts",
  );
  const sandboxSeedHelperPath = path.join(
    root,
    "tests/e2e/helpers/provider-runtime/provider-sandbox-fixtures.ts",
  );
  const sandboxOperationFixturesSource = readFileSync(sandboxOperationFixturesPath, "utf8");
  const sandboxSeedHelperSource = readFileSync(sandboxSeedHelperPath, "utf8");
  const failures: string[] = [];

  if (/responseSchema:\s*z\.unknown\(\)/.test(sandboxOperationFixturesSource)) {
    failures.push(
      "apps/backend/src/integrations/provider-sandbox/operation-fixtures.ts: fixture-backed operations must use provider-owned response schemas, not z.unknown().",
    );
  }
  if (/\bresponse:\s*unknown\b/.test(sandboxOperationFixturesSource)) {
    failures.push(
      "apps/backend/src/integrations/provider-sandbox/operation-fixtures.ts: ProviderSandboxOperationFixture.response must be derived from the operation schema.",
    );
  }
  if (/\bresponse:\s*unknown\b/.test(sandboxSeedHelperSource)) {
    failures.push(
      "tests/e2e/helpers/provider-runtime/provider-sandbox-fixtures.ts: fixture responses must stay typed by ProviderSandboxOperationFixture.",
    );
  }

  const operationResponseWriters = [
    {
      path: sandboxOperationFixturesPath,
      source: sandboxOperationFixturesSource,
    },
    {
      path: sandboxSeedHelperPath,
      source: sandboxSeedHelperSource,
    },
  ];
  const allowedWriterPaths = new Set(operationResponseWriters.map((entry) => entry.path));
  const e2eSources = e2eSourceFiles(root).map((file) => ({
    path: path.join(root, "tests/e2e", file.name),
    source: file.source,
  }));
  const backendProviderSandboxSources = ["index.ts", "operation-fixtures.ts"].map((name) => {
    const absolutePath = path.join(root, "apps/backend/src/integrations/provider-sandbox", name);
    return { path: absolutePath, source: readFileSync(absolutePath, "utf8") };
  });
  for (const { path: sourcePath, source } of [...e2eSources, ...backendProviderSandboxSources]) {
    if (allowedWriterPaths.has(sourcePath)) continue;
    if (
      source.includes("providerSandboxOperationResponseResourceType") ||
      source.includes("provider_operation_response")
    ) {
      failures.push(
        `${path.relative(root, sourcePath)}: operation-response fixtures must be seeded through the typed provider sandbox helper.`,
      );
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Provider sandbox fixture responses must stay tied to backend/provider schemas:\n${failures.join(
      "\n",
    )}`,
  );
}

function assertProviderCapabilityE2esAssertLiveMode(root: string): void {
  const requiredLiveCapabilityFiles = [
    "boldsign-e2e.ts",
    "gmail-e2e.ts",
    "google-calendar-e2e.ts",
    "google-drive-e2e.ts",
    "microsoft-onedrive-e2e.ts",
    "microsoft-todo-e2e.ts",
    "monday-e2e.ts",
    "outlook-calendar-e2e.ts",
    "outlook-mail-e2e.ts",
  ] as const;
  const capabilityDir = path.join(root, "tests/e2e/capabilities");
  const failures = requiredLiveCapabilityFiles.filter((name) => {
    const source = readFileSync(path.join(capabilityDir, name), "utf8");
    return !source.includes("requireTestingProvidersLive(");
  });
  assert.deepEqual(
    failures,
    [],
    `Provider capability E2Es are the live provider contract layer and must assert live mode before provider execution:\n${failures.join(
      "\n",
    )}`,
  );
}

async function assertTestingSeedDisablesProviderWebhookSubscriptions(root: string): Promise<void> {
  const requiredDisabledSlugs = [
    "gmail",
    "google-drive",
    "google-calendar",
    "outlook-mail",
    "outlook-calendar",
    "microsoft-onedrive",
    "microsoft-sharepoint",
    "monday",
    "boldsign",
  ] as const;
  const seedModule = (await import(
    pathToFileURL(path.join(root, "clients/testing/seed.ts")).href
  )) as {
    default: {
      initialCapabilities: ReadonlyArray<{
        slug: string;
        config?: unknown;
      }>;
    };
  };
  const bySlug = new Map(
    seedModule.default.initialCapabilities.map((entry) => [entry.slug, entry]),
  );
  const failures = requiredDisabledSlugs.filter((slug) => {
    const entry = bySlug.get(slug);
    if (!entry || typeof entry.config !== "object" || entry.config === null) return true;
    const providerWebhooks = (entry.config as { providerWebhooks?: unknown }).providerWebhooks;
    if (typeof providerWebhooks !== "object" || providerWebhooks === null) return true;
    return (providerWebhooks as { manageSubscriptions?: unknown }).manageSubscriptions !== false;
  });
  assert.deepEqual(
    failures,
    [],
    `clients/testing/seed.ts must disable config.providerWebhooks.manageSubscriptions for webhook-capable testing capabilities:\n${failures.join("\n")}`,
  );
}

function testingScenarioIds(root: string): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const { source } of e2eFiles(root)) {
    for (const id of testingScenarioByIdReferences(source)) ids.add(id);
  }
  return ids;
}

function testingScenarioByIdReferences(source: string): readonly string[] {
  return [...source.matchAll(TESTING_SCENARIO_BY_ID_RE)].map((match) => {
    const id = match.groups?.id;
    if (!id) throw new Error("testingScenarioById regex must capture id");
    return id;
  });
}

function assertTestingScenarioCatalogCoverage(root: string): void {
  const files = testingScenarioFiles(root);
  const implementedIds = testingScenarioIds(root);
  const catalogIds = highValueTestingScenarios.map((scenario) => scenario.id);
  const duplicateCatalogIds = catalogIds.filter((id, index) => catalogIds.indexOf(id) !== index);
  assert.deepEqual(
    duplicateCatalogIds,
    [],
    `High Value catalog ids must be unique: ${duplicateCatalogIds.join(", ") || "(none)"}`,
  );
  if (files.length > 0) {
    const missing = catalogIds.filter((id) => !implementedIds.has(id));
    assert.deepEqual(
      missing,
      [],
      `High Value catalog ids missing scenario E2E coverage: ${missing.join(", ") || "(none)"}`,
    );
  }

  const filesWithMultipleHighValueIds = files
    .filter(
      ({ source }) =>
        new Set([...source.matchAll(HIGH_VALUE_TEST_ID_RE)].map((match) => match[0])).size > 1,
    )
    .map(({ name }) => name);
  assert.deepEqual(
    filesWithMultipleHighValueIds,
    [],
    `High Value scenario E2E files should cover one catalog id each: ${
      filesWithMultipleHighValueIds.join(", ") || "(none)"
    }`,
  );

  const scenarioById: ReadonlyMap<string, TestingScenario> = new Map(
    allTestingScenarios.map((scenario) => [scenario.id, scenario]),
  );
  const missingCriteria = [...implementedIds].filter((id) => {
    const scenario = scenarioById.get(id);
    return !scenario || scenario.judgeCriteria.length === 0;
  });
  assert.deepEqual(
    missingCriteria,
    [],
    `Implemented testing scenario ids must define judgeCriteria: ${
      missingCriteria.join(", ") || "(none)"
    }`,
  );

  const missingCriteriaUsage = files
    .filter(({ source }) => SCENARIO_JUDGE_E2E_RE.test(source))
    .filter(({ source }) => !source.includes("SCENARIO.judgeCriteria"))
    .map(({ name }) => name);
  assert.deepEqual(
    missingCriteriaUsage,
    [],
    `Judged scenario E2Es must include SCENARIO.judgeCriteria as their baseline criteria:\n${missingCriteriaUsage.join(
      "\n",
    )}`,
  );

  const filenameProblems: string[] = [];
  const owners = new Map<string, string[]>();
  for (const { name, source } of files) {
    const fileMatch = name.match(SCENARIO_E2E_FILE_RE);
    if (!fileMatch?.groups) {
      filenameProblems.push(`${name}: expected filename format ts-<hv|mv|lv>-<nnn>-<slug>-e2e.ts`);
      continue;
    }

    const ids = [...new Set(testingScenarioByIdReferences(source))];
    for (const id of ids) owners.set(id, [...(owners.get(id) ?? []), name]);
    if (ids.length !== 1) {
      filenameProblems.push(
        `${name}: expected exactly one testingScenarioById(...) catalog id, found ${
          ids.join(", ") || "(none)"
        }`,
      );
      continue;
    }

    const filenameId = `TS-${fileMatch.groups.value.toUpperCase()}-${fileMatch.groups.number}`;
    if (filenameId !== ids[0]) {
      filenameProblems.push(`${name}: filename id ${filenameId} does not match ${ids[0]}`);
    }

    const testBlockCount = source.match(/^test\(/gm)?.length ?? 0;
    if (testBlockCount !== 1) {
      filenameProblems.push(
        `${name}: expected exactly one test(...) block, found ${testBlockCount}`,
      );
    }
  }
  assert.deepEqual(
    filenameProblems,
    [],
    `Scenario E2E filenames must match their catalog ids:\n${filenameProblems.join("\n")}`,
  );

  const duplicateOwners = [...owners.entries()]
    .filter(([, ownerFiles]) => ownerFiles.length > 1)
    .map(([id, ownerFiles]) => `${id}: ${ownerFiles.join(", ")}`);
  assert.deepEqual(
    duplicateOwners,
    [],
    `Each testing scenario catalog id should have one E2E file at most:\n${duplicateOwners.join(
      "\n",
    )}`,
  );
}

function assertTestingScenarioExpectationMetadata(root: string): void {
  const expectationValues = new Set<string>(TESTING_SCENARIO_EXPECTATIONS);
  const metadataProblems = allTestingScenarios.flatMap((scenario) => {
    const problems: string[] = [];
    if (!expectationValues.has(scenario.expectation)) {
      problems.push(
        `${scenario.id}: unsupported expectation ${JSON.stringify(scenario.expectation)}`,
      );
    }
    return problems;
  });
  assert.deepEqual(
    metadataProblems,
    [],
    `Scenario expectation metadata is malformed:\n${metadataProblems.join("\n")}`,
  );

  const scenarioById: ReadonlyMap<string, TestingScenario> = new Map(
    allTestingScenarios.map((scenario) => [scenario.id, scenario]),
  );
  const fileProblems: string[] = [];
  for (const { name, source } of testingScenarioFiles(root)) {
    const ids = [...new Set(testingScenarioByIdReferences(source))];
    if (ids.length !== 1) continue;
    const [id] = ids;
    const scenario = scenarioById.get(id);
    if (!scenario) continue;

    const expectedOwner = `const SCENARIO = testingScenarioById("${id}")`;
    if (!source.includes(expectedOwner)) {
      fileProblems.push(`${name}: expected scenario owner declaration ${expectedOwner}`);
    }

    const hasTddFailFast = TDD_RED_TARGET_RE.test(source);
    if (scenario.expectation === "red" && !hasTddFailFast) {
      fileProblems.push(
        `${name}: red scenario must fail fast with an inline missingProductPath error`,
      );
    }
    if (scenario.expectation !== "red" && hasTddFailFast) {
      fileProblems.push(`${name}: red-target fail-fast error is only allowed for red scenarios`);
    }
  }
  assert.deepEqual(
    fileProblems,
    [],
    `Scenario E2E expectation checks failed:\n${fileProblems.join("\n")}`,
  );
}

function assertNoStaticGuardTestsInE2e(root: string): void {
  const failures = e2eFiles(root)
    .filter(({ source }) => STATIC_GUARD_TEST_RE.test(source))
    .map(({ name }) => name);
  assert.deepEqual(
    failures,
    [],
    `Static source/config guard assertions do not belong in tests/e2e; move them to scripts/repo-tooling/guards:\n${failures.join(
      "\n",
    )}`,
  );
}

function assertScenarioSourcesAvoidFakeClientFields(root: string): void {
  const failures: string[] = [];
  const sources = [
    {
      name: "scenarios.ts",
      source: readFileSync(path.join(root, "tests/e2e/scenarios/scenarios.ts"), "utf8"),
    },
    ...testingScenarioFiles(root),
    ...e2eSourceFilesUnder(root, "tests/e2e/helpers/test-data"),
    ...e2eSourceFilesUnder(root, "tests/e2e/helpers/fixtures"),
  ];
  for (const { name, source } of sources) {
    for (const banned of BANNED_SCENARIO_CLIENT_VISIBLE_PATTERNS) {
      if (banned.pattern.test(source)) failures.push(`${name}: ${JSON.stringify(banned.label)}`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `Scenario E2Es must not include fake-looking client-visible fields:\n${failures.join("\n")}`,
  );
}

function evaluateStringExpression(expression: ts.Expression): string | null {
  if (ts.isStringLiteralLike(expression)) return expression.text;
  if (ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isTemplateExpression(expression)) {
    let text = expression.head.text;
    for (const span of expression.templateSpans) {
      text += `\${${span.expression.getText()}}`;
      text += span.literal.text;
    }
    return text;
  }
  if (ts.isArrayLiteralExpression(expression)) {
    const parts: string[] = [];
    for (const element of expression.elements) {
      if (!ts.isExpression(element)) return null;
      const value = evaluateStringExpression(element);
      parts.push(value ?? "");
    }
    return parts.join("\n");
  }
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "join" &&
    ts.isArrayLiteralExpression(expression.expression.expression)
  ) {
    const separatorExpression = expression.arguments[0];
    const separator =
      separatorExpression === undefined ? "," : evaluateStringExpression(separatorExpression);
    if (separator === null) return null;
    const parts: string[] = [];
    for (const element of expression.expression.expression.elements) {
      if (!ts.isExpression(element)) return null;
      const value = evaluateStringExpression(element);
      parts.push(value ?? "");
    }
    return parts.join(separator);
  }
  if (ts.isParenthesizedExpression(expression)) return evaluateStringExpression(expression.expression);
  return null;
}

function sendChannelMessageTexts(file: TestingScenarioE2eFile): readonly {
  line: number;
  text: string;
}[] {
  const sourceFile = ts.createSourceFile(
    file.name,
    file.source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const messages: { line: number; text: string }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "sendChannelMessage"
    ) {
      const messageExpression = node.arguments[2];
      if (messageExpression !== undefined) {
        const text = evaluateStringExpression(messageExpression);
        if (text !== null) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(messageExpression.getStart(sourceFile));
          messages.push({ line: line + 1, text });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return messages;
}

function assertScenarioChannelMessagesAvoidCoachedPrompts(root: string): void {
  const failures: string[] = [];
  for (const file of testingScenarioFiles(root)) {
    if (ALLOWED_CACHED_SCENARIO_PROMPT_REALISM_FILES.has(file.name)) continue;
    for (const message of sendChannelMessageTexts(file)) {
      const doNotMatches = message.text.match(/\bdo not\b/gi) ?? [];
      if (doNotMatches.length >= 3) {
        failures.push(
          `${file.name}:${message.line}: repeated "do not" rubric (${doNotMatches.length} matches). Move grading constraints to judge criteria.`,
        );
      }
      for (const { label, pattern, hint } of COACHED_SCENARIO_PROMPT_PATTERNS) {
        const match = message.text.match(pattern);
        if (match) {
          failures.push(
            `${file.name}:${message.line}: coached prompt (${label}) matched ${JSON.stringify(
              match[0],
            )}. ${hint}`,
          );
        }
      }
    }
  }
  assert.deepEqual(
    failures,
    [],
    `Scenario sendChannelMessage prompts must read like real client messages, not test-harness instructions:\n${failures.join(
      "\n",
    )}`,
  );
}

function assertScenarioSourcesAvoidSemanticProseRegexAssertions(root: string): void {
  const failures = testingScenarioFiles(root)
    .filter(({ source }) => SEMANTIC_PROSE_REGEX_ASSERTION_RE.test(source))
    .filter(({ source }) => !SEMANTIC_PROSE_REGEX_EXEMPTION_RE.test(source))
    .map(
      ({ name }) =>
        `${name}: client-visible or generated prose meaning should use an LLM judge; keep regex for structural ids/protocols/status only, or add semantic prose regex exempt with a reason`,
    );
  assert.deepEqual(
    failures,
    [],
    `Scenario E2Es must not use broad regex as semantic prose judges:\n${failures.join("\n")}`,
  );
}

function assertScenarioDirectToolAssertionsHaveContextCoverage(root: string): void {
  const failures = testingScenarioFiles(root)
    .filter(({ source }) => DIRECT_TOOL_ASSERTION_RE.test(source))
    .filter(({ source }) => GUIDANCE_BACKED_TOOL_NAME_RE.test(source))
    .filter(({ source }) => !CONTEXT_COVERAGE_ASSERTION_RE.test(source))
    .filter(({ source }) => !CONTEXT_COVERAGE_ASSERTION_EXEMPTION_RE.test(source))
    .map(
      ({ name }) =>
        `${name}: direct guidance-backed tool assertions must be paired with a context-coverage helper or a context coverage assertion exempt comment with a reason`,
    );
  assert.deepEqual(
    failures,
    [],
    `Scenario E2Es must prove relevant prompt turn context or work-item guidanceMarkdown before direct guidance-backed provider/tool result assertions:\n${failures.join(
      "\n",
    )}`,
  );
}

function assertE2eSweepRunDirExtraction(root: string): void {
  const relative = "tmp/e2e/runs/e2e-20260528120000-ts-hv-001-abc12345";
  const absolute = path.join(root, "tmp/e2e/runs/e2e-20260528120000-ts-hv-002-def67890");
  assert.equal(
    extractRunDir(`[e2e:TS-HV-001] runDir=${absolute}\n`, root),
    absolute,
    "sweep run-dir extraction must support absolute runDir= log lines",
  );
  assert.equal(
    extractRunDir(`[e2e] Keeping run dir for inspection: ${relative}\n`, root),
    path.join(root, relative),
    "sweep run-dir extraction must support legacy relative inspection log lines",
  );
  assert.equal(
    extractRunDir(
      `[e2e:TS-HV-001] runDir=${path.join(root, "tmp/e2e/runs/old")}\n` +
        `[e2e] Keeping run dir for inspection: ${absolute}\n`,
      root,
    ),
    absolute,
    "sweep run-dir extraction must use the last printed run-dir line",
  );
}

function assertE2eRuntimeClonePolicy(): void {
  const dir = mkdtempSync(path.join(tmpdir(), "e2e-runtime-clone-"));
  const sourceRoot = path.join(dir, "source");
  const runDir = path.join(dir, "run");
  const writeSourceFile = (relativePath: string, content: string): void => {
    const filePath = path.join(sourceRoot, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  };
  try {
    writeSourceFile("agents/testing/sessions/session.jsonl", "{}\n");
    writeSourceFile("agents/testing/agent/pi-state.json", "{}\n");
    writeSourceFile("agents/testing/agent/codex-home/logs_2.sqlite", "legacy");
    writeSourceFile("logs/assistant-runtime.jsonl", "{}\n");
    writeSourceFile("npm/node_modules/cached-package", "cache");

    cloneE2eRuntimeState(sourceRoot, runDir);

    assert.equal(
      existsSync(path.join(runDir, "agents", "testing", "sessions", "session.jsonl")),
      true,
      "E2E runtime clone must preserve agent session transcripts for debugging",
    );
    assert.equal(
      existsSync(path.join(runDir, "agents", "testing", "agent", "pi-state.json")),
      true,
      "E2E runtime clone must preserve current agent-runtime state",
    );
    assert.equal(
      existsSync(path.join(runDir, "agents", "testing", "agent", "codex-home")),
      false,
      "E2E runtime clone must not copy legacy Codex homes",
    );
    assert.deepEqual(
      readdirSync(path.join(runDir, "logs")),
      [],
      "E2E runtime clone must start with empty per-run logs",
    );
    assert.deepEqual(
      readdirSync(path.join(runDir, "npm")),
      [],
      "E2E runtime clone must not copy reusable npm dependency caches",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const MONDAY_RESOURCE = {
  kind: "monday.item",
  providerConfigKey: "monday-testing",
  connectionId: "testing",
  boardId: "456",
  itemId: "123",
  label: "monday:item:456:123",
} as const satisfies E2eFixtureManifestResource;

function readManifest(manifestPath: string): E2eFixtureManifestEvent[] {
  return readFileSync(manifestPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const value: unknown = JSON.parse(line);
      if (!value || typeof value !== "object") {
        throw new Error(`${manifestPath}: fixture manifest line must be an object.`);
      }
      return value as E2eFixtureManifestEvent;
    });
}

async function assertFixtureScopeManifestSafety(): Promise<void> {
  const calls: string[] = [];
  const scope = createE2eFixtureScope({ runId: "run-1" });
  scope.add({
    label: "plain",
    resource: MONDAY_RESOURCE,
    cleanup: async () => {
      calls.push("cleaned");
    },
  });
  await scope.cleanup();
  assert.deepEqual(calls, ["cleaned"]);

  const dir = mkdtempSync(path.join(tmpdir(), "e2e-fixture-scope-"));
  const manifestPath = path.join(dir, "fixture-manifest.jsonl");
  try {
    const manifestScope = createE2eFixtureScope({ runId: "run-1", manifestPath });
    manifestScope.add({
      label: MONDAY_RESOURCE.label,
      resource: MONDAY_RESOURCE,
      cleanup: async () => {},
    });
    await manifestScope.cleanup();
    const events = readManifest(manifestPath);
    assert.deepEqual(
      events.map((event) => event.event),
      ["created", "cleaned"],
    );
    assert.deepEqual(events[0]?.event === "created" ? events[0].resource : null, MONDAY_RESOURCE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const failedDir = mkdtempSync(path.join(tmpdir(), "e2e-fixture-scope-"));
  const failedManifestPath = path.join(failedDir, "fixture-manifest.jsonl");
  try {
    const failingScope = createE2eFixtureScope({
      runId: "run-1",
      manifestPath: failedManifestPath,
    });
    failingScope.add({
      label: MONDAY_RESOURCE.label,
      resource: MONDAY_RESOURCE,
      cleanup: async () => {
        throw new Error("cleanup failed");
      },
    });
    await assert.rejects(failingScope.cleanup(), /e2e cleanup failed runId=run-1/);
    assert.deepEqual(
      readManifest(failedManifestPath).map((event) => event.event),
      ["created"],
    );
  } finally {
    rmSync(failedDir, { recursive: true, force: true });
  }
}

function writeFixtureManifest(dir: string, events: readonly unknown[]): string {
  const runDir = path.join(dir, "run-1");
  mkdirSync(runDir, { recursive: true });
  const manifestPath = path.join(runDir, "fixture-manifest.jsonl");
  writeFileSync(manifestPath, events.map((event) => JSON.stringify(event)).join("\n"), "utf8");
  return manifestPath;
}

function mondayCreated(label = "monday:item:456:123") {
  return {
    event: "created",
    runId: "run-1",
    label,
    at: CREATED_AT,
    resource: MONDAY_RESOURCE,
  };
}

function cleaned(label = "monday:item:456:123") {
  return { event: "cleaned", runId: "run-1", label, at: CLEANED_AT };
}

function cleanupHandlers(calls: string[]): StaleFixtureCleanupHandlers {
  return {
    archiveMondayItem: async (resource) => {
      calls.push(`monday:${resource.itemId}`);
    },
    deleteProfileArtifact: async (resource) => {
      calls.push(`artifact:${resource.artifactId}`);
    },
  };
}

async function assertStaleFixtureCleanupSafety(): Promise<void> {
  const active = activeFixtureCandidatesFromEvents("/tmp/fixture-manifest.jsonl", [
    mondayCreated("monday:record:lead:123"),
    mondayCreated("monday:record:lead:456"),
    cleaned("monday:record:lead:123"),
  ] as never);
  assert.deepEqual(
    active.map((candidate) => candidate.label),
    ["monday:record:lead:456"],
  );

  const staleDir = mkdtempSync(path.join(tmpdir(), "e2e-stale-fixtures-"));
  try {
    const manifestPath = writeFixtureManifest(staleDir, [mondayCreated()]);
    assert.equal(
      staleFixtureCandidates({
        manifestPaths: [manifestPath],
        olderThanHours: 24,
        now: new Date("2026-05-25T13:00:00.000Z"),
      }).length,
      1,
    );
    assert.equal(
      staleFixtureCandidates({
        manifestPaths: [manifestPath],
        olderThanHours: 48,
        now: new Date("2026-05-25T13:00:00.000Z"),
      }).length,
      0,
    );
  } finally {
    rmSync(staleDir, { recursive: true, force: true });
  }

  const dryRunDir = mkdtempSync(path.join(tmpdir(), "e2e-stale-fixtures-"));
  try {
    writeFixtureManifest(dryRunDir, [mondayCreated()]);
    const calls: string[] = [];
    const result = await previewStaleFixtureCleanup({ olderThanHours: 0, runsDir: dryRunDir });
    assert.equal(result.candidates.length, 1);
    assert.equal(result.cleaned, 0);
    assert.deepEqual(calls, []);
  } finally {
    rmSync(dryRunDir, { recursive: true, force: true });
  }

  const executeDir = mkdtempSync(path.join(tmpdir(), "e2e-stale-fixtures-"));
  try {
    writeFixtureManifest(executeDir, [
      mondayCreated(),
      {
        event: "created",
        runId: "run-1",
        label: "future:resource:1",
        at: CREATED_AT,
        resource: { kind: "future.resource", label: "future:resource:1", id: "1" },
      },
    ]);
    const calls: string[] = [];
    const result = await executeStaleFixtureCleanup(
      { olderThanHours: 0, runsDir: executeDir },
      cleanupHandlers(calls),
    );
    assert.equal(result.candidates.length, 2);
    assert.equal(result.cleaned, 1);
    assert.equal(result.skipped, 1);
    assert.deepEqual(calls, ["monday:123"]);
    assert.deepEqual(
      staleFixtureCandidates({
        manifestPaths: [path.join(executeDir, "run-1", "fixture-manifest.jsonl")],
        olderThanHours: 0,
      }).map((candidate) => candidate.label),
      ["future:resource:1"],
    );
  } finally {
    rmSync(executeDir, { recursive: true, force: true });
  }

  assert.deepEqual(parseCleanupStaleFixturesArgs([]), {
    execute: false,
    olderThanHours: 24,
    runsDir: "tmp/e2e/runs",
  });
  assert.deepEqual(parseCleanupStaleFixturesArgs(["--execute", "--older-than-hours=12"]), {
    execute: true,
    olderThanHours: 12,
    runsDir: "tmp/e2e/runs",
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runE2eHarnessGuardCli());
}
