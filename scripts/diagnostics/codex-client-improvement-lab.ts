#!/usr/bin/env tsx

import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildCodexExecCommand,
  CODEX_SANDBOX_MODES,
  codexAgentHeadlessBaseOptionsFromEnv,
  execCodexArgv,
  extractLastCodexAgentMessage,
  parseCodexJsonEvents,
  type CodexSandboxMode,
} from "@ai-assistants/codex-agent";
import { assertRuntimeProfile, repoRoot } from "@ai-assistants/repo-layout";
import { parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { runClientSnapshotCli } from "../clients/snapshot";

const root = repoRoot(import.meta.url);
const DEFAULT_CLIENT_ID = "testing";
const DEFAULT_ENV_PROFILE = "dev";
const DEFAULT_MAX_EVIDENCE = 90;
const DEFAULT_MAX_LENS_EVIDENCE = 35;
const DEFAULT_MAX_LENS_FINDINGS = 6;
const DEFAULT_MAX_RECOMMENDATIONS = 6;
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_PROMPT_MAX_CHARS = 120_000;
const EVIDENCE_STRATEGIES = ["raw", "stories", "hybrid"] as const;
const REVIEW_MODES = ["single", "lensed"] as const;
const LENS_IDS = ["provider_work_reliability", "client_guidance_workflows"] as const;

type JsonRecord = Record<string, unknown>;
type EvidenceStrategy = (typeof EVIDENCE_STRATEGIES)[number];
type ReviewMode = (typeof REVIEW_MODES)[number];
type LensId = (typeof LENS_IDS)[number];

const cliSchema = z
  .object({
    help: z.boolean().optional(),
    snapshot: z.string().optional(),
    summary: z.string().optional(),
    client: z.string().default(DEFAULT_CLIENT_ID),
    "env-profile": z.string().default(DEFAULT_ENV_PROFILE),
    model: z.string().optional(),
    "codex-profile": z.string().optional(),
    sandbox: z.enum(CODEX_SANDBOX_MODES).default("read-only"),
    format: z.enum(["markdown", "json"]).default("markdown"),
    "max-evidence": z.coerce.number().int().min(10).max(240).default(DEFAULT_MAX_EVIDENCE),
    "max-recommendations": z.coerce
      .number()
      .int()
      .min(1)
      .max(12)
      .default(DEFAULT_MAX_RECOMMENDATIONS),
    "timeout-ms": z.coerce.number().int().min(30_000).max(1_800_000).default(DEFAULT_TIMEOUT_MS),
    "prompt-max-chars": z.coerce
      .number()
      .int()
      .min(20_000)
      .max(240_000)
      .default(DEFAULT_PROMPT_MAX_CHARS),
    "evidence-strategy": z.enum(EVIDENCE_STRATEGIES).default("hybrid"),
    "review-mode": z.enum(REVIEW_MODES).default("single"),
    "max-lens-evidence": z.coerce.number().int().min(5).max(120).default(DEFAULT_MAX_LENS_EVIDENCE),
    "max-lens-findings": z.coerce.number().int().min(1).max(12).default(DEFAULT_MAX_LENS_FINDINGS),
    critic: z.boolean().optional(),
    "skip-critic": z.boolean().optional(),
    out: z.string().optional(),
    "out-dir": z.string().optional(),
    "dry-run": z.boolean().optional(),
    "persist-session": z.boolean().optional(),
    "use-existing-snapshot": z.boolean().optional(),
  })
  .strict();

type CliArgs = z.infer<typeof cliSchema>;

const evidenceKindSchema = z.enum([
  "message",
  "work_item",
  "action",
  "proposal",
  "backend_job",
  "artifact",
  "integration",
  "channel",
  "webhook",
  "guidance",
  "work_route",
  "scheduled_task",
  "agent_event",
  "agent_run",
  "prior_outcome",
  "unknown",
]);

const signalSchema = z.enum([
  "failed_or_blocked",
  "retry_or_loop",
  "disconnected_integration",
  "unhealthy_webhook",
  "provider_write_failed",
  "delivery_failed",
  "approval_waiting",
  "clarification",
  "document",
  "follow_up",
  "system_update",
  "drafting",
  "meeting",
  "summary",
  "notification",
  "memory_or_context",
  "client_workflow",
]);

const normalizedEvidenceSchema = z
  .object({
    ref: z.string().trim().min(1),
    kind: evidenceKindSchema,
    sourcePath: z.string().trim().min(1),
    title: z.string().trim().min(1).nullable(),
    status: z.string().trim().min(1).nullable(),
    occurredAt: z.string().trim().min(1).nullable(),
    excerpt: z.string().trim().min(1),
    excerpted: z.boolean(),
    signals: z.array(signalSchema),
  })
  .strict();

type NormalizedEvidence = z.infer<typeof normalizedEvidenceSchema>;
type PackagedEvidence = JsonRecord & { ref: string };

type EvidencePackageResult = {
  packagedEvidence: PackagedEvidence[];
  storyCount: number;
  rawEvidenceCount: number;
};

type SnapshotContextFiles = {
  dir: string;
  lensDir: string;
  indexPath: string;
  durableStatePath: string;
  providerReadinessPath: string;
  workItemsPath: string;
  agentRunsPath: string;
  agentEventsPath: string;
  providerWritesPath: string;
  artifactsPath: string;
  guidanceSchedulesPath: string;
  storiesPath: string;
  rawEvidencePath: string;
};

type LensDefinition = {
  id: LensId;
  objective: string;
  questions: readonly string[];
  evidenceKinds: readonly string[];
  signals: readonly string[];
  preferredFiles: (files: SnapshotContextFiles) => readonly string[];
};

const recommendationReportSchema = z
  .object({
    clientId: z.string().trim().min(1),
    sourcePath: z.string().trim().min(1),
    executiveSummary: z.string().trim().min(1),
    codebaseInspectionSummary: z.string().trim().min(1),
    recommendations: z
      .array(
        z
          .object({
            id: z
              .string()
              .trim()
              .min(1)
              .regex(/^[a-z][a-z0-9_]*$/),
            title: z.string().trim().min(1),
            lane: z.enum(["reliability", "capability", "maintainer_workflow"]),
            severity: z.enum(["critical", "high", "medium", "low"]),
            confidence: z.enum(["low", "medium", "high"]),
            targetScope: z.enum([
              "maintainer_product",
              "client_guidance",
              "client_scheduled_task",
              "client_approval_policy",
              "client_provider_state",
              "client_runtime_data",
              "needs_more_evidence",
            ]),
            actionType: z.enum([
              "new_capability_or_tool",
              "backend_or_runtime_fix",
              "guidance_update",
              "scheduled_task_change",
              "approval_policy_change",
              "provider_state_change",
              "data_cleanup",
              "investigation",
            ]),
            ownerLayer: z.enum([
              "reliability_code",
              "tool_api",
              "workflow_orchestration",
              "context_retrieval",
              "memory_policy",
              "prompt_guidance",
              "product_ui",
              "approval_escalation",
              "maintainer_backlog",
            ]),
            problem: z.string().trim().min(1),
            whyItMattersForClient: z.string().trim().min(1),
            proposedChange: z.string().trim().min(1),
            smallestUsefulVersion: z.string().trim().min(1),
            validationPlan: z.string().trim().min(1),
            evidenceRefs: z.array(z.string().trim().min(1)).min(1),
            repoFileRefs: z.array(z.string().trim().min(1)),
            missingEvidence: z.array(z.string().trim().min(1)),
          })
          .strict(),
      )
      .min(1),
    rejectedIdeas: z.array(
      z
        .object({
          title: z.string().trim().min(1),
          reason: z.string().trim().min(1),
          evidenceRefs: z.array(z.string().trim().min(1)),
        })
        .strict(),
    ),
    followUpQuestions: z.array(z.string().trim().min(1)),
  })
  .strict();

type RecommendationReport = z.infer<typeof recommendationReportSchema>;

const lensReportSchema = z
  .object({
    lens: z.enum(LENS_IDS),
    objective: z.string().trim().min(1),
    snapshotSource: z.string().trim().min(1),
    findings: z.array(
      z
        .object({
          id: z
            .string()
            .trim()
            .min(1)
            .regex(/^[a-z][a-z0-9_]*$/),
          claim: z.string().trim().min(1),
          category: z.enum([
            "provider_readiness",
            "work_queue_reliability",
            "client_workflow",
            "guidance_or_schedule",
            "product_opportunity",
            "needs_more_evidence",
          ]),
          severity: z.enum(["critical", "high", "medium", "low"]),
          confidence: z.enum(["low", "medium", "high"]),
          evidenceRefs: z.array(z.string().trim().min(1)).min(1),
          sourceFiles: z.array(z.string().trim().min(1)).min(1),
          originalSourcePaths: z.array(z.string().trim().min(1)),
          missingEvidence: z.array(z.string().trim().min(1)),
          whyItMatters: z.string().trim().min(1),
          suggestedNextCheck: z.string().trim().min(1),
        })
        .strict(),
    ),
    coverageNotes: z.array(z.string().trim().min(1)),
    rejectedSignals: z.array(
      z
        .object({
          signal: z.string().trim().min(1),
          reason: z.string().trim().min(1),
          evidenceRefs: z.array(z.string().trim().min(1)),
        })
        .strict(),
    ),
  })
  .strict();

type LensReport = z.infer<typeof lensReportSchema>;

const criticReportSchema = z
  .object({
    clientId: z.string().trim().min(1),
    sourcePath: z.string().trim().min(1),
    overallVerdict: z.enum(["accept", "accept_with_changes", "needs_revision", "reject"]),
    summary: z.string().trim().min(1),
    recommendationReviews: z
      .array(
        z
          .object({
            recommendationId: z
              .string()
              .trim()
              .min(1)
              .regex(/^[a-z][a-z0-9_]*$/),
            verdict: z.enum(["accept", "downgrade", "reject", "needs_more_evidence"]),
            confidenceAfterCritic: z.enum(["low", "medium", "high"]),
            severityAfterCritic: z.enum(["critical", "high", "medium", "low", "not_applicable"]),
            overkillRisk: z.enum(["low", "medium", "high"]),
            classificationIssue: z.boolean(),
            evidenceRefsChecked: z.array(z.string().trim().min(1)),
            reasons: z.array(z.string().trim().min(1)).min(1),
            missingEvidence: z.array(z.string().trim().min(1)),
            suggestedRevision: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
    globalConcerns: z.array(z.string().trim().min(1)),
    highestConfidenceRecommendationIds: z.array(z.string().trim().min(1)),
    rejectedRecommendationIds: z.array(z.string().trim().min(1)),
  })
  .strict();

type CriticReport = z.infer<typeof criticReportSchema>;

const lensReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lens", "objective", "snapshotSource", "findings", "coverageNotes", "rejectedSignals"],
  properties: {
    lens: { type: "string", enum: LENS_IDS },
    objective: { type: "string", minLength: 1 },
    snapshotSource: { type: "string", minLength: 1 },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "claim",
          "category",
          "severity",
          "confidence",
          "evidenceRefs",
          "sourceFiles",
          "originalSourcePaths",
          "missingEvidence",
          "whyItMatters",
          "suggestedNextCheck",
        ],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
          claim: { type: "string", minLength: 1 },
          category: {
            type: "string",
            enum: [
              "provider_readiness",
              "work_queue_reliability",
              "client_workflow",
              "guidance_or_schedule",
              "product_opportunity",
              "needs_more_evidence",
            ],
          },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          evidenceRefs: { type: "array", minItems: 1, items: { type: "string" } },
          sourceFiles: { type: "array", minItems: 1, items: { type: "string" } },
          originalSourcePaths: { type: "array", items: { type: "string" } },
          missingEvidence: { type: "array", items: { type: "string" } },
          whyItMatters: { type: "string", minLength: 1 },
          suggestedNextCheck: { type: "string", minLength: 1 },
        },
      },
    },
    coverageNotes: { type: "array", items: { type: "string" } },
    rejectedSignals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["signal", "reason", "evidenceRefs"],
        properties: {
          signal: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1 },
          evidenceRefs: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const criticReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "clientId",
    "sourcePath",
    "overallVerdict",
    "summary",
    "recommendationReviews",
    "globalConcerns",
    "highestConfidenceRecommendationIds",
    "rejectedRecommendationIds",
  ],
  properties: {
    clientId: { type: "string", minLength: 1 },
    sourcePath: { type: "string", minLength: 1 },
    overallVerdict: {
      type: "string",
      enum: ["accept", "accept_with_changes", "needs_revision", "reject"],
    },
    summary: { type: "string", minLength: 1 },
    recommendationReviews: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "recommendationId",
          "verdict",
          "confidenceAfterCritic",
          "severityAfterCritic",
          "overkillRisk",
          "classificationIssue",
          "evidenceRefsChecked",
          "reasons",
          "missingEvidence",
          "suggestedRevision",
        ],
        properties: {
          recommendationId: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
          verdict: {
            type: "string",
            enum: ["accept", "downgrade", "reject", "needs_more_evidence"],
          },
          confidenceAfterCritic: { type: "string", enum: ["low", "medium", "high"] },
          severityAfterCritic: {
            type: "string",
            enum: ["critical", "high", "medium", "low", "not_applicable"],
          },
          overkillRisk: { type: "string", enum: ["low", "medium", "high"] },
          classificationIssue: { type: "boolean" },
          evidenceRefsChecked: { type: "array", items: { type: "string" } },
          reasons: { type: "array", minItems: 1, items: { type: "string" } },
          missingEvidence: { type: "array", items: { type: "string" } },
          suggestedRevision: { type: "string", minLength: 1 },
        },
      },
    },
    globalConcerns: { type: "array", items: { type: "string" } },
    highestConfidenceRecommendationIds: { type: "array", items: { type: "string" } },
    rejectedRecommendationIds: { type: "array", items: { type: "string" } },
  },
} as const;

const recommendationReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "clientId",
    "sourcePath",
    "executiveSummary",
    "codebaseInspectionSummary",
    "recommendations",
    "rejectedIdeas",
    "followUpQuestions",
  ],
  properties: {
    clientId: { type: "string", minLength: 1 },
    sourcePath: { type: "string", minLength: 1 },
    executiveSummary: { type: "string", minLength: 1 },
    codebaseInspectionSummary: { type: "string", minLength: 1 },
    recommendations: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "lane",
          "severity",
          "confidence",
          "targetScope",
          "actionType",
          "ownerLayer",
          "problem",
          "whyItMattersForClient",
          "proposedChange",
          "smallestUsefulVersion",
          "validationPlan",
          "evidenceRefs",
          "repoFileRefs",
          "missingEvidence",
        ],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
          title: { type: "string", minLength: 1 },
          lane: {
            type: "string",
            enum: ["reliability", "capability", "maintainer_workflow"],
          },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          targetScope: {
            type: "string",
            enum: [
              "maintainer_product",
              "client_guidance",
              "client_scheduled_task",
              "client_approval_policy",
              "client_provider_state",
              "client_runtime_data",
              "needs_more_evidence",
            ],
          },
          actionType: {
            type: "string",
            enum: [
              "new_capability_or_tool",
              "backend_or_runtime_fix",
              "guidance_update",
              "scheduled_task_change",
              "approval_policy_change",
              "provider_state_change",
              "data_cleanup",
              "investigation",
            ],
          },
          ownerLayer: {
            type: "string",
            enum: [
              "reliability_code",
              "tool_api",
              "workflow_orchestration",
              "context_retrieval",
              "memory_policy",
              "prompt_guidance",
              "product_ui",
              "approval_escalation",
              "maintainer_backlog",
            ],
          },
          problem: { type: "string", minLength: 1 },
          whyItMattersForClient: { type: "string", minLength: 1 },
          proposedChange: { type: "string", minLength: 1 },
          smallestUsefulVersion: { type: "string", minLength: 1 },
          validationPlan: { type: "string", minLength: 1 },
          evidenceRefs: { type: "array", minItems: 1, items: { type: "string" } },
          repoFileRefs: { type: "array", items: { type: "string" } },
          missingEvidence: { type: "array", items: { type: "string" } },
        },
      },
    },
    rejectedIdeas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "reason", "evidenceRefs"],
        properties: {
          title: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1 },
          evidenceRefs: { type: "array", items: { type: "string" } },
        },
      },
    },
    followUpQuestions: { type: "array", items: { type: "string" } },
  },
} as const;

const LENS_DEFINITIONS: readonly LensDefinition[] = [
  {
    id: "provider_work_reliability",
    objective:
      "Map evidence about integration readiness, provider write failures, webhook health, work item decay, retries, stuck work, and silent runtime failures.",
    questions: [
      "Which connected accounts, capability links, webhooks, provider writes, or backend jobs are blocking useful assistant work?",
      "Which work items appear stuck, expired, repeatedly retried, failed, or incorrectly treated as complete?",
      "What evidence would a maintainer need before deciding whether this is a live provider-state fix or a product/runtime fix?",
    ],
    evidenceKinds: [
      "integration",
      "webhook",
      "backend_job",
      "action",
      "work_item",
      "agent_run",
      "agent_event",
      "work_item_story",
      "agent_run_story",
      "provider_write_story",
    ],
    signals: [
      "failed_or_blocked",
      "retry_or_loop",
      "disconnected_integration",
      "unhealthy_webhook",
      "provider_write_failed",
      "delivery_failed",
    ],
    preferredFiles: (files) => [
      files.indexPath,
      files.providerReadinessPath,
      files.providerWritesPath,
      files.workItemsPath,
      files.agentRunsPath,
      files.agentEventsPath,
      files.storiesPath,
      files.rawEvidencePath,
    ],
  },
  {
    id: "client_guidance_workflows",
    objective:
      "Map evidence about repeated client workflows, document/deal handling, guidance quality, scheduled tasks, approval behavior, and missing maintainer/product capabilities.",
    questions: [
      "Which repeated client requests or artifacts suggest durable client guidance, routes, or scheduled tasks?",
      "Which live guidance or schedule entries look stale, overbroad, missing, or contradicted by recent operational evidence?",
      "Which missing tools, diagnostics, or product capabilities would reduce maintainer work without turning the client into a workflow builder?",
    ],
    evidenceKinds: [
      "guidance",
      "scheduled_task",
      "work_route",
      "artifact",
      "message",
      "work_item",
      "action",
      "work_item_story",
      "artifact_story",
      "provider_write_story",
    ],
    signals: [
      "document",
      "follow_up",
      "system_update",
      "drafting",
      "meeting",
      "summary",
      "notification",
      "memory_or_context",
      "client_workflow",
      "clarification",
      "approval_waiting",
    ],
    preferredFiles: (files) => [
      files.indexPath,
      files.durableStatePath,
      files.guidanceSchedulesPath,
      files.workItemsPath,
      files.artifactsPath,
      files.storiesPath,
      files.rawEvidencePath,
    ],
  },
] as const;

function usage(): string {
  return [
    "Usage:",
    "  npm run diagnostics -- codex-client-improvement-lab",
    "  npm run diagnostics -- codex-client-improvement-lab --snapshot=/abs/path/client-summary.json --dry-run",
    "  npm run diagnostics -- codex-client-improvement-lab --snapshot=/abs/path/client-summary.json --model=gpt-5-codex",
    "",
    "Runs an isolated read-only Codex CLI trial that asks a headless Codex agent to recommend client assistant improvements from snapshot evidence.",
    "",
    "Options:",
    "  --snapshot=<path>              Client snapshot or summary JSON. Defaults to a fresh enriched snapshot in the run dir.",
    "  --summary=<path>               Alias for --snapshot.",
    "  --client=<id>                  Client id to unwrap from aggregate files. Default: testing",
    "  --env-profile=dev|e2e|prod     Runtime profile used only for default snapshot lookup. Default: dev",
    "  --model=<model>                Optional Codex model override.",
    "  --codex-profile=<name>         Optional Codex config.toml profile.",
    "  --sandbox=read-only|workspace-write|danger-full-access  Default: read-only",
    "  --format=markdown|json         Output format. Default: markdown",
    `  --max-evidence=<n>             Evidence records sent to Codex. Default: ${DEFAULT_MAX_EVIDENCE}`,
    `  --max-recommendations=<n>      Requested recommendations. Default: ${DEFAULT_MAX_RECOMMENDATIONS}`,
    `  --timeout-ms=<n>               Codex exec timeout. Default: ${DEFAULT_TIMEOUT_MS}`,
    `  --prompt-max-chars=<n>         Prompt character budget. Default: ${DEFAULT_PROMPT_MAX_CHARS}`,
    "  --evidence-strategy=raw|stories|hybrid  Packaging strategy. Default: hybrid",
    "  --review-mode=single|lensed    single runs one final Codex call; lensed runs 2 evidence-map lens calls first. Default: single",
    `  --max-lens-evidence=<n>        Starter evidence records per lens. Default: ${DEFAULT_MAX_LENS_EVIDENCE}`,
    `  --max-lens-findings=<n>        Max findings per lens report. Default: ${DEFAULT_MAX_LENS_FINDINGS}`,
    "  --critic                       Run critic after final recommendation report. Default: on for --review-mode=lensed, off for single.",
    "  --skip-critic                  Disable the default lensed critic call.",
    "  --out=<path>                   Write final parsed report to this path.",
    "  --out-dir=<path>               Write prompt, schema, events, and last message artifacts.",
    "  --dry-run                      Build artifacts and print metadata without running Codex.",
    "  --persist-session              Do not pass --ephemeral to Codex.",
    "  --use-existing-snapshot        Use the latest existing default snapshot instead of generating a fresh enriched snapshot. Mainly for comparing stale/local artifacts.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  const parsed = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      snapshot: { type: "string" },
      summary: { type: "string" },
      client: { type: "string" },
      "env-profile": { type: "string" },
      model: { type: "string" },
      "codex-profile": { type: "string" },
      sandbox: { type: "string" },
      format: { type: "string" },
      "max-evidence": { type: "string" },
      "max-recommendations": { type: "string" },
      "timeout-ms": { type: "string" },
      "prompt-max-chars": { type: "string" },
      "evidence-strategy": { type: "string" },
      "review-mode": { type: "string" },
      "max-lens-evidence": { type: "string" },
      "max-lens-findings": { type: "string" },
      critic: { type: "boolean" },
      "skip-critic": { type: "boolean" },
      out: { type: "string" },
      "out-dir": { type: "string" },
      "dry-run": { type: "boolean" },
      "persist-session": { type: "boolean" },
      "use-existing-snapshot": { type: "boolean" },
    },
    schema: cliSchema,
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  return parsed;
}

