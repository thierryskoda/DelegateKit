#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  createDeepSeekModel,
  generateLlmObject,
  llmErrorDiagnostics,
} from "@ai-assistants/llm-client";
import { assertRuntimeProfile, repoRoot } from "@ai-assistants/repo-layout";
import { loadProfileDotEnv, parseCli, runCliMain } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import {
  renderSanitizedJsonForLlm,
  truncateForLlmPrompt,
} from "../../apps/backend/src/ops-support/profile-learning-review-diagnostics";

const root = repoRoot(import.meta.url);
const DEFAULT_SNAPSHOT_PATH = path.join(
  root,
  "clients",
  "client-state-summaries.generated",
  "testing.json",
);

const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_MAX_QUESTIONS = 3;
const DEFAULT_MAX_CHUNKS = 36;
const DEFAULT_MAX_ISSUE_PACKETS = 3;
const PROMPT_MAX_CHARS = 55_000;
const STAGE_TIMEOUT_MS = 45_000;
const STAGE_MAX_OUTPUT_TOKENS = 10_000;
let selectedModel = DEFAULT_MODEL;
let auditDir: string | null = null;
let auditSequence = 0;

const cliSchema = z
  .object({
    help: z.boolean().optional(),
    snapshot: z.string().optional(),
    client: z.string().default("testing"),
    "env-profile": z.string().default("dev"),
    model: z.string().default(DEFAULT_MODEL),
    format: z.enum(["markdown", "json"]).default("markdown"),
    "max-questions": z.coerce.number().int().min(1).max(8).default(DEFAULT_MAX_QUESTIONS),
    "max-chunks": z.coerce.number().int().min(6).max(120).default(DEFAULT_MAX_CHUNKS),
    "max-issue-packets": z.coerce
      .number()
      .int()
      .min(1)
      .max(8)
      .default(DEFAULT_MAX_ISSUE_PACKETS),
    "audit-dir": z.string().optional(),
  })
  .strict();

type CliArgs = z.infer<typeof cliSchema>;
type JsonRecord = Record<string, unknown>;

const chunkKindSchema = z.enum([
  "scheduled_task",
  "guidance",
  "work_route",
  "integration",
  "integration_channel",
  "integration_webhook",
  "work_item",
  "action",
  "backend_job",
  "artifact",
]);

const laneSchema = z.enum(["reliability", "capability"]);

const structuralSignalSchema = z.enum([
  "disconnected_integration",
  "unhealthy_webhook",
  "failed_job",
  "blocked_work_item",
  "active_client_channel",
  "approval_signal",
  "guidance_signal",
  "scheduled_loop",
  "recent_completion",
  "document_signal",
  "follow_up_signal",
]);

const traceChunkSchema = z
  .object({
    ref: z.string().trim().min(1),
    kind: chunkKindSchema,
    sourceSection: z.string().trim().min(1),
    title: z.string().trim().min(1).nullable(),
    status: z.string().trim().min(1).nullable(),
    occurredAt: z.string().trim().min(1).nullable(),
    excerpt: z.string().trim().min(1),
    excerptIsPromptTruncated: z.boolean(),
    structuralSignals: z.array(structuralSignalSchema),
  })
  .strict();

const semanticLabelSchema = z
  .object({
    ref: z.string().trim().min(1),
    userIntent: z.string().trim().min(1).max(320).nullable(),
    workflow: z.string().trim().min(1).max(320).nullable(),
    outcome: z.string().trim().min(1).max(320).nullable(),
    possibleFriction: z.string().trim().min(1).max(420).nullable(),
    possibleOpportunity: z.string().trim().min(1).max(420).nullable(),
    laneHint: laneSchema,
  })
  .strict();

const semanticLabelBatchSchema = z
  .object({
    labels: z.array(semanticLabelSchema).min(1).max(12),
  })
  .strict();

const compactTraceSchema = z
  .object({
    traceId: z.string().trim().min(1),
    refs: z.array(z.string().trim().min(1)).min(1).max(16),
    kind: chunkKindSchema,
    laneHint: laneSchema,
    title: z.string().trim().min(1),
    status: z.string().trim().min(1).nullable(),
    occurredAt: z.string().trim().min(1).nullable(),
    summary: z.string().trim().min(1).max(1_300),
    structuralSignals: z.array(structuralSignalSchema),
    missingContext: z.string().trim().min(1).max(500).nullable(),
  })
  .strict();

const roleProfileSchema = z
  .object({
    inferredAssistantRole: z.string().trim().min(1).max(240),
    clientWorkDomain: z.string().trim().min(1).max(240),
    primaryOutcomes: z.array(z.string().trim().min(1).max(220)).min(2).max(8),
    workAssistantShouldOwn: z.array(z.string().trim().min(1).max(260)).min(2).max(10),
    decisionsClientShouldKeep: z.array(z.string().trim().min(1).max(260)).min(1).max(8),
    tenXDefinition: z.string().trim().min(1).max(900),
    confidence: z.enum(["low", "medium", "high"]),
  })
  .strict();

const lensIdSchema = z.enum([
  "reliability",
  "repeated_clarification",
  "memory_reuse",
  "next_step_extraction",
  "crm_or_system_update",
  "document_tracker",
  "follow_up_management",
  "notification_batching",
  "approval_shortcuts",
  "meeting_prep",
  "daily_handled_summary",
  "drafting_help",
  "learning_loop",
]);

const selectedLensSchema = z
  .object({
    lensId: lensIdSchema,
    relevance: z.enum(["low", "medium", "high"]),
    rationale: z.string().trim().min(1).max(420),
    evidenceRefs: z.array(z.string().trim().min(1)).max(12),
  })
  .strict();

const lensSelectionSchema = z
  .object({
    selectedLenses: z.array(selectedLensSchema).min(1).max(8),
  })
  .strict();

const investigationQuestionSchema = z
  .object({
    questionId: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/),
    question: z.string().trim().min(1).max(360),
    lensId: lensIdSchema,
    evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(14),
    whyThisQuestionExists: z.string().trim().min(1).max(600),
    scope: z.string().trim().min(1).max(500),
    outOfScope: z.string().trim().min(1).max(500),
    expectedOutput: z.string().trim().min(1).max(420),
  })
  .strict();

const questionSetSchema = z
  .object({
    questions: z.array(investigationQuestionSchema).min(1).max(8),
  })
  .strict();

const investigationSchema = z
  .object({
    questionId: z.string().trim().min(1),
    answer: z.string().trim().min(1).max(1_400),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(16),
    confidence: z.enum(["low", "medium", "high"]),
    recurrence: z.enum(["one_off", "possibly_recurring", "recurring", "unclear"]),
    missingEvidence: z.array(z.string().trim().min(1).max(240)).max(8),
    likelyLane: laneSchema,
  })
  .strict();

const patternSchema = z
  .object({
    patternId: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/),
    title: z.string().trim().min(1).max(180),
    lane: laneSchema,
    description: z.string().trim().min(1).max(900),
    prevalence: z.enum(["one_off_severe", "weak", "moderate", "strong"]),
    investigationRefs: z.array(z.string().trim().min(1)).min(1).max(8),
    representativeEvidenceRefs: z.array(z.string().trim().min(1)).min(1).max(16),
  })
  .strict();

const patternSetSchema = z
  .object({
    patterns: z.array(patternSchema).min(1).max(8),
  })
  .strict();

const ownerLayerSchema = z.enum([
  "reliability/code",
  "tool/API",
  "workflow/orchestration",
  "context/retrieval",
  "memory policy",
  "prompt/guidance",
  "product/UI",
  "approval/escalation",
  "maintainer backlog",
]);

const issuePacketSchema = z
  .object({
    issueId: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/),
    title: z.string().trim().min(1).max(180),
    lane: laneSchema,
    category: z.string().trim().min(1).max(140),
    impact: z.string().trim().min(1).max(900),
    representativeEvidenceRefs: z.array(z.string().trim().min(1)).min(1).max(16),
    prevalenceEstimate: z.string().trim().min(1).max(500),
    evidenceStrength: z.enum(["weak", "moderate", "strong"]),
    risk: z.string().trim().min(1).max(700),
    likelyOwnerLayer: ownerLayerSchema,
    missingEvidence: z.array(z.string().trim().min(1).max(260)).max(8),
  })
  .strict();

const issuePacketSetSchema = z
  .object({
    issuePackets: z.array(issuePacketSchema).min(1).max(8),
  })
  .strict();

const fixLayerDecisionSchema = z
  .object({
    issueId: z.string().trim().min(1),
    layer: ownerLayerSchema,
    reason: z.string().trim().min(1).max(700),
  })
  .strict();

const proposalSchema = z
  .object({
    issueId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(180),
    recommendation: z.string().trim().min(1).max(1_200),
    smallestUsefulVersion: z.string().trim().min(1).max(900),
    owner: ownerLayerSchema,
    lane: laneSchema,
    expectedImpact: z.string().trim().min(1).max(900),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(16),
  })
  .strict();

