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
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import { profileLearningReviewIntegrationInstructionsPath } from "../../judges/registry";
import { parseProfile } from "../cli";

const PROMPT_VERSION = 1;
const SCHEMA_VERSION = 1;
const JUDGE_TIMEOUT_MS = 600_000;

const PROFILE_LEARNING_REVIEW_SOURCE_DIR = "apps/backend/src/product/profile-learning-review";

const PRIMARY_SOURCE_PATHS = [
  "apps/backend/src/product/profile-learning-review/types.ts",
  "apps/backend/src/product/profile-learning-review/candidate-normalization.ts",
  "apps/backend/src/product/profile-learning-review/connect-learning-recommendation-dtos.ts",
  "apps/backend/src/product/profile-learning-review/reviewers/prompt-contracts.ts",
  "packages/connect-api-contracts/src/index.ts",
  "runtime-guidance/state_destination_router/GUIDANCE.ts",
] as const;

const INTEGRATION_SURFACE_PATHS = [
  "apps/backend/src/api/routes/portal-learning-recommendations.ts",
  "apps/backend/src/api/routes/internal-learning-reviews.ts",
  "apps/backend/src/product/assistant-scheduled-tasks/assistant-scheduled-tasks.ts",
  "apps/backend/src/product/assistant-work-items/profile-assistant-work-routes.ts",
  "apps/backend/src/product/profile-guidance/profile-guidance.ts",
  "apps/connect/src/features/approvals/approvals.api.ts",
  "apps/connect/src/features/approvals/approvals.cache-updates.ts",
  "apps/connect/src/features/approvals/approvals.page.tsx",
  "apps/connect/src/features/approvals/approvals.queries.ts",
  "apps/connect/src/features/approvals/approvals.store.ts",
  "packages/connect-api-contracts/src/index.ts",
  "packages/control-plane-contracts/src/schemas.ts",
  "runtime-guidance/state_destination_router/GUIDANCE.ts",
] as const;

const CONSTRAINT_MIGRATION_PATHS = [
  "supabase/migrations/20260606132000_profile_learning_review_guidance_candidates.sql",
  "supabase/migrations/20260606153000_profile_learning_review_evidence_refinery.sql",
  "supabase/migrations/20260609170500_retire_profile_memories.sql",
  "supabase/migrations/20260704120000_drop_workflow_product.sql",
] as const;

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
  return "See profile-learning integration evidence.";
}

const rawProfileLearningReviewIntegrationFindingSchema = z
  .object({
    severity: z.enum(["error", "warning"]),
    title: z.string().trim().min(1),
    surfaces: z
      .union([z.string().trim().min(1), z.array(z.string().trim().min(1))])
      .default([])
      .transform((value) => (Array.isArray(value) ? value : [value])),
    candidate_types: z
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
    surfaces: finding.surfaces,
    candidateTypes: finding.candidate_types,
    explanation: finding.explanation,
    evidence: stringifyJudgeField(finding.evidence),
    recommendation: stringifyJudgeField(finding.recommendation),
  }));

const profileLearningReviewIntegrationResultSchema = z
  .object({
    is_valid: z.boolean(),
    summary: z.string().trim().min(1),
    findings: z.array(rawProfileLearningReviewIntegrationFindingSchema),
  })
  .strict();

type ProfileLearningReviewIntegrationResult = z.infer<
  typeof profileLearningReviewIntegrationResultSchema
>;

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
    "Usage: npm run guard -- semantic profile-learning-review-integration [--profile dev] [--list]",
    "",
    "Runs a Codex-backed JSON LLM judge over profile-learning candidate integration surfaces.",
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

async function tsSourcePaths(root: string, relativeDir: string): Promise<string[]> {
  const absoluteDir = path.join(root, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) return tsSourcePaths(root, relativePath);
      if (entry.isFile() && entry.name.endsWith(".ts")) return [relativePath];
      return [];
    }),
  );
  return nested.flat().sort((left, right) => left.localeCompare(right));
}

