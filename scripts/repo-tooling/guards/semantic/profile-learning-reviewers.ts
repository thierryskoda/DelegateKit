#!/usr/bin/env tsx

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runJsonJudge } from "@ai-assistants/llm-judge";
import {
  profileLearningReviewCandidateTypeSchema,
  profileLearningReviewTargetKindSchema,
} from "@ai-assistants/control-plane-contracts";
import { profileRuntimeDir, repoRoot, type RuntimeProfile } from "@ai-assistants/repo-layout";
import { PROVIDER_ASSISTANT_WORK_EVENT_TYPES } from "@ai-assistants/tool-contracts";
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { profileLearningReviewersInstructionsPath } from "../../judges/registry";
import { parseProfile } from "../cli";

const PROMPT_VERSION = 1;
const SCHEMA_VERSION = 1;
const JUDGE_TIMEOUT_MS = 240_000;

const REVIEWER_SOURCE_DIR = "apps/backend/src/product/profile-learning-review/reviewers";
const PROFILE_LEARNING_REVIEW_SOURCE_DIR = "apps/backend/src/product/profile-learning-review";
const STATE_DESTINATION_ROUTER_SOURCE_PATH =
  "runtime-guidance/state_destination_router/GUIDANCE.ts";

type Args = {
  profile: RuntimeProfile;
  help: boolean;
  list: boolean;
};

function stringifyJudgeField(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const text = value
      .map((entry) => stringifyJudgeField(entry))
      .filter(Boolean)
      .join("; ");
    if (text.trim()) return text.trim();
  }
  if (value && typeof value === "object") return JSON.stringify(value);
  return "See profile-learning reviewer evidence.";
}

const rawProfileLearningReviewerFindingSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    title: z.string().trim().min(1),
    reviewers: z
      .union([z.string().trim().min(1), z.array(z.string().trim().min(1))])
      .default([])
      .transform((value) => (Array.isArray(value) ? value : [value])),
    sources: z
      .union([z.string().trim().min(1), z.array(z.string().trim().min(1))])
      .default([])
      .transform((value) => (Array.isArray(value) ? value : [value])),
    explanation: z.string().trim().min(1),
    evidence: z.unknown(),
    recommendation: z.unknown(),
  })
  .passthrough()
  .transform((finding) => ({
    severity: finding.severity,
    title: finding.title,
    reviewers: finding.reviewers,
    sources: finding.sources,
    explanation: finding.explanation,
    evidence: stringifyJudgeField(finding.evidence),
    recommendation: stringifyJudgeField(finding.recommendation),
  }));

const profileLearningReviewersResultSchema = z
  .object({
    is_valid: z.boolean(),
    summary: z.string().trim().min(1),
    findings: z.array(rawProfileLearningReviewerFindingSchema),
  })
  .strict();

type ProfileLearningReviewersResult = z.infer<typeof profileLearningReviewersResultSchema>;

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
    "Usage: npm run guard -- semantic profile-learning-reviewers [--profile dev] [--list]",
    "",
    "Runs a Codex-backed JSON LLM judge over profile-learning reviewer prompt source and canonical contracts.",
  ].join("\n");
}

function lineNumbered(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line, index) => `${String(index + 1).padStart(4, " ")} | ${line}`)
    .join("\n");
}

async function sourceEvidence(
  root: string,
  relativePath: string,
): Promise<Record<string, unknown>> {
  const absolutePath = path.join(root, relativePath);
  const text = await readFile(absolutePath, "utf8");
  return {
    path: relativePath,
    lineNumbered: lineNumbered(text.trim()),
  };
}