function isInsideRepo(filePath: string): boolean {
  const relative = path.relative(root, path.resolve(filePath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertOutsideRepo(filePath: string, label: string): void {
  if (!isInsideRepo(filePath)) return;
  throw new Error(
    `${label} must be outside the source repo because Codex lab artifacts include client/runtime evidence. Use an absolute /tmp path instead: ${filePath}`,
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function defaultInputPath(input: { clientId: string; envProfile: string }): Promise<string> {
  const home = process.env.HOME ?? "";
  const candidates = [
    path.join(root, "clients", "client-state-summaries.generated", `${input.clientId}.json`),
    path.join(root, "clients", "client-state-snapshots.generated", `${input.clientId}.json`),
    path.join(
      home,
      `.ai-assistants-${input.envProfile}`,
      "client-state-summaries",
      `${input.clientId}.json`,
    ),
    path.join(
      home,
      `.ai-assistants-${input.envProfile}`,
      "client-state-snapshots",
      `${input.clientId}.json`,
    ),
    path.join(home, ".ai-assistants-prod", "client-state-summaries", `${input.clientId}.json`),
    path.join(home, ".ai-assistants-prod", "client-state-snapshots", `${input.clientId}.json`),
  ];
  for (const candidate of candidates) {
    if (candidate && (await fileExists(candidate))) return candidate;
  }
  throw new Error(
    [
      `No default snapshot found for ${input.clientId}.`,
      "Generate one with:",
      `  npm run clients -- snapshot --profile=${input.envProfile} --client=${input.clientId}`,
      "or pass --snapshot=/abs/path/client-summary-or-snapshot.json.",
      "Checked:",
      ...candidates.map((candidate) => `  - ${candidate}`),
    ].join("\n"),
  );
}

async function generateFreshSnapshot(input: {
  clientId: string;
  envProfile: string;
  runDir: string;
}): Promise<string> {
  const snapshotDir = path.join(input.runDir, "snapshot");
  await mkdir(snapshotDir, { recursive: true });

  const originalLog = console.log;
  console.log = (...values: unknown[]) => {
    process.stderr.write(`${values.map(String).join(" ")}\n`);
  };
  try {
    await runClientSnapshotCli([
      `--profile=${input.envProfile}`,
      `--client=${input.clientId}`,
      `--out-dir=${snapshotDir}`,
    ]);
  } finally {
    console.log = originalLog;
  }

  const snapshotPath = path.join(snapshotDir, `${input.clientId}.json`);
  if (!(await fileExists(snapshotPath))) {
    throw new Error(`Fresh snapshot generation did not write ${snapshotPath}.`);
  }
  return snapshotPath;
}

async function resolveInputPath(args: CliArgs, runDir: string): Promise<string> {
  const explicitPath = args.snapshot ?? args.summary;
  if (explicitPath) return path.resolve(explicitPath);
  assertRuntimeProfile(args["env-profile"]);
  if (!args["use-existing-snapshot"]) {
    return generateFreshSnapshot({
      clientId: args.client,
      envProfile: args["env-profile"],
      runDir,
    });
  }
  return defaultInputPath({ clientId: args.client, envProfile: args["env-profile"] });
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function recordValue(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstString(record: JsonRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return null;
}

function stableJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const rendered = JSON.stringify(value);
  if (!rendered || rendered === "{}" || rendered === "[]") return null;
  return rendered;
}

function compactJson(value: unknown, maxChars: number): string | null {
  const rendered = stableJson(value);
  return rendered ? truncateText(rendered, maxChars) : null;
}

function truncateText(raw: string, maxChars: number): string {
  const trimmed = raw.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 32)).trimEnd()}\n...[truncated]`;
}

function refFor(prefix: string, id: string | null, fallback: number): string {
  return `${prefix}:${id ?? fallback.toString()}`;
}

function evidenceRef(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return stringValue(value.ref);
}

function compactList(values: readonly string[], maxItems: number): string[] {
  return [...new Set(values.filter((value) => value.trim()).map((value) => value.trim()))].slice(
    0,
    maxItems,
  );
}

function textFromFields(record: JsonRecord, keys: readonly string[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const value = record[key];
    const rendered = typeof value === "string" ? value.trim() : stableJson(value);
    if (rendered) parts.push(`${key}: ${rendered}`);
  }
  return parts.join("\n").trim();
}

function statusText(record: JsonRecord): string {
  return [
    firstString(record, ["status", "state", "connectionStatus", "credentialStatus", "result"]),
    stableJson(record),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function signalsFor(
  record: JsonRecord,
  kind: NormalizedEvidence["kind"],
): NormalizedEvidence["signals"] {
  const text = statusText(record);
  const signals: NormalizedEvidence["signals"] = [];
  if (/fail|failed|error|blocked|dead|timeout|exception|cannot|unable/.test(text)) {
    signals.push("failed_or_blocked");
  }
  if (/retry|loop|repeated|again|stale|claimed/.test(text)) signals.push("retry_or_loop");
  if (/disconnect|expired|revoked|missing credential|auth/.test(text)) {
    signals.push("disconnected_integration");
  }
  if (kind === "webhook" && !/active|healthy|enabled/.test(text)) signals.push("unhealthy_webhook");
  if (/provider write|write receipt|write failed/.test(text)) signals.push("provider_write_failed");
  if (/delivery_failed|undelivered|message failed/.test(text)) signals.push("delivery_failed");
  if (/approval|approve|confirm|permission/.test(text)) signals.push("approval_waiting");
  if (/clarif|which folder|where should|do you mean|can you confirm/.test(text)) {
    signals.push("clarification");
  }
  if (/doc|document|file|folder|invoice|statement|pdf|signed|signature|mandate/.test(text)) {
    signals.push("document");
  }
  if (/follow.?up|stale|waiting|remind|pending|due/.test(text)) signals.push("follow_up");
  if (/crm|monday|board|status|update/.test(text)) signals.push("system_update");
  if (/draft|reply|respond|email|message/.test(text)) signals.push("drafting");
  if (/meeting|call|agenda|prep/.test(text)) signals.push("meeting");
  if (/summary|brief|digest|handled/.test(text)) signals.push("summary");
  if (/notification|alert|telegram|whatsapp|sms|noise|fyi/.test(text)) signals.push("notification");
  if (/memory|remember|alias|preference|again|same/.test(text)) signals.push("memory_or_context");
  if (/workflow|process|client|deal|case|project|request/.test(text))
    signals.push("client_workflow");
  return [...new Set(signals)];
}

function makeEvidence(input: {
  ref: string;
  kind: NormalizedEvidence["kind"];
  sourcePath: string;
  record: JsonRecord;
  titleKeys: readonly string[];
  statusKeys?: readonly string[];
  occurredAtKeys?: readonly string[];
  excerptKeys: readonly string[];
}): NormalizedEvidence | null {
  const title = firstString(input.record, input.titleKeys);
  const text = textFromFields(input.record, input.excerptKeys);
  if (!title && !text) return null;
  return normalizedEvidenceSchema.parse({
    ref: input.ref,
    kind: input.kind,
    sourcePath: input.sourcePath,
    title,
    status: firstString(input.record, input.statusKeys ?? ["status", "state", "result"]),
    occurredAt: firstString(
      input.record,
      input.occurredAtKeys ?? ["occurredAt", "updatedAt", "createdAt", "finishedAt", "lastRunAt"],
    ),
    excerpt: truncateText(text || title || "(no text)", 1_800),
    excerpted: (text || "").length > 1_800,
    signals: signalsFor(input.record, input.kind),
  });
}

function addEvidence(
  output: NormalizedEvidence[],
  input: Parameters<typeof makeEvidence>[0],
): void {
  const evidence = makeEvidence(input);
  if (evidence) output.push(evidence);
}

async function readInput(filePath: string, clientId: string): Promise<JsonRecord> {
  const raw = await readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error(`Input ${filePath} did not contain a JSON object.`);
  const summaries = recordValue(parsed.summaries);
  if (Object.keys(summaries).length > 0) {
    const summary = summaries[clientId];
    if (!isRecord(summary)) {
      throw new Error(`Aggregate summary ${filePath} does not contain client ${clientId}.`);
    }
    return summary;
  }
  const snapshots = recordValue(parsed.snapshots);
  if (Object.keys(snapshots).length > 0) {
    const snapshot = snapshots[clientId];
    if (!isRecord(snapshot)) {
      throw new Error(`Aggregate snapshot ${filePath} does not contain client ${clientId}.`);
    }
    return snapshot;
  }
  return parsed;
}

function collectEvidence(input: JsonRecord): NormalizedEvidence[] {
  const evidence: NormalizedEvidence[] = [];
  const recentActivity = recordValue(input.recentActivity);
  const integrations = recordValue(input.integrations);

  for (const [index, item] of arrayValue(input.messages).entries()) {
    addEvidence(evidence, {
      ref: `message:${index}`,
      kind: "message",
      sourcePath: "messages",
      record: recordValue(item),
      titleKeys: ["title", "direction", "sender", "from"],
      statusKeys: ["status", "deliveryStatus"],
      excerptKeys: [
        "direction",
        "sender",
        "from",
        "to",
        "text",
        "contentText",
        "summary",
        "status",
      ],
    });
  }
  for (const [index, item] of [
    ...arrayValue(recentActivity.workItems),
    ...arrayValue(input.recentWorkItems),
  ].entries()) {
    addEvidence(evidence, {
      ref: `work_item:${index}`,
      kind: "work_item",
      sourcePath: "recentActivity.workItems",
      record: recordValue(item),
      titleKeys: ["title", "kind", "type"],
      excerptKeys: ["title", "kind", "status", "instructions", "summary", "result", "lastError"],
    });
  }
  for (const [index, item] of [
    ...arrayValue(recentActivity.actions),
    ...arrayValue(input.recentProfileActions),
    ...arrayValue(input.recentProviderWriteReceipts),
  ].entries()) {
    addEvidence(evidence, {
      ref: `action:${index}`,
      kind: "action",
      sourcePath: "recentActivity.actions",
      record: recordValue(item),
      titleKeys: ["title", "kind", "type", "toolName", "operation"],
      statusKeys: ["status", "providerExecutionStatus"],
      occurredAtKeys: ["finishedAt", "startedAt", "createdAt", "updatedAt"],
      excerptKeys: ["title", "summary", "status", "target", "result", "metadata", "operation"],
    });
  }
  for (const [index, item] of [
    ...arrayValue(recentActivity.proposals),
    ...arrayValue(input.recentProposals),
  ].entries()) {
    addEvidence(evidence, {
      ref: `proposal:${index}`,
      kind: "proposal",
      sourcePath: "recentActivity.proposals",
      record: recordValue(item),
      titleKeys: ["title", "kind", "type"],
      excerptKeys: ["title", "summary", "status", "target", "proposedPatch"],
    });
  }
  for (const [index, item] of [
    ...arrayValue(recentActivity.backendJobs),
    ...arrayValue(input.recentBackendJobs),
  ].entries()) {
    addEvidence(evidence, {
      ref: `backend_job:${index}`,
      kind: "backend_job",
      sourcePath: "recentActivity.backendJobs",
      record: recordValue(item),
      titleKeys: ["kind", "title", "jobKind"],
      excerptKeys: [
        "kind",
        "jobKind",
        "status",
        "summary",
        "errorCode",
        "errorMessage",
        "metadata",
      ],
    });
  }
  for (const [index, item] of [
    ...arrayValue(recentActivity.artifacts),
    ...arrayValue(input.recentArtifacts),
  ].entries()) {
    addEvidence(evidence, {
      ref: `artifact:${index}`,
      kind: "artifact",
      sourcePath: "recentActivity.artifacts",
      record: recordValue(item),
      titleKeys: ["filename", "title", "name"],
      excerptKeys: ["filename", "description", "mimeType", "metadata", "status"],
    });
  }
  for (const [index, item] of arrayValue(input.guidance).entries()) {
    const record = recordValue(item);
    addEvidence(evidence, {
      ref: `guidance:${firstString(record, ["key", "id"]) ?? index}`,
      kind: "guidance",
      sourcePath: "guidance",
      record,
      titleKeys: ["title", "key"],
      excerptKeys: ["key", "title", "status", "selectorDescription", "bodyMarkdown", "summary"],
    });
  }
  for (const [index, item] of arrayValue(input.assistantWorkRoutes).entries()) {
    const record = recordValue(item);
    addEvidence(evidence, {
      ref: `work_route:${firstString(record, ["eventType", "id"]) ?? index}`,
      kind: "work_route",
      sourcePath: "assistantWorkRoutes",
      record,
      titleKeys: ["eventType", "title", "key"],
      statusKeys: ["managedBy", "status"],
      excerptKeys: ["eventType", "managedBy", "priority", "instructions", "config"],
    });
  }
  for (const [index, item] of arrayValue(input.scheduledTasks).entries()) {
    const record = recordValue(item);
    addEvidence(evidence, {
      ref: `scheduled_task:${firstString(record, ["key", "id"]) ?? index}`,
      kind: "scheduled_task",
      sourcePath: "scheduledTasks",
      record,
      titleKeys: ["title", "name", "key"],
      excerptKeys: ["title", "instructions", "schedule", "status", "lastRunAt", "nextRunAt"],
    });
  }
  const integrationGroups: Array<{
    path: string;
    kind: NormalizedEvidence["kind"];
    items: unknown[];
    titleKeys: readonly string[];
    statusKeys?: readonly string[];
    excerptKeys: readonly string[];
  }> = [
    {
      path: "integrations.connectedAccounts",
      kind: "integration",
      items: [
        ...arrayValue(integrations.connectedAccounts),
        ...arrayValue(input.connectedAccounts),
      ],
      titleKeys: ["provider", "displayLabel", "accountEmail"],
      statusKeys: ["status", "connectionStatus", "credentialStatus"],
      excerptKeys: [
        "provider",
        "displayLabel",
        "accountEmail",
        "status",
        "connectionStatus",
        "credentialStatus",
        "lastError",
      ],
    },
    {
      path: "integrations.capabilityAccountLinks",
      kind: "integration",
      items: [
        ...arrayValue(integrations.capabilityAccountLinks),
        ...arrayValue(input.capabilityAccountLinks),
      ],
      titleKeys: ["capabilitySlug", "label", "provider"],
      excerptKeys: ["capabilitySlug", "label", "status", "required", "readiness", "provider"],
    },
    {
      path: "integrations.channels",
      kind: "channel",
      items: [...arrayValue(integrations.channels), ...arrayValue(input.channels)],
      titleKeys: ["provider", "channel", "accountId"],
      excerptKeys: ["provider", "channel", "accountId", "status", "routing"],
    },
    {
      path: "integrations.webhookSubscriptions",
      kind: "webhook",
      items: [
        ...arrayValue(integrations.webhookSubscriptions),
        ...arrayValue(input.providerWebhookSubscriptions),
        ...arrayValue(input.webhookSubscriptions),
        ...arrayValue(input.recentProviderWebhookDeliveries),
      ],
      titleKeys: ["providerKey", "adapterKey", "eventScope", "deliveryKey"],
      statusKeys: ["status", "errorCode"],
      excerptKeys: [
        "providerKey",
        "adapterKey",
        "eventScope",
        "deliveryKey",
        "status",
        "errorCode",
        "errorMessage",
        "expiresAt",
      ],
    },
  ];

  for (const group of integrationGroups) {
    for (const [index, item] of group.items.entries()) {
      addEvidence(evidence, {
        ref: `${group.kind}:${index}`,
        kind: group.kind,
        sourcePath: group.path,
        record: recordValue(item),
        titleKeys: group.titleKeys,
        statusKeys: group.statusKeys,
        excerptKeys: group.excerptKeys,
      });
    }
  }
  for (const [index, item] of arrayValue(input.recentAgentEvents).entries()) {
    const record = recordValue(item);
    const payload = recordValue(record.payload);
    addEvidence(evidence, {
      ref: `agent_event:${index}`,
      kind: "agent_event",
      sourcePath: "recentAgentEvents",
      record: { ...record, payload },
      titleKeys: ["eventType", "sourceEventKey"],
      statusKeys: ["status", "eventType"],
      occurredAtKeys: ["occurredAt", "createdAt"],
      excerptKeys: ["eventType", "source", "visibility", "sourceEventKey", "payload"],
    });
  }
  for (const [index, item] of arrayValue(input.recentAgentRuns).entries()) {
    addEvidence(evidence, {
      ref: `agent_run:${index}`,
      kind: "agent_run",
      sourcePath: "recentAgentRuns",
      record: recordValue(item),
      titleKeys: ["agentId", "sessionKey", "runtimeRunId"],
      statusKeys: ["status"],
      occurredAtKeys: ["endedAt", "startedAt", "createdAt", "updatedAt"],
      excerptKeys: ["agentId", "status", "failure", "sessionKey", "runtimeRunId"],
    });
  }
  for (const [index, item] of arrayValue(input.priorOutcomes).entries()) {
    addEvidence(evidence, {
      ref: `prior_outcome:${index}`,
      kind: "prior_outcome",
      sourcePath: "priorOutcomes",
      record: recordValue(item),
      titleKeys: ["title", "candidateType", "targetKind"],
      excerptKeys: [
        "title",
        "candidateType",
        "targetKind",
        "status",
        "rationale",
        "failureMessage",
      ],
    });
  }

  if (evidence.length === 0) {
    const fallback = stableJson(input) ?? "input object";
    evidence.push(
      normalizedEvidenceSchema.parse({
        ref: "input:root",
        kind: "unknown",
        sourcePath: "root",
        title: firstString(recordValue(input.profile), ["displayName", "display_name", "name"]),
        status: null,
        occurredAt: null,
        excerpt: truncateText(fallback, 2_000),
        excerpted: fallback.length > 2_000,
        signals: signalsFor(input, "unknown"),
      }),
    );
  }
  return evidence;
}

function packagedScore(item: PackagedEvidence): number {
  const signals = Array.isArray(item.signals)
    ? item.signals.filter((value) => typeof value === "string")
    : [];
  const text = stableJson(item)?.toLowerCase() ?? "";
  let score = signals.length * 4;
  if (/fail|failed|error|blocked|expired|disconnected|cannot|unable/.test(text)) score += 12;
  if (/attachment|document|pdf|drive|folder|artifact/.test(text)) score += 7;
  if (/monday|crm|client|deal|financing/.test(text)) score += 5;
  if (/approval|pending|clarif|question|ambiguous/.test(text)) score += 4;
  if (item.kind === "work_item_story") score += 4;
  if (item.kind === "agent_run_story") score += 2;
  return score;
}

function selectPackagedEvidence(
  evidence: readonly PackagedEvidence[],
  maxEvidence: number,
): PackagedEvidence[] {
  return [...evidence]
    .sort((a, b) => packagedScore(b) - packagedScore(a) || a.ref.localeCompare(b.ref))
    .slice(0, maxEvidence);
}

function buildRawEvidencePackages(evidence: readonly NormalizedEvidence[]): PackagedEvidence[] {
  return evidence.map((item) => ({ ...item }));
}

function payloadSummary(payload: JsonRecord): JsonRecord {
  const from = recordValue(payload.from);
  const to = arrayValue(payload.to)
    .map((value) => firstString(recordValue(value), ["email", "name"]))
    .filter((value): value is string => Boolean(value));
  return {
    subject: firstString(payload, ["subject", "title"]),
    from: firstString(from, ["email", "name"]) ?? firstString(payload, ["from", "sender"]),
    to: compactList(to, 4),
    provider: firstString(payload, ["provider"]),
    receivedAt: firstString(payload, ["receivedAt", "createdAt"]),
    attachmentNames: arrayValue(payload.attachments)
      .map((value) => firstString(recordValue(value), ["filename", "name"]))
      .filter((value): value is string => Boolean(value))
      .slice(0, 8),
    snippet: truncateText(
      [
        firstString(payload, ["snippet"]),
        firstString(payload, ["detail"]),
        firstString(payload, ["bodyText"]),
      ]
        .filter(Boolean)
        .join("\n"),
      900,
    ),
  };
}

function groupByString<T>(
  items: readonly T[],
  keyFor: (item: T) => string | null,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function buildWorkItemStories(input: JsonRecord): PackagedEvidence[] {
  const artifactsByMessageId = groupByString(
    arrayValue(input.recentArtifacts).map(recordValue),
    (artifact) => firstString(recordValue(artifact.metadata), ["messageId"]),
  );
  return arrayValue(input.recentWorkItems).map((value, index) => {
    const workItem = recordValue(value);
    const payload = recordValue(workItem.payload);
    const result = recordValue(workItem.result);
    const id = firstString(workItem, ["id"]);
    const messageId = firstString(payload, ["outlookMessageId", "gmailMessageId", "messageId"]);
    const relatedArtifacts = (messageId ? (artifactsByMessageId.get(messageId) ?? []) : []).map(
      (artifact) => ({
        id: firstString(artifact, ["id"]),
        filename: firstString(artifact, ["filename"]),
        type: firstString(artifact, ["type"]),
        createdAt: firstString(artifact, ["createdAt"]),
      }),
    );
    const story = {
      ref: refFor("story:work_item", id, index),
      kind: "work_item_story",
      evidenceRefs: [`work_item:${index}`],
      sourcePath: "recentWorkItems",
      title: firstString(workItem, ["title", "kind"]) ?? `Work item ${index}`,
      status: firstString(workItem, ["status"]),
      occurredAt: firstString(workItem, ["createdAt", "updatedAt"]),
      lifecycle: {
        attempts: numberValue(workItem.attempts),
        maxAttempts: numberValue(workItem.maxAttempts),
        availableAt: firstString(workItem, ["availableAt"]),
        runStartedAt: firstString(workItem, ["runStartedAt"]),
        runExpiresAt: firstString(workItem, ["runExpiresAt"]),
        finishedAt: firstString(workItem, ["finishedAt"]),
        lastError: firstString(workItem, ["lastError"]),
        originScheduledTaskId: firstString(workItem, ["originScheduledTaskId"]),
        originSessionId: firstString(workItem, ["originSessionId"]),
      },
      request: payloadSummary(payload),
      guidance: {
        guidanceIds: arrayValue(workItem.guidanceIds).slice(0, 10),
        profileGuidanceDbIds: arrayValue(workItem.profileGuidanceDbIds).slice(0, 10),
      },
      result: {
        summary:
          firstString(workItem, ["resultSummary"]) ??
          firstString(result, ["summary", "message", "outcome"]),
        compact: compactJson(result, 1_200),
      },
      relatedArtifacts: relatedArtifacts.slice(0, 8),
      signals: signalsFor(
        {
          ...workItem,
          payload: payloadSummary(payload),
          result,
          relatedArtifacts,
        },
        "work_item",
      ),
    } satisfies PackagedEvidence;
    return story;
  });
}

function buildAgentRunStories(input: JsonRecord): PackagedEvidence[] {
  const eventsByRun = groupByString(arrayValue(input.recentAgentEvents).map(recordValue), (event) =>
    firstString(event, ["agentRunId"]),
  );
  return arrayValue(input.recentAgentRuns).map((value, index) => {
    const run = recordValue(value);
    const id = firstString(run, ["id"]);
    const events = id ? (eventsByRun.get(id) ?? []) : [];
    const toolNames = compactList(
      events
        .map((event) => firstString(recordValue(event.payload), ["toolName"]))
        .filter((value): value is string => Boolean(value)),
      16,
    );
    const eventTypeCounts = events.reduce<Record<string, number>>((counts, event) => {
      const eventType = firstString(event, ["eventType"]) ?? "unknown";
      counts[eventType] = (counts[eventType] ?? 0) + 1;
      return counts;
    }, {});
    const notableEvents = events
      .filter((event) => {
        const payload = recordValue(event.payload);
        const text = stableJson(payload)?.toLowerCase() ?? "";
        return /fail|error|blocked|disconnect|unable|cannot|message|tool\.result/.test(text);
      })
      .slice(0, 10)
      .map((event) => {
        const payload = recordValue(event.payload);
        return {
          eventType: firstString(event, ["eventType"]),
          occurredAt: firstString(event, ["occurredAt"]),
          toolName: firstString(payload, ["toolName"]),
          status: firstString(payload, ["status"]),
          error: truncateText(firstString(payload, ["error"]) ?? "", 500),
          text: truncateText(firstString(payload, ["text"]) ?? "", 700),
          output: compactJson(payload.output, 700),
        };
      });
    return {
      ref: refFor("story:agent_run", id, index),
      kind: "agent_run_story",
      evidenceRefs: [`agent_run:${index}`],
      sourcePath: "recentAgentRuns/recentAgentEvents",
      title: firstString(run, ["sessionKey", "runtimeRunId"]) ?? `Agent run ${index}`,
      status: firstString(run, ["status"]),
      occurredAt: firstString(run, ["startedAt", "createdAt"]),
      run: {
        agentId: firstString(run, ["agentId"]),
        sessionId: firstString(run, ["sessionId"]),
        sessionKey: firstString(run, ["sessionKey"]),
        runtimeRunId: firstString(run, ["runtimeRunId"]),
        startedAt: firstString(run, ["startedAt"]),
        endedAt: firstString(run, ["endedAt"]),
        failure: compactJson(run.failure, 1_000),
      },
      eventSummary: {
        eventCount: events.length,
        eventTypeCounts,
        toolNames,
        notableEvents,
      },
      signals: signalsFor({ ...run, eventTypeCounts, toolNames, notableEvents }, "agent_run"),
    } satisfies PackagedEvidence;
  });
}

function buildProviderWriteStories(input: JsonRecord): PackagedEvidence[] {
  const receiptsByAction = groupByString(
    arrayValue(input.recentProviderWriteReceipts).map(recordValue),
    (receipt) => firstString(receipt, ["profileActionId"]),
  );
  return arrayValue(input.recentProfileActions).map((value, index) => {
    const action = recordValue(value);
    const id = firstString(action, ["id"]);
    const receipts = id ? (receiptsByAction.get(id) ?? []) : [];
    return {
      ref: refFor("story:profile_action", id, index),
      kind: "provider_write_story",
      evidenceRefs: [`action:${index}`],
      sourcePath: "recentProfileActions/recentProviderWriteReceipts",
      title: firstString(action, ["title", "toolName", "actionType"]) ?? `Profile action ${index}`,
      status: firstString(action, ["status", "providerExecutionStatus"]),
      occurredAt: firstString(action, ["createdAt", "updatedAt"]),
      action: {
        toolName: firstString(action, ["toolName"]),
        actionType: firstString(action, ["actionType"]),
        summary: firstString(action, ["summary"]),
        decision: firstString(action, ["decision"]),
        decisionSource: firstString(action, ["decisionSource"]),
        providerExecutionStatus: firstString(action, ["providerExecutionStatus"]),
        providerError: compactJson(action.providerError, 900),
      },
      receipts: receipts.slice(0, 6).map((receipt) => ({
        id: firstString(receipt, ["id"]),
        providerKey: firstString(receipt, ["providerKey"]),
        capabilitySlug: firstString(receipt, ["capabilitySlug"]),
        toolName: firstString(receipt, ["toolName"]),
        operation: firstString(receipt, ["operation"]),
        externalResourceType: firstString(receipt, ["externalResourceType"]),
        metadata: compactJson(receipt.metadata, 700),
        startedAt: firstString(receipt, ["startedAt"]),
        finishedAt: firstString(receipt, ["finishedAt"]),
      })),
      signals: signalsFor({ ...action, receipts }, "action"),
    } satisfies PackagedEvidence;
  });
}

function buildArtifactStories(input: JsonRecord): PackagedEvidence[] {
  const artifacts = arrayValue(input.recentArtifacts).map(recordValue);
  const artifactsByMessageId = groupByString(artifacts, (artifact) =>
    firstString(recordValue(artifact.metadata), ["messageId"]),
  );
  const stories: PackagedEvidence[] = [];
  let index = 0;
  for (const [messageId, group] of artifactsByMessageId.entries()) {
    stories.push({
      ref: `story:artifact_thread:${index}`,
      kind: "artifact_story",
      evidenceRefs: group.map(
        (_, artifactIndex) => `artifact:${artifacts.indexOf(group[artifactIndex])}`,
      ),
      sourcePath: "recentArtifacts",
      title: `Artifacts from message ${messageId.slice(0, 18)}`,
      status: null,
      occurredAt: firstString(group[0] ?? {}, ["createdAt"]),
      artifactCount: group.length,
      artifacts: group.slice(0, 10).map((artifact) => ({
        id: firstString(artifact, ["id"]),
        type: firstString(artifact, ["type"]),
        filename: firstString(artifact, ["filename"]),
        description: firstString(artifact, ["description"]),
        metadata: compactJson(artifact.metadata, 600),
        createdAt: firstString(artifact, ["createdAt"]),
      })),
      signals: signalsFor({ messageId, artifacts: group }, "artifact"),
    });
    index += 1;
  }
  return stories;
}

function buildEvidenceStories(input: JsonRecord): PackagedEvidence[] {
  return [
    ...buildWorkItemStories(input),
    ...buildAgentRunStories(input),
    ...buildProviderWriteStories(input),
    ...buildArtifactStories(input),
  ];
}

function packageEvidence(input: {
  snapshot: JsonRecord;
  rawEvidence: readonly NormalizedEvidence[];
  strategy: EvidenceStrategy;
  maxEvidence: number;
}): EvidencePackageResult {
  const rawPackages = buildRawEvidencePackages(input.rawEvidence);
  if (input.strategy === "raw") {
    return {
      packagedEvidence: selectPackagedEvidence(rawPackages, input.maxEvidence),
      storyCount: 0,
      rawEvidenceCount: rawPackages.length,
    };
  }

  const stories = buildEvidenceStories(input.snapshot);
  if (input.strategy === "stories") {
    return {
      packagedEvidence: selectPackagedEvidence(stories, input.maxEvidence),
      storyCount: stories.length,
      rawEvidenceCount: rawPackages.length,
    };
  }

  const durableRaw = rawPackages.filter((item) =>
    ["scheduled_task", "guidance", "work_route", "integration", "webhook"].includes(
      String(item.kind),
    ),
  );
  const highSignalRaw = selectPackagedEvidence(
    rawPackages.filter((item) => packagedScore(item) >= 12),
    Math.ceil(input.maxEvidence * 0.35),
  );
  const selectedStories = selectPackagedEvidence(stories, Math.ceil(input.maxEvidence * 0.75));
  const byRef = new Map<string, PackagedEvidence>();
  for (const item of [...selectedStories, ...highSignalRaw, ...durableRaw]) {
    byRef.set(item.ref, item);
  }
  return {
    packagedEvidence: selectPackagedEvidence([...byRef.values()], input.maxEvidence),
    storyCount: stories.length,
    rawEvidenceCount: rawPackages.length,
  };
}

function jsonLines(records: readonly unknown[]): string {
  return records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : "");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeSnapshotContextFiles(input: {
  runDir: string;
  clientId: string;
  sourcePath: string;
  snapshot: JsonRecord;
  rawEvidence: readonly NormalizedEvidence[];
  stories: readonly PackagedEvidence[];
}): Promise<SnapshotContextFiles> {
  const dir = path.join(input.runDir, "snapshot-context");
  const lensDir = path.join(dir, "lenses");
  await mkdir(lensDir, { recursive: true });

  const recentActivity = recordValue(input.snapshot.recentActivity);
  const integrations = recordValue(input.snapshot.integrations);
  const files: SnapshotContextFiles = {
    dir,
    lensDir,
    indexPath: path.join(dir, "index.json"),
    durableStatePath: path.join(dir, "durable-state.json"),
    providerReadinessPath: path.join(dir, "provider-readiness.json"),
    workItemsPath: path.join(dir, "work-items.jsonl"),
    agentRunsPath: path.join(dir, "agent-runs.jsonl"),
    agentEventsPath: path.join(dir, "agent-events.jsonl"),
    providerWritesPath: path.join(dir, "provider-writes.jsonl"),
    artifactsPath: path.join(dir, "artifacts.jsonl"),
    guidanceSchedulesPath: path.join(dir, "guidance-and-schedules.json"),
    storiesPath: path.join(dir, "stories.jsonl"),
    rawEvidencePath: path.join(dir, "raw-evidence.jsonl"),
  };

  const workItems = [
    ...arrayValue(recentActivity.workItems),
    ...arrayValue(input.snapshot.recentWorkItems),
  ];
  const profileActions = [
    ...arrayValue(recentActivity.actions),
    ...arrayValue(input.snapshot.recentProfileActions),
  ];
  const providerWriteReceipts = arrayValue(input.snapshot.recentProviderWriteReceipts);
  const backendJobs = [
    ...arrayValue(recentActivity.backendJobs),
    ...arrayValue(input.snapshot.recentBackendJobs),
  ];
  const artifacts = [
    ...arrayValue(recentActivity.artifacts),
    ...arrayValue(input.snapshot.recentArtifacts),
  ];

  const index = {
    clientId: input.clientId,
    sourcePath: input.sourcePath,
    generatedAt: new Date().toISOString(),
    files: {
      durableState: files.durableStatePath,
      providerReadiness: files.providerReadinessPath,
      workItems: files.workItemsPath,
      agentRuns: files.agentRunsPath,
      agentEvents: files.agentEventsPath,
      providerWrites: files.providerWritesPath,
      artifacts: files.artifactsPath,
      guidanceAndSchedules: files.guidanceSchedulesPath,
      stories: files.storiesPath,
      rawEvidence: files.rawEvidencePath,
    },
    snapshotSections: Object.keys(input.snapshot).sort(),
    counts: {
      workItems: workItems.length,
      profileActions: profileActions.length,
      providerWriteReceipts: providerWriteReceipts.length,
      backendJobs: backendJobs.length,
      artifacts: artifacts.length,
      agentRuns: arrayValue(input.snapshot.recentAgentRuns).length,
      agentEvents: arrayValue(input.snapshot.recentAgentEvents).length,
      guidance: arrayValue(input.snapshot.guidance).length,
      scheduledTasks: arrayValue(input.snapshot.scheduledTasks).length,
      assistantWorkRoutes: arrayValue(input.snapshot.assistantWorkRoutes).length,
      connectedAccounts: arrayValue(integrations.connectedAccounts).length,
      capabilityAccountLinks: arrayValue(integrations.capabilityAccountLinks).length,
      webhookSubscriptions:
        arrayValue(integrations.webhookSubscriptions).length +
        arrayValue(input.snapshot.providerWebhookSubscriptions).length +
        arrayValue(input.snapshot.webhookSubscriptions).length,
      webhookDeliveries: arrayValue(input.snapshot.recentProviderWebhookDeliveries).length,
      rawEvidence: input.rawEvidence.length,
      stories: input.stories.length,
    },
  } satisfies JsonRecord;

  await writeJson(files.indexPath, index);
  await writeJson(files.durableStatePath, {
    profile: recordValue(input.snapshot.profile),
    integrations,
    connectedAccounts: input.snapshot.connectedAccounts ?? null,
    capabilityAccountLinks: input.snapshot.capabilityAccountLinks ?? null,
    channels: input.snapshot.channels ?? null,
    assistantWorkRoutes: input.snapshot.assistantWorkRoutes ?? [],
  });
  await writeJson(files.providerReadinessPath, {
    integrations,
    connectedAccounts: input.snapshot.connectedAccounts ?? [],
    capabilityAccountLinks: input.snapshot.capabilityAccountLinks ?? [],
    providerWebhookSubscriptions: input.snapshot.providerWebhookSubscriptions ?? [],
    webhookSubscriptions: input.snapshot.webhookSubscriptions ?? [],
    recentProviderWebhookDeliveries: input.snapshot.recentProviderWebhookDeliveries ?? [],
    recentBackendJobs: backendJobs,
    recentProviderWriteReceipts: providerWriteReceipts,
  });
  await writeFile(files.workItemsPath, jsonLines(workItems));
  await writeFile(files.agentRunsPath, jsonLines(arrayValue(input.snapshot.recentAgentRuns)));
  await writeFile(files.agentEventsPath, jsonLines(arrayValue(input.snapshot.recentAgentEvents)));
  await writeFile(
    files.providerWritesPath,
    jsonLines([
      ...profileActions.map((record) => ({ kind: "profile_action", record })),
      ...providerWriteReceipts.map((record) => ({ kind: "provider_write_receipt", record })),
    ]),
  );
  await writeFile(files.artifactsPath, jsonLines(artifacts));
  await writeJson(files.guidanceSchedulesPath, {
    guidance: input.snapshot.guidance ?? [],
    scheduledTasks: input.snapshot.scheduledTasks ?? [],
    assistantWorkRoutes: input.snapshot.assistantWorkRoutes ?? [],
  });
  await writeFile(files.storiesPath, jsonLines(input.stories));
  await writeFile(files.rawEvidencePath, jsonLines(input.rawEvidence));
  return files;
}

function compactContext(input: JsonRecord): JsonRecord {
  const integrations = recordValue(input.integrations);
  const profile = recordValue(input.profile);
  const connectedAccounts = [
    ...arrayValue(integrations.connectedAccounts),
    ...arrayValue(input.connectedAccounts),
  ];
  const capabilityAccountLinks = [
    ...arrayValue(integrations.capabilityAccountLinks),
    ...arrayValue(input.capabilityAccountLinks),
  ];
  const channels = [...arrayValue(integrations.channels), ...arrayValue(input.channels)];
  const webhookSubscriptions = [
    ...arrayValue(integrations.webhookSubscriptions),
    ...arrayValue(input.providerWebhookSubscriptions),
    ...arrayValue(input.webhookSubscriptions),
  ];
  return {
    profile: Object.keys(profile).length ? profile : null,
    snapshotSections: Object.keys(input).sort(),
    counts: {
      guidance: arrayValue(input.guidance).length,
      scheduledTasks: arrayValue(input.scheduledTasks).length,
      assistantWorkRoutes: arrayValue(input.assistantWorkRoutes).length,
      connectedAccounts: connectedAccounts.length,
      capabilityAccountLinks: capabilityAccountLinks.length,
      channels: channels.length,
      webhookSubscriptions: webhookSubscriptions.length,
      recentAgentEvents: arrayValue(input.recentAgentEvents).length,
      recentAgentRuns: arrayValue(input.recentAgentRuns).length,
    },
  };
}

function evidenceMatchesLens(item: PackagedEvidence, lens: LensDefinition): boolean {
  const kind = String(item.kind ?? "");
  const signals = Array.isArray(item.signals)
    ? item.signals.filter((value): value is string => typeof value === "string")
    : [];
  if (lens.evidenceKinds.includes(kind)) return true;
  if (signals.some((signal) => lens.signals.includes(signal))) return true;
  const text = stableJson(item)?.toLowerCase() ?? "";
  return lens.questions.some((question) => {
    const keywords = question
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((word) => word.length >= 5);
    return keywords.some((word) => text.includes(word));
  });
}

function selectLensEvidence(input: {
  packagedEvidence: readonly PackagedEvidence[];
  lens: LensDefinition;
  maxEvidence: number;
}): PackagedEvidence[] {
  const matched = input.packagedEvidence.filter((item) => evidenceMatchesLens(item, input.lens));
  return selectPackagedEvidence(
    matched.length ? matched : input.packagedEvidence,
    Math.max(20, Math.min(input.maxEvidence, 120)),
  );
}

function renderLensPrompt(input: {
  clientId: string;
  sourcePath: string;
  maxFindings: number;
  compactClientContext: JsonRecord;
  snapshotContextFiles: SnapshotContextFiles;
  lens: LensDefinition;
  evidence: readonly PackagedEvidence[];
}): string {
  return [
    "You are a headless Codex CLI evidence-lens auditor running inside the AI Assistants source repository.",
    "",
    "Goal:",
    `Produce a structured evidence map for the ${input.lens.id} lens for client ${input.clientId}.`,
    "",
    "Important boundaries:",
    "- Treat this as read-only analysis. Do not edit files.",
    "- Do not produce final recommendations. Your job is to map claims to original evidence for the final recommender.",
    "- Prefer original evidence refs and source files over prose summary. Do not invent provider state, client preferences, external resources, or hidden messages.",
    "- The selected evidence seed is intentionally small. Use it to orient, then inspect the listed snapshot context files with filesystem tools when needed.",
    "- Do not read large JSONL files wholesale. Use targeted searches for names, ids, providers, evidence refs, or statuses, then inspect only the matching records.",
    "- Prefer a few high-confidence findings over broad coverage. Reject weak signals instead of stretching them into improvements.",
    "- Each finding must cite evidenceRefs from the selected evidence or the raw/story files, plus sourceFiles you inspected.",
    "- Use missingEvidence when the claim is plausible but not proven enough.",
    `- Produce at most ${input.maxFindings.toString()} findings. It is fine to produce fewer.`,
    "- Return only JSON matching the provided output schema.",
    "",
    "Lens objective:",
    input.lens.objective,
    "",
    "Questions to answer:",
    ...input.lens.questions.map((question) => `- ${question}`),
    "",
    "Snapshot source:",
    input.sourcePath,
    "",
    "Preferred snapshot files:",
    ...input.lens.preferredFiles(input.snapshotContextFiles).map((filePath) => `- ${filePath}`),
    "",
    "Compact client context:",
    JSON.stringify(input.compactClientContext, null, 2),
    "",
    "Selected evidence seed:",
    JSON.stringify(input.evidence, null, 2),
  ].join("\n");
}

function buildLensPrompt(input: {
  clientId: string;
  sourcePath: string;
  compactClientContext: JsonRecord;
  snapshotContextFiles: SnapshotContextFiles;
  lens: LensDefinition;
  maxFindings: number;
  evidence: readonly PackagedEvidence[];
  promptMaxChars: number;
}): { prompt: string; evidence: PackagedEvidence[] } {
  let selectedEvidence = [...input.evidence];
  while (selectedEvidence.length > 10) {
    const prompt = renderLensPrompt({ ...input, evidence: selectedEvidence });
    if (prompt.length <= input.promptMaxChars) return { prompt, evidence: selectedEvidence };
    selectedEvidence = selectedEvidence.slice(
      0,
      Math.max(10, Math.floor(selectedEvidence.length * 0.75)),
    );
  }
  const prompt = renderLensPrompt({ ...input, evidence: selectedEvidence });
  if (prompt.length <= input.promptMaxChars) return { prompt, evidence: selectedEvidence };
  return {
    prompt: truncateText(prompt, input.promptMaxChars),
    evidence: selectedEvidence,
  };
}

function renderPrompt(input: {
  clientId: string;
  sourcePath: string;
  maxRecommendations: number;
  compactClientContext: JsonRecord;
  evidenceStrategy: EvidenceStrategy;
  reviewMode: ReviewMode;
  snapshotContextFiles: SnapshotContextFiles;
  lensReports: readonly LensReport[];
  evidence: readonly PackagedEvidence[];
}): string {
  return [
    "You are a headless Codex CLI reviewer running inside the AI Assistants source repository.",
    "",
    "Goal:",
    `Review the provided client snapshot evidence for ${input.clientId} and recommend concrete improvements to this client's assistant behavior.`,
    "",
    "How to work:",
    "- Treat this as read-only analysis. Do not edit files.",
    "- Use the enriched snapshot evidence as the source of truth for client behavior. Cite evidenceRefs from the provided evidence list.",
    "- The snapshot may include durable state plus recent work items, actions, artifacts, provider writes, backend jobs, agent runs, and agent events. Prefer operational evidence over durable configuration when judging what actually happened.",
    `- Evidence packaging strategy: ${input.evidenceStrategy}. Raw evidence is one row per source record. Story evidence links related rows into work-item, agent-run, provider-write, or artifact-thread packets. Hybrid evidence includes story packets plus selected durable/raw records.`,
    `- Review mode: ${input.reviewMode}. In lensed mode, lens reports are evidence maps, not final conclusions. Verify lens claims against original evidence before recommending.`,
    "- When a story has evidenceRefs, use the story ref for the pattern and underlying evidenceRefs for exact support when useful.",
    "- The snapshot context files are available on disk. Inspect them if the selected evidence or lens reports leave important ambiguity, but do not read large JSONL files wholesale. Use targeted searches or filters.",
    "- You may inspect repository files to understand current architecture, tool contracts, guidance, and validation paths before recommending fixes.",
    "- Prefer recommendations that improve real client outcomes over broad platform abstractions.",
    "- Include both kinds of improvements when supported: maintainer/product work such as new capabilities, tools, backend/runtime fixes, or validation gaps; and live client-state fixes such as profile guidance, scheduled tasks, approval policy, provider state, or cleanup.",
    "- Set targetScope to show who owns the change: maintainer_product for code/tool/capability/platform work, or the specific client_* scope for live client state.",
    "- Set actionType to the concrete kind of work. Use new_capability_or_tool only when a real missing tool/capability is supported by evidence.",
    "- Separate reliability fixes from capability/product improvements.",
    "- Do not invent provider state, external resources, client preferences, or unseen messages. Use missingEvidence when needed.",
    "- Prefer the smallest useful version that could be implemented and validated soon.",
    "- Recommend at most " + input.maxRecommendations.toString() + " items.",
    "- Return only JSON matching the provided output schema.",
    "",
    "Client snapshot source:",
    input.sourcePath,
    "",
    "Snapshot context files:",
    JSON.stringify(
      {
        index: input.snapshotContextFiles.indexPath,
        durableState: input.snapshotContextFiles.durableStatePath,
        providerReadiness: input.snapshotContextFiles.providerReadinessPath,
        workItems: input.snapshotContextFiles.workItemsPath,
        agentRuns: input.snapshotContextFiles.agentRunsPath,
        agentEvents: input.snapshotContextFiles.agentEventsPath,
        providerWrites: input.snapshotContextFiles.providerWritesPath,
        artifacts: input.snapshotContextFiles.artifactsPath,
        guidanceAndSchedules: input.snapshotContextFiles.guidanceSchedulesPath,
        stories: input.snapshotContextFiles.storiesPath,
        rawEvidence: input.snapshotContextFiles.rawEvidencePath,
      },
      null,
      2,
    ),
    "",
    "Lens evidence maps:",
    input.lensReports.length ? JSON.stringify(input.lensReports, null, 2) : "[]",
    "",
    "Compact client context:",
    JSON.stringify(input.compactClientContext, null, 2),
    "",
    "Selected evidence:",
    JSON.stringify(input.evidence, null, 2),
  ].join("\n");
}

function buildPrompt(input: {
  clientId: string;
  sourcePath: string;
  maxRecommendations: number;
  compactClientContext: JsonRecord;
  evidenceStrategy: EvidenceStrategy;
  reviewMode: ReviewMode;
  snapshotContextFiles: SnapshotContextFiles;
  lensReports: readonly LensReport[];
  evidence: readonly PackagedEvidence[];
  promptMaxChars: number;
}): { prompt: string; evidence: PackagedEvidence[] } {
  let selectedEvidence = [...input.evidence];
  while (selectedEvidence.length > 10) {
    const prompt = renderPrompt({ ...input, evidence: selectedEvidence });
    if (prompt.length <= input.promptMaxChars) return { prompt, evidence: selectedEvidence };
    selectedEvidence = selectedEvidence.slice(
      0,
      Math.max(10, Math.floor(selectedEvidence.length * 0.75)),
    );
  }
  const prompt = renderPrompt({ ...input, evidence: selectedEvidence });
  if (prompt.length <= input.promptMaxChars) return { prompt, evidence: selectedEvidence };
  return {
    prompt: truncateText(prompt, input.promptMaxChars),
    evidence: selectedEvidence,
  };
}

async function createRunDir(outDir: string | undefined): Promise<string> {
  if (outDir) {
    const resolved = path.resolve(outDir);
    assertOutsideRepo(resolved, "--out-dir");
    await mkdir(resolved, { recursive: true });
    return resolved;
  }
  return mkdtemp(path.join(os.tmpdir(), "ai-assistants-codex-improvement-"));
}

function parseReport(raw: string): RecommendationReport {
  try {
    return recommendationReportSchema.parse(JSON.parse(raw));
  } catch (cause) {
    throw new Error(`Codex final message was not a valid recommendation report JSON object.`, {
      cause,
    });
  }
}

function parseLensReport(raw: string): LensReport {
  try {
    return lensReportSchema.parse(JSON.parse(raw));
  } catch (cause) {
    throw new Error(`Codex final message was not a valid lens report JSON object.`, {
      cause,
    });
  }
}

function parseCriticReport(raw: string): CriticReport {
  try {
    return criticReportSchema.parse(JSON.parse(raw));
  } catch (cause) {
    throw new Error(`Codex final message was not a valid critic report JSON object.`, {
      cause,
    });
  }
}

function shouldRunCritic(args: CliArgs): boolean {
  if (args.critic && args["skip-critic"]) {
    throw new Error("Pass either --critic or --skip-critic, not both.");
  }
  if (args.critic) return true;
  if (args["skip-critic"]) return false;
  return args["review-mode"] === "lensed";
}

function renderCriticPrompt(input: {
  clientId: string;
  sourcePath: string;
  snapshotContextFiles: SnapshotContextFiles;
  lensReports: readonly LensReport[];
  recommendationReport: RecommendationReport;
  evidence: readonly PackagedEvidence[];
}): string {
  return [
    "You are a headless Codex CLI critic reviewing an AI Assistants client improvement report.",
    "",
    "Goal:",
    "Criticize the final recommendation report. Prefer fewer, more certain recommendations over always finding more improvements.",
    "",
    "How to work:",
    "- Treat this as read-only analysis. Do not edit files.",
    "- Do not add new recommendations. Review only the recommendations already present.",
    "- Be skeptical. Reject or downgrade recommendations that are weakly supported, over-engineered, misclassified, too broad, or not actionable.",
    "- Verify evidence refs against the provided evidence, lens maps, and snapshot context files when needed.",
    "- Do not read large JSONL files wholesale. Use targeted searches for the specific recommendation ids, evidence refs, providers, names, or statuses you are checking.",
    "- A good recommendation should have a concrete owner layer, a smallest useful version, realistic validation, and evidence that directly supports the problem.",
    "- If evidence is plausible but incomplete, use needs_more_evidence instead of accepting with high confidence.",
    "- Check targetScope/actionType carefully: maintainer/product work must not be mislabeled as live client guidance, and live provider-state fixes must not be overbuilt as platform work.",
    "- Return only JSON matching the provided critic schema.",
    "",
    "Client:",
    input.clientId,
    "",
    "Snapshot source:",
    input.sourcePath,
    "",
    "Snapshot context files:",
    JSON.stringify(
      {
        index: input.snapshotContextFiles.indexPath,
        durableState: input.snapshotContextFiles.durableStatePath,
        providerReadiness: input.snapshotContextFiles.providerReadinessPath,
        workItems: input.snapshotContextFiles.workItemsPath,
        agentRuns: input.snapshotContextFiles.agentRunsPath,
        agentEvents: input.snapshotContextFiles.agentEventsPath,
        providerWrites: input.snapshotContextFiles.providerWritesPath,
        artifacts: input.snapshotContextFiles.artifactsPath,
        guidanceAndSchedules: input.snapshotContextFiles.guidanceSchedulesPath,
        stories: input.snapshotContextFiles.storiesPath,
        rawEvidence: input.snapshotContextFiles.rawEvidencePath,
      },
      null,
      2,
    ),
    "",
    "Lens evidence maps:",
    input.lensReports.length ? JSON.stringify(input.lensReports, null, 2) : "[]",
    "",
    "Final recommendation report to critique:",
    JSON.stringify(input.recommendationReport, null, 2),
    "",
    "Selected evidence sample:",
    JSON.stringify(input.evidence, null, 2),
  ].join("\n");
}

function buildCriticPrompt(input: {
  clientId: string;
  sourcePath: string;
  snapshotContextFiles: SnapshotContextFiles;
  lensReports: readonly LensReport[];
  recommendationReport: RecommendationReport;
  evidence: readonly PackagedEvidence[];
  promptMaxChars: number;
}): { prompt: string; evidence: PackagedEvidence[] } {
  let selectedEvidence = [...input.evidence];
  while (selectedEvidence.length > 8) {
    const prompt = renderCriticPrompt({ ...input, evidence: selectedEvidence });
    if (prompt.length <= input.promptMaxChars) return { prompt, evidence: selectedEvidence };
    selectedEvidence = selectedEvidence.slice(
      0,
      Math.max(8, Math.floor(selectedEvidence.length * 0.7)),
    );
  }
  const prompt = renderCriticPrompt({ ...input, evidence: selectedEvidence });
  if (prompt.length <= input.promptMaxChars) return { prompt, evidence: selectedEvidence };
  return {
    prompt: truncateText(prompt, input.promptMaxChars),
    evidence: selectedEvidence,
  };
}

async function runCodexJsonPrompt(input: {
  args: CliArgs;
  prompt: string;
  schemaPath: string;
  eventsPath: string;
  lastMessagePath: string;
  label: string;
}): Promise<string> {
  const argvForCodex = buildCodexExecCommand(codexAgentHeadlessBaseOptionsFromEnv(), {
    prompt: "-",
    cwd: root,
    sandbox: input.args.sandbox as CodexSandboxMode,
    model: input.args.model,
    profile: input.args["codex-profile"],
    json: true,
    ephemeral: !input.args["persist-session"],
    outputLastMessageFile: input.lastMessagePath,
    outputSchemaFile: input.schemaPath,
  });

  process.stderr.write(`codex-client-improvement-lab: running codex exec (${input.label})\n`);
  const rawEvents = await execCodexArgv(root, argvForCodex, input.args["timeout-ms"], input.prompt);
  await writeFile(input.eventsPath, rawEvents);
  const events = parseCodexJsonEvents(rawEvents);
  return extractLastCodexAgentMessage(events) ?? (await readFile(input.lastMessagePath, "utf8"));
}

function formatReport(
  report: RecommendationReport,
  metadata: JsonRecord,
  criticReport: CriticReport | null,
): string {
  const lines = [
    "# Codex Client Improvement Lab",
    "",
    `- Client: ${report.clientId}`,
    `- Source: ${report.sourcePath}`,
    `- Run dir: ${String(metadata.runDir)}`,
    `- Review mode: ${String(metadata.reviewMode)}`,
    `- Critic: ${String(metadata.criticEnabled)}`,
    `- Evidence strategy: ${String(metadata.evidenceStrategy)}`,
    `- Lens reports: ${String(metadata.lensReportsTotal ?? 0)}`,
    `- Evidence sent: ${String(metadata.evidenceSent)} / ${String(metadata.evidenceTotal)}`,
    "",
    "## Summary",
    "",
    report.executiveSummary,
    "",
    "## Codebase Inspection",
    "",
    report.codebaseInspectionSummary,
    "",
    "## Recommendations",
    "",
  ];
  for (const item of report.recommendations) {
    lines.push(
      `### ${item.title}`,
      "",
      `- Severity: ${item.severity}`,
      `- Lane: ${item.lane}`,
      `- Owner layer: ${item.ownerLayer}`,
      `- Target: ${item.targetScope}`,
      `- Action: ${item.actionType}`,
      `- Confidence: ${item.confidence}`,
      `- Evidence: ${item.evidenceRefs.join(", ")}`,
      item.repoFileRefs.length
        ? `- Repo refs: ${item.repoFileRefs.join(", ")}`
        : "- Repo refs: none",
      "",
      `Problem: ${item.problem}`,
      "",
      `Why it matters: ${item.whyItMattersForClient}`,
      "",
      `Proposed change: ${item.proposedChange}`,
      "",
      `Smallest useful version: ${item.smallestUsefulVersion}`,
      "",
      `Validation: ${item.validationPlan}`,
      "",
    );
  }
  if (report.rejectedIdeas.length > 0) {
    lines.push("## Rejected Ideas", "");
    for (const item of report.rejectedIdeas) {
      lines.push(`- ${item.title}: ${item.reason}`);
    }
    lines.push("");
  }
  if (report.followUpQuestions.length > 0) {
    lines.push("## Follow-up Questions", "");
    for (const question of report.followUpQuestions) {
      lines.push(`- ${question}`);
    }
    lines.push("");
  }
  if (criticReport) {
    lines.push("## Critic", "");
    lines.push(`Overall verdict: ${criticReport.overallVerdict}`, "");
    lines.push(criticReport.summary, "");
    for (const item of criticReport.recommendationReviews) {
      lines.push(
        `- ${item.recommendationId}: ${item.verdict}, confidence ${item.confidenceAfterCritic}, overkill risk ${item.overkillRisk}. ${item.reasons.join(" ")}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function writeOutput(input: {
  args: CliArgs;
  report: RecommendationReport;
  criticReport: CriticReport | null;
  metadata: JsonRecord;
}): Promise<void> {
  const rendered =
    input.args.format === "json"
      ? JSON.stringify(
          { ...input.metadata, report: input.report, criticReport: input.criticReport },
          null,
          2,
        )
      : formatReport(input.report, input.metadata, input.criticReport);
  if (input.args.out) {
    const outPath = path.resolve(input.args.out);
    assertOutsideRepo(outPath, "--out");
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, rendered);
    console.log(`Wrote Codex improvement report to ${outPath}`);
    return;
  }
  console.log(rendered);
}

export async function runCodexClientImprovementLabCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  assertRuntimeProfile(args["env-profile"]);
  const criticEnabled = shouldRunCritic(args);

  const runDir = await createRunDir(args["out-dir"]);
  const inputPath = await resolveInputPath(args, runDir);
  const snapshot = await readInput(inputPath, args.client);
  const clientId =
    firstString(recordValue(snapshot.profile), ["id", "profileId", "slug"]) ?? args.client;
  const evidence = collectEvidence(snapshot);
  const stories = buildEvidenceStories(snapshot);
  const evidencePackage = packageEvidence({
    snapshot,
    rawEvidence: evidence,
    strategy: args["evidence-strategy"],
    maxEvidence: args["max-evidence"],
  });
  const snapshotContextFiles = await writeSnapshotContextFiles({
    runDir,
    clientId,
    sourcePath: inputPath,
    snapshot,
    rawEvidence: evidence,
    stories,
  });
  const compactClientContext = compactContext(snapshot);
  const lensSchemaPath = path.join(snapshotContextFiles.lensDir, "lens-output-schema.json");
  await writeFile(lensSchemaPath, JSON.stringify(lensReportJsonSchema, null, 2));

  const lensReports: LensReport[] = [];
  const lensMetadata: JsonRecord[] = [];
  for (const lens of LENS_DEFINITIONS) {
    const lensEvidence = selectLensEvidence({
      packagedEvidence: evidencePackage.packagedEvidence,
      lens,
      maxEvidence: args["max-lens-evidence"],
    });
    const lensPromptInput = buildLensPrompt({
      clientId,
      sourcePath: inputPath,
      compactClientContext,
      snapshotContextFiles,
      lens,
      maxFindings: args["max-lens-findings"],
      evidence: lensEvidence,
      promptMaxChars: args["prompt-max-chars"],
    });
    const lensPromptPath = path.join(snapshotContextFiles.lensDir, `${lens.id}-prompt.md`);
    const lensEventsPath = path.join(snapshotContextFiles.lensDir, `${lens.id}-events.jsonl`);
    const lensLastMessagePath = path.join(
      snapshotContextFiles.lensDir,
      `${lens.id}-last-message.json`,
    );
    const lensReportPath = path.join(snapshotContextFiles.lensDir, `${lens.id}.json`);
    await writeFile(lensPromptPath, lensPromptInput.prompt);
    lensMetadata.push({
      lens: lens.id,
      promptPath: lensPromptPath,
      eventsPath: args["review-mode"] === "lensed" && !args["dry-run"] ? lensEventsPath : null,
      lastMessagePath:
        args["review-mode"] === "lensed" && !args["dry-run"] ? lensLastMessagePath : null,
      reportPath: args["review-mode"] === "lensed" && !args["dry-run"] ? lensReportPath : null,
      evidenceSent: lensPromptInput.evidence.length,
      promptChars: lensPromptInput.prompt.length,
    });
    if (args["review-mode"] !== "lensed" || args["dry-run"]) continue;
    const finalLensMessage = await runCodexJsonPrompt({
      args,
      prompt: lensPromptInput.prompt,
      schemaPath: lensSchemaPath,
      eventsPath: lensEventsPath,
      lastMessagePath: lensLastMessagePath,
      label: `lens:${lens.id}`,
    });
    const lensReport = parseLensReport(finalLensMessage);
    lensReports.push(lensReport);
    await writeFile(lensReportPath, `${JSON.stringify(lensReport, null, 2)}\n`);
  }

  const promptInput = buildPrompt({
    clientId,
    sourcePath: inputPath,
    maxRecommendations: args["max-recommendations"],
    compactClientContext,
    evidenceStrategy: args["evidence-strategy"],
    reviewMode: args["review-mode"],
    snapshotContextFiles,
    lensReports,
    evidence: evidencePackage.packagedEvidence,
    promptMaxChars: args["prompt-max-chars"],
  });

  const promptPath = path.join(runDir, "prompt.md");
  const schemaPath = path.join(runDir, "output-schema.json");
  const eventsPath = path.join(runDir, "events.jsonl");
  const lastMessagePath = path.join(runDir, "last-message.json");
  const criticPromptPath = path.join(runDir, "critic-prompt.md");
  const criticSchemaPath = path.join(runDir, "critic-output-schema.json");
  const criticEventsPath = path.join(runDir, "critic-events.jsonl");
  const criticLastMessagePath = path.join(runDir, "critic-last-message.json");
  const criticReportPath = path.join(runDir, "critic-report.json");
  await writeFile(promptPath, promptInput.prompt);
  await writeFile(schemaPath, JSON.stringify(recommendationReportJsonSchema, null, 2));
  await writeFile(criticSchemaPath, JSON.stringify(criticReportJsonSchema, null, 2));

  const metadata = {
    clientId,
    inputPath,
    runDir,
    promptPath,
    schemaPath,
    snapshotContextDir: snapshotContextFiles.dir,
    reviewMode: args["review-mode"],
    criticEnabled,
    evidenceStrategy: args["evidence-strategy"],
    lensSchemaPath,
    maxLensEvidence: args["max-lens-evidence"],
    maxLensFindings: args["max-lens-findings"],
    lensReportsTotal: lensReports.length,
    lensMetadata,
    criticPromptPath: criticEnabled ? criticPromptPath : null,
    criticSchemaPath: criticEnabled ? criticSchemaPath : null,
    criticEventsPath: criticEnabled && !args["dry-run"] ? criticEventsPath : null,
    criticLastMessagePath: criticEnabled && !args["dry-run"] ? criticLastMessagePath : null,
    criticReportPath: criticEnabled && !args["dry-run"] ? criticReportPath : null,
    rawEvidenceTotal: evidence.length,
    storyTotal: evidencePackage.storyCount,
    packagedEvidenceTotal: evidencePackage.packagedEvidence.length,
    evidenceTotal: evidencePackage.packagedEvidence.length,
    evidenceSent: promptInput.evidence.length,
    promptChars: promptInput.prompt.length,
  } satisfies JsonRecord;

  if (args["dry-run"]) {
    const output = {
      ...metadata,
      dryRun: true,
      sampleEvidenceRefs: promptInput.evidence
        .slice(0, 20)
        .map((item) => evidenceRef(item))
        .filter((value): value is string => Boolean(value)),
    };
    console.log(args.format === "json" ? JSON.stringify(output, null, 2) : formatDryRun(output));
    return;
  }

  const finalMessage = await runCodexJsonPrompt({
    args,
    prompt: promptInput.prompt,
    schemaPath,
    eventsPath,
    lastMessagePath,
    label: "final",
  });
  const report = parseReport(finalMessage);
  let criticReport: CriticReport | null = null;
  let criticPromptChars: number | null = null;
  let criticEvidenceSent: number | null = null;
  if (criticEnabled) {
    const criticPromptInput = buildCriticPrompt({
      clientId,
      sourcePath: inputPath,
      snapshotContextFiles,
      lensReports,
      recommendationReport: report,
      evidence: promptInput.evidence,
      promptMaxChars: args["prompt-max-chars"],
    });
    criticPromptChars = criticPromptInput.prompt.length;
    criticEvidenceSent = criticPromptInput.evidence.length;
    await writeFile(criticPromptPath, criticPromptInput.prompt);
    const finalCriticMessage = await runCodexJsonPrompt({
      args,
      prompt: criticPromptInput.prompt,
      schemaPath: criticSchemaPath,
      eventsPath: criticEventsPath,
      lastMessagePath: criticLastMessagePath,
      label: "critic",
    });
    criticReport = parseCriticReport(finalCriticMessage);
    await writeFile(criticReportPath, `${JSON.stringify(criticReport, null, 2)}\n`);
  }

  await writeOutput({
    args,
    report,
    criticReport,
    metadata: {
      ...metadata,
      eventsPath,
      lastMessagePath,
      criticPromptChars,
      criticEvidenceSent,
      sandbox: args.sandbox,
      model: args.model ?? null,
      codexProfile: args["codex-profile"] ?? null,
    },
  });
}

function formatDryRun(output: JsonRecord): string {
  return [
    "# Codex Client Improvement Lab Dry Run",
    "",
    `- Client: ${String(output.clientId)}`,
    `- Input: ${String(output.inputPath)}`,
    `- Run dir: ${String(output.runDir)}`,
    `- Review mode: ${String(output.reviewMode)}`,
    `- Critic: ${String(output.criticEnabled)}`,
    `- Evidence strategy: ${String(output.evidenceStrategy)}`,
    `- Snapshot context: ${String(output.snapshotContextDir)}`,
    `- Lens reports: ${String(output.lensReportsTotal ?? 0)}`,
    `- Max lens evidence: ${String(output.maxLensEvidence)}`,
    `- Max lens findings: ${String(output.maxLensFindings)}`,
    `- Raw evidence: ${String(output.rawEvidenceTotal)}`,
    `- Story evidence: ${String(output.storyTotal)}`,
    `- Packaged evidence: ${String(output.packagedEvidenceTotal)}`,
    `- Prompt: ${String(output.promptPath)}`,
    `- Schema: ${String(output.schemaPath)}`,
    `- Evidence sent: ${String(output.evidenceSent)} / ${String(output.evidenceTotal)}`,
    `- Prompt chars: ${String(output.promptChars)}`,
    "",
    "Sample evidence refs:",
    ...arrayValue(output.sampleEvidenceRefs).map((ref) => `- ${String(ref)}`),
  ].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runCodexClientImprovementLabCli());
}
