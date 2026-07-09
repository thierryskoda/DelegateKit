#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
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

const DEFAULT_MAX_WORK_ITEMS = 120;
const DEFAULT_MAX_EVIDENCE_ITEMS = 180;
const DEFAULT_MAX_FINDINGS = 10;
const DEFAULT_MODEL = "deepseek-v4-flash";
const PROMPT_MAX_CHARS = 55_000;
const STAGE_TIMEOUT_MS = 45_000;
const STAGE_MAX_OUTPUT_TOKENS = 10_000;
let selectedModel = DEFAULT_MODEL;

const cliSchema = z
  .object({
    help: z.boolean().optional(),
    snapshot: z.string().optional(),
    "max-work-items": z.coerce.number().int().min(20).max(300).default(DEFAULT_MAX_WORK_ITEMS),
    "max-evidence-items": z.coerce
      .number()
      .int()
      .min(40)
      .max(350)
      .default(DEFAULT_MAX_EVIDENCE_ITEMS),
    "max-findings": z.coerce.number().int().min(1).max(16).default(DEFAULT_MAX_FINDINGS),
    "max-problems": z.coerce.number().int().min(1).max(16).optional(),
    format: z.enum(["markdown", "json"]).default("markdown"),
    "env-profile": z.string().default("dev"),
    client: z.string().default("testing"),
    model: z.string().default(DEFAULT_MODEL),
  })
  .strict();

type CliArgs = z.infer<typeof cliSchema>;
type JsonRecord = Record<string, unknown>;

type EvidenceItem = {
  ref: string;
  kind: string;
  occurredAt: string | null;
  status: string | null;
  title: string | null;
  summary: string | null;
};

type DurableContext = {
  profile: unknown;
  scheduledTasks: unknown[];
  guidance: unknown[];
  assistantWorkRoutes: unknown[];
  integrations: unknown;
};

const evidenceCategorySchema = z.enum([
  "completed_work",
  "blocked_work",
  "missed_opportunity",
  "noise",
  "tool_or_provider_issue",
  "client_question",
  "state_or_guidance_signal",
  "follow_up_signal",
  "approval_or_safety_signal",
]);

const notableFactSchema = z
  .object({
    ref: z.string().trim().min(1),
    category: evidenceCategorySchema,
    fact: z.string().trim().min(1).max(700),
    whyItMatters: z.string().trim().min(1).max(500),
  })
  .strict();

const evidenceReaderSchema = z
  .object({
    activitySummary: z.string().trim().min(1).max(1_800),
    notableFacts: z.array(notableFactSchema).max(80),
  })
  .strict();

const clientRoleProfileSchema = z
  .object({
    inferredAssistantRole: z.string().trim().min(1).max(220),
    clientWorkDomain: z.string().trim().min(1).max(220),
    primaryOutcomes: z.array(z.string().trim().min(1).max(220)).min(2).max(8),
    workAssistantShouldOwn: z.array(z.string().trim().min(1).max(260)).min(2).max(10),
    decisionsClientShouldKeep: z.array(z.string().trim().min(1).max(260)).min(1).max(8),
    tenXDefinition: z.string().trim().min(1).max(900),
    confidence: z.enum(["low", "medium", "high"]),
  })
  .strict();

const improvementCategorySchema = z.enum([
  "client_role_fit",
  "context_memory",
  "clarification_reduction",
  "notification_quality",
  "follow_up_management",
  "document_or_file_handling",
  "crm_or_system_updates",
  "drafting_or_response_help",
  "meeting_or_day_preparation",
  "tool_reliability",
  "approval_and_safety",
  "workflow_or_guidance",
  "measurement_or_learning_loop",
  "other",
]);

const findingSchema = z
  .object({
    findingId: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9_]*$/),
    title: z.string().trim().min(1).max(180),
    kind: z.enum(["friction", "opportunity", "coverage_failure"]),
    category: improvementCategorySchema,
    severity: z.enum(["low", "medium", "high"]),
    confidence: z.enum(["low", "medium", "high"]),
    actualBehavior: z.string().trim().min(1).max(900),
    betterBehavior: z.string().trim().min(1).max(900),
    whyItMattersToClient: z.string().trim().min(1).max(800),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(18),
  })
  .strict();

const gapFinderSchema = z
  .object({
    summary: z.string().trim().min(1).max(1_500),
    findings: z.array(findingSchema).max(30),
  })
  .strict();

const findingDeduperSchema = z
  .object({
    summary: z.string().trim().min(1).max(1_200),
    findings: z.array(findingSchema).max(16),
  })
  .strict();

const contextPacketSchema = z
  .object({
    findingId: z.string().trim().min(1),
    contextSummary: z.string().trim().min(1).max(1_800),
    patternStrength: z.enum(["weak", "moderate", "strong"]),
    relevantEvidenceRefs: z.array(z.string().trim().min(1)).min(1).max(24),
    relevantGuidanceKeys: z.array(z.string().trim().min(1)).max(12),
    currentSystemBehavior: z.string().trim().min(1).max(900),
    missingContext: z.string().trim().min(1).max(700).nullable(),
  })
  .strict();

const coverageReviewSchema = z
  .object({
    findingId: z.string().trim().min(1),
    coverageStatus: z.enum([
      "not_covered",
      "covered_and_working",
      "covered_but_not_working",
      "partially_covered",
      "unclear",
    ]),
    existingCoverage: z.array(z.string().trim().min(1).max(300)).max(10),
    reason: z.string().trim().min(1).max(1_000),
    recommendationImplication: z.enum([
      "add_new_capability",
      "fix_existing_loop",
      "tighten_guidance_or_workflow",
      "investigate_more",
      "do_not_change",
    ]),
  })
  .strict();

