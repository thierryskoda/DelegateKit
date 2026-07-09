#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runJsonJudge } from "@ai-assistants/llm-judge";
import {
  ASSISTANT_CAPABILITIES,
  allAssistantCapabilityContracts,
  allAlwaysAvailableAgentToolContracts,
} from "@ai-assistants/assistant-capability-surface";
import { profileRuntimeDir, repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { type ToolContract } from "@ai-assistants/tool-contracts";
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import {
  loadCapabilityGuidanceSpecs,
  loadGenericRuntimeGuidanceSpecs,
  type GuidanceSpec,
} from "../../build/guidance-registry";
import { runtimeGuidanceQualityInstructionsPath } from "../../judges/registry";
import { parseProfile } from "../cli";
import { profileAssistantBaseInstructions } from "../../../../apps/backend/src/ops-support/assistant-prompt";

const PROMPT_VERSION = 6;
const SCHEMA_VERSION = 1;
const JUDGE_TIMEOUT_MS = 240_000;

type Args = {
  profile: RuntimeProfile;
  help: boolean;
  list: boolean;
};

function normalizeJudgeText(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value !== undefined && value !== null) {
    const text = JSON.stringify(value);
    if (text && text !== "null") return text;
  }
  throw new Error(`Runtime guidance judge finding is missing ${field}.`);
}

const rawRuntimeGuidanceFindingSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    title: z.string().trim().min(1),
    guidance: z
      .union([z.string().trim().min(1), z.array(z.string().trim().min(1))])
      .default([])
      .transform((value) => (Array.isArray(value) ? value : [value])),
    explanation: z.string().trim().min(1).optional(),
    evplanation: z.string().trim().min(1).optional(),
    evidence: z.unknown(),
    recommendation: z.string().trim().min(1),
  })
  .passthrough()
  .transform((finding) => ({
    severity: finding.severity,
    title: finding.title,
    guidance: finding.guidance,
    explanation: normalizeJudgeText(finding.explanation ?? finding.evplanation, "explanation"),
    evidence: normalizeJudgeText(finding.evidence, "evidence"),
    recommendation: finding.recommendation,
  }));

const runtimeGuidanceResultSchema = z
  .object({
    is_valid: z.boolean(),
    summary: z.string().trim().min(1),
    findings: z.array(rawRuntimeGuidanceFindingSchema),
  })
  .strict();

type RuntimeGuidanceResult = z.infer<typeof runtimeGuidanceResultSchema>;

const cliSchema = z
  .object({
    help: z.boolean().optional(),
    list: z.boolean().optional(),
    profile: z.string().optional(),
  })
  .transform((v) => ({
    help: v.help ?? false,
    list: v.list ?? false,
    profile: parseProfile(v.profile ?? process.env.AI_ASSISTANTS_PROFILE),
  }));

function parseArgs(argv: readonly string[]): Args {
  return parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      list: { type: "boolean" },
      profile: { type: "string" },
    },
    schema: cliSchema,
  });
}

function usage(): string {
  return [
    "Usage: npm run guard -- semantic runtime-guidance [--profile dev] [--list]",
    "",
    "Runs a Codex-backed JSON LLM judge over runtime guidance quality and internal implementation leakage.",
  ].join("\n");
}

function lineNumbered(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line, index) => `${String(index + 1).padStart(4, " ")} | ${line}`)
    .join("\n");
}

function guidanceEvidence(root: string, guidance: GuidanceSpec): Record<string, unknown> {
  return {
    sourceKind: guidance.sourceKind,
    sourceId: guidance.sourceId,
    name: guidance.name,
    description: guidance.description,
    path: path.relative(root, guidance.sourcePath),
    lineNumbered: lineNumbered(guidance.authored.body.markdown.trim()),
    references: guidance.references.map(({ kind, name }) => ({ kind, name })),
  };
}

const capabilitySpecByToolId = new Map(
  ASSISTANT_CAPABILITIES.map((spec) => [spec.toolSurfaceId, spec]),
);

function toolContractEvidence(root: string, contract: ToolContract): Record<string, unknown> {
  const capability = capabilitySpecByToolId.get(contract.pluginId);
  return {
    name: contract.name,
    pluginId: contract.pluginId,
    capabilitySlug: capability?.slug ?? null,
    capabilitySourceDir: capability ? path.relative(root, capability.sourceDir) : null,
    label: contract.label,
    description: contract.description,
    effect: contract.effect,
    externalAction: contract.externalAction ?? null,
    parameters: contract.parameters,
  };
}

