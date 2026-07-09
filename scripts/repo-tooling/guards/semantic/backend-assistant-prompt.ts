#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { profileCapabilitySpec } from "@ai-assistants/capability-catalog";
import { runJsonJudge, type JsonJudgeCacheStatus } from "@ai-assistants/llm-judge";
import { repoRoot, type RuntimeProfile, profileRuntimeDir } from "@ai-assistants/repo-layout";
import { assistantCapabilitiesForMainAgent } from "@ai-assistants/assistant-capability-surface";
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { profileAssistantBaseInstructions } from "../../../../apps/backend/src/ops-support/assistant-prompt";
import { loadCapabilityGuidanceSpecs, type GuidanceSpec } from "../../build/guidance-registry";
import {
  loadRuntimeProfileConfigs,
  type RuntimeProfileConfig,
} from "../../build/profile-db-config";
import { backendAssistantPromptQualityInstructionsPath } from "../../judges/registry";
import { parsePositiveInt, parseProfile } from "../cli";

const PROMPT_VERSION = 1;
const SCHEMA_VERSION = 1;
const DEFAULT_CONCURRENCY = 2;
const JUDGE_TIMEOUT_MS = 240_000;
const MAX_RENDERED_GUIDANCE_CHARS = 8_000;

type Args = {
  profile: RuntimeProfile;
  clients: string[];
  concurrency: number;
  list: boolean;
  help: boolean;
};

type BackendPromptTarget = {
  runtimeProfile: RuntimeProfileConfig;
  relativePath: string;
  prompt: string;
  capabilityGuidance: GuidanceSpec[];
};

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

function normalizeJudgeLine(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const match = value.trim().match(/\d+/);
    if (match) {
      const parsed = Number.parseInt(match[0], 10);
      if (parsed > 0) return parsed;
    }
  }
  return null;
}

const rawBackendPromptFindingSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    title: z.string().trim().min(1).optional(),
    line: z.union([z.number(), z.string()]).nullable().optional(),
    line_number: z.union([z.number(), z.string()]).nullable().optional(),
    lineNumber: z.union([z.number(), z.string()]).nullable().optional(),
    section: z.string().trim().min(1).nullable().optional(),
    explanation: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1).optional(),
    issue: z.string().trim().min(1).optional(),
    reason: z.string().trim().min(1).optional(),
    details: z.string().trim().min(1).optional(),
    evidence: z.unknown().optional(),
    recommendation: z.unknown().optional(),
    fix: z.unknown().optional(),
    suggestion: z.unknown().optional(),
  })
  .passthrough()
  .transform((finding) => {
    const explanation =
      finding.explanation ?? finding.message ?? finding.issue ?? finding.reason ?? finding.details;
    if (!explanation) {
      throw new Error(
        `Backend assistant prompt judge finding is missing explanation/message/issue/reason/details: ${JSON.stringify(finding)}`,
      );
    }
    const recommendation = stringifyJudgeField(
      finding.recommendation ?? finding.fix ?? finding.suggestion,
    );
    if (!recommendation) {
      throw new Error(
        `Backend assistant prompt judge finding is missing recommendation/fix/suggestion: ${JSON.stringify(finding)}`,
      );
    }
    const evidence = stringifyJudgeField(finding.evidence);
    return {
      severity: finding.severity,
      title:
        finding.title ??
        explanation.split(/[.!?]\s/)[0]?.slice(0, 120) ??
        "Backend assistant prompt issue",
      line:
        normalizeJudgeLine(finding.line) ??
        normalizeJudgeLine(finding.line_number) ??
        normalizeJudgeLine(finding.lineNumber),
      section: finding.section ?? null,
      explanation,
      evidence:
        evidence ??
        "See backendBasePrompt, runtimeProfile, capabilityGuidance, and heading outline evidence.",
      recommendation,
    };
  });

