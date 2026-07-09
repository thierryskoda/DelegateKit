#!/usr/bin/env tsx

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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

const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_MAX_PROBLEMS = 6;
const DEFAULT_MAX_ISSUE_PACKETS = 4;
const DEFAULT_PROMPT_RECORDS = 80;
const PROMPT_MAX_CHARS = 55_000;
const STAGE_TIMEOUT_MS = 45_000;
const STAGE_MAX_OUTPUT_TOKENS = 10_000;

let selectedModel = DEFAULT_MODEL;
const root = repoRoot(import.meta.url);

type JsonRecord = Record<string, unknown>;

const cliSchema = z
  .object({
    help: z.boolean().optional(),
    snapshot: z.string().optional(),
    summary: z.string().optional(),
    client: z.string().default("testing"),
    "env-profile": z.string().default("dev"),
    model: z.string().default(DEFAULT_MODEL),
    format: z.enum(["markdown", "json"]).default("markdown"),
    "max-problems": z.coerce.number().int().min(1).max(20).default(DEFAULT_MAX_PROBLEMS),
    "max-issue-packets": z.coerce
      .number()
      .int()
      .min(1)
      .max(12)
      .default(DEFAULT_MAX_ISSUE_PACKETS),
    out: z.string().optional(),
    "out-dir": z.string().optional(),
    "dry-run": z.boolean().optional(),
  })
  .strict();

type CliArgs = z.infer<typeof cliSchema>;

const laneSchema = z.enum(["reliability", "capability"]);
const severitySchema = z.enum(["critical", "high", "medium", "low"]);
const evidenceStrengthSchema = z.enum(["strong", "medium", "weak", "needs_more_evidence"]);
const ownerLayerSchema = z.enum([
  "reliability_code",
  "tool_api",
  "workflow_orchestration",
  "context_retrieval",
  "memory_policy",
  "prompt_guidance",
  "product_ui",
  "approval_escalation",
  "maintainer_backlog",
]);

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
    status: z.string().trim().min(1).nullable(),
    occurredAt: z.string().trim().min(1).nullable(),
    title: z.string().trim().min(1).nullable(),
    excerpt: z.string().trim().min(1),
    targetRefs: z.array(z.string().trim().min(1)).max(20),
    excerpted: z.boolean(),
    signals: z.array(signalSchema),
  })
  .strict();

const problemFindingSchema = z
  .object({
    problemId: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/),
    lane: laneSchema,
    category: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(180),
    summary: z.string().trim().min(1).max(900),
    severity: severitySchema,
    evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(20),
    missingEvidence: z.array(z.string().trim().min(1).max(260)).max(8),
  })
  .strict();

const contextDossierSchema = z
  .object({
    problemId: z.string().trim().min(1),
    lane: laneSchema,
    problemSummary: z.string().trim().min(1).max(900),
    relevantEvidence: z.array(normalizedEvidenceSchema).min(1).max(40),
    relatedGuidanceRefs: z.array(z.string().trim().min(1)).max(20),
    relatedWorkflowRefs: z.array(z.string().trim().min(1)).max(20),
    knownContext: z.string().trim().min(1).max(1_500),
    missingContext: z.array(z.string().trim().min(1).max(260)).max(10),
    investigatorBoundary: z.string().trim().min(1).max(600),
  })
  .strict();

const investigationSchema = z
  .object({
    problemId: z.string().trim().min(1),
    isRealProblem: z.boolean(),
    recurrence: z.enum(["one_off", "possibly_recurring", "recurring", "unclear"]),
    importance: z.enum(["low", "medium", "high"]),
    confidence: z.enum(["low", "medium", "high"]),
    answer: z.string().trim().min(1).max(1_500),
    supportingRefs: z.array(z.string().trim().min(1)).min(1).max(20),
    counterRefs: z.array(z.string().trim().min(1)).max(20),
    likelyOwnerLayer: ownerLayerSchema,
    missingEvidence: z.array(z.string().trim().min(1).max(260)).max(8),
  })
  .strict();

const investigationResultSchema = z.object({ investigation: investigationSchema }).strict();

const clusterSchema = z
  .object({
    clusterId: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/),
    lane: laneSchema,
    title: z.string().trim().min(1).max(180),
    summary: z.string().trim().min(1).max(900),
    investigationProblemIds: z.array(z.string().trim().min(1)).min(1).max(12),
    representativeEvidenceRefs: z.array(z.string().trim().min(1)).min(1).max(20),
    prevalence: z.enum(["one_off_severe", "weak", "moderate", "strong"]),
    evidenceStrength: evidenceStrengthSchema,
  })
  .strict();

const clusterSetSchema = z.object({ clusters: z.array(clusterSchema).min(1).max(12) }).strict();

const issuePacketSchema = z
  .object({
    issueId: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/),
    lane: laneSchema,
    category: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(180),
    summary: z.string().trim().min(1).max(1_200),
    impact: z.string().trim().min(1).max(900),
    prevalence: z.enum(["one_off_severe", "weak", "moderate", "strong"]),
    severity: severitySchema,
    evidenceStrength: evidenceStrengthSchema,
    likelyOwnerLayer: ownerLayerSchema,
    representativeEvidenceRefs: z.array(z.string().trim().min(1)).min(1).max(20),
    counterEvidenceRefs: z.array(z.string().trim().min(1)).max(20),
    missingEvidence: z.array(z.string().trim().min(1).max(260)).max(8),
    decisionState: z.enum(["ready_for_fix", "needs_more_evidence", "reject"]),
  })
  .strict();

const issuePacketSetSchema = z
  .object({ issuePackets: z.array(issuePacketSchema).min(1).max(12) })
  .strict();

const fixProposalSchema = z
  .object({
    issueId: z.string().trim().min(1),
    title: z.string().trim().min(1).max(180),
    ownerLayer: ownerLayerSchema,
    recommendation: z.string().trim().min(1).max(1_200),
    smallestUsefulVersion: z.string().trim().min(1).max(900),
    whyThisHelpsClient: z.string().trim().min(1).max(900),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(20),
    rejectedInventedSurfaceCheck: z.string().trim().min(1).max(700),
  })
  .strict();