async function evidence(input: { root: string }): Promise<Record<string, unknown>> {
  const [capabilityGuidance, genericGuidance] = await Promise.all([
    loadCapabilityGuidanceSpecs(input.root, ASSISTANT_CAPABILITIES),
    loadGenericRuntimeGuidanceSpecs(input.root),
  ]);
  const toolContracts = [
    ...allAlwaysAvailableAgentToolContracts(),
    ...allAssistantCapabilityContracts(),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const backendBasePrompt = profileAssistantBaseInstructions({
    profileId: "client",
    profileDisplayName: "the client",
    assistantDisplayName: "the assistant",
    timezone: "America/Toronto",
  });
  return {
    repo: {
      packageName: "@ai-assistants/workspace",
      judgment: "runtime guidance quality",
    },
    backendBasePrompt: {
      path: "apps/backend/src/runtime/agent-runner/assistant-defaults.ts",
      lineNumbered: lineNumbered(backendBasePrompt.trim()),
    },
    capabilityGuidance: capabilityGuidance.map((entry) => guidanceEvidence(input.root, entry)),
    genericGuidance: genericGuidance.map((entry) => guidanceEvidence(input.root, entry)),
    toolContracts: toolContracts.map((contract) => toolContractEvidence(input.root, contract)),
    clientGuidance: [],
    judgmentScope: [
      "Judge runtime guidance read by client-facing assistants plus agent-visible tool contracts used by that guidance.",
      "Do not judge maintainer-only .agents skills.",
      "Use backendBasePrompt to identify duplicated bootstrap guidance.",
      "Use toolContracts to identify whether exact call-time facts belong in tool descriptions/schemas instead of guidance.",
    ],
  };
}

function formatFailure(result: RuntimeGuidanceResult): string {
  return result.findings
    .filter((finding) => finding.severity === "error")
    .map((finding) =>
      [
        `- ${finding.title}`,
        `  Guidance: ${finding.guidance.length ? finding.guidance.join(", ") : "unspecified"}`,
        `  ${finding.explanation}`,
        `  Evidence: ${finding.evidence}`,
        `  Recommendation: ${finding.recommendation}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export async function runRuntimeGuidanceJudgeCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const root = repoRoot(import.meta.url);
  const [judgeEvidence, instructionsText] = await Promise.all([
    evidence({ root }),
    readFile(runtimeGuidanceQualityInstructionsPath(), "utf8"),
  ]);

  if (args.list) {
    console.log(
      JSON.stringify(
        {
          schema_version: SCHEMA_VERSION,
          capability_guidance_count: Array.isArray(judgeEvidence.capabilityGuidance)
            ? judgeEvidence.capabilityGuidance.length
            : 0,
          tool_contract_count: Array.isArray(judgeEvidence.toolContracts)
            ? judgeEvidence.toolContracts.length
            : 0,
          client_guidance_count: 0,
        },
        null,
        2,
      ),
    );
    return;
  }

  const cacheDir = path.join(
    profileRuntimeDir(args.profile),
    "cache",
    "llm-judges",
    "runtime-guidance",
  );

  console.error(
    `Running runtime guidance LLM judge (profile=${args.profile}, cache ${cacheDir ? "enabled" : "disabled"}, source client guidance omitted).`,
  );

  const startedAt = Date.now();
  const judge = await runJsonJudge({
    id: "runtime-guidance-quality",
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    schema: runtimeGuidanceResultSchema,
    instructions: instructionsText.trim(),
    evidence: judgeEvidence,
    repoRoot: root,
    cacheDir,
    timeoutMs: JUDGE_TIMEOUT_MS,
  });
  const errorCount = judge.result.findings.filter((finding) => finding.severity === "error").length;
  const warningCount = judge.result.findings.filter(
    (finding) => finding.severity === "warning",
  ).length;
  const ok = judge.result.is_valid && errorCount === 0;
  console.error(
    `Runtime guidance judge: ${ok ? "valid" : "invalid"} (${judge.cacheStatus}, errors=${errorCount}, warnings=${warningCount})`,
  );

  const output = {
    schema_version: SCHEMA_VERSION,
    prompt_version: PROMPT_VERSION,
    ok,
    judged_at: new Date().toISOString(),
    profile: args.profile,
    cache: cacheDir ? { enabled: true, dir: cacheDir } : { enabled: false, dir: null },
    duration_ms: Date.now() - startedAt,
    cache_status: judge.cacheStatus,
    cache_key: judge.cacheKey,
    judge_run_ref: judge.runRef,
    codex_thread_id: judge.codexThreadId,
    result: judge.result,
  };
  console.log(JSON.stringify(output, null, 2));
  if (!ok) {
    console.error(`Runtime guidance judge failed:\n\n${formatFailure(judge.result)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runRuntimeGuidanceJudgeCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