const improvementProposalSchema = z
  .object({
    findingId: z.string().trim().min(1),
    recommendationType: z.enum([
      "scheduled_task_create",
      "scheduled_task_update",
      "guidance_create",
      "guidance_update",
      "work_route_create",
      "work_route_update",
      "maintainer_backlog",
      "product_tooling_fix",
      "measurement_loop_update",
      "no_change",
    ]),
    title: z.string().trim().min(1).max(180),
    proposedChange: z.string().trim().min(1).max(1_800),
    owner: z.enum(["profile_state", "maintainer", "product_code", "none"]),
    expectedImpact: z.string().trim().min(1).max(900),
    smallestUsefulVersion: z.string().trim().min(1).max(900),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(24),
  })
  .strict();

const simulationReviewSchema = z
  .object({
    findingId: z.string().trim().min(1),
    wouldHaveHelpedPastCases: z.enum(["yes", "probably", "unclear", "probably_not", "no"]),
    clientAnnoyanceRisk: z.enum(["low", "medium", "high"]),
    unsafeActionRisk: z.enum(["low", "medium", "high"]),
    duplicateOrOverkillRisk: z.enum(["low", "medium", "high"]),
    evidenceBasedReason: z.string().trim().min(1).max(1_200),
    adjustmentNeeded: z.string().trim().min(1).max(900).nullable(),
  })
  .strict();

const lifecycleDecisionSchema = z
  .object({
    findingId: z.string().trim().min(1),
    decision: z.enum([
      "implement_now",
      "needs_maintainer_review",
      "promising_needs_more_evidence",
      "already_covered_but_broken",
      "reject",
    ]),
    priority: z.enum(["low", "medium", "high"]),
    reason: z.string().trim().min(1).max(1_000),
    finalProposal: improvementProposalSchema.nullable(),
  })
  .strict();

const finalRecommendationSchema = z
  .object({
    rank: z.number().int().min(1).max(20),
    title: z.string().trim().min(1).max(180),
    decision: lifecycleDecisionSchema.shape.decision,
    recommendationType: improvementProposalSchema.shape.recommendationType,
    owner: improvementProposalSchema.shape.owner,
    priority: z.enum(["low", "medium", "high"]),
    action: z.string().trim().min(1).max(1_800),
    whyThisHelpsClient: z.string().trim().min(1).max(1_000),
    evidenceRefs: z.array(z.string().trim().min(1)).min(1).max(24),
    notOverkillBecause: z.string().trim().min(1).max(800),
    howToMeasureLater: z.string().trim().min(1).max(800),
  })
  .strict();

const portfolioSchema = z
  .object({
    executiveSummary: z.string().trim().min(1).max(1_800),
    roleFitSummary: z.string().trim().min(1).max(1_200),
    finalRecommendations: z.array(finalRecommendationSchema).max(12),
    promisingButNeedsEvidence: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(180),
            reason: z.string().trim().min(1).max(700),
          })
          .strict(),
      )
      .max(12),
    alreadyCoveredButBroken: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(180),
            reason: z.string().trim().min(1).max(700),
          })
          .strict(),
      )
      .max(12),
    rejectedOrDeferred: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(180),
            reason: z.string().trim().min(1).max(700),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();

type EvidenceReaderOutput = z.infer<typeof evidenceReaderSchema>;
type ClientRoleProfile = z.infer<typeof clientRoleProfileSchema>;
type Finding = z.infer<typeof findingSchema>;
type ContextPacket = z.infer<typeof contextPacketSchema>;
type CoverageReview = z.infer<typeof coverageReviewSchema>;
type ImprovementProposal = z.infer<typeof improvementProposalSchema>;
type SimulationReview = z.infer<typeof simulationReviewSchema>;
type LifecycleDecision = z.infer<typeof lifecycleDecisionSchema>;
type Portfolio = z.infer<typeof portfolioSchema>;

const CATEGORY_REVIEW_ORDER: z.infer<typeof improvementCategorySchema>[] = [
  "context_memory",
  "clarification_reduction",
  "notification_quality",
  "follow_up_management",
  "document_or_file_handling",
  "crm_or_system_updates",
  "drafting_or_response_help",
  "meeting_or_day_preparation",
  "tool_reliability",
  "approval_and_safety",
  "workflow_or_guidance",
  "measurement_or_learning_loop",
];

function usage(): string {
  return [
    "Usage:",
    "  npm run diagnostics -- helpfulness-flow",
    "  npm run diagnostics -- helpfulness-flow --snapshot=/abs/path/client-summary.json --format=json",
    "",
    "Runs a read-only client-assistant improvement loop against a generated client-state summary.",
    "",
    "Options:",
    `  --snapshot=<path>          Summary snapshot JSON. Default: ${DEFAULT_SNAPSHOT_PATH}`,
    "  --max-work-items=<n>      Recent work items to include. Default: 120",
    "  --max-evidence-items=<n>  Total compact evidence items to include. Default: 180",
    "  --max-findings=<n>        Findings to investigate after dedupe. Default: 10",
    "  --max-problems=<n>        Backward-compatible alias for --max-findings",
    "  --format=markdown|json    Output format. Default: markdown",
    "  --env-profile=dev|prod    Runtime .env to load for LLM credentials only. Default: dev",
    "  --client=<profile-id>     Client id to unwrap from aggregate summary files. Default: testing",
    `  --model=<model>          LLM model for each isolated agent. Default: ${DEFAULT_MODEL}`,
  ].join("\n");
}

