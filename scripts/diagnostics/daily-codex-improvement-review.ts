import {
  buildCodexExecCommand,
  codexAgentHeadlessBaseOptionsFromEnv,
  execCodexArgv,
  extractLastCodexAgentMessage,
  parseCodexJsonEvents,
  type CodexSandboxMode,
} from "@ai-assistants/codex-agent";
import {
  createSupabaseServiceClient,
  requireSupabaseRows,
  type SupabaseServiceClient,
} from "@ai-assistants/control-db";
import { readDiagnosticRecords } from "@ai-assistants/runtime-diagnostics";
import { repoRoot } from "@ai-assistants/repo-layout";
import { parseCli, parseOutputFormat } from "@ai-assistants/workspace-shared";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { supabaseConfigFromProfile } from "../repo-tooling/build/profile-db-config";
import { resolveDiagnosticRuntimeContext } from "./lib/runtime-context";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue | undefined>;

const DEFAULT_SINCE_HOURS = 24;
const DEFAULT_ROW_LIMIT = 200;
const DEFAULT_DIAGNOSTIC_LIMIT = 300;
const DEFAULT_RECOMMENDATIONS = 5;
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_PROMPT_MAX_CHARS = 120_000;
const MAX_STRING_CHARS = 6_000;
const ROOT = repoRoot(import.meta.url);
const DEV_PROFILE = "dev" as const;

const SECRET_KEY_PARTS = [
  "authorization",
  "cookie",
  "credential",
  "password",
  "secret",
  "service_role",
  "token",
  "webhook_secret",
] as const;

const recommendationSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1).max(180),
    priority: z.enum(["p0", "p1", "p2", "p3"]),
    confidence: z.enum(["high", "medium", "low"]),
    recommendationType: z.enum([
      "bug_fix",
      "missing_tool_or_capability",
      "runtime_reliability",
      "observability",
      "prompt_or_guidance",
      "data_model_or_contract",
      "cleanup_or_simplification",
    ]),
    problem: z.string().trim().min(1).max(2_000),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(12),
    likelyOwnerFiles: z.array(z.string().trim().min(1)).max(12),
    proposedSmallestChange: z.string().trim().min(1).max(2_000),
    validationPlan: z.string().trim().min(1).max(1_500),
    whyNow: z.string().trim().min(1).max(1_500),
    riskIfIgnored: z.string().trim().min(1).max(1_500),
    nonGoals: z.array(z.string().trim().min(1)).max(8),
  })
  .strict();

const reviewReportSchema = z
  .object({
    generatedAt: z.string().trim().min(1),
    environment: z.literal("dev"),
    sourceWindow: z.object({
      since: z.string().trim().min(1),
      until: z.string().trim().min(1),
    }),
    headline: z.string().trim().min(1).max(1_500),
    noiseAssessment: z.string().trim().min(1).max(2_000),
    recommendations: z.array(recommendationSchema).max(DEFAULT_RECOMMENDATIONS),
    rejectedIdeas: z
      .array(
        z
          .object({
            idea: z.string().trim().min(1).max(500),
            reasonRejected: z.string().trim().min(1).max(1_000),
          })
          .strict(),
      )
      .max(8),
    missingEvidence: z.array(z.string().trim().min(1)).max(10),
  })
  .strict();

type ReviewReport = z.infer<typeof reviewReportSchema>;

type CliArgs = {
  help: boolean;
  sinceHours: number;
  rowLimit: number;
  diagnosticLimit: number;
  maxRecommendations: number;
  timeoutMs: number;
  promptMaxChars: number;
  model?: string;
  codexProfile?: string;
  sandbox: CodexSandboxMode;
  format: "markdown" | "json";
  outDir?: string;
  dryRun: boolean;
};