const fixProposalResultSchema = z.object({ proposal: fixProposalSchema }).strict();

const evaluatorArtifactSchema = z
  .object({
    issueId: z.string().trim().min(1),
    proves: z.string().trim().min(1).max(900),
    doesNotProve: z.string().trim().min(1).max(900),
    regressionExamples: z
      .array(
        z
          .object({
            evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(10),
            expectedBetterBehavior: z.string().trim().min(1).max(600),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    deterministicChecks: z.array(z.string().trim().min(1).max(400)).max(8),
    llmJudgeRubric: z.string().trim().min(1).max(1_200).nullable(),
    humanReviewNotes: z.string().trim().min(1).max(900).nullable(),
    postChangeMetric: z.string().trim().min(1).max(600),
  })
  .strict();

const evaluatorArtifactResultSchema = z.object({ evaluator: evaluatorArtifactSchema }).strict();

const validationResultSchema = z
  .object({
    issueId: z.string().trim().min(1),
    decision: z.enum([
      "recommend",
      "needs_maintainer_review",
      "needs_more_evidence",
      "already_covered_but_broken",
      "reject",
    ]),
    wouldHaveHelped: z.enum(["yes", "probably", "unclear", "probably_not", "no"]),
    confidence: z.enum(["low", "medium", "high"]),
    validationSummary: z.string().trim().min(1).max(900),
    duplicateOrOverkillRisk: z.enum(["low", "medium", "high"]),
    riskNotes: z.array(z.string().trim().min(1).max(300)).max(8),
    requiredAdjustment: z.string().trim().min(1).max(700).nullable(),
  })
  .strict();

const validationResultObjectSchema = z.object({ validation: validationResultSchema }).strict();

const finalRecommendationSchema = z
  .object({
    issuePacket: issuePacketSchema,
    proposal: fixProposalSchema,
    evaluatorArtifact: evaluatorArtifactSchema,
    validationResult: validationResultSchema,
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.validationResult.decision === "recommend") {
      if (item.issuePacket.representativeEvidenceRefs.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["issuePacket", "representativeEvidenceRefs"],
          message: "Recommended items require representative evidence.",
        });
      }
      if (item.evaluatorArtifact.regressionExamples.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["evaluatorArtifact", "regressionExamples"],
          message: "Recommended items require evaluator regression examples.",
        });
      }
    }
  });

const labReportSchema = z
  .object({
    clientId: z.string().trim().min(1),
    sourcePath: z.string().trim().min(1),
    dryRun: z.boolean(),
    evidence: z.array(normalizedEvidenceSchema),
    findings: z.array(problemFindingSchema),
    selectedFindings: z.array(problemFindingSchema),
    dossiers: z.array(contextDossierSchema),
    investigations: z.array(investigationSchema),
    clusters: z.array(clusterSchema),
    issuePackets: z.array(issuePacketSchema),
    proposals: z.array(fixProposalSchema),
    evaluatorArtifacts: z.array(evaluatorArtifactSchema),
    validations: z.array(validationResultSchema),
    finalRecommendations: z.array(finalRecommendationSchema),
    deferredOrRejected: z.array(
      z
        .object({
          title: z.string().trim().min(1).max(180),
          reason: z.string().trim().min(1).max(900),
          evidenceRefs: z.array(z.string().trim().min(1)).max(20),
        })
        .strict(),
    ),
    comparisonNotes: z.array(z.string().trim().min(1).max(500)),
  })
  .strict();

type NormalizedEvidence = z.infer<typeof normalizedEvidenceSchema>;
type ProblemFinding = z.infer<typeof problemFindingSchema>;
type ContextDossier = z.infer<typeof contextDossierSchema>;
type Investigation = z.infer<typeof investigationSchema>;
type Cluster = z.infer<typeof clusterSchema>;
type IssuePacket = z.infer<typeof issuePacketSchema>;
type FixProposal = z.infer<typeof fixProposalSchema>;
type EvaluatorArtifact = z.infer<typeof evaluatorArtifactSchema>;
type ValidationResult = z.infer<typeof validationResultSchema>;
type LabReport = z.infer<typeof labReportSchema>;

function usage(): string {
  return [
    "Usage:",
    "  npm run diagnostics -- client-improvement-lab",
    "  npm run diagnostics -- client-improvement-lab --snapshot=/abs/path/client-summary.json",
    "  tsx scripts/diagnostics/client-improvement-lab.ts --dry-run --format=json",
    "",
    "Runs an isolated, read-only client-assistant improvement lab.",
    "",
    "Options:",
    "  --snapshot=<path>             Client snapshot or summary JSON. Defaults to generated testing data.",
    "  --summary=<path>              Alias for --snapshot.",
    "  --client=<id>                 Client id to unwrap from aggregate summary files. Default: testing",
    "  --env-profile=dev|prod        Runtime .env for LLM credentials only. Default: dev",
    `  --model=<model>              LLM model. Default: ${DEFAULT_MODEL}`,
    "  --format=markdown|json        Output format. Default: markdown",
    `  --max-problems=<n>           Selected problems. Default: ${DEFAULT_MAX_PROBLEMS}`,
    `  --max-issue-packets=<n>      Issue packets to develop. Default: ${DEFAULT_MAX_ISSUE_PACKETS}`,
    "  --out=<path>                  Write final report to this file instead of stdout.",
    "  --out-dir=<path>              Write intermediate JSON artifacts for debugging.",
    "  --dry-run                    Stop after deterministic evidence and problem discovery.",
  ].join("\n");
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
  const candidates = [
    path.join(root, "clients", "client-state-summaries.generated", `${input.clientId}.json`),
    path.join(root, "clients", "client-state-snapshots.generated", `${input.clientId}.json`),
    path.join(
      process.env.HOME ?? "",
      `.ai-assistants-${input.envProfile}`,
      "client-state-snapshots",
      `${input.clientId}.json`,
    ),
    path.join(
      process.env.HOME ?? "",
      ".ai-assistants-prod",
      "client-state-snapshots",
      `${input.clientId}.json`,
    ),
  ];
  for (const candidate of candidates) {
    if (candidate && (await fileExists(candidate))) return candidate;
  }
  throw new Error(
    [
      `No default client improvement input found for ${input.clientId}.`,
      "Generate one with:",
      `  npm run clients -- snapshot --profile=${input.envProfile} --client=${input.clientId}`,
      "or pass --snapshot=/abs/path/client-summary-or-snapshot.json.",
      "Checked:",
      ...candidates.map((candidate) => `  - ${candidate}`),
    ].join("\n"),
  );
}