function parseArgs(argv: readonly string[]): CliArgs {
  const parsed = parseCli(argv, {
    options: {
      help: { type: "boolean", short: "h" },
      snapshot: { type: "string" },
      "max-work-items": { type: "string" },
      "max-evidence-items": { type: "string" },
      "max-findings": { type: "string" },
      "max-problems": { type: "string" },
      format: { type: "string" },
      "env-profile": { type: "string" },
      client: { type: "string" },
      model: { type: "string" },
    },
    schema: cliSchema,
  });
  if (parsed.help) {
    console.log(usage());
    process.exit(0);
  }
  return parsed;
}

function effectiveMaxFindings(args: CliArgs): number {
  return args["max-problems"] ?? args["max-findings"];
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordValue(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
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

function evidenceItem(input: {
  ref: string;
  kind: string;
  record: JsonRecord;
  titleKeys?: readonly string[];
  summaryKeys?: readonly string[];
  occurredAtKeys?: readonly string[];
}): EvidenceItem {
  return {
    ref: input.ref,
    kind: input.kind,
    occurredAt: firstString(
      input.record,
      input.occurredAtKeys ?? ["finishedAt", "updatedAt", "createdAt"],
    ),
    status: firstString(input.record, ["status", "state"]),
    title: firstString(input.record, input.titleKeys ?? ["title", "summary", "kind"]),
    summary: firstString(
      input.record,
      input.summaryKeys ?? ["resultSummary", "summary", "lastError", "errorMessage"],
    ),
  };
}

function summarizeGuidance(guidance: unknown[]): unknown[] {
  return guidance.map((item) => {
    const record = recordValue(item);
    return {
      key: stringValue(record, "key"),
      status: stringValue(record, "status"),
      title: stringValue(record, "title"),
      selectorDescription: stringValue(record, "selectorDescription"),
      bodyMarkdownExcerpt: stringValue(record, "bodyMarkdown")
        ? truncateForLlmPrompt(stringValue(record, "bodyMarkdown") ?? "", 1_800)
        : null,
    };
  });
}

function summarizeScheduledTasks(tasks: unknown[]): unknown[] {
  return tasks.map((item) => {
    const record = recordValue(item);
    return {
      status: stringValue(record, "status"),
      title: stringValue(record, "title"),
      instructions: stringValue(record, "instructions")
        ? truncateForLlmPrompt(stringValue(record, "instructions") ?? "", 1_800)
        : null,
      schedule: record["schedule"] ?? null,
      nextRunAt: stringValue(record, "nextRunAt"),
      lastRunAt: stringValue(record, "lastRunAt"),
    };
  });
}

function summarizeRoutes(routes: unknown[]): unknown[] {
  return routes.map((item) => {
    const record = recordValue(item);
    return {
      eventType: stringValue(record, "eventType"),
      managedBy: stringValue(record, "managedBy"),
      priority: record["priority"] ?? null,
      instructions: stringValue(record, "instructions")
        ? truncateForLlmPrompt(stringValue(record, "instructions") ?? "", 1_800)
        : null,
    };
  });
}

function summarizeIntegrations(integrations: unknown): unknown {
  const record = recordValue(integrations);
  const connectedAccounts = arrayValue(record.connectedAccounts).map((item) => {
    const account = recordValue(item);
    return {
      provider: stringValue(account, "provider"),
      displayLabel: stringValue(account, "displayLabel"),
      accountEmail: stringValue(account, "accountEmail"),
      connectionStatus: stringValue(account, "connectionStatus"),
      credentialStatus: stringValue(account, "credentialStatus"),
      lastError: stringValue(account, "lastError"),
    };
  });
  const capabilityAccountLinks = arrayValue(record.capabilityAccountLinks).map((item) => {
    const link = recordValue(item);
    const readiness = recordValue(link.readiness);
    return {
      capabilitySlug: stringValue(link, "capabilitySlug"),
      label: stringValue(link, "label"),
      status: stringValue(link, "status"),
      required: link.required ?? null,
      readinessStatus: stringValue(readiness, "status"),
      blockerCode: stringValue(readiness, "blockerCode"),
      lastError: stringValue(readiness, "lastError"),
    };
  });
  const channels = arrayValue(record.channels).map((item) => {
    const channel = recordValue(item);
    return {
      provider: stringValue(channel, "provider"),
      accountId: stringValue(channel, "accountId"),
      status: stringValue(channel, "status"),
    };
  });
  const unhealthyWebhooks = arrayValue(record.webhookSubscriptions)
    .map((item) => {
      const webhook = recordValue(item);
      return {
        providerKey: stringValue(webhook, "providerKey"),
        adapterKey: stringValue(webhook, "adapterKey"),
        eventScope: stringValue(webhook, "eventScope"),
        status: stringValue(webhook, "status"),
        lastErrorCode: stringValue(webhook, "lastErrorCode"),
        lastErrorMessage: stringValue(webhook, "lastErrorMessage"),
        expiresAt: stringValue(webhook, "expiresAt"),
      };
    })
    .filter((webhook) => webhook.status && webhook.status !== "active");
  return {
    connectedAccounts,
    capabilityAccountLinks,
    channels,
    unhealthyWebhooks,
  };
}

function compactSnapshot(
  snapshot: JsonRecord,
  input: CliArgs,
): {
  durableContext: DurableContext;
  evidence: EvidenceItem[];
} {
  const recentActivity = recordValue(snapshot.recentActivity);
  const scheduledTasks = summarizeScheduledTasks(arrayValue(snapshot.scheduledTasks));
  const guidance = summarizeGuidance(arrayValue(snapshot.guidance));
  const assistantWorkRoutes = summarizeRoutes(arrayValue(snapshot.assistantWorkRoutes));
  const integrations = summarizeIntegrations(snapshot.integrations);
  const evidence: EvidenceItem[] = [];

  for (const [index, item] of scheduledTasks.entries()) {
    const record = recordValue(item);
    evidence.push({
      ref: `scheduled_task:${index}`,
      kind: "scheduled_task",
      occurredAt: firstString(record, ["lastRunAt", "nextRunAt"]),
      status: stringValue(record, "status"),
      title: stringValue(record, "title"),
      summary: stringValue(record, "instructions"),
    });
  }
  for (const [index, item] of guidance.entries()) {
    const record = recordValue(item);
    evidence.push({
      ref: `guidance:${stringValue(record, "key") ?? index}`,
      kind: "profile_guidance",
      occurredAt: null,
      status: stringValue(record, "status"),
      title: stringValue(record, "title"),
      summary: firstString(record, ["selectorDescription", "bodyMarkdownExcerpt"]),
    });
  }
  for (const [index, item] of assistantWorkRoutes.entries()) {
    const record = recordValue(item);
    evidence.push({
      ref: `work_route:${stringValue(record, "eventType") ?? index}`,
      kind: "assistant_work_route",
      occurredAt: null,
      status: stringValue(record, "managedBy"),
      title: stringValue(record, "eventType"),
      summary: stringValue(record, "instructions"),
    });
  }
  if (snapshot.integrations) {
    evidence.push({
      ref: "integrations:summary",
      kind: "integrations",
      occurredAt: null,
      status: null,
      title: "Connected provider and capability status",
      summary: truncateForLlmPrompt(JSON.stringify(integrations), 4_000),
    });
    const integrationRecord = recordValue(integrations);
    const channels = arrayValue(integrationRecord.channels);
    if (channels.length > 0) {
      evidence.push({
        ref: "integrations:channels",
        kind: "integration_channels",
        occurredAt: null,
        status: null,
        title: "Active client communication channels",
        summary: truncateForLlmPrompt(JSON.stringify(channels), 1_200),
      });
    }
    for (const [index, item] of arrayValue(integrationRecord.unhealthyWebhooks).entries()) {
      const webhook = recordValue(item);
      evidence.push({
        ref: `integration_webhook:${index}`,
        kind: "integration_webhook",
        occurredAt: stringValue(webhook, "expiresAt"),
        status: stringValue(webhook, "status"),
        title: `${stringValue(webhook, "providerKey") ?? "provider"} ${stringValue(webhook, "eventScope") ?? "webhook"}`,
        summary: firstString(webhook, ["lastErrorMessage", "lastErrorCode"]),
      });
    }
  }
  for (const [index, item] of arrayValue(recentActivity.workItems)
    .slice(0, input["max-work-items"])
    .entries()) {
    evidence.push(
      evidenceItem({
        ref: `work_item:${index}`,
        kind: "work_item",
        record: recordValue(item),
      }),
    );
  }
  for (const [index, item] of arrayValue(recentActivity.actions).slice(0, 80).entries()) {
    evidence.push(
      evidenceItem({
        ref: `action:${index}`,
        kind: "profile_action",
        record: recordValue(item),
        summaryKeys: ["summary", "title", "failureMessage"],
      }),
    );
  }
  for (const [index, item] of arrayValue(recentActivity.backendJobs).slice(0, 80).entries()) {
    evidence.push(
      evidenceItem({
        ref: `backend_job:${index}`,
        kind: "backend_job",
        record: recordValue(item),
        titleKeys: ["kind", "title"],
        summaryKeys: ["lastError", "summary"],
      }),
    );
  }
  for (const [index, item] of arrayValue(recentActivity.artifacts).slice(0, 60).entries()) {
    evidence.push(
      evidenceItem({
        ref: `artifact:${index}`,
        kind: "artifact",
        record: recordValue(item),
        titleKeys: ["filename", "title", "summary"],
        summaryKeys: ["summary", "sourceSummary"],
      }),
    );
  }

  return {
    durableContext: {
      profile: snapshot.profile ?? null,
      scheduledTasks,
      guidance,
      assistantWorkRoutes,
      integrations,
    },
    evidence: evidence.filter((item) => item.title || item.summary).slice(0, input["max-evidence-items"]),
  };
}

function renderEvidenceForPrompt(evidence: readonly EvidenceItem[]) {
  return evidence.map((item) => ({
    ref: item.ref,
    kind: item.kind,
    occurredAt: item.occurredAt,
    status: item.status,
    title: item.title ? truncateForLlmPrompt(item.title, 300) : null,
    summary: item.summary ? truncateForLlmPrompt(item.summary, 1_100) : null,
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
  process.stderr.write(`helpfulness-flow: ${input.stage}\n`);
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

async function runEvidenceReader(input: {
  durableContext: DurableContext;
  evidence: EvidenceItem[];
}): Promise<EvidenceReaderOutput> {
  return runStage({
    stage: "evidence_reader",
    schema: evidenceReaderSchema,
    outputName: "ClientImprovementEvidenceReader",
    outputDescription: "Factual observations from recent assistant behavior.",
    instructions:
      "You are the evidence reader. Read recent assistant behavior and durable context. Output concise factual observations only. Do not propose improvements. Use only provided evidence refs. Some fields are prompt excerpts; never infer that source data is actually truncated merely because a prompt excerpt is short or clipped.",
    promptPayload: {
      role: "evidence_reader",
      durableContext: input.durableContext,
      evidence: renderEvidenceForPrompt(input.evidence),
    },
  });
}

async function runClientRoleProfiler(input: {
  durableContext: DurableContext;
  evidenceReader: EvidenceReaderOutput;
}): Promise<ClientRoleProfile> {
  return runStage({
    stage: "client_role_profiler",
    schema: clientRoleProfileSchema,
    outputName: "ClientRoleProfile",
    outputDescription: "Client-specific model of what this assistant is for.",
    instructions:
      "Infer the assistant role for this specific client from evidence. Stay generic across industries: do not assume a deal coordinator, inbox assistant, or any other role unless the evidence supports it. Define what 10x better means for this client.",
    promptPayload: {
      role: "client_role_profiler",
      durableContext: input.durableContext,
      activitySummary: input.evidenceReader.activitySummary,
      notableFacts: input.evidenceReader.notableFacts,
    },
  });
}

async function runGapFinder(input: {
  durableContext: DurableContext;
  evidenceReader: EvidenceReaderOutput;
  roleProfile: ClientRoleProfile;
}): Promise<Finding[]> {
  const result = await runStage({
    stage: "gap_finder",
    schema: gapFinderSchema,
    outputName: "ClientImprovementFindings",
    outputDescription: "Friction, opportunities, and coverage failures.",
    instructions:
      "You are the gap finder. Compare actual assistant behavior to the inferred client role and 10x definition. Find friction, missed opportunities, and places existing loops appear covered but failed. Do not propose fixes. Prefer concrete, evidence-backed findings over generic advice.",
    promptPayload: {
      role: "gap_finder",
      durableContext: input.durableContext,
      roleProfile: input.roleProfile,
      activitySummary: input.evidenceReader.activitySummary,
      notableFacts: input.evidenceReader.notableFacts,
    },
  });
  return result.findings;
}

async function runCategoryScout(input: {
  category: z.infer<typeof improvementCategorySchema>;
  durableContext: DurableContext;
  evidenceReader: EvidenceReaderOutput;
  roleProfile: ClientRoleProfile;
}): Promise<Finding[]> {
  const result = await runStage({
    stage: `category_scout.${input.category}`,
    schema: gapFinderSchema,
    outputName: "ClientImprovementCategoryFindings",
    outputDescription: "Category-specific friction and opportunity findings.",
    instructions:
      "You are a category-specific scout. Review exactly one category and find improvements that would make this client's assistant materially more useful. Keep findings evidence-backed. Include high-value opportunities even when nothing technically failed. Return no findings only if the evidence truly has nothing relevant for this category. Do not propose fixes.",
    promptPayload: {
      role: "category_scout",
      category: input.category,
      durableContext: input.durableContext,
      roleProfile: input.roleProfile,
      activitySummary: input.evidenceReader.activitySummary,
      notableFacts: input.evidenceReader.notableFacts,
    },
  });
  return result.findings.filter((finding) => finding.category === input.category).slice(0, 4);
}

async function runFindingDeduper(input: {
  findings: Finding[];
  roleProfile: ClientRoleProfile;
  maxFindings: number;
}): Promise<Finding[]> {
  const result = await runStage({
    stage: "finding_deduper",
    schema: findingDeduperSchema,
    outputName: "DeduplicatedClientImprovementFindings",
    outputDescription: "Deduplicated and prioritized findings for investigation.",
    instructions:
      "Merge duplicates, preserve category diversity, and keep findings most likely to make the assistant materially more useful for the client. Keep both proven problems and high-value opportunities. Do not let tool reliability consume the whole list unless every other category is genuinely unsupported. Prefer a portfolio that includes current blockers, proactive workflow improvements, client-memory opportunities, follow-up opportunities, and measurement-loop failures when evidence supports them. Do not propose fixes.",
    promptPayload: {
      role: "finding_deduper",
      maxFindings: input.maxFindings,
      roleProfile: input.roleProfile,
      findings: input.findings,
    },
  });
  return result.findings.slice(0, input.maxFindings);
}

function relatedEvidence(finding: Finding, evidence: readonly EvidenceItem[]): EvidenceItem[] {
  const explicitRefs = new Set(finding.evidenceRefs);
  const terms = `${finding.title} ${finding.actualBehavior} ${finding.betterBehavior}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 3);
  const explicit = evidence.filter((item) => explicitRefs.has(item.ref));
  const semantic = evidence.filter((item) => {
    const haystack = `${item.title ?? ""} ${item.summary ?? ""}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
  return [...new Map([...explicit, ...semantic].map((item) => [item.ref, item])).values()].slice(
    0,
    24,
  );
}

async function runContextGatherer(input: {
  finding: Finding;
  durableContext: DurableContext;
  evidence: EvidenceItem[];
}): Promise<ContextPacket> {
  return runStage({
    stage: `context_gatherer.${input.finding.findingId}`,
    schema: contextPacketSchema,
    outputName: "ClientImprovementContextPacket",
    outputDescription: "Focused context for one finding.",
    instructions:
      "You are the context gatherer for exactly one finding. Gather only relevant context, current system behavior, and missing context. Do not validate and do not propose a fix.",
    promptPayload: {
      role: "context_gatherer",
      finding: input.finding,
      durableContext: input.durableContext,
      relevantEvidence: renderEvidenceForPrompt(relatedEvidence(input.finding, input.evidence)),
    },
  });
}

async function runCoverageChecker(input: {
  finding: Finding;
  context: ContextPacket;
  durableContext: DurableContext;
}): Promise<CoverageReview> {
  return runStage({
    stage: `coverage_checker.${input.finding.findingId}`,
    schema: coverageReviewSchema,
    outputName: "ClientImprovementCoverageReview",
    outputDescription: "Whether existing systems already cover a finding.",
    instructions:
      "You are the coverage checker. Check whether existing guidance, scheduled tasks, work routes, workflows, tools, integrations, or learning loops already cover this finding. If covered but behavior still failed, say covered_but_not_working. Do not propose the fix yet.",
    promptPayload: {
      role: "coverage_checker",
      finding: input.finding,
      context: input.context,
      durableContext: input.durableContext,
    },
  });
}

async function runImprovementProposer(input: {
  finding: Finding;
  context: ContextPacket;
  coverage: CoverageReview;
  roleProfile: ClientRoleProfile;
}): Promise<ImprovementProposal> {
  return runStage({
    stage: `improvement_proposer.${input.finding.findingId}`,
    schema: improvementProposalSchema,
    outputName: "ClientImprovementProposal",
    outputDescription: "One concrete improvement proposal.",
    instructions:
      "You are the improvement proposer. Propose exactly one concrete, smallest-useful improvement for this finding. Use the right owner: profile state, maintainer backlog, or product code. Do not propose ad-hoc JSON files, env knobs, hidden local config, or speculative abstractions. Guidance can shape assistant decisions, but cannot actively poll providers or schedule itself; active checks require scheduled tasks, work routes, or product code. Do not invent notification channels like Slack or Outlook unless provided in evidence. Integration-health monitoring should usually be a maintainer/product loop fix; involve the client only when the client must reauthorize or approve.",
    promptPayload: {
      role: "improvement_proposer",
      roleProfile: input.roleProfile,
      finding: input.finding,
      context: input.context,
      coverage: input.coverage,
    },
  });
}

async function runSimulationReviewer(input: {
  finding: Finding;
  context: ContextPacket;
  coverage: CoverageReview;
  proposal: ImprovementProposal;
  acceptedSoFar: ImprovementProposal[];
}): Promise<SimulationReview> {
  return runStage({
    stage: `simulation_reviewer.${input.finding.findingId}`,
    schema: simulationReviewSchema,
    outputName: "ClientImprovementSimulationReview",
    outputDescription: "Replay-style critique of a proposal against evidence.",
    instructions:
      "Replay the proposed improvement against the past evidence. Would it have helped the cases shown? Would it annoy the client, create unsafe action, duplicate coverage, or be overkill? Be skeptical but do not reject valuable opportunities just because they need maintainer review.",
    promptPayload: {
      role: "simulation_reviewer",
      finding: input.finding,
      context: input.context,
      coverage: input.coverage,
      proposal: input.proposal,
      acceptedSoFar: input.acceptedSoFar,
    },
  });
}

async function runLifecycleDecider(input: {
  finding: Finding;
  coverage: CoverageReview;
  proposal: ImprovementProposal;
  simulation: SimulationReview;
}): Promise<LifecycleDecision> {
  return runStage({
    stage: `lifecycle_decider.${input.finding.findingId}`,
    schema: lifecycleDecisionSchema,
    outputName: "ClientImprovementLifecycleDecision",
    outputDescription: "Lifecycle decision for one proposed improvement.",
    instructions:
      "Choose the lifecycle state for this improvement. Keep finalProposal non-null for implement_now, needs_maintainer_review, promising_needs_more_evidence, and already_covered_but_broken unless the proposal is no_change. Reject only when evidence is weak, overkill/duplicate risk is high, or the change would not help.",
    promptPayload: {
      role: "lifecycle_decider",
      finding: input.finding,
      coverage: input.coverage,
      proposal: input.proposal,
      simulation: input.simulation,
    },
  });
}

async function runPortfolioReviewer(input: {
  durableContext: DurableContext;
  evidenceRefs: readonly string[];
  roleProfile: ClientRoleProfile;
  findings: Finding[];
  decisions: LifecycleDecision[];
}): Promise<Portfolio> {
  return runStage({
    stage: "portfolio_reviewer",
    schema: portfolioSchema,
    outputName: "ClientImprovementPortfolio",
    outputDescription: "Final client assistant improvement portfolio.",
    instructions:
      "You are the final portfolio reviewer. Produce a client-specific improvement loop output, not a narrow bug report. Rank the highest-value implement_now, needs_maintainer_review, and already_covered_but_broken items. Include a balanced portfolio when evidence supports it: current blockers, proactive client-value improvements, and fixes to the improvement loop itself. Keep promising_needs_more_evidence separate. Do not invent evidence refs, channels, direct links, app surfaces, or scheduled task titles; use only evidenceRefs provided or refs already present on finalProposal. If an action references scheduled_task:N, copy the exact title from evidence/context instead of guessing. Do not create recommendations from rejected items.",
    promptPayload: {
      role: "portfolio_reviewer",
      validEvidenceRefs: input.evidenceRefs,
      roleProfile: input.roleProfile,
      findings: input.findings,
      decisions: input.decisions,
      durableContext: input.durableContext,
    },
  });
}

async function runPortfolioAuditor(input: {
  portfolio: Portfolio;
  durableContext: DurableContext;
  evidence: EvidenceItem[];
  roleProfile: ClientRoleProfile;
  decisions: LifecycleDecision[];
}): Promise<Portfolio> {
  return runStage({
    stage: "portfolio_auditor",
    schema: portfolioSchema,
    outputName: "AuditedClientImprovementPortfolio",
    outputDescription: "Audited final improvement portfolio with duplicate and evidence checks.",
    instructions:
      "Audit the portfolio for evidence consistency, duplicate recommendations, invented product surfaces, invented endpoints, invented notification channels, invented exact polling intervals, unsupported percentage claims, prompt-truncation artifacts, and overbroad actions. Return a corrected portfolio. Merge or remove duplicates. Keep actions at the product/maintainer next-step level unless evidence proves the exact implementation mechanism. A product_code recommendation should usually be product_tooling_fix or maintainer_backlog, not scheduled_task_create, unless the existing scheduled-task product surface can really perform the action. A scheduled_task_update must name the exact existing task and only change that task's real purpose; otherwise use scheduled_task_create or maintainer_backlog. Do not cite an unrelated reminder task as evidence for CRM or deal follow-up. Do not recommend increasing field limits or fixing truncation merely because prompt context used excerpts. Do not claim guidance can log failures, check providers, schedule retries, or perform active monitoring by itself. Do not mention internal state, Google Docs memory, settings pages, OAuth scopes, endpoint names, direct links, or notification channels unless the evidence shows that concrete surface; use profile guidance or maintainer_backlog instead. Keep the final list high-value and practical.",
    promptPayload: {
      role: "portfolio_auditor",
      roleProfile: input.roleProfile,
      portfolio: input.portfolio,
      decisions: input.decisions,
      durableContext: input.durableContext,
      evidence: renderEvidenceForPrompt(input.evidence),
    },
  });
}

function normalizeEvidenceRefs(input: {
  portfolio: Portfolio;
  evidence: readonly EvidenceItem[];
  decisions: readonly LifecycleDecision[];
}): Portfolio {
  const validRefs = new Set(input.evidence.map((item) => item.ref));
  const proposalRefs = input.decisions.flatMap((decision) =>
    (decision.finalProposal?.evidenceRefs ?? []).filter((ref) => validRefs.has(ref)),
  );
  const fallbackRefs = [...new Set(proposalRefs)];
  const integrationFallback = validRefs.has("integrations:summary") ? ["integrations:summary"] : [];
  return {
    ...input.portfolio,
    finalRecommendations: input.portfolio.finalRecommendations.map((recommendation) => {
      const refs = recommendation.evidenceRefs.filter((ref) => validRefs.has(ref));
      return {
        ...recommendation,
        evidenceRefs:
          refs.length > 0
            ? refs
            : fallbackRefs.length > 0
              ? fallbackRefs.slice(0, 8)
              : integrationFallback,
      };
    }),
  };
}

function applyDeterministicPortfolioCleanup(portfolio: Portfolio): Portfolio {
  return {
    ...portfolio,
    finalRecommendations: portfolio.finalRecommendations.map((recommendation) => {
      const text = `${recommendation.title} ${recommendation.action}`.toLowerCase();
      if (text.includes("webhook") && recommendation.recommendationType === "guidance_update") {
        return {
          ...recommendation,
          recommendationType: "maintainer_backlog",
          owner: "maintainer",
          action:
            "Create a maintainer backlog item to repair webhook desired state and reconciliation for the affected provider. The fix should avoid unsupported webhook targets, use the provider-supported subscription surface, and fall back to product-owned polling only after maintainer review.",
          notOverkillBecause:
            "Webhook health is a product/integration reliability issue, not a runtime guidance change. Keeping it in the maintainer backlog prevents the assistant from pretending guidance can reconfigure providers.",
        } satisfies typeof recommendation;
      }
      if (/\bevery\s+\d+|\b\d+\s*(minutes?|hours?)\b|\b9\s*am\b|\b5\s*pm\b/i.test(recommendation.action)) {
        return {
          ...recommendation,
          action: recommendation.action
            .replace(/\bevery\s+\d+\s*(minutes?|hours?)\b/gi, "on a reviewed cadence")
            .replace(/\(9am.?5pm Mon.?Fri\)/gi, "during business hours")
            .replace(/\bwithin minutes\b/gi, "promptly"),
          notOverkillBecause:
            "The recommendation leaves cadence as a maintainer-reviewed product decision instead of inventing an exact interval from the diagnostic evidence.",
        } satisfies typeof recommendation;
      }
      if (text.includes("oauth token") || text.includes("fresh oauth tokens")) {
        return {
          ...recommendation,
          action: recommendation.action.replace(
            /providing fresh OAuth tokens|generate new credentials and update the integration configuration/gi,
            "having the client complete the supported OAuth reauthorization flow",
          ),
        } satisfies typeof recommendation;
      }
      return recommendation;
    }),
  };
}

function formatMarkdown(input: {
  snapshot: string;
  evidenceCount: number;
  evidenceReader: EvidenceReaderOutput;
  roleProfile: ClientRoleProfile;
  rawFindings: Finding[];
  findings: Finding[];
  decisions: LifecycleDecision[];
  portfolio: Portfolio;
}): string {
  const lines: string[] = [
    "# Client Assistant Improvement Loop",
    "",
    `Snapshot: ${input.snapshot}`,
    `Evidence items reviewed: ${input.evidenceCount}`,
    `Raw findings discovered: ${input.rawFindings.length}`,
    `Findings investigated: ${input.findings.length}`,
    "",
    "## Inferred Assistant Role",
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
    "## Activity Summary",
    "",
    input.evidenceReader.activitySummary,
    "",
    "## Final Recommendations",
    "",
  ];

  if (input.portfolio.finalRecommendations.length === 0) {
    lines.push("No final recommendations survived portfolio review.", "");
  } else {
    for (const recommendation of input.portfolio.finalRecommendations) {
      lines.push(
        `${recommendation.rank}. ${recommendation.title}`,
        `   - Decision: ${recommendation.decision}`,
        `   - Type: ${recommendation.recommendationType}`,
        `   - Owner: ${recommendation.owner}`,
        `   - Priority: ${recommendation.priority}`,
        `   - Action: ${recommendation.action}`,
        `   - Why: ${recommendation.whyThisHelpsClient}`,
        `   - Evidence: ${recommendation.evidenceRefs.join(", ")}`,
        `   - Not overkill: ${recommendation.notOverkillBecause}`,
        `   - Measure later: ${recommendation.howToMeasureLater}`,
        "",
      );
    }
  }

  if (input.portfolio.promisingButNeedsEvidence.length > 0) {
    lines.push("## Promising But Needs More Evidence", "");
    for (const item of input.portfolio.promisingButNeedsEvidence) {
      lines.push(`- ${item.title}: ${item.reason}`);
    }
    lines.push("");
  }
  if (input.portfolio.alreadyCoveredButBroken.length > 0) {
    lines.push("## Already Covered But Broken", "");
    for (const item of input.portfolio.alreadyCoveredButBroken) {
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

  lines.push("## Investigated Findings", "");
  for (const finding of input.findings) {
    const decision = input.decisions.find((item) => item.findingId === finding.findingId);
    lines.push(
      `- ${finding.title} (${finding.kind}, ${finding.category}, ${finding.severity}): ${decision?.decision ?? "not_decided"}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export async function runHelpfulnessFlowCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  selectedModel = args.model;
  assertRuntimeProfile(args["env-profile"]);
  loadProfileDotEnv(args["env-profile"]);
  const resolvedSnapshotPath = snapshotPath(args.snapshot);
  const snapshot = await readSnapshot(resolvedSnapshotPath, args.client);
  const profileRecord = recordValue(snapshot.profile);
  const profileId = stringValue(profileRecord, "id") ?? args.client;
  const { durableContext, evidence } = compactSnapshot(snapshot, args);
  if (evidence.length === 0) {
    throw new Error(
      `No compact evidence items found in ${resolvedSnapshotPath}. Check that this is a client summary or pass --client for aggregate summaries.`,
    );
  }

  const evidenceReader = await runEvidenceReader({ durableContext, evidence });
  const roleProfile = await runClientRoleProfiler({ durableContext, evidenceReader });
  const broadFindings = await runGapFinder({ durableContext, evidenceReader, roleProfile });
  const categoryFindings: Finding[] = [];
  for (const category of CATEGORY_REVIEW_ORDER) {
    categoryFindings.push(
      ...(await runCategoryScout({
        category,
        durableContext,
        evidenceReader,
        roleProfile,
      })),
    );
  }
  const rawFindings = [...broadFindings, ...categoryFindings];
  const findings = await runFindingDeduper({
    findings: rawFindings,
    roleProfile,
    maxFindings: effectiveMaxFindings(args),
  });

  const contexts: ContextPacket[] = [];
  const coverageReviews: CoverageReview[] = [];
  const proposals: ImprovementProposal[] = [];
  const simulations: SimulationReview[] = [];
  const decisions: LifecycleDecision[] = [];
  const acceptedSoFar: ImprovementProposal[] = [];

  for (const finding of findings) {
    const context = await runContextGatherer({ finding, durableContext, evidence });
    contexts.push(context);
    const coverage = await runCoverageChecker({ finding, context, durableContext });
    coverageReviews.push(coverage);
    const proposal = await runImprovementProposer({ finding, context, coverage, roleProfile });
    proposals.push(proposal);
    const simulation = await runSimulationReviewer({
      finding,
      context,
      coverage,
      proposal,
      acceptedSoFar,
    });
    simulations.push(simulation);
    const decision = await runLifecycleDecider({ finding, coverage, proposal, simulation });
    decisions.push(decision);
    if (
      decision.finalProposal &&
      (decision.decision === "implement_now" ||
        decision.decision === "needs_maintainer_review" ||
        decision.decision === "already_covered_but_broken")
    ) {
      acceptedSoFar.push(decision.finalProposal);
    }
  }

  const portfolio = await runPortfolioReviewer({
    durableContext,
    evidenceRefs: evidence.map((item) => item.ref),
    roleProfile,
    findings,
    decisions,
  });
  const auditedPortfolio = await runPortfolioAuditor({
    portfolio,
    durableContext,
    evidence,
    roleProfile,
    decisions,
  });
  const normalizedPortfolio = applyDeterministicPortfolioCleanup(
    normalizeEvidenceRefs({
    portfolio: auditedPortfolio,
    evidence,
    decisions,
    }),
  );

  const output = {
    snapshot: resolvedSnapshotPath,
    profileId,
    evidenceCount: evidence.length,
    evidenceReader,
    roleProfile,
    broadFindings,
    categoryFindings,
    rawFindings,
    findings,
    contexts,
    coverageReviews,
    proposals,
    simulations,
    decisions,
    portfolioBeforeAudit: portfolio,
    portfolio: normalizedPortfolio,
  };

  if (args.format === "json") {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log(
    formatMarkdown({
      snapshot: resolvedSnapshotPath,
      evidenceCount: evidence.length,
      evidenceReader,
      roleProfile,
      rawFindings,
      findings,
      decisions,
      portfolio: normalizedPortfolio,
    }),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  void runCliMain(() => runHelpfulnessFlowCli());
}
