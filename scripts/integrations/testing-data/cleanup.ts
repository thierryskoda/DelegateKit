import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { repoRoot } from "@ai-assistants/repo-layout";
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import {
  boldsignApiRevokeDocument,
  executeGoogleDriveNangoProxyOperation,
  executeMicrosoftOnedriveDriveNangoProxyOperation,
  googleDriveNangoProxyRecordSchema,
  microsoftOnedriveDriveNangoProxyRecordSchema,
  mondayLiveArchiveItems,
  requireGoogleDriveNango,
  requireMicrosoftOnedriveNango,
} from "../../../apps/backend/src/ops-support/provider-cleanup";
import {
  createDefaultCleanupHandlers,
  cleanupStaleFixtureCandidate,
  type StaleFixtureCandidate,
} from "../../repo-tooling/e2e-fixtures/cleanup-stale-fixtures";
import { requireSingleTestingNangoConnection } from "../../../tests/e2e/helpers/readiness/testing-provider-readiness";
import { AUDITED_TESTING_CAPABILITIES } from "./providers";
import { formatCleanupMarkdown } from "./report-format";
import {
  installTestingDataRuntime,
  parseTestingDataSharedArgs,
  profileFlagsFromArgv,
  usage,
} from "./runtime";
import type {
  CleanupResultEntry,
  IntegrationDataAuditReport,
  IntegrationDataCandidate,
  IntegrationDataCleanupReport,
} from "./types";

const cleanupArgsSchema = z.object({
  report: z.string().trim().min(1),
  candidate: z.array(z.string()).optional(),
  execute: z.boolean().optional(),
});

const ALLOWED_CLEANUP_CATEGORIES = new Set<IntegrationDataCandidate["category"]>([
  "manifest_backed",
  "likely_stale",
]);

function readAuditReport(reportPath: string): IntegrationDataAuditReport {
  const absolute = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(repoRoot(import.meta.url), reportPath);
  const raw = JSON.parse(readFileSync(absolute, "utf8")) as unknown;
  z.object({
    schemaVersion: z.literal(1),
    candidates: z.array(z.unknown()).min(0),
  }).parse(raw);
  return raw as IntegrationDataAuditReport;
}

function manifestCandidateFromEvidence(
  candidate: IntegrationDataCandidate,
): StaleFixtureCandidate | null {
  if (candidate.provider === "monday" && candidate.kind === "item") {
    const itemId = String(candidate.evidence.itemId ?? "");
    const providerConfigKey = String(candidate.evidence.providerConfigKey ?? "");
    const connectionId = String(candidate.evidence.connectionId ?? "");
    const boardId = String(candidate.evidence.boardId ?? "");
    if (!itemId || !providerConfigKey || !connectionId || !boardId) return null;
    return {
      manifestPath: "integration-audit",
      runId: "integration-audit",
      label: candidate.label,
      createdAt: new Date(0),
      resource: {
        kind: "monday.item",
        providerConfigKey,
        connectionId,
        boardId,
        itemId,
        label: candidate.label,
      },
    };
  }
  if (candidate.provider === "profile" && candidate.kind === "artifact") {
    const artifactId = String(candidate.evidence.artifactId ?? "");
    const profileId = String(candidate.evidence.profileId ?? "testing");
    const storageBucket = String(candidate.evidence.storageBucket ?? "");
    const storageKey = String(candidate.evidence.storageKey ?? "");
    if (!artifactId || !storageBucket || !storageKey) return null;
    return {
      manifestPath: "integration-audit",
      runId: "integration-audit",
      label: candidate.label,
      createdAt: new Date(0),
      resource: {
        kind: "profile.artifact",
        profileId,
        artifactId,
        storageBucket,
        storageKey,
        label: candidate.label,
      },
    };
  }
  return null;
}