type EvidenceFiles = {
  runDir: string;
  indexPath: string;
  businessContextPath: string;
  controlPlanePath: string;
  diagnosticsPath: string;
  promptPath: string;
  schemaPath: string;
  codexEventsPath: string;
  codexLastMessagePath: string;
  codexErrorPath: string;
  reportJsonPath: string;
  reportMarkdownPath: string;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run diagnostics -- daily-codex-improvement-review",
    "  npm run diagnostics -- daily-codex-improvement-review --dry-run",
    "  npm run diagnostics -- daily-codex-improvement-review --since-hours=48 --model=gpt-5-codex",
    "",
    "Builds an isolated dev-only evidence pack from dev Supabase and dev diagnostics, then asks headless Codex for the top maintainer code improvements.",
    "",
    "Options:",
    "  --since-hours=<n>          Dev evidence lookback window. Default: 24",
    "  --row-limit=<n>            Max recent rows per Supabase section. Default: 200",
    "  --diagnostic-limit=<n>     Max recent diagnostics rows. Default: 300",
    "  --max-recommendations=<n>  Max recommendations to request, capped at 5. Default: 5",
    "  --timeout-ms=<n>           Codex timeout. Default: 240000",
    "  --prompt-max-chars=<n>     Prompt cap before truncation. Default: 120000",
    "  --model=<model>            Optional Codex model override.",
    "  --codex-profile=<name>     Optional Codex config.toml profile.",
    "  --sandbox=read-only|workspace-write|danger-full-access  Default: read-only",
    "  --format=markdown|json     Output format. Default: markdown",
    "  --out-dir=<abs-path>       Write artifacts to an absolute directory outside the repo. Default: temp dir",
    "  --dry-run                  Collect evidence and write prompt/schema, but do not run Codex.",
    "",
    "The Codex run is intentionally isolated: it ignores user config unless --codex-profile is passed, ignores rules, and receives compact business context through the generated evidence pack.",
  ].join("\n");
}