async function resolveInputPath(args: CliArgs): Promise<string> {
  const explicitPath = args.snapshot ?? args.summary;
  if (explicitPath) return path.resolve(explicitPath);
  return defaultInputPath({ clientId: args.client, envProfile: args["env-profile"] });
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
      format: { type: "string" },
      "max-problems": { type: "string" },
      "max-issue-packets": { type: "string" },
      out: { type: "string" },
      "out-dir": { type: "string" },
      "dry-run": { type: "boolean" },
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

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(record: JsonRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return null;
}

function safeJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const rendered = JSON.stringify(value);
  if (!rendered || rendered === "{}" || rendered === "[]") return null;
  return rendered;
}

function textFromFields(record: JsonRecord, keys: readonly string[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const value = record[key];
    const rendered = typeof value === "string" ? value.trim() : safeJson(value);
    if (rendered) parts.push(`${key}: ${rendered}`);
  }
  return parts.join("\n").trim();
}

function makeExcerpt(text: string, maxChars = 1_600): { excerpt: string; excerpted: boolean } {
  const trimmed = text.trim();
  const excerpt = truncateForLlmPrompt(trimmed, maxChars);
  return {
    excerpt: excerpt || "(no text)",
    excerpted: trimmed.length > excerpt.length,
  };
}

function statusText(record: JsonRecord): string {
  return [
    firstString(record, ["status", "state", "connectionStatus", "credentialStatus", "result"]),
    safeJson(record),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function signalsFor(record: JsonRecord, kind: NormalizedEvidence["kind"]): NormalizedEvidence["signals"] {
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
  if (/workflow|process|client|deal|case|project|request/.test(text)) signals.push("client_workflow");
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
  targetRefs?: string[];
}): NormalizedEvidence | null {
  const title = firstString(input.record, input.titleKeys);
  const text = textFromFields(input.record, input.excerptKeys);
  if (!title && !text) return null;
  const excerpt = makeExcerpt(text || title || "");
  return normalizedEvidenceSchema.parse({
    ref: input.ref,
    kind: input.kind,
    sourcePath: input.sourcePath,
    status: firstString(input.record, input.statusKeys ?? ["status", "state", "result"]),
    occurredAt: firstString(
      input.record,
      input.occurredAtKeys ?? ["occurredAt", "updatedAt", "createdAt", "finishedAt", "lastRunAt"],
    ),
    title,
    excerpt: excerpt.excerpt,
    targetRefs: input.targetRefs ?? [],
    excerpted: excerpt.excerpted,
    signals: signalsFor(input.record, input.kind),
  });
}

async function readInput(filePath: string, clientId: string): Promise<JsonRecord> {
  const raw = await readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) throw new Error(`Input ${filePath} did not contain a JSON object.`);
  const summaries = recordValue(parsed.summaries);
  if (Object.keys(summaries).length > 0) {
    const clientSummary = summaries[clientId];
    if (!isRecord(clientSummary)) {
      throw new Error(`Aggregate input ${filePath} does not contain client ${clientId}.`);
    }
    return clientSummary;
  }
  const clients = recordValue(parsed.clients);
  if (Object.keys(clients).length > 0) {
    const clientSnapshot = clients[clientId];
    if (!isRecord(clientSnapshot)) {
      throw new Error(`Aggregate input ${filePath} does not contain client ${clientId}.`);
    }
    return clientSnapshot;
  }
  return parsed;
}

function addEvidence(
  output: NormalizedEvidence[],
  input: Parameters<typeof makeEvidence>[0],
): void {
  const evidence = makeEvidence(input);
  if (evidence) output.push(evidence);
}