const backendPromptJudgeResultSchema = z
  .object({
    is_valid: z.boolean(),
    summary: z.string().trim().min(1),
    findings: z.array(rawBackendPromptFindingSchema),
  })
  .strict();

type BackendPromptJudgeResult = z.infer<typeof backendPromptJudgeResultSchema>;

function normalizeClientList(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (Array.isArray(raw)) return raw.map((value) => String(value).trim()).filter(Boolean);
  if (typeof raw === "string") return raw.trim() ? [raw.trim()] : [];
  throw new Error("--client must be a string or repeatable.");
}

const backendPromptCliSchema = z
  .object({
    help: z.boolean().optional(),
    list: z.boolean().optional(),
    profile: z.string().optional(),
    client: z.union([z.string(), z.array(z.string())]).optional(),
    concurrency: z.string().optional(),
  })
  .transform((value) => ({
    help: value.help ?? false,
    list: value.list ?? false,
    profile: parseProfile(value.profile ?? process.env.AI_ASSISTANTS_PROFILE),
    clients: normalizeClientList(value.client),
    concurrency: parsePositiveInt(value.concurrency, DEFAULT_CONCURRENCY, "concurrency"),
  }));

function parseArgs(argv: readonly string[]): Args {
  return parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      list: { type: "boolean" },
      profile: { type: "string" },
      client: { type: "string", multiple: true },
      concurrency: { type: "string" },
    },
    schema: backendPromptCliSchema,
  });
}

function usage(): string {
  return [
    "Usage: npm run guard -- semantic backend-prompt [--profile dev] [--client <id>] [--concurrency 2] [--list]",
    "",
    "Renders backend assistant base prompts, then runs one Codex-backed JSON LLM judge per selected client.",
    "Requires the selected profile control DB to be available.",
  ].join("\n");
}

function lineNumbered(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line, index) => `${String(index + 1).padStart(4, " ")} | ${line}`)
    .join("\n");
}

function markdownHeadings(text: string): Array<{ line: number; level: number; title: string }> {
  return text
    .split(/\r?\n/)
    .map((line, index) => {
      const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      if (!match) return null;
      return { line: index + 1, level: match[1].length, title: match[2].trim() };
    })
    .filter((entry): entry is { line: number; level: number; title: string } => Boolean(entry));
}

function selectRuntimeProfiles(
  profiles: readonly RuntimeProfileConfig[],
  clients: readonly string[],
): RuntimeProfileConfig[] {
  if (clients.length === 0) return [...profiles];
  const selected = profiles.filter((profile) => clients.includes(profile.id));
  const selectedIds = new Set(selected.map((profile) => profile.id));
  const missing = clients.filter((client) => !selectedIds.has(client));
  if (missing.length > 0)
    throw new Error(`No active runtime profile matched: ${missing.join(", ")}`);
  return selected;
}

function guidanceSummary(root: string, guidance: GuidanceSpec): Record<string, unknown> {
  return {
    sourceKind: guidance.sourceKind,
    sourceId: guidance.sourceId,
    name: guidance.name,
    description: guidance.description,
    path: path.relative(root, guidance.sourcePath),
    references: guidance.references.map(({ kind, name }) => ({ kind, name })),
  };
}

function truncateForEvidence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()}\n\n[truncated ${text.length - maxChars} chars]`;
}

function runtimeProfileEvidence(profile: RuntimeProfileConfig): Record<string, unknown> {
  return {
    id: profile.id,
    displayName: profile.displayName,
    assistantName: profile.assistantName,
    timezone: profile.timezone,
    defaultAssistant: profile.defaultAssistant,
    capabilities: profile.capabilitySlugs.map((slug) => ({
      slug,
      label: profileCapabilitySpec(slug)?.label ?? slug,
    })),
    channels: profile.channels.map((channel) => ({
      provider: channel.provider,
      accountId: channel.accountId,
    })),
  };
}

function renderPromptValidationGuidance(guidance: readonly GuidanceSpec[]): string {
  return guidance
    .map((entry) => [`## Source: ${entry.name}`, "", entry.authored.body.markdown.trim()].join("\n"))
    .join("\n\n");
}