async function trashGoogleDriveFile(
  db: SupabaseServiceClient,
  candidate: IntegrationDataCandidate,
): Promise<void> {
  const fileId = String(candidate.evidence.fileId ?? "");
  if (!fileId)
    throw new Error(`Google Drive candidate ${candidate.id} is missing fileId evidence.`);
  const binding = await requireGoogleDriveNango(db, "testing");
  await executeGoogleDriveNangoProxyOperation(
    binding.nangoProviderConfigKey,
    binding.nangoConnectionId,
    "update-file",
    googleDriveNangoProxyRecordSchema,
    { fileId, trashed: true },
  );
}

async function revokeBoldSignDocument(candidate: IntegrationDataCandidate): Promise<void> {
  const documentId = String(candidate.evidence.documentId ?? "");
  if (!documentId) {
    throw new Error(`BoldSign candidate ${candidate.id} is missing documentId evidence.`);
  }
  await boldsignApiRevokeDocument({
    documentId,
    message: "Revoked by testing integration data cleanup maintainer script.",
  });
}

async function deleteMicrosoftOneDriveItem(
  db: SupabaseServiceClient,
  candidate: IntegrationDataCandidate,
): Promise<void> {
  const itemId = String(candidate.evidence.itemId ?? "");
  if (!itemId) {
    throw new Error(`Microsoft OneDrive candidate ${candidate.id} is missing itemId evidence.`);
  }
  const binding = await requireMicrosoftOnedriveNango(db, "testing");
  await executeMicrosoftOnedriveDriveNangoProxyOperation(
    binding.nangoProviderConfigKey,
    binding.nangoConnectionId,
    "delete-item",
    microsoftOnedriveDriveNangoProxyRecordSchema,
    { itemId },
  );
}

async function archiveMondayItem(
  db: SupabaseServiceClient,
  candidate: IntegrationDataCandidate,
): Promise<void> {
  const itemId = String(candidate.evidence.itemId ?? "");
  if (!itemId) throw new Error(`Monday candidate ${candidate.id} is missing itemId evidence.`);
  const fixture = await requireSingleTestingNangoConnection(db, AUDITED_TESTING_CAPABILITIES.monday);
  await mondayLiveArchiveItems({
    providerConfigKey: fixture.connectedAccount.nango_provider_config_key!,
    connectionId: fixture.connectedAccount.nango_connection_id!,
    targets: [{ providerItemId: itemId }],
  });
}

async function executeCandidateCleanup(
  db: SupabaseServiceClient,
  candidate: IntegrationDataCandidate,
  handlers: ReturnType<typeof createDefaultCleanupHandlers>,
): Promise<CleanupResultEntry> {
  if (candidate.cleanupAction === "report_only") {
    return {
      candidateId: candidate.id,
      status: "skipped",
      message: "Report-only candidate.",
    };
  }

  if (candidate.cleanupAction === "delete_profile_artifact") {
    const manifestCandidate = manifestCandidateFromEvidence(candidate);
    if (!manifestCandidate) {
      return {
        candidateId: candidate.id,
        status: "failed",
        message: "Missing artifact evidence for profile artifact cleanup.",
      };
    }
    await cleanupStaleFixtureCandidate(manifestCandidate, handlers);
    return {
      candidateId: candidate.id,
      status: "cleaned",
      message: "Deleted profile artifact.",
    };
  }

  if (candidate.cleanupAction === "archive_monday_item") {
    await archiveMondayItem(db, candidate);
    return {
      candidateId: candidate.id,
      status: "cleaned",
      message: "Archived Monday item.",
    };
  }

  if (candidate.cleanupAction === "trash_google_drive_file") {
    await trashGoogleDriveFile(db, candidate);
    return {
      candidateId: candidate.id,
      status: "cleaned",
      message: "Moved Google Drive file to trash.",
    };
  }

  if (candidate.cleanupAction === "revoke_boldsign_document") {
    await revokeBoldSignDocument(candidate);
    return {
      candidateId: candidate.id,
      status: "cleaned",
      message: "Revoked BoldSign signature request.",
    };
  }

  if (candidate.cleanupAction === "delete_microsoft_onedrive_item") {
    await deleteMicrosoftOneDriveItem(db, candidate);
    return {
      candidateId: candidate.id,
      status: "cleaned",
      message: "Deleted Microsoft OneDrive item.",
    };
  }

  return {
    candidateId: candidate.id,
    status: "skipped",
    message: `Unsupported cleanup action ${candidate.cleanupAction}.`,
  };
}