const evaluatorArtifactSchema = z
  .object({
    issueId: z.string().trim().min(1),
    proves: z.string().trim().min(1).max(700),
    doesNotProve: z.string().trim().min(1).max(700),
    regressionExamples: z.array(z.string().trim().min(1).max(360)).min(1).max(5),
    deterministicChecks: z.array(z.string().trim().min(1).max(300)).max(6),
    llmJudgeRubric: z.string().trim().min(1).max(900),
    postDeployMeasurement: z.string().trim().min(1).max(600),
  })
  .strict();

const replayValidationSchema = z
  .object({
    issueId: z.string().trim().min(1),
    wouldHaveHelped: z.enum(["yes", "probably", "unclear", "probably_not", "no"]),
    confidence: z.enum(["low", "medium", "high"]),
    evidenceBasedReason: z.string().trim().min(1).max(1_000),
    risks: z.array(z.string().trim().min(1).max(260)).max(8),
  })
  .strict();

const critiqueDecisionSchema = z.enum([
  "implement_now",
  "needs_maintainer_review",
  "promising_needs_more_evidence",
  "already_covered_but_broken",
  "reject",
]);

const critiqueSchema = z
  .object({
    issueId: z.string().trim().min(1),
    decision: critiqueDecisionSchema,
    priority: z.enum(["low", "medium", "high"]),
    clientAnnoyanceRisk: z.enum(["low", "medium", "high"]),
    unsafeActionRisk: z.enum(["low", "medium", "high"]),
    duplicateOrOverkillRisk: z.enum(["low", "medium", "high"]),
    reason: z.string().trim().min(1).max(1_000),
    adjustmentNeeded: z.string().trim().min(1).max(700).nullable(),
  })
  .strict();

const finalRecommendationSchema = z
  .object({
    issueId: z.string().trim().min(1),
    rank: z.number().int().min(1).max(20),
    title: z.string().trim().min(1).max(180),
    lane: laneSchema,
    decision: critiqueDecisionSchema,
    priority: z.enum(["low", "medium", "high"]),
    action: z.string().trim().min(1).max(1_200),
    whyThisHelpsClient: z.string().trim().min(1).max(900),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(16),
    evaluatorArtifact: evaluatorArtifactSchema,
    validationSummary: z.string().trim().min(1).max(800),
    notOverkillBecause: z.string().trim().min(1).max(700),
  })
  .strict();

const finalPortfolioSchema = z
  .object({
    executiveSummary: z.string().trim().min(1).max(1_500),
    laneBalance: z.string().trim().min(1).max(900),
    reliabilityRecommendations: z.array(finalRecommendationSchema).max(8),
    capabilityRecommendations: z.array(finalRecommendationSchema).max(8),
    promisingNeedsMoreEvidence: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(180),
            reason: z.string().trim().min(1).max(700),
            evidenceRefs: z.array(z.string().trim().min(1)).max(12),
          })
          .strict(),
      )
      .max(8),
    rejectedOrDeferred: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(180),
            reason: z.string().trim().min(1).max(700),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

type TraceChunk = z.infer<typeof traceChunkSchema>;
type SemanticLabel = z.infer<typeof semanticLabelSchema>;
type CompactTrace = z.infer<typeof compactTraceSchema>;
type RoleProfile = z.infer<typeof roleProfileSchema>;
type SelectedLens = z.infer<typeof selectedLensSchema>;
type InvestigationQuestion = z.infer<typeof investigationQuestionSchema>;
type Investigation = z.infer<typeof investigationSchema>;
type Pattern = z.infer<typeof patternSchema>;
type IssuePacket = z.infer<typeof issuePacketSchema>;
type FixLayerDecision = z.infer<typeof fixLayerDecisionSchema>;
type Proposal = z.infer<typeof proposalSchema>;
type EvaluatorArtifact = z.infer<typeof evaluatorArtifactSchema>;
type ReplayValidation = z.infer<typeof replayValidationSchema>;
type Critique = z.infer<typeof critiqueSchema>;
type FinalPortfolio = z.infer<typeof finalPortfolioSchema>;

const STATIC_LENSES: Record<z.infer<typeof lensIdSchema>, { title: string; purpose: string }> = {
  reliability: {
    title: "Reliability",
    purpose: "Find broken tools, unhealthy integrations, failed jobs, and blocked execution loops.",
  },
  repeated_clarification: {
    title: "Repeated clarification",
    purpose: "Find places the assistant repeatedly asks the client for context it could remember or resolve.",
  },
  memory_reuse: {
    title: "Memory reuse",
    purpose: "Find reusable client answers, aliases, contacts, folder mappings, or preferences.",
  },
  next_step_extraction: {
    title: "Next-step extraction",
    purpose: "Find messages where the assistant could turn input into owners, due dates, blockers, or tasks.",
  },
  crm_or_system_update: {
    title: "System updates",
    purpose: "Find obvious updates the assistant could make or propose in the client's systems of record.",
  },
  document_tracker: {
    title: "Document tracker",
    purpose: "Find opportunities to track missing, signed, received, or filed documents.",
  },
  follow_up_management: {
    title: "Follow-up management",
    purpose: "Find stale threads, pending replies, and follow-up reminders the assistant should manage.",
  },
  notification_batching: {
    title: "Notification batching",
    purpose: "Find interruptions that should be grouped, prioritized, or suppressed.",
  },
  approval_shortcuts: {
    title: "Approval shortcuts",
    purpose: "Find client decisions that could be made with safe options or approval buttons.",
  },
  meeting_prep: {
    title: "Meeting prep",
    purpose: "Find calls or calendar events where the assistant could prepare context and agendas.",
  },
  daily_handled_summary: {
    title: "Daily handled summary",
    purpose: "Find whether the assistant should report what it handled and what needs attention.",
  },
  drafting_help: {
    title: "Drafting help",
    purpose: "Find messages where drafting replies would be more helpful than notification-only behavior.",
  },
  learning_loop: {
    title: "Learning loop",
    purpose: "Find repeated failures that should become evals, regression cases, or maintainer review items.",
  },
};

function usage(): string {
  return [
    "Usage:",
    "  npm run diagnostics -- trace-improvement-flow",
    "  npm run diagnostics -- trace-improvement-flow --snapshot=/abs/path/client-summary.json --format=json",
    "",
    "Runs an isolated, read-only, multi-agent-style trace improvement prototype.",
    "",
    "Options:",
    `  --snapshot=<path>            Summary snapshot JSON. Default: ${DEFAULT_SNAPSHOT_PATH}`,
    "  --client=<profile-id>       Client id to unwrap from aggregate summary files. Default: testing",
    "  --env-profile=dev|prod      Runtime .env to load for LLM credentials only. Default: dev",
    `  --model=<model>             LLM model for each narrow agent. Default: ${DEFAULT_MODEL}`,
    "  --format=markdown|json      Output format. Default: markdown",
    `  --max-questions=<n>         Evidence-specific questions. Default: ${DEFAULT_MAX_QUESTIONS}`,
    `  --max-chunks=<n>            Chunks sent to semantic labelers. Default: ${DEFAULT_MAX_CHUNKS}`,
    `  --max-issue-packets=<n>     Issue packets to propose fixes for. Default: ${DEFAULT_MAX_ISSUE_PACKETS}`,
    "  --audit-dir=<path>          Write per-stage JSON audit logs to this directory",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  const parsed = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      snapshot: { type: "string" },
      client: { type: "string" },
      "env-profile": { type: "string" },
      model: { type: "string" },
      format: { type: "string" },
      "max-questions": { type: "string" },
      "max-chunks": { type: "string" },
      "max-issue-packets": { type: "string" },
      "audit-dir": { type: "string" },
    },
    schema: cliSchema,
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  return parsed;
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

function stringValue(record: JsonRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(record: JsonRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = stringValue(record, key);
    if (value) return value;
  }
  return null;
}

function rawSummaryForExcerpt(record: JsonRecord, keys: readonly string[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      parts.push(`${key}: ${value.trim()}`);
    } else if (value !== null && value !== undefined && typeof value !== "function") {
      const rendered = JSON.stringify(value);
      if (rendered && rendered !== "{}" && rendered !== "[]") parts.push(`${key}: ${rendered}`);
    }
  }
  return parts.join("\n").trim();
}

function snapshotPath(raw: string | undefined): string {
  return path.resolve(raw ?? DEFAULT_SNAPSHOT_PATH);
}

async function readSnapshot(filePath: string, clientId: string): Promise<JsonRecord> {
  const raw = await readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error(`Snapshot ${filePath} did not contain a JSON object.`);
  const summaries = recordValue(parsed.summaries);
  if (Object.keys(summaries).length > 0) {
    const summary = summaries[clientId];
    if (!isRecord(summary)) {
      throw new Error(
        `Aggregate summary ${filePath} does not contain client ${JSON.stringify(clientId)}.`,
      );
    }
    return summary;
  }
  return parsed;
}

function excerpt(raw: string, maxChars = 1_500): { value: string; truncated: boolean } {
  const trimmed = raw.trim();
  const value = truncateForLlmPrompt(trimmed, maxChars);
  return { value: value || "(empty excerpt)", truncated: trimmed.length > value.length };
}