function positiveInteger(raw: string | undefined, fallback: number, label: string): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer; got ${JSON.stringify(raw)}.`);
  }
  return parsed;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const parsed = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      "since-hours": { type: "string" },
      "row-limit": { type: "string" },
      "diagnostic-limit": { type: "string" },
      "max-recommendations": { type: "string" },
      "timeout-ms": { type: "string" },
      "prompt-max-chars": { type: "string" },
      model: { type: "string" },
      "codex-profile": { type: "string" },
      sandbox: { type: "string" },
      format: { type: "string" },
      "out-dir": { type: "string" },
      "dry-run": { type: "boolean" },
    },
    schema: z
      .object({
        help: z.boolean().optional(),
        "since-hours": z.string().optional(),
        "row-limit": z.string().optional(),
        "diagnostic-limit": z.string().optional(),
        "max-recommendations": z.string().optional(),
        "timeout-ms": z.string().optional(),
        "prompt-max-chars": z.string().optional(),
        model: z.string().optional(),
        "codex-profile": z.string().optional(),
        sandbox: z.string().optional(),
        format: z.string().optional(),
        "out-dir": z.string().optional(),
        "dry-run": z.boolean().optional(),
      })
      .transform((raw) => {
        const sandbox = raw.sandbox?.trim() || "read-only";
        if (
          sandbox !== "read-only" &&
          sandbox !== "workspace-write" &&
          sandbox !== "danger-full-access"
        ) {
          throw new Error(`Unsupported sandbox ${JSON.stringify(raw.sandbox)}.`);
        }
        const maxRecommendations = Math.min(
          DEFAULT_RECOMMENDATIONS,
          positiveInteger(
            raw["max-recommendations"],
            DEFAULT_RECOMMENDATIONS,
            "--max-recommendations",
          ),
        );
        const outDir = raw["out-dir"]?.trim();
        if (outDir && !path.isAbsolute(outDir)) {
          throw new Error(`--out-dir must be absolute; got ${JSON.stringify(outDir)}.`);
        }
        return {
          help: raw.help ?? false,
          sinceHours: positiveInteger(raw["since-hours"], DEFAULT_SINCE_HOURS, "--since-hours"),
          rowLimit: Math.min(
            1_000,
            positiveInteger(raw["row-limit"], DEFAULT_ROW_LIMIT, "--row-limit"),
          ),
          diagnosticLimit: Math.min(
            2_000,
            positiveInteger(
              raw["diagnostic-limit"],
              DEFAULT_DIAGNOSTIC_LIMIT,
              "--diagnostic-limit",
            ),
          ),
          maxRecommendations,
          timeoutMs: positiveInteger(raw["timeout-ms"], DEFAULT_TIMEOUT_MS, "--timeout-ms"),
          promptMaxChars: positiveInteger(
            raw["prompt-max-chars"],
            DEFAULT_PROMPT_MAX_CHARS,
            "--prompt-max-chars",
          ),
          model: raw.model?.trim() || undefined,
          codexProfile: raw["codex-profile"]?.trim() || undefined,
          sandbox: sandbox as CodexSandboxMode,
          format: parseOutputFormat(raw.format, "markdown"),
          outDir,
          dryRun: raw["dry-run"] ?? false,
        };
      }),
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  return parsed;
}

function isInsideRepo(candidatePath: string): boolean {
  const relative = path.relative(ROOT, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function createEvidenceFiles(outDir: string | undefined): Promise<EvidenceFiles> {
  const runDir = outDir
    ? path.resolve(outDir)
    : await mkdtemp(path.join(os.tmpdir(), "ai-assistants-daily-codex-review-"));
  if (isInsideRepo(runDir)) {
    throw new Error(`Review artifacts must live outside the source repo; got ${runDir}.`);
  }
  await mkdir(runDir, { recursive: true });
  return {
    runDir,
    indexPath: path.join(runDir, "index.json"),
    businessContextPath: path.join(runDir, "business-context.md"),
    controlPlanePath: path.join(runDir, "dev-control-plane.json"),
    diagnosticsPath: path.join(runDir, "dev-diagnostics.jsonl"),
    promptPath: path.join(runDir, "prompt.md"),
    schemaPath: path.join(runDir, "output-schema.json"),
    codexEventsPath: path.join(runDir, "codex-events.jsonl"),
    codexLastMessagePath: path.join(runDir, "codex-last-message.json"),
    codexErrorPath: path.join(runDir, "codex-error.txt"),
    reportJsonPath: path.join(runDir, "report.json"),
    reportMarkdownPath: path.join(runDir, "report.md"),
  };
}

function shouldRedactKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEY_PARTS.some((part) => lower.includes(part));
}

function sanitizeJson(value: unknown, depth = 0, key = ""): JsonValue {
  if (shouldRedactKey(key)) return "[redacted]";
  if (value === null) return null;
  if (typeof value === "string") {
    return value.length > MAX_STRING_CHARS
      ? `${value.slice(0, MAX_STRING_CHARS)}\n[truncated ${value.length - MAX_STRING_CHARS} chars]`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value === undefined) return null;
  if (depth > 6) return "[max-depth]";
  if (Array.isArray(value)) return value.map((entry) => sanitizeJson(entry, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeJson(entryValue, depth + 1, entryKey),
      ]),
    );
  }
  return String(value);
}

function jsonl(rows: readonly unknown[]): string {
  return `${rows.map((row) => JSON.stringify(sanitizeJson(row))).join("\n")}\n`;
}

function countBy<T extends string | null | undefined>(items: readonly T[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = item?.trim() || "<missing>";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function collectControlPlaneEvidence(input: {
  db: SupabaseServiceClient;
  sinceIso: string;
  rowLimit: number;
}): Promise<JsonRecord> {
  const [
    profilesResult,
    assistantsResult,
    channelsResult,
    profileCapabilitiesResult,
    capabilityLinksResult,
    connectedAccountsResult,
    profileGuidanceResult,
    scheduledTasksResult,
    workRoutesResult,
    agentRunsResult,
    agentEventsResult,
    workItemsResult,
    actionsResult,
    proposalsResult,
    providerWriteReceiptsResult,
    backendJobsResult,
    artifactsResult,
    learningReviewRunsResult,
    learningReviewCandidatesResult,
  ] = await Promise.all([
    input.db.from("profiles").select().order("id"),
    input.db.from("assistants").select().order("assistant_id"),
    input.db.from("profile_channels").select().order("profile_id").order("provider"),
    input.db.from("profile_capabilities").select().order("profile_id").order("capability_slug"),
    input.db.from("capability_account_links").select().order("profile_id").order("capability_slug"),
    input.db.from("connected_provider_accounts").select().order("profile_id").order("provider"),
    input.db.from("profile_guidance").select().order("profile_id").order("key"),
    input.db.from("assistant_scheduled_tasks").select().order("profile_id").order("title"),
    input.db.from("profile_assistant_work_routes").select().order("profile_id").order("event_type"),
    input.db
      .from("agent_runs")
      .select()
      .gte("created_at", input.sinceIso)
      .order("created_at", { ascending: false })
      .limit(input.rowLimit),
    input.db
      .from("agent_events")
      .select()
      .gte("occurred_at", input.sinceIso)
      .order("occurred_at", { ascending: false })
      .limit(input.rowLimit),
    input.db
      .from("assistant_work_items")
      .select()
      .gte("updated_at", input.sinceIso)
      .order("updated_at", { ascending: false })
      .limit(input.rowLimit),
    input.db
      .from("profile_actions")
      .select()
      .gte("updated_at", input.sinceIso)
      .order("updated_at", { ascending: false })
      .limit(input.rowLimit),
    input.db
      .from("profile_proposals")
      .select()
      .gte("updated_at", input.sinceIso)
      .order("updated_at", { ascending: false })
      .limit(input.rowLimit),
    input.db
      .from("provider_write_receipts")
      .select()
      .gte("created_at", input.sinceIso)
      .order("created_at", { ascending: false })
      .limit(input.rowLimit),
    input.db
      .from("backend_jobs")
      .select()
      .gte("updated_at", input.sinceIso)
      .order("updated_at", { ascending: false })
      .limit(input.rowLimit),
    input.db
      .from("artifacts")
      .select()
      .gte("created_at", input.sinceIso)
      .order("created_at", { ascending: false })
      .limit(input.rowLimit),
    input.db
      .from("profile_learning_review_runs")
      .select()
      .gte("created_at", input.sinceIso)
      .order("created_at", { ascending: false })
      .limit(input.rowLimit),
    input.db
      .from("profile_learning_review_candidates")
      .select()
      .gte("created_at", input.sinceIso)
      .order("created_at", { ascending: false })
      .limit(input.rowLimit),
  ]);

  const profiles = requireSupabaseRows(
    "Load dev profiles",
    profilesResult.data,
    profilesResult.error,
  );
  const agentEvents = requireSupabaseRows(
    "Load dev recent agent_events",
    agentEventsResult.data,
    agentEventsResult.error,
  );
  const workItems = requireSupabaseRows(
    "Load dev recent assistant_work_items",
    workItemsResult.data,
    workItemsResult.error,
  );
  const actions = requireSupabaseRows(
    "Load dev recent profile_actions",
    actionsResult.data,
    actionsResult.error,
  );
  const backendJobs = requireSupabaseRows(
    "Load dev recent backend_jobs",
    backendJobsResult.data,
    backendJobsResult.error,
  );

  return sanitizeJson({
    schemaVersion: 1,
    profile: DEV_PROFILE,
    sourceWindow: { since: input.sinceIso },
    summary: {
      profileCount: profiles.length,
      profileStatusCounts: countBy(profiles.map((profile) => profile.status)),
      agentEventTypeCounts: countBy(agentEvents.map((event) => event.event_type)),
      workItemStatusCounts: countBy(workItems.map((item) => item.status)),
      actionStatusCounts: countBy(actions.map((action) => action.status)),
      backendJobStatusCounts: countBy(backendJobs.map((job) => job.status)),
    },
    stableState: {
      profiles,
      assistants: requireSupabaseRows(
        "Load dev assistants",
        assistantsResult.data,
        assistantsResult.error,
      ),
      channels: requireSupabaseRows(
        "Load dev profile_channels",
        channelsResult.data,
        channelsResult.error,
      ),
      profileCapabilities: requireSupabaseRows(
        "Load dev profile_capabilities",
        profileCapabilitiesResult.data,
        profileCapabilitiesResult.error,
      ),
      capabilityAccountLinks: requireSupabaseRows(
        "Load dev capability_account_links",
        capabilityLinksResult.data,
        capabilityLinksResult.error,
      ),
      connectedProviderAccounts: requireSupabaseRows(
        "Load dev connected_provider_accounts",
        connectedAccountsResult.data,
        connectedAccountsResult.error,
      ),
      profileGuidance: requireSupabaseRows(
        "Load dev profile_guidance",
        profileGuidanceResult.data,
        profileGuidanceResult.error,
      ),
      scheduledTasks: requireSupabaseRows(
        "Load dev assistant_scheduled_tasks",
        scheduledTasksResult.data,
        scheduledTasksResult.error,
      ),
      assistantWorkRoutes: requireSupabaseRows(
        "Load dev profile_assistant_work_routes",
        workRoutesResult.data,
        workRoutesResult.error,
      ),
    },
    recentOperationalState: {
      agentRuns: requireSupabaseRows(
        "Load dev recent agent_runs",
        agentRunsResult.data,
        agentRunsResult.error,
      ),
      agentEvents,
      workItems,
      profileActions: actions,
      profileProposals: requireSupabaseRows(
        "Load dev recent profile_proposals",
        proposalsResult.data,
        proposalsResult.error,
      ),
      providerWriteReceipts: requireSupabaseRows(
        "Load dev recent provider_write_receipts",
        providerWriteReceiptsResult.data,
        providerWriteReceiptsResult.error,
      ),
      backendJobs,
      artifacts: requireSupabaseRows(
        "Load dev recent artifacts",
        artifactsResult.data,
        artifactsResult.error,
      ),
      profileLearningReviewRuns: requireSupabaseRows(
        "Load dev recent profile_learning_review_runs",
        learningReviewRunsResult.data,
        learningReviewRunsResult.error,
      ),
      profileLearningReviewCandidates: requireSupabaseRows(
        "Load dev recent profile_learning_review_candidates",
        learningReviewCandidatesResult.data,
        learningReviewCandidatesResult.error,
      ),
    },
  }) as JsonRecord;
}

function collectDiagnosticEvidence(input: { sinceMs: number; limit: number }): {
  runtimeRoot: string;
  rows: JsonValue[];
  counts: Record<string, number>;
} {
  const runtime = resolveDiagnosticRuntimeContext(ROOT, {
    profile: DEV_PROFILE,
    runtimeRoot: undefined,
  });
  const cutoff = Date.now() - input.sinceMs;
  const rows = readDiagnosticRecords(runtime.runtimeRoot, { days: 14 })
    .filter((row) => Date.parse(row.ts) >= cutoff)
    .slice(-input.limit);
  return {
    runtimeRoot: runtime.runtimeRoot,
    rows: rows.map((row) => sanitizeJson(row)),
    counts: countBy(rows.map((row) => row.kind)),
  };
}

function businessContextMarkdown(input: {
  files: EvidenceFiles;
  sinceIso: string;
  untilIso: string;
}) {
  return [
    "# Daily Codex Improvement Review Context",
    "",
    "This is maintainer-only analysis for the private AI personal assistants repo.",
    "",
    "## Product Direction",
    "",
    "- Improve named clients' private assistants for mobile-first channels.",
    "- Prefer concrete client outcomes, safety boundaries, explicit provider/tool contracts, and maintainer-led iteration.",
    "- Do not recommend generic workflow-builder/platform abstractions unless evidence shows a current product workflow needs them.",
    "- Prioritize code changes that make the assistant more reliable, useful, observable, and easier for the maintainer to operate.",
    "- This first isolated version must stay read-only and dev-only.",
    "",
    "## Source Window",
    "",
    `- Environment: dev only`,
    `- Since: ${input.sinceIso}`,
    `- Until: ${input.untilIso}`,
    "",
    "## Evidence Files",
    "",
    `- Dev Supabase evidence: ${input.files.controlPlanePath}`,
    `- Dev diagnostics JSONL: ${input.files.diagnosticsPath}`,
    `- Repo root: ${ROOT}`,
    "",
    "## Review Goal",
    "",
    "Recommend the top code/product improvements worth the maintainer's attention. Favor the smallest validated source change over broad architecture rewrites.",
    "",
    "Do not load AGENTS.md or Codex skill files for this isolated experiment; this file is the compact business context for the run.",
  ].join("\n");
}

function renderPrompt(input: {
  files: EvidenceFiles;
  sinceIso: string;
  untilIso: string;
  maxRecommendations: number;
  diagnosticCounts: Record<string, number>;
  controlPlaneSummary: JsonRecord;
}): string {
  return [
    "You are a bounded evidence ranker running inside the AI Assistants source repository.",
    "",
    "Goal:",
    `Review the dev-only evidence pack and recommend the top ${input.maxRecommendations.toString()} maintainer code improvements.`,
    "",
    "Hard boundaries:",
    "- Treat this as read-only analysis. Do not edit files.",
    "- Do not load or use Codex skills, focused skills, SKILL.md files, AGENTS.md, or broad repo rule files. The generated business-context file is the only business context for this isolated experiment.",
    "- Use only dev evidence. Do not inspect prod data, prod env files, credentials, browser sessions, or unrelated runtime roots.",
    "- Do not recommend live client-state changes as the primary output. This report is for source/code/product improvements.",
    "- Do not infer hidden chain-of-thought. Judge assistant behavior only from observable messages, tool traces, diagnostics, and persisted state.",
    "- Reject weak or speculative ideas. Fewer high-confidence recommendations are better than five noisy ones.",
    "- Prefer fixes that improve real client outcomes and can be validated with existing guards, typecheck, E2E, or a small new runtime check.",
    "- Finish in one short pass. Do not run broad repo searches. Use at most six targeted shell reads/searches total, only when needed to identify likely owner files.",
    "- Return only JSON matching the provided schema.",
    "",
    "How to work:",
    "- Start with the index/business context, then inspect the evidence files with targeted searches.",
    "- You may inspect a few source files to understand likely owner code and validation paths, but do not inventory a subsystem.",
    "- Do not read large JSONL files wholesale. Search/filter for error kinds, failed statuses, duplicated patterns, provider/tool names, or evidence ids.",
    "- Each recommendation must cite concrete evidence refs or file paths. Use missingEvidence when the evidence pack is insufficient.",
    "",
    "Evidence pack:",
    `- Business context: ${input.files.businessContextPath}`,
    `- Dev Supabase/control-plane data: ${input.files.controlPlanePath}`,
    `- Dev diagnostics: ${input.files.diagnosticsPath}`,
    `- Source window: ${input.sinceIso} to ${input.untilIso}`,
    "",
    "Compact evidence summary:",
    JSON.stringify(
      {
        diagnosticCounts: input.diagnosticCounts,
        controlPlaneSummary: input.controlPlaneSummary.summary ?? null,
      },
      null,
      2,
    ),
  ].join("\n");
}

function cappedPrompt(prompt: string, maxChars: number): string {
  if (prompt.length <= maxChars) return prompt;
  return `${prompt.slice(0, maxChars)}\n[truncated ${prompt.length - maxChars} chars]`;
}

function parseJsonFromAgentText(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Codex returned an empty final message.");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const primary = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(primary) as unknown;
  } catch {
    const start = primary.search(/[{[]/);
    if (start < 0) throw new Error("Codex final message did not contain JSON.");
    const opening = primary[start];
    const closing = opening === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < primary.length; index += 1) {
      const char = primary[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === opening) depth += 1;
      else if (char === closing) {
        depth -= 1;
        if (depth === 0) return JSON.parse(primary.slice(start, index + 1)) as unknown;
      }
    }
    throw new Error("Codex final message did not contain a complete JSON value.");
  }
}

function formatMarkdown(report: ReviewReport, files: EvidenceFiles): string {
  const lines = [
    "# Daily Codex Improvement Review",
    "",
    `- Environment: ${report.environment}`,
    `- Window: ${report.sourceWindow.since} to ${report.sourceWindow.until}`,
    `- Evidence dir: ${files.runDir}`,
    "",
    "## Headline",
    "",
    report.headline,
    "",
    "## Recommendations",
    "",
  ];
  if (!report.recommendations.length) {
    lines.push("No high-confidence recommendations.", "");
  }
  for (const [index, item] of report.recommendations.entries()) {
    lines.push(
      `### ${index + 1}. ${item.title}`,
      "",
      `- Priority: ${item.priority}`,
      `- Confidence: ${item.confidence}`,
      `- Type: ${item.recommendationType}`,
      `- Problem: ${item.problem}`,
      `- Evidence: ${item.evidenceRefs.join(", ")}`,
      `- Likely owner files: ${item.likelyOwnerFiles.length ? item.likelyOwnerFiles.join(", ") : "unknown"}`,
      `- Smallest change: ${item.proposedSmallestChange}`,
      `- Validation: ${item.validationPlan}`,
      `- Why now: ${item.whyNow}`,
      `- Risk if ignored: ${item.riskIfIgnored}`,
      "",
    );
  }
  lines.push("## Noise Assessment", "", report.noiseAssessment, "");
  if (report.rejectedIdeas.length) {
    lines.push("## Rejected Ideas", "");
    for (const item of report.rejectedIdeas) {
      lines.push(`- ${item.idea}: ${item.reasonRejected}`);
    }
    lines.push("");
  }
  if (report.missingEvidence.length) {
    lines.push("## Missing Evidence", "");
    for (const item of report.missingEvidence) lines.push(`- ${item}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function runCodexReview(input: {
  args: CliArgs;
  files: EvidenceFiles;
  prompt: string;
}): Promise<ReviewReport> {
  const argv = buildCodexExecCommand(codexAgentHeadlessBaseOptionsFromEnv(), {
    prompt: "-",
    cwd: ROOT,
    addDirs: [input.files.runDir],
    sandbox: input.args.sandbox,
    model: input.args.model,
    profile: input.args.codexProfile,
    json: true,
    ephemeral: true,
    ignoreRules: true,
    ignoreUserConfig: input.args.codexProfile ? undefined : true,
    outputLastMessageFile: input.files.codexLastMessagePath,
    outputSchemaFile: input.files.schemaPath,
  });
  let rawEvents: string;
  try {
    rawEvents = await execCodexArgv(ROOT, argv, input.args.timeoutMs, input.prompt);
  } catch (error) {
    await writeFile(
      input.files.codexErrorPath,
      error instanceof Error ? error.stack || error.message : String(error),
      "utf8",
    );
    throw error;
  }
  await writeFile(input.files.codexEventsPath, rawEvents, "utf8");
  const events = parseCodexJsonEvents(rawEvents);
  const finalMessage =
    extractLastCodexAgentMessage(events) ??
    (await readFile(input.files.codexLastMessagePath, "utf8"));
  return reviewReportSchema.parse(parseJsonFromAgentText(finalMessage));
}

async function writeEvidencePack(input: {
  args: CliArgs;
  files: EvidenceFiles;
  sinceIso: string;
  untilIso: string;
  controlPlane: JsonRecord;
  diagnostics: { runtimeRoot: string; rows: JsonValue[]; counts: Record<string, number> };
}): Promise<string> {
  await writeFile(
    input.files.businessContextPath,
    `${businessContextMarkdown({
      files: input.files,
      sinceIso: input.sinceIso,
      untilIso: input.untilIso,
    })}\n`,
    "utf8",
  );
  await writeFile(input.files.controlPlanePath, `${JSON.stringify(input.controlPlane, null, 2)}\n`);
  await writeFile(input.files.diagnosticsPath, jsonl(input.diagnostics.rows), "utf8");
  await writeFile(
    input.files.schemaPath,
    `${JSON.stringify(z.toJSONSchema(reviewReportSchema, { io: "output" }), null, 2)}\n`,
    "utf8",
  );
  const prompt = cappedPrompt(
    renderPrompt({
      files: input.files,
      sinceIso: input.sinceIso,
      untilIso: input.untilIso,
      maxRecommendations: input.args.maxRecommendations,
      diagnosticCounts: input.diagnostics.counts,
      controlPlaneSummary: input.controlPlane,
    }),
    input.args.promptMaxChars,
  );
  await writeFile(input.files.promptPath, `${prompt}\n`, "utf8");
  await writeFile(
    input.files.indexPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        createdAt: input.untilIso,
        environment: DEV_PROFILE,
        runDir: input.files.runDir,
        repoRoot: ROOT,
        runtimeRoot: input.diagnostics.runtimeRoot,
        sourceWindow: { since: input.sinceIso, until: input.untilIso },
        files: input.files,
        dryRun: input.args.dryRun,
        codex: {
          sandbox: input.args.sandbox,
          model: input.args.model ?? null,
          codexProfile: input.args.codexProfile ?? null,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return prompt;
}

async function writeReport(input: { report: ReviewReport; files: EvidenceFiles }): Promise<void> {
  await writeFile(input.files.reportJsonPath, `${JSON.stringify(input.report, null, 2)}\n`, "utf8");
  await writeFile(
    input.files.reportMarkdownPath,
    formatMarkdown(input.report, input.files),
    "utf8",
  );
}

export async function runDailyCodexImprovementReviewCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv);
  const files = await createEvidenceFiles(args.outDir);
  const until = new Date();
  const since = new Date(until.getTime() - args.sinceHours * 60 * 60 * 1_000);
  const db = createSupabaseServiceClient(supabaseConfigFromProfile(DEV_PROFILE));
  const [controlPlane, diagnostics] = await Promise.all([
    collectControlPlaneEvidence({
      db,
      sinceIso: since.toISOString(),
      rowLimit: args.rowLimit,
    }),
    Promise.resolve(
      collectDiagnosticEvidence({
        sinceMs: args.sinceHours * 60 * 60 * 1_000,
        limit: args.diagnosticLimit,
      }),
    ),
  ]);
  await writeEvidencePack({
    args,
    files,
    sinceIso: since.toISOString(),
    untilIso: until.toISOString(),
    controlPlane,
    diagnostics,
  });
  if (args.dryRun) {
    const dryRunOutput = {
      status: "dry_run",
      runDir: files.runDir,
      indexPath: files.indexPath,
      promptPath: files.promptPath,
      schemaPath: files.schemaPath,
      controlPlanePath: files.controlPlanePath,
      diagnosticsPath: files.diagnosticsPath,
    };
    if (args.format === "json") {
      console.log(JSON.stringify(dryRunOutput, null, 2));
    } else {
      console.log(
        `# Daily Codex Improvement Review Dry Run\n\n- Run dir: ${files.runDir}\n- Prompt: ${files.promptPath}\n- Schema: ${files.schemaPath}\n- Dev Supabase evidence: ${files.controlPlanePath}\n- Dev diagnostics: ${files.diagnosticsPath}`,
      );
    }
    return;
  }

  const prompt = await readFile(files.promptPath, "utf8");
  const report = await runCodexReview({ args, files, prompt });
  await writeReport({ report, files });
  if (args.format === "json") {
    console.log(
      JSON.stringify(
        {
          runDir: files.runDir,
          reportPath: files.reportJsonPath,
          markdownPath: files.reportMarkdownPath,
          report,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(await readFile(files.reportMarkdownPath, "utf8"));
}
