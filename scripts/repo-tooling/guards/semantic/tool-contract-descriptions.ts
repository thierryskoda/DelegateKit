#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  type JsonJudgeCacheStatus,
  type JsonJudgeResult,
  runJsonJudge,
} from "@ai-assistants/llm-judge";
import { profileRuntimeDir, repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { type ToolContract } from "@ai-assistants/tool-contracts";
import { z } from "zod";
import {
  ASSISTANT_CAPABILITIES,
  allAssistantCapabilityContracts,
} from "@ai-assistants/assistant-capability-surface";
import { toolContractDescriptionsInstructionsPath } from "../../judges/registry";
import { parseCli } from "@ai-assistants/workspace-shared";
import { parseProfile } from "../cli";

/** Bump when `scripts/repo-tooling/judges/prompts/tool-contract-descriptions.md` meaningfully changes. */
const PROMPT_VERSION = 9;
const SCHEMA_VERSION = 1;
const JUDGE_TIMEOUT_MS = 240_000;

type Args = {
  profile: RuntimeProfile;
  help: boolean;
  list: boolean;
};

const pluginSpecByToolId = new Map(
  ASSISTANT_CAPABILITIES.map((spec) => [spec.toolSurfaceId, spec]),
);

const rawDescriptionFindingSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    title: z.string().trim().min(1).optional(),
    tools: z.array(z.string().trim().min(1)).default([]),
    tool: z.string().trim().min(1).optional(),
    plugins: z.array(z.string().trim().min(1)).default([]),
    plugin: z.string().trim().min(1).optional(),
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
        `Tool description finding is missing explanation/message/issue/reason: ${JSON.stringify(finding)}`,
      );
    }
    const recommendation = stringifyJudgeField(finding.recommendation ?? finding.fix);
    if (!recommendation) {
      throw new Error(
        `Tool description finding is missing recommendation/fix: ${JSON.stringify(finding)}`,
      );
    }
    const tools = finding.tools.length > 0 ? finding.tools : finding.tool ? [finding.tool] : [];
    const plugins =
      finding.plugins.length > 0 ? finding.plugins : finding.plugin ? [finding.plugin] : [];
    const evidence = stringifyJudgeField(finding.evidence);
    return {
      severity: finding.severity,
      title:
        finding.title ?? explanation.split(/[.!?]\s/)[0]?.slice(0, 120) ?? "Tool description issue",
      tools,
      plugins,
      explanation,
      evidence: evidence ?? "See tool contract evidence (description, parameters schema, flags).",
      recommendation,
      suggested_owner_plugin:
        finding.suggested_owner_plugin ?? finding.suggestedOwnerPlugin ?? null,
    };
  });

const toolContractDescriptionJudgeResultSchema = z
  .object({
    is_valid: z.boolean(),
    summary: z.string().trim().min(1),
    findings: z.array(rawDescriptionFindingSchema),
  })
  .strict();

type ToolContractDescriptionJudgeResult = z.infer<typeof toolContractDescriptionJudgeResultSchema>;

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

const toolContractDescriptionsCliSchema = z
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
    schema: toolContractDescriptionsCliSchema,
  });
}

function usage(): string {
  return [
    "Usage: npm run guard -- semantic tool-contract-descriptions [--profile dev] [--list]",
    "",
    "Runs a Codex-backed JSON LLM judge over local plugin tool contracts (one Codex invocation per plugin batch).",
  ].join("\n");
}

function lineNumbered(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line, index) => `${String(index + 1).padStart(4, " ")} | ${line}`)
    .join("\n");
}

function contractEvidence(root: string, contract: ToolContract): Record<string, unknown> {
  const plugin = pluginSpecByToolId.get(contract.pluginId);
  return {
    name: contract.name,
    pluginId: contract.pluginId,
    capabilitySlug: plugin?.slug ?? null,
    pluginSourceDir: plugin ? path.relative(root, plugin.sourceDir) : null,
    label: contract.label,
    description: contract.description,
    effect: contract.effect,
    externalAction: contract.externalAction ?? null,
    parameters: contract.parameters,
  };
}