function makeChunk(input: {
  ref: string;
  kind: z.infer<typeof chunkKindSchema>;
  sourceSection: string;
  record: JsonRecord;
  titleKeys: readonly string[];
  statusKeys?: readonly string[];
  occurredAtKeys?: readonly string[];
  excerptKeys: readonly string[];
  structuralSignals?: z.infer<typeof structuralSignalSchema>[];
}): TraceChunk | null {
  const rawExcerpt = rawSummaryForExcerpt(input.record, input.excerptKeys);
  const title = firstString(input.record, input.titleKeys);
  if (!rawExcerpt && !title) return null;
  const rendered = excerpt(rawExcerpt || title || "", 1_600);
  return {
    ref: input.ref,
    kind: input.kind,
    sourceSection: input.sourceSection,
    title,
    status: firstString(input.record, input.statusKeys ?? ["status", "state"]),
    occurredAt: firstString(
      input.record,
      input.occurredAtKeys ?? ["finishedAt", "updatedAt", "createdAt", "lastRunAt", "nextRunAt"],
    ),
    excerpt: rendered.value,
    excerptIsPromptTruncated: rendered.truncated,
    structuralSignals: input.structuralSignals ?? [],
  };
}

function signalsForRecord(kind: z.infer<typeof chunkKindSchema>, record: JsonRecord) {
  const status = `${firstString(record, ["status", "state", "connectionStatus", "credentialStatus"]) ?? ""}`.toLowerCase();
  const text = JSON.stringify(record).toLowerCase();
  const signals: z.infer<typeof structuralSignalSchema>[] = [];
  if (kind === "integration" && /disconnected|expired|revoked|error|missing/.test(text)) {
    signals.push("disconnected_integration");
  }
  if (kind === "integration_webhook" && status !== "active") signals.push("unhealthy_webhook");
  if (kind === "backend_job" && /fail|error|blocked/.test(status + text)) signals.push("failed_job");
  if (kind === "work_item" && /blocked|failed|error|waiting/.test(status + text)) {
    signals.push("blocked_work_item");
  }
  if (kind === "integration_channel" && /active|connected|enabled/.test(status + text)) {
    signals.push("active_client_channel");
  }
  if (/approval|approve|confirm|permission/.test(text)) signals.push("approval_signal");
  if (kind === "guidance") signals.push("guidance_signal");
  if (kind === "scheduled_task") signals.push("scheduled_loop");
  if (/complete|completed|done|sent|filed|created/.test(status + text)) {
    signals.push("recent_completion");
  }
  if (/document|file|folder|invoice|statement|pdf|signed|signature|mandate/.test(text)) {
    signals.push("document_signal");
  }
  if (/follow.?up|stale|waiting|remind|pending|due/.test(text)) signals.push("follow_up_signal");
  return [...new Set(signals)];
}