export async function runTestingDataCleanup(argv: readonly string[]): Promise<void> {
  if (argv[0] !== "cleanup") {
    throw new Error(`Expected testing-data subcommand cleanup.\n\n${usage()}`);
  }
  const { profile } = parseTestingDataSharedArgs(["cleanup", ...profileFlagsFromArgv(argv)]);

  const args = parseCli(
    argv
      .slice(1)
      .filter((arg) => !arg.startsWith("--profile=") && !arg.startsWith("--profile-id=")),
    {
      options: {
        report: { type: "string" },
        candidate: { type: "string", multiple: true },
        execute: { type: "boolean" },
      },
      allowPositionals: false,
      schema: cleanupArgsSchema,
    },
  );

  const audit = readAuditReport(args.report);
  const selectedIds = new Set(args.candidate ?? []);
  if (args.execute === true && selectedIds.size === 0) {
    throw new Error(
      "Refusing execute without explicit --candidate=<id> flags. Run dry-run first, review the audit markdown, then pass candidate ids.",
    );
  }

  const selected = audit.candidates.filter((candidate) =>
    selectedIds.size === 0 ? true : selectedIds.has(candidate.id),
  );

  for (const id of selectedIds) {
    if (!audit.candidates.some((candidate) => candidate.id === id)) {
      throw new Error(`Candidate ${JSON.stringify(id)} was not found in audit report.`);
    }
  }

  const db = installTestingDataRuntime(profile);
  const handlers = createDefaultCleanupHandlers(db);
  const results: CleanupResultEntry[] = [];

  for (const candidate of selected) {
    if (!ALLOWED_CLEANUP_CATEGORIES.has(candidate.category)) {
      results.push({
        candidateId: candidate.id,
        status: "skipped",
        message: `Category ${candidate.category} is not eligible for automatic cleanup.`,
      });
      continue;
    }
    if (candidate.cleanupAction === "report_only") {
      results.push({
        candidateId: candidate.id,
        status: "skipped",
        message: candidate.reason,
      });
      continue;
    }
    if (!args.execute) {
      results.push({
        candidateId: candidate.id,
        status: "planned",
        message: `Would run ${candidate.cleanupAction}: ${candidate.reason}`,
      });
      continue;
    }

    try {
      results.push(await executeCandidateCleanup(db, candidate, handlers));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        candidateId: candidate.id,
        status: "failed",
        message,
      });
    }
  }

  const cleanupReport: IntegrationDataCleanupReport = {
    schemaVersion: 1,
    sourceReportPath: args.report,
    generatedAt: new Date().toISOString(),
    execute: args.execute === true,
    candidateIds: [...selectedIds],
    results,
  };

  const resultPath = args.report.replace(/\.json$/i, ".cleanup.json");
  writeFileSync(resultPath, `${JSON.stringify(cleanupReport, null, 2)}\n`, "utf8");
  const markdownPath = resultPath.replace(/\.json$/i, ".md");
  writeFileSync(markdownPath, `${formatCleanupMarkdown(cleanupReport)}\n`, "utf8");

  const cleaned = results.filter((entry) => entry.status === "cleaned").length;
  const planned = results.filter((entry) => entry.status === "planned").length;
  const skipped = results.filter((entry) => entry.status === "skipped").length;
  const failed = results.filter((entry) => entry.status === "failed").length;
  console.log(
    `[testing-data] cleanup mode=${args.execute ? "execute" : "dry-run"} cleaned=${cleaned} planned=${planned} skipped=${skipped} failed=${failed}`,
  );
  console.log(`[testing-data] cleanup report: ${resultPath}`);
}
