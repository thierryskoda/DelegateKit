#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runJsonJudge } from "@ai-assistants/llm-judge";
import { profileRuntimeDir, repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { type ToolContract } from "@ai-assistants/tool-contracts";
import { z } from "zod";
import {
  ASSISTANT_CAPABILITIES,
  contractsForCapabilitySurfaceId,
} from "@ai-assistants/assistant-capability-surface";
import { pluginBoundaryOverlapInstructionsPath } from "../../judges/registry";
import { type GuidanceSpec, loadCapabilityGuidanceSpecs } from "../../build/guidance-registry";
import { parseCli } from "@ai-assistants/workspace-shared";
import { parseProfile } from "../cli";

/** Bump when `scripts/repo-tooling/judges/prompts/plugin-boundary-overlap.md` meaningfully changes. */
const PROMPT_VERSION = 10;
const SCHEMA_VERSION = 1;
const JUDGE_TIMEOUT_MS = 240_000;

type Args = {
  profile: RuntimeProfile;
  help: boolean;
  list: boolean;
};

const rawBoundaryFindingSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    title: z.string().trim().min(1).optional(),
    plugins: z.array(z.string().trim().min(1)).default([]),
    tools: z.array(z.string().trim().min(1)).default([]),
    explanation: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1).optional(),
    issue: z.string().trim().min(1).optional(),
    reason: z.string().trim().min(1).optional(),
    evidence: z.unknown().optional(),
    recommendation: z.unknown().optional(),
    fix: z.unknown().optional(),
    suggested_owner_plugin: z.string().trim().min(1).nullable().optional(),
    suggestedOwnerPlugin: z.string().trim().min(1).nullable().optional(),
  })
  .passthrough()
  .transform((finding) => {
    const explanation = finding.explanation ?? finding.message ?? finding.issue ?? finding.reason;
    if (!explanation) {
      throw new Error(
        `Plugin boundary finding is missing explanation/message/issue/reason: ${JSON.stringify(finding)}`,
      );
    }
    const recommendation = stringifyJudgeField(finding.recommendation ?? finding.fix);
    if (!recommendation) {
      throw new Error(
        `Plugin boundary finding is missing recommendation/fix: ${JSON.stringify(finding)}`,
      );
    }
    const evidence = stringifyJudgeField(finding.evidence);
    return {
      severity: finding.severity,
      title:
        finding.title ?? explanation.split(/[.!?]\s/)[0]?.slice(0, 120) ?? "Plugin boundary issue",
      plugins: finding.plugins,
      tools: finding.tools,
      explanation,
      evidence:
        evidence ??
        "See plugin manifests, tool contracts, guidance, AGENTS.md, and client guidance composition evidence.",
      recommendation,
      suggested_owner_plugin:
        finding.suggested_owner_plugin ?? finding.suggestedOwnerPlugin ?? null,
    };
  });

const pluginBoundaryJudgeResultSchema = z
  .object({
    is_valid: z.boolean(),
    summary: z.string().trim().min(1),
    findings: z.array(rawBoundaryFindingSchema),
  })
  .strict();

type PluginBoundaryJudgeResult = z.infer<typeof pluginBoundaryJudgeResultSchema>;

function stringifyJudgeField(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const text = value
      .map((entry) => stringifyJudgeField(entry))
      .filter(Boolean)
      .join("; ");
    return text.trim() || null;
  }
  if (value && typeof value === "object") return JSON.stringify(value);
  return null;
}

const pluginBoundariesCliSchema = z
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
    schema: pluginBoundariesCliSchema,
  });
}

function usage(): string {
  return [
    "Usage: npm run guard -- semantic plugin-boundaries [--profile dev] [--list]",
    "",
    "Runs a Codex-backed JSON LLM judge over plugin tool contracts and guidance to catch semantic overlap between plugins.",
    "DB-owned client guidance is omitted from source evidence.",
  ].join("\n");
}

function lineNumbered(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line, index) => `${String(index + 1).padStart(4, " ")} | ${line}`)
    .join("\n");
}

function toolEvidence(contract: ToolContract): Record<string, unknown> {
  return {
    name: contract.name,
    pluginId: contract.pluginId,
    label: contract.label,
    description: contract.description,
    effect: contract.effect,
    externalAction: contract.externalAction ?? null,
    parameters: contract.parameters,
  };
}

function skillEvidence(root: string, skill: GuidanceSpec, note?: string): Record<string, unknown> {
  return {
    sourceKind: skill.sourceKind,
    sourceId: skill.sourceId,
    name: skill.name,
    description: skill.description,
    path: path.relative(root, skill.sourcePath),
    lineNumbered: lineNumbered(skill.authored.body.markdown.trim()),
    ...(note ? { note } : {}),
  };
}