async function reviewerSourcePaths(root: string): Promise<string[]> {
  const absoluteDir = path.join(root, REVIEWER_SOURCE_DIR);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(REVIEWER_SOURCE_DIR, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

async function evidence(input: { root: string }): Promise<Record<string, unknown>> {
  const reviewerPaths = await reviewerSourcePaths(input.root);
  const supportingPaths = [
    `${PROFILE_LEARNING_REVIEW_SOURCE_DIR}/types.ts`,
    `${PROFILE_LEARNING_REVIEW_SOURCE_DIR}/candidate-normalization.ts`,
    `${PROFILE_LEARNING_REVIEW_SOURCE_DIR}/prompt-shaping.ts`,
    `${PROFILE_LEARNING_REVIEW_SOURCE_DIR}/verification.ts`,
    STATE_DESTINATION_ROUTER_SOURCE_PATH,
  ] as const;

  const [agentsMd, reviewerSources, supportingSources] = await Promise.all([
    sourceEvidence(input.root, "AGENTS.md"),
    Promise.all(reviewerPaths.map((relativePath) => sourceEvidence(input.root, relativePath))),
    Promise.all(supportingPaths.map((relativePath) => sourceEvidence(input.root, relativePath))),
  ]);

  return {
    repo: {
      packageName: "@ai-assistants/workspace",
      judgment: "profile-learning reviewer prompt health",
    },
    agentsMd,
    canonicalSchemas: {
      profileLearningReviewCandidateTypes: profileLearningReviewCandidateTypeSchema.options,
      profileLearningReviewTargetKinds: profileLearningReviewTargetKindSchema.options,
      supportedWorkRouteEventTypes: PROVIDER_ASSISTANT_WORK_EVENT_TYPES,
    },
    reviewerSources,
    supportingSources,
    judgmentScope: [
      "Judge profile-learning reviewer prompts and reviewer orchestration only.",
      "Use canonicalSchemas as the source of truth for candidate types, target kinds, and work-route event types.",
      "Use the State Destination Router source as the source of truth for destination placement rules.",
      "Use AGENTS.md for maintainer expectations around typed guidance, no stale stringly contracts, no silent fallbacks, and durable state boundaries.",
      "Do not judge unrelated runtime guidance, live client data, provider implementations, or DB migrations.",
    ],
  };
}

function formatFailure(result: ProfileLearningReviewersResult): string {
  return result.findings
    .filter((finding) => finding.severity === "error")
    .map((finding) =>
      [
        `- ${finding.title}`,
        `  Reviewers: ${finding.reviewers.length ? finding.reviewers.join(", ") : "unspecified"}`,
        `  Sources: ${finding.sources.length ? finding.sources.join(", ") : "unspecified"}`,
        `  ${finding.explanation}`,
        `  Evidence: ${finding.evidence}`,
        `  Recommendation: ${finding.recommendation}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export async function runProfileLearningReviewersJudgeCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const root = repoRoot(import.meta.url);
  const [judgeEvidence, instructionsText] = await Promise.all([
    evidence({ root }),
    readFile(profileLearningReviewersInstructionsPath(), "utf8"),
  ]);

  if (args.list) {
    console.log(
      JSON.stringify(
        {
          schema_version: SCHEMA_VERSION,
          reviewer_source_count: Array.isArray(judgeEvidence.reviewerSources)
            ? judgeEvidence.reviewerSources.length
            : 0,
          supporting_source_count: Array.isArray(judgeEvidence.supportingSources)
            ? judgeEvidence.supportingSources.length
            : 0,
          candidate_types: profileLearningReviewCandidateTypeSchema.options,
          target_kinds: profileLearningReviewTargetKindSchema.options,
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
    "profile-learning-reviewers",
  );

  console.error(
    `Running profile-learning reviewer prompt LLM judge (profile=${args.profile}, cache ${cacheDir ? "enabled" : "disabled"}).`,
  );

  const startedAt = Date.now();
  const judge = await runJsonJudge({
    id: "profile-learning-reviewers",
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    schema: profileLearningReviewersResultSchema,
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
    `Profile-learning reviewer prompt judge: ${ok ? "valid" : "invalid"} (${judge.cacheStatus}, errors=${errorCount}, warnings=${warningCount})`,
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
    console.error(
      `Profile-learning reviewer prompt judge failed:\n\n${formatFailure(judge.result)}`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runProfileLearningReviewersJudgeCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