function normalizeEvidence(input: JsonRecord): NormalizedEvidence[] {
  const evidence: NormalizedEvidence[] = [];
  const recentActivity = recordValue(input.recentActivity);
  const integrations = recordValue(input.integrations);
  const integrationConnectedAccounts = [
    ...arrayValue(integrations.connectedAccounts),
    ...arrayValue(input.connectedAccounts),
  ];
  const integrationCapabilityAccountLinks = [
    ...arrayValue(integrations.capabilityAccountLinks),
    ...arrayValue(input.capabilityAccountLinks),
  ];
  const integrationChannels = [...arrayValue(integrations.channels), ...arrayValue(input.channels)];
  const integrationWebhookSubscriptions = [
    ...arrayValue(integrations.webhookSubscriptions),
    ...arrayValue(input.providerWebhookSubscriptions),
    ...arrayValue(input.webhookSubscriptions),
  ];

  for (const [index, item] of arrayValue(input.messages).entries()) {
    addEvidence(evidence, {
      ref: `message:${index}`,
      kind: "message",
      sourcePath: "messages",
      record: recordValue(item),
      titleKeys: ["title", "direction", "sender", "from"],
      statusKeys: ["status", "deliveryStatus"],
      excerptKeys: ["direction", "sender", "from", "to", "text", "contentText", "summary", "status"],
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
  ].entries()) {
    addEvidence(evidence, {
      ref: `action:${index}`,
      kind: "action",
      sourcePath: "recentActivity.actions",
      record: recordValue(item),
      titleKeys: ["title", "kind", "type"],
      excerptKeys: ["title", "summary", "status", "target", "result"],
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
      excerptKeys: ["kind", "jobKind", "status", "summary", "errorCode", "errorMessage", "metadata"],
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
  for (const [index, item] of integrationConnectedAccounts.entries()) {
    addEvidence(evidence, {
      ref: `integration:${index}`,
      kind: "integration",
      sourcePath: "integrations.connectedAccounts",
      record: recordValue(item),
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
    });
  }
  for (const [index, item] of integrationCapabilityAccountLinks.entries()) {
    addEvidence(evidence, {
      ref: `integration_capability:${index}`,
      kind: "integration",
      sourcePath: "integrations.capabilityAccountLinks",
      record: recordValue(item),
      titleKeys: ["capabilitySlug", "label", "provider"],
      excerptKeys: ["capabilitySlug", "label", "status", "required", "readiness", "provider"],
    });
  }
  for (const [index, item] of integrationChannels.entries()) {
    addEvidence(evidence, {
      ref: `channel:${index}`,
      kind: "channel",
      sourcePath: "integrations.channels",
      record: recordValue(item),
      titleKeys: ["provider", "channel", "accountId"],
      excerptKeys: ["provider", "channel", "accountId", "status", "routing"],
    });
  }
  for (const [index, item] of integrationWebhookSubscriptions.entries()) {
    addEvidence(evidence, {
      ref: `webhook:${index}`,
      kind: "webhook",
      sourcePath: "integrations.webhookSubscriptions",
      record: recordValue(item),
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
    });
  }
  for (const [index, item] of arrayValue(input.recentProviderWebhookDeliveries).entries()) {
    addEvidence(evidence, {
      ref: `webhook_delivery:${index}`,
      kind: "webhook",
      sourcePath: "recentProviderWebhookDeliveries",
      record: recordValue(item),
      titleKeys: ["providerKey", "adapterKey", "deliveryKey"],
      statusKeys: ["status", "errorCode"],
      occurredAtKeys: ["receivedAt", "processedAt", "createdAt", "updatedAt"],
      excerptKeys: [
        "providerKey",
        "adapterKey",
        "deliveryKey",
        "status",
        "errorCode",
        "errorMessage",
        "authenticated",
        "processedAt",
      ],
    });
  }
  for (const [index, item] of arrayValue(input.recentProviderWriteReceipts).entries()) {
    addEvidence(evidence, {
      ref: `provider_write:${index}`,
      kind: "action",
      sourcePath: "recentProviderWriteReceipts",
      record: recordValue(item),
      titleKeys: ["toolName", "operation", "providerKey"],
      statusKeys: ["providerExecutionStatus", "status"],
      occurredAtKeys: ["finishedAt", "startedAt", "createdAt"],
      excerptKeys: [
        "providerKey",
        "capabilitySlug",
        "toolName",
        "operation",
        "externalResourceType",
        "metadata",
      ],
    });
  }
  for (const [index, item] of arrayValue(input.recentAgentEvents).entries()) {
    const record = recordValue(item);
    const payload = recordValue(record.payload);
    addEvidence(evidence, {
      ref: `agent_event:${index}`,
      kind:
        firstString(record, ["eventType"]) === "assistant.tool.result" ||
        firstString(record, ["eventType"]) === "assistant.tool.call"
          ? "action"
          : "message",
      sourcePath: "recentAgentEvents",
      record: { ...record, payload },
      titleKeys: ["eventType", "sourceEventKey"],
      statusKeys: ["status", "eventType"],
      occurredAtKeys: ["occurredAt", "createdAt"],
      excerptKeys: [
        "eventType",
        "source",
        "visibility",
        "sourceEventKey",
        "payload",
      ],
    });
  }
  for (const [index, item] of arrayValue(input.recentAgentRuns).entries()) {
    addEvidence(evidence, {
      ref: `agent_run:${index}`,
      kind: "backend_job",
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
      excerptKeys: ["title", "candidateType", "targetKind", "status", "rationale", "failureMessage"],
    });
  }

  if (evidence.length === 0) {
    const fallbackExcerpt = makeExcerpt(safeJson(input) ?? "input object", 2_000);
    evidence.push(
      normalizedEvidenceSchema.parse({
        ref: "input:root",
        kind: "unknown",
        sourcePath: "root",
        status: null,
        occurredAt: null,
        title: firstString(recordValue(input.profile), ["displayName", "display_name", "name"]),
        excerpt: fallbackExcerpt.excerpt,
        targetRefs: [],
        excerpted: fallbackExcerpt.excerpted,
        signals: signalsFor(input, "unknown"),
      }),
    );
  }

  return evidence;
}

function deterministicReliabilityFindings(evidence: readonly NormalizedEvidence[]): ProblemFinding[] {
  const findings: ProblemFinding[] = [];
  const reliabilitySignals = new Set([
    "failed_or_blocked",
    "retry_or_loop",
    "disconnected_integration",
    "unhealthy_webhook",
    "provider_write_failed",
    "delivery_failed",
    "approval_waiting",
  ]);
  for (const item of evidence) {
    const matched = item.signals.filter((signal) => reliabilitySignals.has(signal));
    if (matched.length === 0) continue;
    const severity: ProblemFinding["severity"] =
      matched.some((signal) =>
        ["disconnected_integration", "provider_write_failed", "delivery_failed"].includes(signal),
      )
        ? "high"
        : matched.includes("failed_or_blocked")
          ? "medium"
          : "low";
    findings.push(
      problemFindingSchema.parse({
        problemId: stableId(`reliability_${item.ref}`),
        lane: "reliability",
        category: matched[0],
        title: shortText(item.title, 180) ?? `Reliability signal in ${item.ref}`,
        summary: `Evidence ${item.ref} has reliability signals: ${matched.join(", ")}.`,
        severity,
        evidenceRefs: [item.ref],
        missingEvidence: [],
      }),
    );
  }
  return findings;
}

function deterministicCapabilityFindings(evidence: readonly NormalizedEvidence[]): ProblemFinding[] {
  const groups: Array<{
    category: string;
    title: string;
    summary: string;
    signals: NormalizedEvidence["signals"];
  }> = [
    {
      category: "repeated_clarification",
      title: "Assistant may be asking for reusable context",
      summary:
        "The evidence includes clarification or repeated-context signals that may be better handled through remembered mappings, aliases, or structured options.",
      signals: ["clarification", "memory_or_context"],
    },
    {
      category: "next_step_extraction",
      title: "Assistant may not be turning messages into next steps",
      summary:
        "The evidence includes follow-up, document, drafting, or system-update signals where the assistant may be able to identify owners, missing items, due dates, or draft replies.",
      signals: ["follow_up", "document", "drafting", "system_update"],
    },
    {
      category: "notification_quality",
      title: "Assistant may be creating avoidable notification noise",
      summary:
        "The evidence includes notification, summary, or approval signals where batching, priority, or approval shortcuts may reduce interruptions.",
      signals: ["notification", "summary", "approval_waiting"],
    },
    {
      category: "workflow_ownership",
      title: "Assistant may be under-owning a client workflow",
      summary:
        "The evidence includes client workflow, meeting, follow-up, or document signals where the assistant may be able to coordinate more of the administrative flow.",
      signals: ["client_workflow", "meeting", "follow_up", "document"],
    },
  ];

  const findings: ProblemFinding[] = [];
  for (const group of groups) {
    const refs = evidence
      .filter((item) => item.signals.some((signal) => group.signals.includes(signal)))
      .map((item) => item.ref)
      .slice(0, 12);
    if (refs.length === 0) continue;
    findings.push(
      problemFindingSchema.parse({
        problemId: stableId(`capability_${group.category}`),
        lane: "capability",
        category: group.category,
        title: group.title,
        summary: group.summary,
        severity: refs.length >= 3 ? "medium" : "low",
        evidenceRefs: refs,
        missingEvidence:
          refs.length < 2 ? ["Need more repeated examples before treating this as recurring."] : [],
      }),
    );
  }
  return findings;
}

function stableId(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70);
  return /^[a-z]/.test(normalized) ? normalized : `item_${normalized || "unknown"}`;
}

function shortText(value: string | null, maxChars: number): string | null {
  if (!value) return null;
  return value.length <= maxChars ? value : value.slice(0, maxChars - 1).trimEnd();
}

function selectFindings(findings: readonly ProblemFinding[], maxProblems: number): ProblemFinding[] {
  const severityScore: Record<ProblemFinding["severity"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  const reliability = findings.filter((finding) => finding.lane === "reliability");
  const capability = findings.filter((finding) => finding.lane === "capability");
  const sortFindings = (items: ProblemFinding[]) =>
    [...items].sort(
      (a, b) =>
        severityScore[b.severity] - severityScore[a.severity] ||
        b.evidenceRefs.length - a.evidenceRefs.length ||
        a.problemId.localeCompare(b.problemId),
    );
  const selected: ProblemFinding[] = [];
  const sortedReliability = sortFindings(reliability);
  const sortedCapability = sortFindings(capability);
  if (sortedReliability[0]) selected.push(sortedReliability[0]);
  if (sortedCapability[0] && selected.length < maxProblems) selected.push(sortedCapability[0]);
  const rest = sortFindings(
    findings.filter((finding) => !selected.some((item) => item.problemId === finding.problemId)),
  );
  for (const finding of rest) {
    if (selected.length >= maxProblems) break;
    selected.push(finding);
  }
  return selected;
}

function buildDossiers(
  findings: readonly ProblemFinding[],
  evidence: readonly NormalizedEvidence[],
): ContextDossier[] {
  const byRef = new Map(evidence.map((item) => [item.ref, item]));
  const guidanceRefs = evidence
    .filter((item) => item.kind === "guidance")
    .map((item) => item.ref)
    .slice(0, 20);
  const workflowRefs = evidence
    .filter((item) => ["work_route", "scheduled_task"].includes(item.kind))
    .map((item) => item.ref)
    .slice(0, 20);
  return findings.map((finding) => {
    const direct = finding.evidenceRefs
      .map((ref) => byRef.get(ref))
      .filter((item): item is NormalizedEvidence => item !== undefined);
    const relatedSignals = new Set(direct.flatMap((item) => item.signals));
    const related = evidence
      .filter(
        (item) =>
          !finding.evidenceRefs.includes(item.ref) &&
          item.signals.some((signal) => relatedSignals.has(signal)),
      )
      .slice(0, 12);
    const relevantEvidence = [...direct, ...related].slice(0, 40);
    return contextDossierSchema.parse({
      problemId: finding.problemId,
      lane: finding.lane,
      problemSummary: finding.summary,
      relevantEvidence,
      relatedGuidanceRefs: guidanceRefs,
      relatedWorkflowRefs: workflowRefs,
      knownContext: truncateForLlmPrompt(
        relevantEvidence.map((item) => `${item.ref}: ${item.excerpt}`).join("\n"),
        1_400,
      ).slice(0, 1_500),
      missingContext: finding.missingEvidence,
      investigatorBoundary:
        "Decide whether this problem is real, recurring, and important. Do not propose a fix.",
    });
  });
}

function problemPromptEvidence(evidence: readonly NormalizedEvidence[]): unknown[] {
  return evidence.slice(0, DEFAULT_PROMPT_RECORDS).map((item) => ({
    ref: item.ref,
    kind: item.kind,
    status: item.status,
    title: item.title,
    excerpt: item.excerpt,
    signals: item.signals,
    excerpted: item.excerpted,
  }));
}

async function runStage<TSchema extends z.ZodTypeAny>(input: {
  stage: string;
  schema: TSchema;
  outputName: string;
  outputDescription: string;
  instructions: string;
  promptPayload: unknown;
}): Promise<z.infer<TSchema>> {
  process.stderr.write(`client-improvement-lab: ${input.stage}\n`);
  try {
    return await generateLlmObject({
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
  } catch (error) {
    throw new Error(
      `${input.stage} failed: ${JSON.stringify(llmErrorDiagnostics(error), null, 2)}`,
      { cause: error },
    );
  }
}

async function investigateDossier(dossier: ContextDossier): Promise<Investigation> {
  const result = await runStage({
    stage: `investigate.${dossier.problemId}`,
    schema: investigationResultSchema,
    outputName: "ClientImprovementInvestigation",
    outputDescription: "A one-problem investigation. It must not propose a fix.",
    instructions:
      "You are an isolated investigator. Your only job is to decide whether the provided problem is real, recurring, and important. Do not propose a fix. Use only provided evidence refs. Be honest about missing evidence.",
    promptPayload: {
      dossier: {
        ...dossier,
        relevantEvidence: problemPromptEvidence(dossier.relevantEvidence),
      },
    },
  });
  return result.investigation;
}

async function clusterInvestigations(input: {
  investigations: readonly Investigation[];
  dossiers: readonly ContextDossier[];
}): Promise<Cluster[]> {
  const result = await runStage({
    stage: "cluster_investigations",
    schema: clusterSetSchema,
    outputName: "ClientImprovementClusters",
    outputDescription: "Recurring patterns and severe one-offs from investigations.",
    instructions:
      "Cluster related investigations into recurring patterns or severe one-offs. Keep reliability and capability lanes separate. Do not propose fixes.",
    promptPayload: {
      investigations: input.investigations,
      dossiers: input.dossiers.map((dossier) => ({
        problemId: dossier.problemId,
        lane: dossier.lane,
        problemSummary: dossier.problemSummary,
        evidenceRefs: dossier.relevantEvidence.map((item) => item.ref),
        knownContext: dossier.knownContext,
      })),
    },
  });
  return result.clusters;
}

async function buildIssuePackets(input: {
  clusters: readonly Cluster[];
  investigations: readonly Investigation[];
  maxIssuePackets: number;
}): Promise<IssuePacket[]> {
  const result = await runStage({
    stage: "build_issue_packets",
    schema: issuePacketSetSchema,
    outputName: "ClientImprovementIssuePackets",
    outputDescription: "Evidence-backed issue packets for candidate improvements.",
    instructions:
      "Convert clusters into issue packets. Every packet must preserve evidence refs, likely owner layer, evidence strength, and decision state. Do not invent client-specific workflows beyond evidence.",
    promptPayload: {
      maxIssuePackets: input.maxIssuePackets,
      clusters: input.clusters,
      investigations: input.investigations,
    },
  });
  return result.issuePackets.slice(0, input.maxIssuePackets);
}

async function proposeFix(packet: IssuePacket, evidence: readonly NormalizedEvidence[]): Promise<FixProposal> {
  const result = await runStage({
    stage: `propose_fix.${packet.issueId}`,
    schema: fixProposalResultSchema,
    outputName: "ClientImprovementFixProposal",
    outputDescription: "The smallest useful fix for one issue packet.",
    instructions:
      "Propose exactly one smallest useful fix. Reject invented channels, endpoints, provider writes, OAuth scopes, dashboards, exact cadences, and storage paths unless evidence proves them. Keep the client in control for commercial judgment.",
    promptPayload: {
      issuePacket: packet,
      evidence: problemPromptEvidence(
        evidence.filter((item) => packet.representativeEvidenceRefs.includes(item.ref)),
      ),
    },
  });
  return result.proposal;
}

async function buildEvaluator(input: {
  packet: IssuePacket;
  proposal: FixProposal;
}): Promise<EvaluatorArtifact> {
  const result = await runStage({
    stage: `build_evaluator.${input.packet.issueId}`,
    schema: evaluatorArtifactResultSchema,
    outputName: "ClientImprovementEvaluatorArtifact",
    outputDescription: "Evaluator and regression artifact for one proposed fix.",
    instructions:
      "Build an evaluator artifact. Include regression examples, deterministic checks when possible, semantic judge rubric when needed, and a post-change success metric. State what the evaluator does not prove.",
    promptPayload: input,
  });
  return result.evaluator;
}

async function validateProposal(input: {
  packet: IssuePacket;
  proposal: FixProposal;
  evaluator: EvaluatorArtifact;
  dossier: ContextDossier | null;
}): Promise<ValidationResult> {
  const result = await runStage({
    stage: `validate_and_critique.${input.packet.issueId}`,
    schema: validationResultObjectSchema,
    outputName: "ClientImprovementValidationResult",
    outputDescription: "Validation and duplicate/overkill critique for one recommendation.",
    instructions:
      "Decide whether the fix would plausibly improve the representative traces. Check duplicate, overkill, unsafe action, too-client-specific, and missing-evidence risk. Final recommendations need evidence and an evaluator.",
    promptPayload: input,
  });
  return result.validation;
}

function deterministicClusterAndPackets(
  findings: readonly ProblemFinding[],
  maxIssuePackets: number,
): { clusters: Cluster[]; issuePackets: IssuePacket[] } {
  const clusters = findings.slice(0, maxIssuePackets).map((finding) =>
    clusterSchema.parse({
      clusterId: stableId(`cluster_${finding.problemId}`),
      lane: finding.lane,
      title: finding.title,
      summary: finding.summary,
      investigationProblemIds: [finding.problemId],
      representativeEvidenceRefs: finding.evidenceRefs,
      prevalence: finding.evidenceRefs.length > 2 ? "moderate" : "weak",
      evidenceStrength:
        finding.missingEvidence.length > 0
          ? "needs_more_evidence"
          : finding.evidenceRefs.length > 2
            ? "medium"
            : "weak",
    }),
  );
  const issuePackets = clusters.map((cluster, index) =>
    issuePacketSchema.parse({
      issueId: stableId(`issue_${cluster.clusterId}`),
      lane: cluster.lane,
      category: findings[index]?.category ?? cluster.lane,
      title: cluster.title,
      summary: cluster.summary,
      impact:
        cluster.lane === "reliability"
          ? "Reliability problems can stop the assistant from completing work or force maintainer intervention."
          : "Capability gaps can keep the assistant in passive triage instead of removing client admin work.",
      prevalence: cluster.prevalence,
      severity: findings[index]?.severity ?? "medium",
      evidenceStrength: cluster.evidenceStrength,
      likelyOwnerLayer: cluster.lane === "reliability" ? "reliability_code" : "workflow_orchestration",
      representativeEvidenceRefs: cluster.representativeEvidenceRefs,
      counterEvidenceRefs: [],
      missingEvidence: findings[index]?.missingEvidence ?? [],
      decisionState:
        cluster.evidenceStrength === "needs_more_evidence" ? "needs_more_evidence" : "ready_for_fix",
    }),
  );
  return { clusters, issuePackets };
}

function deterministicDeferred(findings: readonly ProblemFinding[], selected: readonly ProblemFinding[]) {
  const selectedIds = new Set(selected.map((finding) => finding.problemId));
  return findings
    .filter((finding) => !selectedIds.has(finding.problemId))
    .map((finding) => ({
      title: finding.title,
      reason: "Deferred by lane budget or lower severity in this bounded lab run.",
      evidenceRefs: finding.evidenceRefs,
    }));
}

function buildFinalRecommendations(input: {
  issuePackets: readonly IssuePacket[];
  proposals: readonly FixProposal[];
  evaluatorArtifacts: readonly EvaluatorArtifact[];
  validations: readonly ValidationResult[];
}): z.infer<typeof finalRecommendationSchema>[] {
  const proposalByIssue = new Map(input.proposals.map((proposal) => [proposal.issueId, proposal]));
  const evaluatorByIssue = new Map(
    input.evaluatorArtifacts.map((evaluator) => [evaluator.issueId, evaluator]),
  );
  const validationByIssue = new Map(
    input.validations.map((validation) => [validation.issueId, validation]),
  );
  return input.issuePackets.flatMap((packet) => {
    const proposal = proposalByIssue.get(packet.issueId);
    const evaluatorArtifact = evaluatorByIssue.get(packet.issueId);
    const validationResult = validationByIssue.get(packet.issueId);
    if (!proposal || !evaluatorArtifact || !validationResult) return [];
    if (!["recommend", "needs_maintainer_review", "already_covered_but_broken"].includes(validationResult.decision)) {
      return [];
    }
    return [
      finalRecommendationSchema.parse({
        issuePacket: packet,
        proposal,
        evaluatorArtifact,
        validationResult,
      }),
    ];
  });
}

function proposalInventsUnsupportedSurface(
  proposal: FixProposal,
  evidence: readonly NormalizedEvidence[],
): string | null {
  const text = [
    proposal.recommendation,
    proposal.smallestUsefulVersion,
    proposal.rejectedInventedSurfaceCheck,
  ]
    .join("\n")
    .toLowerCase();
  const supportingText = evidence
    .filter((item) => proposal.evidenceRefs.includes(item.ref))
    .map((item) => item.excerpt.toLowerCase())
    .join("\n");
  const unsupportedPatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /default(?:ing)? to ['"]?general['"]?/, label: "invented default folder" },
    { pattern: /create (?:a )?(?:new )?dashboard/, label: "invented dashboard" },
    { pattern: /new oauth scope|additional oauth scope/, label: "invented OAuth scope" },
    { pattern: /new endpoint|new api endpoint/, label: "invented endpoint" },
    { pattern: /every \d+ (?:minute|hour|day)s?/, label: "invented exact cadence" },
  ];
  for (const item of unsupportedPatterns) {
    if (item.pattern.test(text) && !item.pattern.test(supportingText)) return item.label;
  }
  return null;
}

function auditValidation(input: {
  packet: IssuePacket;
  proposal: FixProposal;
  validation: ValidationResult;
  evidence: readonly NormalizedEvidence[];
}): ValidationResult {
  const unsupportedSurface = proposalInventsUnsupportedSurface(input.proposal, input.evidence);
  if (unsupportedSurface) {
    return validationResultSchema.parse({
      ...input.validation,
      decision: "needs_more_evidence",
      wouldHaveHelped:
        input.validation.wouldHaveHelped === "yes" ? "unclear" : input.validation.wouldHaveHelped,
      confidence: "low",
      validationSummary: `${input.validation.validationSummary} Deterministic audit downgraded this because the proposal includes an unsupported ${unsupportedSurface}.`,
      duplicateOrOverkillRisk: "high",
      riskNotes: [
        ...input.validation.riskNotes,
        `Unsupported ${unsupportedSurface}; require evidence or a safer option before recommending.`,
      ].slice(0, 8),
      requiredAdjustment:
        input.validation.requiredAdjustment ??
        "Remove the invented surface/default and propose an approval-first or evidence-backed alternative.",
    });
  }
  if (
    input.validation.decision === "recommend" &&
    input.packet.decisionState === "needs_more_evidence"
  ) {
    return validationResultSchema.parse({
      ...input.validation,
      decision: "needs_maintainer_review",
      validationSummary: `${input.validation.validationSummary} Maintainer review is required because the issue packet still carries a needs-more-evidence state.`,
    });
  }
  return input.validation;
}

function formatMarkdown(report: LabReport): string {
  const lines: string[] = [];
  lines.push(`# Client Improvement Lab: ${report.clientId}`, "");
  lines.push(`Source: \`${report.sourcePath}\``);
  lines.push(`Mode: ${report.dryRun ? "dry run" : "full run"}`, "");
  lines.push("## Evidence");
  lines.push(`- Records: ${report.evidence.length}`);
  const counts = new Map<string, number>();
  for (const item of report.evidence) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  for (const [kind, count] of [...counts.entries()].sort()) lines.push(`- ${kind}: ${count}`);
  lines.push("");
  lines.push("## Initial Problems");
  for (const finding of report.selectedFindings) {
    lines.push(`- [${finding.lane}] ${finding.title}: ${finding.summary}`);
    lines.push(`  Evidence: ${finding.evidenceRefs.join(", ")}`);
  }
  if (report.finalRecommendations.length > 0) {
    lines.push("", "## Final Recommendations");
    for (const lane of ["reliability", "capability"] as const) {
      const items = report.finalRecommendations.filter((item) => item.issuePacket.lane === lane);
      if (items.length === 0) continue;
      lines.push(``, `### ${lane[0].toUpperCase()}${lane.slice(1)}`);
      for (const item of items) {
        lines.push(`- ${item.proposal.title}`);
        lines.push(`  - Decision: ${item.validationResult.decision}`);
        lines.push(`  - Fix: ${item.proposal.smallestUsefulVersion}`);
        lines.push(`  - Why: ${item.proposal.whyThisHelpsClient}`);
        lines.push(`  - Evidence: ${item.proposal.evidenceRefs.join(", ")}`);
        lines.push(`  - Evaluator: ${item.evaluatorArtifact.proves}`);
        lines.push(`  - Validation: ${item.validationResult.validationSummary}`);
      }
    }
  } else if (!report.dryRun) {
    lines.push("", "## Final Recommendations");
    lines.push(
      "- No recommendation passed validation. Inspect deferred items and comparison notes to see whether this was caused by missing evidence or rejected proposals.",
    );
  }
  if (report.deferredOrRejected.length > 0) {
    lines.push("", "## Deferred Or Rejected");
    for (const item of report.deferredOrRejected.slice(0, 12)) {
      lines.push(`- ${item.title}: ${item.reason}`);
    }
  }
  if (report.comparisonNotes.length > 0) {
    lines.push("", "## Comparison Notes");
    for (const note of report.comparisonNotes) lines.push(`- ${note}`);
  }
  return `${lines.join("\n")}\n`;
}

async function writeArtifact(outDir: string | undefined, name: string, value: unknown): Promise<void> {
  if (!outDir) return;
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeOutput(args: CliArgs, report: LabReport): Promise<void> {
  const body = args.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : formatMarkdown(report);
  if (args.out) {
    await mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
    await writeFile(args.out, body, "utf8");
    return;
  }
  process.stdout.write(body);
}

export async function runClientImprovementLabCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  selectedModel = args.model;
  assertRuntimeProfile(args["env-profile"]);
  if (!args["dry-run"]) loadProfileDotEnv(args["env-profile"]);

  const sourcePath = await resolveInputPath(args);
  const input = await readInput(sourcePath, args.client);
  const evidence = normalizeEvidence(input);
  if (evidence.length === 0) throw new Error(`No evidence records found in ${sourcePath}.`);
  await writeArtifact(args["out-dir"], "01-evidence", evidence);

  const findings = [
    ...deterministicReliabilityFindings(evidence),
    ...deterministicCapabilityFindings(evidence),
  ];
  const selectedFindings = selectFindings(findings, args["max-problems"]);
  const dossiers = buildDossiers(selectedFindings, evidence);
  await writeArtifact(args["out-dir"], "02-findings", { findings, selectedFindings, dossiers });

  let investigations: Investigation[] = [];
  let clusters: Cluster[] = [];
  let issuePackets: IssuePacket[] = [];
  let proposals: FixProposal[] = [];
  let evaluatorArtifacts: EvaluatorArtifact[] = [];
  let validations: ValidationResult[] = [];

  if (!args["dry-run"]) {
    for (const dossier of dossiers) investigations.push(await investigateDossier(dossier));
    await writeArtifact(args["out-dir"], "03-investigations", investigations);
    clusters = await clusterInvestigations({ investigations, dossiers });
    issuePackets = await buildIssuePackets({
      clusters,
      investigations,
      maxIssuePackets: args["max-issue-packets"],
    });
    await writeArtifact(args["out-dir"], "04-issue-packets", { clusters, issuePackets });
    for (const packet of issuePackets.filter((packet) => packet.decisionState !== "reject")) {
      const proposal = await proposeFix(packet, evidence);
      proposals.push(proposal);
      const evaluator = await buildEvaluator({ packet, proposal });
      evaluatorArtifacts.push(evaluator);
      const dossier = dossiers.find((item) =>
        item.relevantEvidence.some((evidenceItem) =>
          packet.representativeEvidenceRefs.includes(evidenceItem.ref),
        ),
      );
      const validation = await validateProposal({ packet, proposal, evaluator, dossier: dossier ?? null });
      validations.push(auditValidation({ packet, proposal, validation, evidence }));
    }
    await writeArtifact(args["out-dir"], "05-recommendations", {
      proposals,
      evaluatorArtifacts,
      validations,
    });
  } else {
    const deterministic = deterministicClusterAndPackets(selectedFindings, args["max-issue-packets"]);
    clusters = deterministic.clusters;
    issuePackets = deterministic.issuePackets;
  }

  const finalRecommendations = buildFinalRecommendations({
    issuePackets,
    proposals,
    evaluatorArtifacts,
    validations,
  });
  const evidenceKinds = new Set(evidence.map((item) => item.kind));
  const comparisonNotes = [
    args["dry-run"]
      ? "Dry run stops before LLM investigation, fix proposal, evaluator, and validation stages."
      : "Full run can be compared against helpfulness-flow, trace-improvement-flow, and manual recommendations.",
    !evidenceKinds.has("message") && !evidenceKinds.has("work_item")
      ? "Input evidence has no recent messages or work items, so capability recommendations are likely evidence-limited."
      : null,
    finalRecommendations.length === 0 && !args["dry-run"]
      ? "No final recommendation passed validation; this is a useful signal to inspect missing evidence before productionizing the loop."
      : null,
    "If expected recommendations are missing, inspect deferred/rejected items and missingEvidence fields before productionizing.",
  ].filter((note): note is string => note !== null);
  const acceptedIssueIds = new Set(
    finalRecommendations.map((recommendation) => recommendation.issuePacket.issueId),
  );
  const deferredOrRejected = [
    ...deterministicDeferred(findings, selectedFindings),
    ...issuePackets
      .filter(
        (packet) =>
          packet.decisionState !== "ready_for_fix" && !acceptedIssueIds.has(packet.issueId),
      )
      .map((packet) => ({
        title: packet.title,
        reason:
          packet.decisionState === "needs_more_evidence"
            ? "Issue packet needs more evidence before becoming a recommendation."
            : "Issue packet was rejected.",
        evidenceRefs: packet.representativeEvidenceRefs,
      })),
    ...validations
      .filter((validation) => !["recommend", "needs_maintainer_review", "already_covered_but_broken"].includes(validation.decision))
      .map((validation) => ({
        title: issuePackets.find((packet) => packet.issueId === validation.issueId)?.title ?? validation.issueId,
        reason: validation.validationSummary,
        evidenceRefs:
          issuePackets.find((packet) => packet.issueId === validation.issueId)
            ?.representativeEvidenceRefs ?? [],
      })),
  ];
  const report = labReportSchema.parse({
    clientId: args.client,
    sourcePath,
    dryRun: args["dry-run"] === true,
    evidence,
    findings,
    selectedFindings,
    dossiers,
    investigations,
    clusters,
    issuePackets,
    proposals,
    evaluatorArtifacts,
    validations,
    finalRecommendations,
    deferredOrRejected,
    comparisonNotes,
  });
  await writeArtifact(args["out-dir"], "06-report", report);
  await writeOutput(args, report);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runClientImprovementLabCli());
}