async function evidence(input: { root: string }): Promise<Record<string, unknown>> {
  const [agentsMd, pluginGuidance] = await Promise.all([
    readFile(path.join(input.root, "AGENTS.md"), "utf8"),
    loadCapabilityGuidanceSpecs(input.root, ASSISTANT_CAPABILITIES),
  ]);
  const pluginSkillEvidence = pluginGuidance.map((skill) => skillEvidence(input.root, skill));

  return {
    repo: {
      packageName: "@ai-assistants/workspace",
      judgment: "plugin semantic boundary overlap",
    },
    agentsMd: {
      path: "AGENTS.md",
      lineNumbered: lineNumbered(agentsMd.trim()),
    },
    plugins: ASSISTANT_CAPABILITIES.map((spec) => ({
      slug: spec.slug,
      toolSurfaceId: spec.toolSurfaceId,
      sourceDir: spec.sourceDir,
      capability: {
        id: spec.toolSurfaceId,
        sourceDir: spec.sourceDir,
        contracts: {
          tools: contractsForCapabilitySurfaceId(spec.toolSurfaceId).map(
            (contract) => contract.name,
          ),
        },
      },
      tools: contractsForCapabilitySurfaceId(spec.toolSurfaceId).map(toolEvidence),
      guidance: pluginSkillEvidence.filter((skill) => skill.sourceId === spec.slug),
    })),
    clientGuidance: [],
    judgmentScope: [
      "Judge plugin-owned tool surfaces and plugin guidance.",
      "Client guidance is composition evidence, not plugin ownership.",
      "Prefer findings that identify the plugin that should own the capability.",
    ],
  };
}

function formatFailure(result: PluginBoundaryJudgeResult): string {
  return result.findings
    .filter((finding) => finding.severity === "error")
    .map((finding) =>
      [
        `- ${finding.title}`,
        `  Plugins: ${finding.plugins.length > 0 ? finding.plugins.join(", ") : "unspecified"}`,
        `  Tools: ${finding.tools.length > 0 ? finding.tools.join(", ") : "unspecified"}`,
        `  ${finding.explanation}`,
        `  Evidence: ${finding.evidence}`,
        `  Recommendation: ${finding.recommendation}`,
        finding.suggested_owner_plugin
          ? `  Suggested owner: ${finding.suggested_owner_plugin}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export async function runPluginBoundariesJudgeCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const root = repoRoot(import.meta.url);
  const [judgeEvidence, boundaryInstructions] = await Promise.all([
    evidence({ root }),
    readFile(pluginBoundaryOverlapInstructionsPath(), "utf8"),
  ]);

  if (args.list) {
    console.log(
      JSON.stringify(
        {
          schema_version: SCHEMA_VERSION,
          plugins: (
            judgeEvidence.plugins as Array<{
              slug: string;
              toolSurfaceId: string;
              tools: Array<{ name: string }>;
            }>
          ).map((plugin) => ({
            slug: plugin.slug,
            toolSurfaceId: plugin.toolSurfaceId,
            tools: plugin.tools.map((tool) => tool.name),
          })),
          client_skill_count: 0,
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
    "plugin-boundaries",
  );

  console.error(
    `Running plugin boundary LLM judge (profile=${args.profile}, cache ${cacheDir ? "enabled" : "disabled"}, source client guidance omitted).`,
  );

  const startedAt = Date.now();
  const judge = await runJsonJudge({
    id: "plugin-boundary-overlap",
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    schema: pluginBoundaryJudgeResultSchema,
    instructions: boundaryInstructions.trim(),
    evidence: judgeEvidence,
    repoRoot: root,
    cacheDir,
    timeoutMs: JUDGE_TIMEOUT_MS,
  });
  const errorCount = judge.result.findings.filter((finding) => finding.severity === "error").length;
  const warningCount = judge.result.findings.filter(
    (finding) => finding.severity === "warning",
  ).length;
  console.error(
    `Plugin boundary judge: ${judge.result.is_valid ? "valid" : "invalid"} (${judge.cacheStatus}, errors=${errorCount}, warnings=${warningCount})`,
  );

  const output = {
    schema_version: SCHEMA_VERSION,
    prompt_version: PROMPT_VERSION,
    ok: judge.result.is_valid && errorCount === 0,
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
  if (!output.ok) {
    console.error(`Plugin boundary judge failed:\n\n${formatFailure(judge.result)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runPluginBoundariesJudgeCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