function buildTraceChunks(snapshot: JsonRecord): TraceChunk[] {
  const chunks: TraceChunk[] = [];
  const recentActivity = recordValue(snapshot.recentActivity);

  for (const [index, item] of arrayValue(snapshot.scheduledTasks).entries()) {
    const record = recordValue(item);
    const chunk = makeChunk({
      ref: `scheduled_task:${index}`,
      kind: "scheduled_task",
      sourceSection: "scheduledTasks",
      record,
      titleKeys: ["title", "name"],
      excerptKeys: ["title", "instructions", "schedule", "status", "lastRunAt", "nextRunAt"],
      structuralSignals: signalsForRecord("scheduled_task", record),
    });
    if (chunk) chunks.push(chunk);
  }

  for (const [index, item] of arrayValue(snapshot.guidance).entries()) {
    const record = recordValue(item);
    const key = stringValue(record, "key") ?? String(index);
    const chunk = makeChunk({
      ref: `guidance:${key}`,
      kind: "guidance",
      sourceSection: "guidance",
      record,
      titleKeys: ["title", "key"],
      excerptKeys: ["key", "title", "status", "selectorDescription", "bodyMarkdown"],
      structuralSignals: signalsForRecord("guidance", record),
    });
    if (chunk) chunks.push(chunk);
  }

  for (const [index, item] of arrayValue(snapshot.assistantWorkRoutes).entries()) {
    const record = recordValue(item);
    const eventType = stringValue(record, "eventType") ?? String(index);
    const chunk = makeChunk({
      ref: `work_route:${eventType}`,
      kind: "work_route",
      sourceSection: "assistantWorkRoutes",
      record,
      titleKeys: ["eventType", "title"],
      statusKeys: ["managedBy", "status"],
      excerptKeys: ["eventType", "managedBy", "priority", "instructions"],
      structuralSignals: signalsForRecord("work_route", record),
    });
    if (chunk) chunks.push(chunk);
  }

  const integrations = recordValue(snapshot.integrations);
  for (const [index, item] of arrayValue(integrations.connectedAccounts).entries()) {
    const record = recordValue(item);
    const chunk = makeChunk({
      ref: `integration_account:${index}`,
      kind: "integration",
      sourceSection: "integrations.connectedAccounts",
      record,
      titleKeys: ["provider", "displayLabel", "accountEmail"],
      statusKeys: ["connectionStatus", "credentialStatus", "status"],
      excerptKeys: [
        "provider",
        "displayLabel",
        "accountEmail",
        "connectionStatus",
        "credentialStatus",
        "lastError",
      ],
      structuralSignals: signalsForRecord("integration", record),
    });
    if (chunk) chunks.push(chunk);
  }
  for (const [index, item] of arrayValue(integrations.capabilityAccountLinks).entries()) {
    const record = recordValue(item);
    const chunk = makeChunk({
      ref: `integration_capability:${index}`,
      kind: "integration",
      sourceSection: "integrations.capabilityAccountLinks",
      record,
      titleKeys: ["capabilitySlug", "label"],
      statusKeys: ["status"],
      excerptKeys: ["capabilitySlug", "label", "status", "required", "readiness"],
      structuralSignals: signalsForRecord("integration", record),
    });
    if (chunk) chunks.push(chunk);
  }
  for (const [index, item] of arrayValue(integrations.channels).entries()) {
    const record = recordValue(item);
    const chunk = makeChunk({
      ref: `integration_channel:${index}`,
      kind: "integration_channel",
      sourceSection: "integrations.channels",
      record,
      titleKeys: ["provider", "accountId"],
      excerptKeys: ["provider", "accountId", "status"],
      structuralSignals: signalsForRecord("integration_channel", record),
    });
    if (chunk) chunks.push(chunk);
  }
  for (const [index, item] of arrayValue(integrations.webhookSubscriptions).entries()) {
    const record = recordValue(item);
    const chunk = makeChunk({
      ref: `integration_webhook:${index}`,
      kind: "integration_webhook",
      sourceSection: "integrations.webhookSubscriptions",
      record,
      titleKeys: ["providerKey", "adapterKey", "eventScope"],
      excerptKeys: [
        "providerKey",
        "adapterKey",
        "eventScope",
        "status",
        "lastErrorCode",
        "lastErrorMessage",
        "expiresAt",
      ],
      structuralSignals: signalsForRecord("integration_webhook", record),
    });
    if (chunk) chunks.push(chunk);
  }

  for (const [index, item] of arrayValue(recentActivity.workItems).entries()) {
    const record = recordValue(item);
    const chunk = makeChunk({
      ref: `work_item:${index}`,
      kind: "work_item",
      sourceSection: "recentActivity.workItems",
      record,
      titleKeys: ["title", "summary", "kind"],
      excerptKeys: [
        "title",
        "summary",
        "resultSummary",
        "status",
        "state",
        "lastError",
        "errorMessage",
        "createdAt",
        "updatedAt",
        "finishedAt",
      ],
      structuralSignals: signalsForRecord("work_item", record),
    });
    if (chunk) chunks.push(chunk);
  }

  for (const [index, item] of arrayValue(recentActivity.actions).entries()) {
    const record = recordValue(item);
    const chunk = makeChunk({
      ref: `action:${index}`,
      kind: "action",
      sourceSection: "recentActivity.actions",
      record,
      titleKeys: ["title", "summary", "kind"],
      excerptKeys: ["title", "summary", "status", "failureMessage", "createdAt", "updatedAt"],
      structuralSignals: signalsForRecord("action", record),
    });
    if (chunk) chunks.push(chunk);
  }

  for (const [index, item] of arrayValue(recentActivity.backendJobs).entries()) {
    const record = recordValue(item);
    const chunk = makeChunk({
      ref: `backend_job:${index}`,
      kind: "backend_job",
      sourceSection: "recentActivity.backendJobs",
      record,
      titleKeys: ["kind", "title"],
      excerptKeys: ["kind", "title", "status", "lastError", "summary", "createdAt", "updatedAt"],
      structuralSignals: signalsForRecord("backend_job", record),
    });
    if (chunk) chunks.push(chunk);
  }

  for (const [index, item] of arrayValue(recentActivity.artifacts).entries()) {
    const record = recordValue(item);
    const chunk = makeChunk({
      ref: `artifact:${index}`,
      kind: "artifact",
      sourceSection: "recentActivity.artifacts",
      record,
      titleKeys: ["filename", "title", "summary"],
      excerptKeys: ["filename", "title", "summary", "sourceSummary", "createdAt", "updatedAt"],
      structuralSignals: signalsForRecord("artifact", record),
    });
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

function compactDurableContext(snapshot: JsonRecord): JsonRecord {
  return {
    profile: snapshot.profile ?? null,
    scheduledTasks: arrayValue(snapshot.scheduledTasks).map((item) => {
      const record = recordValue(item);
      return {
        title: firstString(record, ["title", "name"]),
        status: stringValue(record, "status"),
        instructionsExcerpt: stringValue(record, "instructions")
          ? truncateForLlmPrompt(stringValue(record, "instructions") ?? "", 800)
          : null,
      };
    }),
    guidance: arrayValue(snapshot.guidance).map((item) => {
      const record = recordValue(item);
      return {
        key: stringValue(record, "key"),
        title: stringValue(record, "title"),
        status: stringValue(record, "status"),
        selectorDescription: stringValue(record, "selectorDescription"),
        bodyMarkdownExcerpt: stringValue(record, "bodyMarkdown")
          ? truncateForLlmPrompt(stringValue(record, "bodyMarkdown") ?? "", 900)
          : null,
      };
    }),
    assistantWorkRoutes: arrayValue(snapshot.assistantWorkRoutes).map((item) => {
      const record = recordValue(item);
      return {
        eventType: stringValue(record, "eventType"),
        managedBy: stringValue(record, "managedBy"),
        instructionsExcerpt: stringValue(record, "instructions")
          ? truncateForLlmPrompt(stringValue(record, "instructions") ?? "", 700)
          : null,
      };
    }),
    integrationsSummary: summarizeIntegrations(snapshot.integrations),
  };
}

function summarizeIntegrations(integrations: unknown): JsonRecord {
  const record = recordValue(integrations);
  return {
    connectedAccounts: arrayValue(record.connectedAccounts).map((item) => {
      const account = recordValue(item);
      return {
        provider: stringValue(account, "provider"),
        displayLabel: stringValue(account, "displayLabel"),
        accountEmail: stringValue(account, "accountEmail"),
        connectionStatus: stringValue(account, "connectionStatus"),
        credentialStatus: stringValue(account, "credentialStatus"),
        lastError: stringValue(account, "lastError"),
      };
    }),
    channels: arrayValue(record.channels).map((item) => {
      const channel = recordValue(item);
      return {
        provider: stringValue(channel, "provider"),
        accountId: stringValue(channel, "accountId"),
        status: stringValue(channel, "status"),
      };
    }),
    unhealthyWebhooks: arrayValue(record.webhookSubscriptions)
      .map((item) => {
        const webhook = recordValue(item);
        return {
          providerKey: stringValue(webhook, "providerKey"),
          adapterKey: stringValue(webhook, "adapterKey"),
          eventScope: stringValue(webhook, "eventScope"),
          status: stringValue(webhook, "status"),
          lastErrorCode: stringValue(webhook, "lastErrorCode"),
          lastErrorMessage: stringValue(webhook, "lastErrorMessage"),
        };
      })
      .filter((item) => item.status && item.status !== "active"),
  };
}

function prioritizeChunks(chunks: readonly TraceChunk[], maxChunks: number): TraceChunk[] {
  const scored = chunks.map((chunk, index) => {
    const score =
      chunk.structuralSignals.length * 10 +
      (chunk.kind === "work_item" ? 6 : 0) +
      (chunk.kind === "guidance" ? 4 : 0) +
      (chunk.kind === "scheduled_task" ? 4 : 0) +
      (chunk.kind === "integration" || chunk.kind === "integration_webhook" ? 7 : 0) +
      (chunk.kind === "action" || chunk.kind === "backend_job" ? 3 : 0);
    return { chunk, index, score };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxChunks)
    .map((item) => item.chunk);
}

function groupByKind(chunks: readonly TraceChunk[]): TraceChunk[][] {
  const groups = new Map<TraceChunk["kind"], TraceChunk[]>();
  for (const chunk of chunks) {
    const existing = groups.get(chunk.kind) ?? [];
    existing.push(chunk);
    groups.set(chunk.kind, existing);
  }
  const batches: TraceChunk[][] = [];
  for (const group of groups.values()) {
    for (let index = 0; index < group.length; index += 8) {
      batches.push(group.slice(index, index + 8));
    }
  }
  return batches;
}

function renderChunksForPrompt(chunks: readonly TraceChunk[]) {
  return chunks.map((chunk) => ({
    ref: chunk.ref,
    kind: chunk.kind,
    sourceSection: chunk.sourceSection,
    title: chunk.title,
    status: chunk.status,
    occurredAt: chunk.occurredAt,
    excerpt: chunk.excerpt,
    excerptIsPromptTruncated: chunk.excerptIsPromptTruncated,
    structuralSignals: chunk.structuralSignals,
  }));
}

function auditFileName(stage: string): string {
  auditSequence += 1;
  const safeStage = stage.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 90);
  return `${String(auditSequence).padStart(2, "0")}-${safeStage}.json`;
}

async function writeAuditStage(input: {
  stage: string;
  kind: "llm" | "deterministic";
  input: unknown;
  output: unknown;
  metrics?: JsonRecord;
  startedAt?: number;
}): Promise<void> {
  if (!auditDir) return;
  await mkdir(auditDir, { recursive: true });
  const elapsedMs = input.startedAt ? Date.now() - input.startedAt : null;
  const payload = {
    stage: input.stage,
    kind: input.kind,
    elapsedMs,
    metrics: input.metrics ?? {},
    inputJson: renderSanitizedJsonForLlm(input.input, 30_000),
    outputJson: renderSanitizedJsonForLlm(input.output, 30_000),
  };
  await writeFile(
    path.join(auditDir, auditFileName(input.stage)),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

async function runStage<TSchema extends z.ZodTypeAny>(input: {
  stage: string;
  schema: TSchema;
  outputName: string;
  outputDescription: string;
  instructions: string;
  promptPayload: unknown;
}): Promise<z.infer<TSchema>> {
  process.stderr.write(`trace-improvement-flow: ${input.stage}\n`);
  const startedAt = Date.now();
  try {
    const result = await generateLlmObject({
      model: createDeepSeekModel({ model: selectedModel }),
      schema: input.schema,
      outputName: input.outputName,
      outputDescription: input.outputDescription,
      instructions: input.instructions,
      input: renderSanitizedJsonForLlm(input.promptPayload, PROMPT_MAX_CHARS),
      temperature: 0,
      timeout: STAGE_TIMEOUT_MS,
      maxOutputTokens: STAGE_MAX_OUTPUT_TOKENS,
      callAttempts: 2,
      repairAttempts: 1,
    });
    await writeAuditStage({
      stage: input.stage,
      kind: "llm",
      input: {
        outputName: input.outputName,
        outputDescription: input.outputDescription,
        instructions: input.instructions,
        promptPayload: input.promptPayload,
      },
      output: result,
      metrics: {
        outputName: input.outputName,
      },
      startedAt,
    });
    return result;
  } catch (error) {
    throw new Error(
      `${input.stage} failed: ${JSON.stringify(llmErrorDiagnostics(error), null, 2)}`,
      { cause: error },
    );
  }
}

async function labelChunks(input: {
  chunks: TraceChunk[];
  durableContext: JsonRecord;
}): Promise<SemanticLabel[]> {
  const labels: SemanticLabel[] = [];
  for (const batch of groupByKind(input.chunks)) {
    const result = await runStage({
      stage: `semantic_labeler.${batch[0]?.kind ?? "unknown"}`,
      schema: semanticLabelBatchSchema,
      outputName: "TraceSemanticLabels",
      outputDescription: "Small semantic labels for trace chunks.",
      instructions:
        "You are a tiny semantic labeler. Label only the provided chunks. Do not propose fixes. Keep context-specific labels concise. Some excerpt fields are prompt excerpts; do not treat prompt truncation as a product problem.",
      promptPayload: {
        role: "semantic_labeler",
        clientHint: input.durableContext.profile,
        chunks: renderChunksForPrompt(batch),
      },
    });
    const validRefs = new Set(batch.map((chunk) => chunk.ref));
    labels.push(...result.labels.filter((label) => validRefs.has(label.ref)));
  }
  return labels;
}

function mergeCompactTraces(chunks: readonly TraceChunk[], labels: readonly SemanticLabel[]) {
  const labelsByRef = new Map(labels.map((label) => [label.ref, label]));
  return chunks.map((chunk): CompactTrace => {
    const label = labelsByRef.get(chunk.ref);
    const summaryParts = [
      chunk.excerpt,
      label?.userIntent ? `Intent: ${label.userIntent}` : null,
      label?.workflow ? `Process: ${label.workflow}` : null,
      label?.outcome ? `Outcome: ${label.outcome}` : null,
      label?.possibleFriction ? `Friction: ${label.possibleFriction}` : null,
      label?.possibleOpportunity ? `Opportunity: ${label.possibleOpportunity}` : null,
    ].filter(Boolean);
    const laneHint =
      label?.laneHint ??
      (chunk.structuralSignals.some((signal) =>
        ["disconnected_integration", "unhealthy_webhook", "failed_job", "blocked_work_item"].includes(
          signal,
        ),
      )
        ? "reliability"
        : "capability");
    return {
      traceId: `trace:${chunk.ref}`,
      refs: [chunk.ref],
      kind: chunk.kind,
      laneHint,
      title: chunk.title ?? chunk.ref,
      status: chunk.status,
      occurredAt: chunk.occurredAt,
      summary: truncateForLlmPrompt(summaryParts.join("\n"), 1_300),
      structuralSignals: chunk.structuralSignals,
      missingContext:
        chunk.excerptIsPromptTruncated || !label
          ? "Only compact summary/excerpt evidence is available for this trace."
          : null,
    };
  });
}

function renderTracesForPrompt(traces: readonly CompactTrace[]) {
  return traces.map((trace) => ({
    traceId: trace.traceId,
    refs: trace.refs,
    kind: trace.kind,
    laneHint: trace.laneHint,
    title: trace.title,
    status: trace.status,
    occurredAt: trace.occurredAt,
    summary: trace.summary,
    structuralSignals: trace.structuralSignals,
    missingContext: trace.missingContext,
  }));
}

async function runRoleProfiler(input: {
  durableContext: JsonRecord;
  traces: CompactTrace[];
}): Promise<RoleProfile> {
  return runStage({
    stage: "client_role_profiler",
    schema: roleProfileSchema,
    outputName: "TraceImprovementRoleProfile",
    outputDescription: "Generic client role and 10x definition inferred from traces.",
    instructions:
      "Infer the client's assistant role from evidence. Stay generic across client types: do not assume a specific industry role unless evidence supports it. Define what 10x better means in practical client outcomes.",
    promptPayload: {
      role: "client_role_profiler",
      durableContext: input.durableContext,
      compactTraces: renderTracesForPrompt(input.traces.slice(0, 40)),
    },
  });
}

async function runLensSelector(input: {
  roleProfile: RoleProfile;
  traces: CompactTrace[];
}): Promise<SelectedLens[]> {
  const result = await runStage({
    stage: "static_lens_selector",
    schema: lensSelectionSchema,
    outputName: "TraceImprovementLensSelection",
    outputDescription: "Relevant static lenses selected from evidence.",
    instructions:
      "Select from the provided static lens library. Do not invent lenses. Pick lenses that evidence can actually support. Include capability lenses even when reliability issues exist, if evidence supports client-value improvements.",
    promptPayload: {
      role: "lens_selector",
      roleProfile: input.roleProfile,
      lensLibrary: STATIC_LENSES,
      compactTraces: renderTracesForPrompt(input.traces.slice(0, 50)),
    },
  });
  return result.selectedLenses;
}

async function runQuestionGenerator(input: {
  maxQuestions: number;
  roleProfile: RoleProfile;
  selectedLenses: SelectedLens[];
  traces: CompactTrace[];
}): Promise<InvestigationQuestion[]> {
  const result = await runStage({
    stage: "evidence_specific_question_generator",
    schema: questionSetSchema,
    outputName: "EvidenceSpecificInvestigationQuestions",
    outputDescription: "Evidence-specific questions for narrow investigators.",
    instructions:
      "Generate concrete investigation questions from current evidence. Each question must cite evidence refs and be specific to these traces, not generic lens wording. Use no more than maxQuestions. A good question asks what pattern exists, what context is missing, or whether an opportunity is supported. Do not propose fixes.",
    promptPayload: {
      role: "question_generator",
      maxQuestions: input.maxQuestions,
      roleProfile: input.roleProfile,
      selectedLenses: input.selectedLenses,
      compactTraces: renderTracesForPrompt(input.traces),
    },
  });
  return dedupeQuestions(result.questions, input.maxQuestions);
}

function dedupeQuestions(
  questions: readonly InvestigationQuestion[],
  maxQuestions: number,
): InvestigationQuestion[] {
  const seen = new Set<string>();
  const deduped: InvestigationQuestion[] = [];
  for (const question of questions) {
    const key = question.question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(question);
    if (deduped.length >= maxQuestions) break;
  }
  return deduped;
}

function matchingTraces(
  question: InvestigationQuestion,
  traces: readonly CompactTrace[],
): CompactTrace[] {
  const refs = new Set(question.evidenceRefs);
  const explicit = traces.filter((trace) => trace.refs.some((ref) => refs.has(ref)));
  const lensTerms = `${question.question} ${question.whyThisQuestionExists}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 4);
  const semantic = traces.filter((trace) => {
    const haystack = `${trace.title} ${trace.summary} ${trace.structuralSignals.join(" ")}`.toLowerCase();
    return lensTerms.some((term) => haystack.includes(term));
  });
  return [...new Map([...explicit, ...semantic].map((trace) => [trace.traceId, trace])).values()].slice(
    0,
    18,
  );
}

async function runInvestigator(input: {
  question: InvestigationQuestion;
  traces: CompactTrace[];
}): Promise<Investigation> {
  return runStage({
    stage: `single_question_investigator.${input.question.questionId}`,
    schema: investigationSchema,
    outputName: "SingleQuestionInvestigation",
    outputDescription: "One narrow investigation answer without fixes.",
    instructions:
      "You are a single-question investigator. Answer exactly the question using only matching traces. Do not propose fixes or implementation changes. Be honest about missing evidence and recurrence. Classify reliability only for broken tools, provider failures, failed jobs, or unavailable systems. Classify missing proactive workflow, repeated admin burden, memory/context gaps, document tracking gaps, follow-up gaps, and task extraction gaps as capability, even when they cause delays.",
    promptPayload: {
      role: "single_question_investigator",
      question: input.question,
      matchingTraces: renderTracesForPrompt(input.traces),
    },
  });
}

async function runPatternClusterer(input: {
  investigations: Investigation[];
  traces: CompactTrace[];
}): Promise<Pattern[]> {
  const result = await runStage({
    stage: "pattern_clusterer",
    schema: patternSetSchema,
    outputName: "TraceImprovementPatterns",
    outputDescription: "Recurring patterns or one-off severe findings.",
    instructions:
      "Cluster investigation reports into recurring patterns and one-off severe findings. Do not propose fixes. Separate reliability from capability. Reliability is for broken tools, provider failures, failed jobs, or unavailable systems. Capability is for missing proactive workflow, repeated admin burden, memory/context gaps, document tracking gaps, follow-up gaps, and task extraction gaps. Prefer patterns backed by multiple refs, but keep one-off severe reliability blockers when evidence is strong.",
    promptPayload: {
      role: "pattern_clusterer",
      investigations: input.investigations,
      compactTraces: renderTracesForPrompt(input.traces),
    },
  });
  return result.patterns;
}

async function runIssuePacketBuilder(input: {
  patterns: Pattern[];
  traces: CompactTrace[];
  maxIssuePackets: number;
}): Promise<IssuePacket[]> {
  const result = await runStage({
    stage: "issue_packet_builder",
    schema: issuePacketSetSchema,
    outputName: "TraceImprovementIssuePackets",
    outputDescription: "Issue packets ready for fix classification.",
    instructions:
      "Build issue packets from patterns. Include lane, category, representative refs, impact, prevalence, evidence strength, risk, likely owner layer, and missing evidence. Do not propose fixes yet. Keep only the highest-value packets, preserving capability items when evidence supports them. Use reliability only for broken tools, provider failures, failed jobs, or unavailable systems. Use capability for memory/context resolution, document tracking, follow-up management, task extraction, notification quality, approval shortcuts, drafting help, or better client experience.",
    promptPayload: {
      role: "issue_packet_builder",
      maxIssuePackets: input.maxIssuePackets,
      patterns: input.patterns,
      compactTraces: renderTracesForPrompt(input.traces),
    },
  });
  return result.issuePackets.slice(0, input.maxIssuePackets);
}

async function runFixLayerClassifier(issuePacket: IssuePacket): Promise<FixLayerDecision> {
  return runStage({
    stage: `fix_layer_classifier.${issuePacket.issueId}`,
    schema: fixLayerDecisionSchema,
    outputName: "TraceImprovementFixLayerDecision",
    outputDescription: "One fix layer decision.",
    instructions:
      "Classify exactly one issue packet into the smallest appropriate fix layer. Do not propose the fix. Use maintainer backlog for work that requires product/integration investigation outside profile guidance.",
    promptPayload: {
      role: "fix_layer_classifier",
      issuePacket,
      allowedLayers: ownerLayerSchema.options,
    },
  });
}

async function runFixProposer(input: {
  issuePacket: IssuePacket;
  layerDecision: FixLayerDecision;
}): Promise<Proposal> {
  return runStage({
    stage: `fix_proposer.${input.issuePacket.issueId}`,
    schema: proposalSchema,
    outputName: "TraceImprovementProposal",
    outputDescription: "Smallest useful recommendation for one issue.",
    instructions:
      "Propose exactly one smallest useful fix. Reject invented endpoints, channels, exact cadences, exact thresholds, percentage impact claims, OAuth scopes, storage surfaces, direct links, or provider writes unless evidence proves them. Guidance can change assistant behavior, but cannot actively poll providers or repair integrations by itself. For API/provider reliability issues, prefer structured error classification, idempotency-aware retry for confirmed transient operations, maintainer alerts, and graceful user-visible failure states; do not invent cache fallback, circuit breakers, or retry counts unless existing code/evidence proves those mechanisms. For repeated clarification/context issues, prefer an evidence-backed resolver or memory map that stores contact/client/deal/folder aliases, confidence, and safe multiple-choice escalation; do not rely on email-domain-only inference, personal-domain guesses, or defaulting to Uncategorized as the fix. For document tracking, prefer a pending-document tracker tied to existing deal/workflow surfaces and approval/review behavior; do not invent automatic external email reminders or provider writes unless evidence proves those destinations are available and appropriate. For semantic workflow improvements, prefer a reviewed assistant workflow or evaluator-backed proposal over brittle regex-only parsing unless the evidence proves the text pattern is simple and stable.",
    promptPayload: {
      role: "fix_proposer",
      issuePacket: input.issuePacket,
      layerDecision: input.layerDecision,
    },
  });
}

async function runEvaluatorBuilder(input: {
  issuePacket: IssuePacket;
  proposal: Proposal;
}): Promise<EvaluatorArtifact> {
  return runStage({
    stage: `evaluator_builder.${input.issuePacket.issueId}`,
    schema: evaluatorArtifactSchema,
    outputName: "TraceImprovementEvaluatorArtifact",
    outputDescription: "Regression and evaluator artifact for one recommendation.",
    instructions:
      "Build an evaluator artifact for this recommendation. Include regression examples, deterministic checks where possible, an LLM judge rubric for semantic behavior, and post-deploy measurement. State what the artifact proves and does not prove. Do not invent exact timing intervals, reminder cadences, unsupported task destinations, or provider writes; describe those as maintainer-reviewed implementation details unless evidence proves them.",
    promptPayload: {
      role: "evaluator_builder",
      issuePacket: input.issuePacket,
      proposal: input.proposal,
    },
  });
}

async function runReplayValidator(input: {
  issuePacket: IssuePacket;
  proposal: Proposal;
  evaluator: EvaluatorArtifact;
  traces: CompactTrace[];
}): Promise<ReplayValidation> {
  return runStage({
    stage: `replay_validator.${input.issuePacket.issueId}`,
    schema: replayValidationSchema,
    outputName: "TraceImprovementReplayValidation",
    outputDescription: "Replay-style validation for one proposed fix.",
    instructions:
      "Replay the proposed fix against representative traces. Decide whether it would have helped, with confidence and risks. Be skeptical about generic advice, domain-only inference, default Uncategorized behavior, invented reminders, unsupported provider writes, and broad automation without a safety check. Do not reject practical capability improvements only because they need maintainer review.",
    promptPayload: {
      role: "replay_validator",
      issuePacket: input.issuePacket,
      proposal: input.proposal,
      evaluator: input.evaluator,
      representativeTraces: renderTracesForPrompt(input.traces),
    },
  });
}

async function runRiskDuplicateCritic(input: {
  issuePacket: IssuePacket;
  proposal: Proposal;
  validation: ReplayValidation;
  evaluator: EvaluatorArtifact;
  durableContext: JsonRecord;
  acceptedSoFar: Proposal[];
}): Promise<Critique> {
  return runStage({
    stage: `risk_duplicate_critic.${input.issuePacket.issueId}`,
    schema: critiqueSchema,
    outputName: "TraceImprovementCritique",
    outputDescription: "Risk, duplicate, and lifecycle decision.",
    instructions:
      "Critique exactly one proposal. Check client annoyance, unsafe action risk, duplicate or overkill risk, and mismatch with existing guidance/workflows/tools. Use already_covered_but_broken when evidence shows an intended loop exists but failed. Reject recommendations without adequate evidence or evaluator artifact.",
    promptPayload: {
      role: "risk_duplicate_critic",
      durableContext: input.durableContext,
      issuePacket: input.issuePacket,
      proposal: input.proposal,
      validation: input.validation,
      evaluator: input.evaluator,
      acceptedSoFar: input.acceptedSoFar,
    },
  });
}

async function runPortfolioBalancer(input: {
  roleProfile: RoleProfile;
  issuePackets: IssuePacket[];
  proposals: Proposal[];
  evaluators: EvaluatorArtifact[];
  validations: ReplayValidation[];
  critiques: Critique[];
}): Promise<FinalPortfolio> {
  return runStage({
    stage: "portfolio_balancer",
    schema: finalPortfolioSchema,
    outputName: "TraceImprovementFinalPortfolio",
    outputDescription: "Balanced reliability and capability recommendations.",
    instructions:
      "Produce the final portfolio. Separate reliability and capability lanes. Every final recommendation must include the matching evaluator artifact. Final recommendations may only use decisions implement_now, needs_maintainer_review, or already_covered_but_broken. Put promising_needs_more_evidence items only in promisingNeedsMoreEvidence, not in reliabilityRecommendations or capabilityRecommendations. Do not create recommendations from rejected items. Keep generic enough for any client role while staying evidence-specific. If capability evidence is weak, say that rather than inventing capability recommendations. Do not invent exact thresholds, percentages, cache fallback, circuit breakers, retry counts, reminder cadences, or unsupported provider writes unless the proposal/evidence proves them.",
    promptPayload: {
      role: "portfolio_balancer",
      roleProfile: input.roleProfile,
      issuePackets: input.issuePackets,
      proposals: input.proposals,
      evaluators: input.evaluators,
      validations: input.validations,
      critiques: input.critiques,
    },
  });
}

function relatedTracesForIssue(issuePacket: IssuePacket, traces: readonly CompactTrace[]) {
  const refs = new Set(issuePacket.representativeEvidenceRefs);
  return traces
    .filter(
      (trace) =>
        refs.has(trace.traceId) ||
        trace.refs.some((ref) => refs.has(ref) || refs.has(`trace:${ref}`)),
    )
    .slice(0, 14);
}

function normalizeTraceRef(ref: string): string {
  return ref.startsWith("trace:") ? ref.slice("trace:".length) : ref;
}

function normalizeEvidenceRefList(
  refs: readonly string[],
  validRefs: ReadonlySet<string>,
  fallbackRefs: readonly string[],
): string[] {
  const normalized = refs
    .map((ref) => (validRefs.has(ref) ? ref : normalizeTraceRef(ref)))
    .filter((ref) => validRefs.has(ref));
  if (normalized.length > 0) return [...new Set(normalized)];
  return [...new Set(fallbackRefs.map(normalizeTraceRef).filter((ref) => validRefs.has(ref)))].slice(
    0,
    6,
  );
}

function normalizeIssuePacketLanes(issuePackets: readonly IssuePacket[]): IssuePacket[] {
  return issuePackets.map((issuePacket) => {
    const text =
      `${issuePacket.issueId} ${issuePacket.title} ${issuePacket.category} ${issuePacket.impact}`.toLowerCase();
    const isHardReliability =
      /api|graphql|drive unavailable|webhook|credential|integration|failed job|service failure|error/.test(
        text,
      );
    const isCapabilityOpportunity =
      /clarification|memory|context|association|next.?step|follow.?up|document|payment|deadline|owner|tracker|draft/.test(
        text,
      );
    if (isCapabilityOpportunity && !isHardReliability) {
      return { ...issuePacket, lane: "capability" } satisfies IssuePacket;
    }
    return issuePacket;
  });
}

function scrubInventedTiming(text: string): string {
  return text
    .replace(
      /with a maximum of \d+ retries and a backoff factor of \d+,?\s*/gi,
      "using the repo's reviewed retry policy, ",
    )
    .replace(/up to \d+ retries/gi, "bounded retries")
    .replace(/retrying up to \d+ times with backoff factor \d+/gi, "using bounded retries")
    .replace(/retry up to \d+ times[^.]*\./gi, "Use the repo's reviewed retry policy for transient provider failures.")
    .replace(/after \d+ consecutive failures/gi, "after the reviewed failure threshold")
    .replace(/after N consecutive failures/gi, "after the reviewed failure threshold")
    .replace(/confidence\s*[><=]+\s*0\.\d+/gi, "high confidence")
    .replace(/\b0\.\d+\b/gi, "a reviewed confidence threshold")
    .replace(/confidence threshold[^,.]*/gi, "confidence threshold")
    .replace(/by\s*~?\d+%/gi, "materially")
    .replace(/>\d+%/gi, "a material")
    .replace(/≥\d+%/gi, "a material")
    .replace(/\d+% reduction/gi, "material reduction")
    .replace(/\d+%/gi, "a measured percentage")
    .replace(/\bmax retries\b/gi, "the retry limit")
    .replace(/\bmaximum retries is strictly \d+\b/gi, "the retry limit is enforced")
    .replace(/\bup to \d+ times\b/gi, "a bounded number of times")
    .replace(/\b\d+\s+consecutive failures\b/gi, "the reviewed failure threshold")
    .replace(/\b1s\b|\b2s\b|\b4s\b|\b\d+\s*(seconds?|minutes?|hours?)\b/gi, "a reviewed interval");
}

function scrubEvaluatorArtifact(evaluator: EvaluatorArtifact): EvaluatorArtifact {
  const scrubEvaluatorLogic = (text: string) =>
    scrubInventedTiming(text)
      .replace(/Empty map returns high confidence for any email/gi, "Empty map returns no confident match for any email")
      .replace(/high confidence triggers clarification prompt/gi, "low confidence triggers clarification prompt")
      .replace(/401, 403, 404, 500/gi, "401, 403, 404")
      .replace(/status codes 429, 503, 504 and network timeouts/gi, "status codes 429, 500, 503, 504 and network timeouts");
  return {
    ...evaluator,
    proves: scrubEvaluatorLogic(evaluator.proves),
    doesNotProve: scrubEvaluatorLogic(evaluator.doesNotProve),
    regressionExamples: evaluator.regressionExamples.map(scrubEvaluatorLogic),
    deterministicChecks: evaluator.deterministicChecks.map(scrubEvaluatorLogic),
    llmJudgeRubric: scrubEvaluatorLogic(evaluator.llmJudgeRubric),
    postDeployMeasurement: scrubEvaluatorLogic(evaluator.postDeployMeasurement),
  };
}

function applyDeterministicAudit(input: {
  portfolio: FinalPortfolio;
  chunks: TraceChunk[];
  proposals: Proposal[];
}): FinalPortfolio {
  const validRefs = new Set(input.chunks.map((chunk) => chunk.ref));
  const activeChannels = new Set(
    input.chunks
      .filter((chunk) => chunk.kind === "integration_channel")
      .map((chunk) => `${chunk.title ?? ""} ${chunk.excerpt}`.toLowerCase()),
  );
  const evidenceFallback = input.proposals.flatMap((proposal) => proposal.evidenceRefs);
  const cleanRecommendation = (
    recommendation: z.infer<typeof finalRecommendationSchema>,
  ): z.infer<typeof finalRecommendationSchema> => {
    let next = {
      ...recommendation,
      evidenceRefs: normalizeEvidenceRefList(recommendation.evidenceRefs, validRefs, evidenceFallback),
    };
    const text = `${next.title} ${next.action}`.toLowerCase();
    if (text.includes("webhook") && next.action.toLowerCase().includes("guidance")) {
      next = {
        ...next,
        action:
          "Create a maintainer backlog item to repair the affected webhook or provider reliability loop. Keep runtime guidance out of active provider repair unless a separate product workflow consumes it.",
        notOverkillBecause:
          "Webhook repair is an integration reliability concern; assigning it to maintainer/product work avoids pretending guidance can repair providers.",
      };
    }
    if (
      /\bevery\s+\d+|\b\d+\s*(s|sec|seconds?|minutes?|hours?)\b|\b[124]s\b|\b9\s*am\b|\b5\s*pm\b/i.test(
        next.action,
      )
    ) {
      next = {
        ...next,
        action: scrubInventedTiming(next.action).replace(/\bwithin minutes\b/gi, "promptly"),
        notOverkillBecause:
          "The diagnostic evidence does not justify an exact cadence, so timing stays a maintainer-reviewed implementation detail.",
      };
    }
    if (/oauth token|fresh oauth|new credentials/i.test(next.action)) {
      next = {
        ...next,
        action: next.action.replace(
          /providing fresh OAuth tokens|generate new credentials and update the integration configuration|fresh OAuth tokens/gi,
          "the supported OAuth reauthorization flow",
        ),
      };
    }
    if (/slack|outlook|whatsapp|imessage|sms/.test(text)) {
      const channelMentionAllowed = [...activeChannels].some((channel) =>
        /slack|outlook|whatsapp|imessage|sms/.test(channel),
      );
      if (!channelMentionAllowed) {
        next = {
          ...next,
          action: next.action.replace(/Slack|Outlook|WhatsApp|iMessage|SMS/gi, "the active client channel"),
        };
      }
    }
    if (/truncat|excerpt|field limit/i.test(text)) {
      next = {
        ...next,
        decision: "promising_needs_more_evidence",
        action:
          "Investigate whether source traces lack required detail before recommending storage or field-size changes. Prompt excerpts alone are not evidence of product truncation.",
      };
    }
    if (
      next.decision === "implement_now" &&
      next.lane === "capability" &&
      /resolver|memory map|client\/deal|client and deal|folder alias|context memory|confidence/.test(
        `${next.title} ${next.action}`.toLowerCase(),
      )
    ) {
      next = {
        ...next,
        decision: "needs_maintainer_review",
        notOverkillBecause:
          "Context and memory changes can prevent repeated clarification, but they can also misfile client work. Maintainer review is the right first lifecycle step for the resolver policy and confirmation thresholds.",
      };
    }
    next = {
      ...next,
      action: scrubInventedTiming(next.action),
      whyThisHelpsClient: scrubInventedTiming(next.whyThisHelpsClient),
      validationSummary: scrubInventedTiming(next.validationSummary),
      notOverkillBecause: scrubInventedTiming(next.notOverkillBecause),
      evaluatorArtifact: scrubEvaluatorArtifact(next.evaluatorArtifact),
    };
    return next;
  };
  const cleanedReliability = input.portfolio.reliabilityRecommendations.map(cleanRecommendation);
  const cleanedCapability = input.portfolio.capabilityRecommendations.map(cleanRecommendation);
  const misplacedPromising = [...cleanedReliability, ...cleanedCapability]
    .filter((recommendation) => recommendation.decision === "promising_needs_more_evidence")
    .map((recommendation) => ({
      title: recommendation.title,
      reason: recommendation.validationSummary,
      evidenceRefs: recommendation.evidenceRefs,
    }));

  return {
    ...input.portfolio,
    reliabilityRecommendations: cleanedReliability.filter(
      (recommendation) => recommendation.decision !== "promising_needs_more_evidence",
    ),
    capabilityRecommendations: cleanedCapability.filter(
      (recommendation) => recommendation.decision !== "promising_needs_more_evidence",
    ),
    promisingNeedsMoreEvidence: [
      ...input.portfolio.promisingNeedsMoreEvidence,
      ...misplacedPromising,
    ].slice(0, 8),
  };
}

function formatMarkdown(input: {
  snapshot: string;
  profileId: string;
  chunkCount: number;
  labeledChunkCount: number;
  roleProfile: RoleProfile;
  selectedLenses: SelectedLens[];
  questions: InvestigationQuestion[];
  investigations: Investigation[];
  patterns: Pattern[];
  issuePackets: IssuePacket[];
  layerDecisions: FixLayerDecision[];
  proposals: Proposal[];
  evaluators: EvaluatorArtifact[];
  validations: ReplayValidation[];
  critiques: Critique[];
  portfolio: FinalPortfolio;
}): string {
  const lines: string[] = [
    "# Trace Improvement Flow Prototype",
    "",
    `Snapshot: ${input.snapshot}`,
    `Profile: ${input.profileId}`,
    `Trace chunks built: ${input.chunkCount}`,
    `Chunks semantically labeled: ${input.labeledChunkCount}`,
    "",
    "## Role Profile",
    "",
    `Role: ${input.roleProfile.inferredAssistantRole}`,
    `Domain: ${input.roleProfile.clientWorkDomain}`,
    `Confidence: ${input.roleProfile.confidence}`,
    "",
    "10x definition:",
    input.roleProfile.tenXDefinition,
    "",
    "Primary outcomes:",
    ...input.roleProfile.primaryOutcomes.map((item) => `- ${item}`),
    "",
    "## Selected Lenses",
    "",
    ...input.selectedLenses.map(
      (lens) =>
        `- ${STATIC_LENSES[lens.lensId].title} (${lens.relevance}): ${lens.rationale} Evidence: ${lens.evidenceRefs.join(", ") || "none"}`,
    ),
    "",
    "## Generated Questions",
    "",
  ];

  for (const question of input.questions) {
    lines.push(
      `- ${question.question}`,
      `  Evidence: ${question.evidenceRefs.join(", ")}`,
      `  Why: ${question.whyThisQuestionExists}`,
      `  Scope: ${question.scope}`,
      `  Out of scope: ${question.outOfScope}`,
      "",
    );
  }

  lines.push("## Investigated Patterns", "");
  for (const pattern of input.patterns) {
    lines.push(
      `- ${pattern.title} (${pattern.lane}, ${pattern.prevalence}): ${pattern.description}`,
      `  Evidence: ${pattern.representativeEvidenceRefs.join(", ")}`,
      "",
    );
  }

  lines.push("## Issue Packets", "");
  for (const issue of input.issuePackets) {
    const layer = input.layerDecisions.find((item) => item.issueId === issue.issueId);
    lines.push(
      `- ${issue.title} (${issue.lane})`,
      `  Impact: ${issue.impact}`,
      `  Evidence strength: ${issue.evidenceStrength}`,
      `  Owner layer: ${layer?.layer ?? issue.likelyOwnerLayer}`,
      `  Evidence: ${issue.representativeEvidenceRefs.join(", ")}`,
      "",
    );
  }

  lines.push("## Final Recommendations", "", "### Reliability Lane", "");
  if (input.portfolio.reliabilityRecommendations.length === 0) {
    lines.push("- No reliability recommendation survived validation.", "");
  } else {
    for (const recommendation of input.portfolio.reliabilityRecommendations) {
      lines.push(...formatRecommendation(recommendation));
    }
  }

  lines.push("### Capability Lane", "");
  if (input.portfolio.capabilityRecommendations.length === 0) {
    lines.push("- No capability recommendation survived validation.", "");
  } else {
    for (const recommendation of input.portfolio.capabilityRecommendations) {
      lines.push(...formatRecommendation(recommendation));
    }
  }

  lines.push("## Evaluator Artifacts", "");
  for (const evaluator of input.evaluators) {
    lines.push(
      `- ${evaluator.issueId}`,
      `  Proves: ${evaluator.proves}`,
      `  Does not prove: ${evaluator.doesNotProve}`,
      `  Regression examples: ${evaluator.regressionExamples.join(" | ")}`,
      `  Deterministic checks: ${evaluator.deterministicChecks.join(" | ") || "none"}`,
      `  LLM judge rubric: ${evaluator.llmJudgeRubric}`,
      `  Post-deploy measurement: ${evaluator.postDeployMeasurement}`,
      "",
    );
  }

  lines.push("## Validation Summary", "");
  for (const validation of input.validations) {
    const critique = input.critiques.find((item) => item.issueId === validation.issueId);
    lines.push(
      `- ${validation.issueId}: ${validation.wouldHaveHelped} (${validation.confidence}); decision ${critique?.decision ?? "unknown"}. ${validation.evidenceBasedReason}`,
    );
  }
  lines.push("", `Lane balance: ${input.portfolio.laneBalance}`, "");

  if (input.portfolio.promisingNeedsMoreEvidence.length > 0) {
    lines.push("## Promising But Needs More Evidence", "");
    for (const item of input.portfolio.promisingNeedsMoreEvidence) {
      lines.push(`- ${item.title}: ${item.reason}`);
    }
    lines.push("");
  }

  if (input.portfolio.rejectedOrDeferred.length > 0) {
    lines.push("## Rejected Or Deferred", "");
    for (const item of input.portfolio.rejectedOrDeferred) {
      lines.push(`- ${item.title}: ${item.reason}`);
    }
    lines.push("");
  }

  lines.push("## Intermediate Investigation Answers", "");
  for (const investigation of input.investigations) {
    lines.push(
      `- ${investigation.questionId} (${investigation.likelyLane}, ${investigation.recurrence}, ${investigation.confidence}): ${investigation.answer}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function formatRecommendation(
  recommendation: z.infer<typeof finalRecommendationSchema>,
): string[] {
  return [
    `${recommendation.rank}. ${recommendation.title}`,
    `   - Decision: ${recommendation.decision}`,
    `   - Priority: ${recommendation.priority}`,
    `   - Action: ${recommendation.action}`,
    `   - Why: ${recommendation.whyThisHelpsClient}`,
    `   - Evidence: ${recommendation.evidenceRefs.join(", ")}`,
    `   - Evaluator: ${recommendation.evaluatorArtifact.proves}`,
    `   - Validation: ${recommendation.validationSummary}`,
    `   - Not overkill: ${recommendation.notOverkillBecause}`,
    "",
  ];
}

export async function runTraceImprovementFlowCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  selectedModel = args.model;
  auditDir = args["audit-dir"] ? path.resolve(args["audit-dir"]) : null;
  auditSequence = 0;
  assertRuntimeProfile(args["env-profile"]);
  loadProfileDotEnv(args["env-profile"]);

  const resolvedSnapshotPath = snapshotPath(args.snapshot);
  const snapshot = await readSnapshot(resolvedSnapshotPath, args.client);
  const profileRecord = recordValue(snapshot.profile);
  const profileId = stringValue(profileRecord, "id") ?? args.client;
  const durableContext = compactDurableContext(snapshot);
  const chunks = buildTraceChunks(snapshot);
  if (chunks.length === 0) {
    throw new Error(
      `No trace chunks found in ${resolvedSnapshotPath}. Pass a generated client-state summary or --client for aggregate summaries.`,
    );
  }
  await writeAuditStage({
    stage: "deterministic_chunk_builder",
    kind: "deterministic",
    input: {
      snapshot: resolvedSnapshotPath,
      client: args.client,
      summarySections: Object.keys(snapshot),
    },
    output: {
      chunkCount: chunks.length,
      chunksByKind: chunks.reduce<Record<string, number>>((counts, chunk) => {
        counts[chunk.kind] = (counts[chunk.kind] ?? 0) + 1;
        return counts;
      }, {}),
      chunksBySignal: chunks.reduce<Record<string, number>>((counts, chunk) => {
        for (const signal of chunk.structuralSignals) {
          counts[signal] = (counts[signal] ?? 0) + 1;
        }
        return counts;
      }, {}),
      sampleChunks: chunks.slice(0, 20),
    },
  });

  const prioritizedChunks = prioritizeChunks(chunks, args["max-chunks"]);
  await writeAuditStage({
    stage: "chunk_prioritizer",
    kind: "deterministic",
    input: {
      maxChunks: args["max-chunks"],
      totalChunks: chunks.length,
    },
    output: {
      prioritizedCount: prioritizedChunks.length,
      prioritizedRefs: prioritizedChunks.map((chunk) => chunk.ref),
      prioritizedChunks,
    },
  });
  const labels = await labelChunks({ chunks: prioritizedChunks, durableContext });
  const compactTraces = mergeCompactTraces(prioritizedChunks, labels);
  await writeAuditStage({
    stage: "trace_merger_compactor",
    kind: "deterministic",
    input: {
      prioritizedChunks,
      labels,
    },
    output: {
      compactTraceCount: compactTraces.length,
      compactTraces,
    },
  });
  const roleProfile = await runRoleProfiler({ durableContext, traces: compactTraces });
  const selectedLenses = await runLensSelector({ roleProfile, traces: compactTraces });
  const questions = await runQuestionGenerator({
    maxQuestions: args["max-questions"],
    roleProfile,
    selectedLenses,
    traces: compactTraces,
  });

  const investigations: Investigation[] = [];
  for (const question of questions) {
    investigations.push(
      await runInvestigator({
        question,
        traces: matchingTraces(question, compactTraces),
      }),
    );
  }

  const patterns = await runPatternClusterer({ investigations, traces: compactTraces });
  const rawIssuePackets = await runIssuePacketBuilder({
    patterns,
    traces: compactTraces,
    maxIssuePackets: args["max-issue-packets"],
  });
  const issuePackets = normalizeIssuePacketLanes(rawIssuePackets);
  await writeAuditStage({
    stage: "issue_packet_lane_normalizer",
    kind: "deterministic",
    input: {
      rawIssuePackets,
    },
    output: {
      issuePackets,
    },
  });

  const layerDecisions: FixLayerDecision[] = [];
  const proposals: Proposal[] = [];
  const evaluators: EvaluatorArtifact[] = [];
  const validations: ReplayValidation[] = [];
  const critiques: Critique[] = [];
  const acceptedSoFar: Proposal[] = [];

  for (const issuePacket of issuePackets) {
    const layerDecision = await runFixLayerClassifier(issuePacket);
    layerDecisions.push(layerDecision);
    const proposal = await runFixProposer({ issuePacket, layerDecision });
    proposals.push(proposal);
    const evaluator = await runEvaluatorBuilder({ issuePacket, proposal });
    evaluators.push(evaluator);
    const validation = await runReplayValidator({
      issuePacket,
      proposal,
      evaluator,
      traces: relatedTracesForIssue(issuePacket, compactTraces),
    });
    validations.push(validation);
    const critique = await runRiskDuplicateCritic({
      issuePacket,
      proposal,
      validation,
      evaluator,
      durableContext,
      acceptedSoFar,
    });
    critiques.push(critique);
    if (
      critique.decision === "implement_now" ||
      critique.decision === "needs_maintainer_review" ||
      critique.decision === "already_covered_but_broken"
    ) {
      acceptedSoFar.push(proposal);
    }
  }

  const scrubbedEvaluators = evaluators.map(scrubEvaluatorArtifact);
  const portfolioBeforeAudit = await runPortfolioBalancer({
    roleProfile,
    issuePackets,
    proposals,
    evaluators: scrubbedEvaluators,
    validations,
    critiques,
  });
  const portfolio = applyDeterministicAudit({
    portfolio: portfolioBeforeAudit,
    chunks,
    proposals,
  });
  await writeAuditStage({
    stage: "final_deterministic_audit",
    kind: "deterministic",
    input: {
      portfolioBeforeAudit,
      proposals,
    },
    output: {
      portfolio,
    },
  });

  const output = {
    snapshot: resolvedSnapshotPath,
    profileId,
    chunkCount: chunks.length,
    labeledChunkCount: labels.length,
    prioritizedChunks,
    labels,
    compactTraces,
    roleProfile,
    selectedLenses,
    questions,
    investigations,
    patterns,
    issuePackets,
    layerDecisions,
    proposals,
    evaluators: scrubbedEvaluators,
    validations,
    critiques,
    portfolioBeforeAudit,
    portfolio,
  };

  if (args.format === "json") {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(
    formatMarkdown({
      snapshot: resolvedSnapshotPath,
      profileId,
      chunkCount: chunks.length,
      labeledChunkCount: labels.length,
      roleProfile,
      selectedLenses,
      questions,
      investigations,
      patterns,
      issuePackets,
      layerDecisions,
      proposals,
      evaluators: scrubbedEvaluators,
      validations,
      critiques,
      portfolio,
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runTraceImprovementFlowCli());
}