async function buildTargets(input: {
  root: string;
  profiles: readonly RuntimeProfileConfig[];
}): Promise<BackendPromptTarget[]> {
  return Promise.all(
    input.profiles.map(async (runtimeProfile) => {
      const capabilityGuidance = await loadCapabilityGuidanceSpecs(
        input.root,
        assistantCapabilitiesForMainAgent(runtimeProfile.capabilitySlugs),
      );
      const prompt = profileAssistantBaseInstructions({
        profileId: runtimeProfile.id,
        profileDisplayName: runtimeProfile.displayName,
        assistantDisplayName: runtimeProfile.assistantName,
        timezone: runtimeProfile.timezone,
        selectedGuidanceMarkdown: renderPromptValidationGuidance(capabilityGuidance),
        taskEvidenceMarkdown:
          "Representative current-turn evidence placeholder used only for prompt-shape validation.",
      });
      return {
        runtimeProfile,
        relativePath: "apps/backend/src/runtime/agent-runner/assistant-defaults.ts",
        prompt,
        capabilityGuidance,
      };
    }),
  );
}

async function evidenceForTarget(input: {
  root: string;
  profile: RuntimeProfile;
  target: BackendPromptTarget;
}): Promise<Record<string, unknown>> {
  return {
    repo: {
      packageName: "@ai-assistants/workspace",
      judgment: "backend assistant base prompt quality",
    },
    runtimeProfileSet: input.profile,
    runtimeProfile: runtimeProfileEvidence(input.target.runtimeProfile),
    capabilityGuidance: input.target.capabilityGuidance.map((guidance) =>
      guidanceSummary(input.root, guidance),
    ),
    backendBasePrompt: {
      sourcePath: input.target.relativePath,
      lineNumbered: lineNumbered(input.target.prompt.trim()),
      headings: markdownHeadings(input.target.prompt),
      characterCount: input.target.prompt.length,
      lineCount: input.target.prompt.split(/\r?\n/).length,
      selectedGuidanceSample: truncateForEvidence(
        input.target.capabilityGuidance
          .map((guidance) => guidance.renderedContent)
          .join("\n\n"),
        MAX_RENDERED_GUIDANCE_CHARS,
      ),
    },
    judgmentScope: [
      "Judge the backend-rendered assistant instructions for this one runtime profile.",
      "The backend selects capability and profile guidance at runtime, then injects it into the prompt.",
      "Do not expect source capability guidance to be copied into a static workspace document.",
      "Do not propose hand-edits to runtime files; recommend backend prompt, typed guidance, or control-plane source fixes.",
      "Warnings are advisory; errors should be clear enough to block runtime verification.",
    ],
  };
}

function formatFailure(clientId: string, result: BackendPromptJudgeResult): string {
  return result.findings
    .filter((finding) => finding.severity === "error")
    .map((finding) => {
      const line = finding.line ? `:${finding.line}` : "";
      const section = finding.section ? ` [${finding.section}]` : "";
      return [
        `- [${clientId}${line}] ${finding.title}${section}`,
        `  ${finding.explanation}`,
        `  Evidence: ${finding.evidence}`,
        `  Recommendation: ${finding.recommendation}`,
      ].join("\n");
    })
    .join("\n");
}

async function runLimited<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const queue = items.map((item, index) => ({ item, index }));
  const results: R[] = new Array(items.length) as R[];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      results[next.index] = await fn(next.item);
    }
  });
  await Promise.all(workers);
  return results;
}

function aggregateCacheStatus(
  cacheDir: string | null,
  runs: readonly { cache_status: JsonJudgeCacheStatus }[],
): JsonJudgeCacheStatus {
  if (!cacheDir) return "disabled";
  if (runs.length > 0 && runs.every((run) => run.cache_status === "hit")) return "hit";
  return "miss";
}

export async function runBackendAssistantPromptJudgeCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const root = repoRoot(import.meta.url);
  const profiles = selectRuntimeProfiles(
    await loadRuntimeProfileConfigs(args.profile),
    args.clients,
  );

  if (args.list) {
    console.log(
      JSON.stringify(
        {
          schema_version: SCHEMA_VERSION,
          profile: args.profile,
          clients: profiles.map((profile) => ({
            id: profile.id,
            displayName: profile.displayName,
            timezone: profile.timezone,
            capabilitySlugs: profile.capabilitySlugs,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }

  const [instructionsText, targets] = await Promise.all([
    readFile(backendAssistantPromptQualityInstructionsPath(), "utf8"),
    buildTargets({
      root,
      profiles,
    }),
  ]);

  const cacheDir = path.join(
    profileRuntimeDir(args.profile),
    "cache",
    "llm-judges",
    "backend-assistant-prompt",
  );

  console.error(
    `Running backend assistant prompt LLM judges (${targets.length} client(s), profile=${args.profile}, concurrency=${args.concurrency}, cache ${cacheDir ? "enabled" : "disabled"}).`,
  );

  const startedAt = Date.now();
  const clientRuns = await runLimited(targets, args.concurrency, async (target) => {
    const started = Date.now();
    const judge = await runJsonJudge({
      id: `backend-assistant-prompt-quality:${target.runtimeProfile.id}`,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      schema: backendPromptJudgeResultSchema,
      instructions: instructionsText.trim(),
      evidence: await evidenceForTarget({ root, profile: args.profile, target }),
      repoRoot: root,
      cacheDir,
      timeoutMs: JUDGE_TIMEOUT_MS,
    });
    const errorCount = judge.result.findings.filter(
      (finding) => finding.severity === "error",
    ).length;
    const warningCount = judge.result.findings.filter(
      (finding) => finding.severity === "warning",
    ).length;
    console.error(
      `- ${target.runtimeProfile.id}: ${judge.result.is_valid && errorCount === 0 ? "valid" : "invalid"} (${judge.cacheStatus}, errors=${errorCount}, warnings=${warningCount})`,
    );
    return {
      client_id: target.runtimeProfile.id,
      path: target.relativePath,
      cache_status: judge.cacheStatus,
      cache_key: judge.cacheKey,
      judge_run_ref: judge.runRef,
      codex_thread_id: judge.codexThreadId,
      duration_ms: Date.now() - started,
      result: judge.result,
    };
  });

  const failures = clientRuns
    .filter(
      (run) =>
        !run.result.is_valid || run.result.findings.some((finding) => finding.severity === "error"),
    )
    .map((run) => formatFailure(run.client_id, run.result))
    .filter(Boolean);
  const mergedFindings = clientRuns.flatMap((run) => run.result.findings);
  const errorCount = mergedFindings.filter((finding) => finding.severity === "error").length;
  const warningCount = mergedFindings.filter((finding) => finding.severity === "warning").length;
  const output = {
    schema_version: SCHEMA_VERSION,
    prompt_version: PROMPT_VERSION,
    ok: failures.length === 0,
    judged_at: new Date().toISOString(),
    profile: args.profile,
    cache: cacheDir ? { enabled: true, dir: cacheDir } : { enabled: false, dir: null },
    cache_status: aggregateCacheStatus(cacheDir, clientRuns),
    duration_ms: Date.now() - startedAt,
    client_count: clientRuns.length,
    errors: errorCount,
    warnings: warningCount,
    clients: clientRuns,
  };
  console.log(JSON.stringify(output, null, 2));

  if (failures.length > 0) {
    console.error(`Backend assistant prompt judge failed:\n\n${failures.join("\n\n")}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runBackendAssistantPromptJudgeCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