function formatFailure(result: ToolContractDescriptionJudgeResult): string {
  return result.findings
    .filter((finding) => finding.severity === "error")
    .map((finding) =>
      [
        `- ${finding.title}`,
        `  Tools: ${finding.tools.length > 0 ? finding.tools.join(", ") : "unspecified"}`,
        `  ${finding.explanation}`,
        `  Evidence: ${finding.evidence}`,
        `  Recommendation: ${finding.recommendation}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export async function runToolContractDescriptionsJudgeCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const root = repoRoot(import.meta.url);
  const contracts = [...allAssistantCapabilityContracts()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  if (args.list) {
    console.log(
      JSON.stringify(
        {
          schema_version: SCHEMA_VERSION,
          tool_count: contracts.length,
          tools: contracts.map((c) => c.name),
        },
        null,
        2,
      ),
    );
    return;
  }

  const [agentsMd, instructionsText] = await Promise.all([
    readFile(path.join(root, "AGENTS.md"), "utf8"),
    readFile(toolContractDescriptionsInstructionsPath(), "utf8"),
  ]);

  const baseJudgmentScope = [
    "Evaluate canonical assistant tool contracts only (evidence.tools).",
    "Each tool includes derived JSON parameters schema and safety flags.",
    "AGENTS.md provides maintainer expectations; tool text must not contradict it.",
  ] as const;

  const cacheDir = path.join(
    profileRuntimeDir(args.profile),
    "cache",
    "llm-judges",
    "tool-contract-descriptions",
  );

  const contractsByPlugin = new Map<string, ToolContract[]>();
  for (const c of contracts) {
    const list = contractsByPlugin.get(c.pluginId) ?? [];
    list.push(c);
    contractsByPlugin.set(c.pluginId, list);
  }
  const pluginIds = [...contractsByPlugin.keys()].sort((a, b) => a.localeCompare(b));

  console.error(
    `Running tool contract description LLM judge (${pluginIds.length} plugin batch(es), profile=${args.profile}, cache ${cacheDir ? "enabled" : "disabled"}).`,
  );

  const startedAt = Date.now();
  type PluginRun = {
    plugin_id: string;
    tool_count: number;
    cache_status: JsonJudgeCacheStatus;
    cache_key: string;
    judge_run_ref: JsonJudgeResult<ToolContractDescriptionJudgeResult>["runRef"];
    codex_thread_id: string | null;
    duration_ms: number;
    result: ToolContractDescriptionJudgeResult;
  };

  const pluginRuns: PluginRun[] = [];
  for (const pluginId of pluginIds) {
    const batch = contractsByPlugin.get(pluginId) ?? [];
    const batchStarted = Date.now();
    const judgeEvidence = {
      repo: {
        packageName: "@ai-assistants/workspace",
        judgment: "tool contract description quality",
      },
      agentsMd: {
        path: "AGENTS.md",
        lineNumbered: lineNumbered(agentsMd.trim()),
      },
      tools: batch.map((c) => contractEvidence(root, c)),
      judgmentScope: [
        ...baseJudgmentScope,
        `This evidence batch is plugin ${pluginId} only (${batch.length} tool(s)). Compare tool overlap only within evidence.tools.`,
      ],
    };

    const judge = await runJsonJudge({
      id: `tool-contract-descriptions:${pluginId}`,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      schema: toolContractDescriptionJudgeResultSchema,
      instructions: instructionsText.trim(),
      evidence: judgeEvidence,
      repoRoot: root,
      cacheDir,
      timeoutMs: JUDGE_TIMEOUT_MS,
    });

    const eCount = judge.result.findings.filter((f) => f.severity === "error").length;
    const wCount = judge.result.findings.filter((f) => f.severity === "warning").length;
    console.error(
      `- ${pluginId}: ${judge.result.is_valid && eCount === 0 ? "ok" : "issues"} (${judge.cacheStatus}, errors=${eCount}, warnings=${wCount})`,
    );

    pluginRuns.push({
      plugin_id: pluginId,
      tool_count: batch.length,
      cache_status: judge.cacheStatus,
      cache_key: judge.cacheKey,
      judge_run_ref: judge.runRef,
      codex_thread_id: judge.codexThreadId,
      duration_ms: Date.now() - batchStarted,
      result: judge.result,
    });
  }

  const mergedFindings = pluginRuns.flatMap((r) => r.result.findings);
  const errorFindingCount = mergedFindings.filter((f) => f.severity === "error").length;
  const mergedResult: ToolContractDescriptionJudgeResult = {
    is_valid: pluginRuns.every((r) => r.result.is_valid) && errorFindingCount === 0,
    summary: pluginRuns.map((r) => `[${r.plugin_id}] ${r.result.summary}`).join("\n\n"),
    findings: mergedFindings,
  };

  const errorCount = mergedFindings.filter((finding) => finding.severity === "error").length;
  const warningCount = mergedFindings.filter((finding) => finding.severity === "warning").length;
  const ok = mergedResult.is_valid && errorCount === 0;

  const aggregateCacheStatus = (): JsonJudgeCacheStatus => {
    if (!cacheDir) return "disabled";
    if (pluginRuns.every((r) => r.cache_status === "hit")) return "hit";
    return "miss";
  };

  console.error(
    `Tool contract description judge: ${ok ? "ok" : "failed"} (${aggregateCacheStatus()}, errors=${errorCount}, warnings=${warningCount})`,
  );

  const output = {
    schema_version: SCHEMA_VERSION,
    prompt_version: PROMPT_VERSION,
    ok,
    judged_at: new Date().toISOString(),
    profile: args.profile,
    cache: cacheDir ? { enabled: true, dir: cacheDir } : { enabled: false, dir: null },
    duration_ms: Date.now() - startedAt,
    cache_status: aggregateCacheStatus(),
    cache_key: pluginRuns.length === 1 ? pluginRuns[0].cache_key : null,
    judge_run_ref: pluginRuns.length === 1 ? pluginRuns[0].judge_run_ref : null,
    codex_thread_id: pluginRuns.length === 1 ? pluginRuns[0].codex_thread_id : null,
    plugin_runs: pluginRuns,
    result: mergedResult,
  };
  console.log(JSON.stringify(output, null, 2));

  if (!ok) {
    console.error(`Tool contract description judge failed:\n\n${formatFailure(mergedResult)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runToolContractDescriptionsJudgeCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