async function evidence(input: { root: string }): Promise<Record<string, unknown>> {
  const profileLearningReviewPaths = await tsSourcePaths(
    input.root,
    PROFILE_LEARNING_REVIEW_SOURCE_DIR,
  );
  const [agentsMd, primarySources, constraintMigrations] = await Promise.all([
    sourceEvidence(input.root, "AGENTS.md"),
    Promise.all(PRIMARY_SOURCE_PATHS.map((relativePath) => sourceEvidence(input.root, relativePath))),
    Promise.all(
      CONSTRAINT_MIGRATION_PATHS.map((relativePath) => sourceEvidence(input.root, relativePath)),
    ),
  ]);

  return {
    repo: {
      packageName: "@ai-assistants/workspace",
      judgment: "profile-learning candidate integration coverage",
    },
    agentsMd,
    canonicalSchemas: {
      profileLearningReviewCandidateTypes: profileLearningReviewCandidateTypeSchema.options,
      profileLearningReviewTargetKinds: profileLearningReviewTargetKindSchema.options,
    },
    primarySources,
    constraintMigrations,
    profileLearningReviewSourcePaths: profileLearningReviewPaths,
    integrationSurfacePaths: INTEGRATION_SURFACE_PATHS,
    judgmentScope: [
      "Judge profile-learning candidate integration across backend generation, validation, review UI/API, approval, apply, and durable-state owner surfaces.",
      "Use canonicalSchemas as the source of truth for candidate types and target kinds.",
      "Use primarySources and constraintMigrations for compact source evidence, and use the Cursor-indexed repo paths in profileLearningReviewSourcePaths and integrationSurfacePaths to inspect surrounding implementation when needed.",
      "Use integrationSurfacePaths to identify downstream surfaces that must understand candidate types, target kinds, guidance, scheduled tasks, and work routes.",
      "Judge DB migration constraints only for profile-learning candidate and observation persistence; do not judge unrelated provider implementations, live client data, or generated runtime workspace files.",
      "Prefer actionable missing-integration findings over generic requests for more deterministic coverage.",
    ],
  };
}

function formatFailure(result: ProfileLearningReviewIntegrationResult): string {
  return result.findings
    .filter((finding) => finding.severity === "error")
    .map((finding) =>
      [
        `- ${finding.title}`,
        `  Surfaces: ${finding.surfaces.length ? finding.surfaces.join(", ") : "unspecified"}`,
        `  Candidate types: ${
          finding.candidateTypes.length ? finding.candidateTypes.join(", ") : "unspecified"
        }`,
        `  ${finding.explanation}`,
        `  Evidence: ${finding.evidence}`,
        `  Recommendation: ${finding.recommendation}`,
      ].join("\n"),
    )
    .join("\n\n");
}

export async function runProfileLearningReviewIntegrationJudgeCli(
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
    readFile(profileLearningReviewIntegrationInstructionsPath(), "utf8"),
  ]);

  if (args.list) {
    console.log(
      JSON.stringify(
        {
          schema_version: SCHEMA_VERSION,
          primary_source_count: Array.isArray(judgeEvidence.primarySources)
            ? judgeEvidence.primarySources.length
            : 0,
          profile_learning_review_source_path_count: Array.isArray(
            judgeEvidence.profileLearningReviewSourcePaths,
          )
            ? judgeEvidence.profileLearningReviewSourcePaths.length
            : 0,
          integration_surface_count: Array.isArray(judgeEvidence.integrationSurfacePaths)
            ? judgeEvidence.integrationSurfacePaths.length
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
    "profile-learning-review-integration",
  );

  console.error(
    `Running profile-learning review integration LLM judge (profile=${args.profile}, cache ${cacheDir ? "enabled" : "disabled"}).`,
  );

  const startedAt = Date.now();
  const judge = await runJsonJudge({
    id: "profile-learning-review-integration",
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    schema: profileLearningReviewIntegrationResultSchema,
    instructions: instructionsText.trim(),
    evidence: judgeEvidence,
    repoRoot: root,
    cacheDir,
    timeoutMs: JUDGE_TIMEOUT_MS,
    codex: {
      ignoreUserConfig: true,
      ignoreRules: true,
    },
  });

  const errorCount = judge.result.findings.filter((finding) => finding.severity === "error").length;
  const warningCount = judge.result.findings.filter(
    (finding) => finding.severity === "warning",
  ).length;
  const ok = judge.result.is_valid && errorCount === 0;
  console.error(
    `Profile-learning review integration judge: ${ok ? "valid" : "invalid"} (${judge.cacheStatus}, errors=${errorCount}, warnings=${warningCount})`,
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
    console.error(`Profile-learning review integration judge failed:\n\n${formatFailure(judge.result)}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runProfileLearningReviewIntegrationJudgeCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
