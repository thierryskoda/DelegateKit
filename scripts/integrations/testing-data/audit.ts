import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { backendToolResultSchema, toolContractByName } from "@ai-assistants/tool-contracts";
import { boldsignToolContracts } from "@ai-assistants/boldsign-contracts/contracts";
import { googleCalendarToolContracts } from "@ai-assistants/google-calendar-contracts/contracts";
import { microsoftOnedriveToolContracts } from "@ai-assistants/microsoft-onedrive-contracts/contracts";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { repoRoot } from "@ai-assistants/repo-layout";
import { parseCli } from "@ai-assistants/workspace-shared";
import { z } from "zod";
import {
  executeBoldSignReadTool,
  executeGoogleCalendarReadTool,
  executeGoogleDriveReadAndArtifactTool,
  executeMicrosoftOnedriveReadAndArtifactTool,
  mondayBoardList,
  mondayItemList,
} from "../../../apps/backend/src/ops-support/provider-audit";
import {
  activeFixtureCandidatesFromEvents,
  findFixtureManifestPaths,
  readFixtureManifestEvents,
} from "../../repo-tooling/e2e-fixtures/cleanup-stale-fixtures";
import { TESTING_FIXTURE_CLIENT } from "../../../tests/e2e/helpers/test-data/testing-realistic-data";
import { requireTestingCapabilityConnected } from "../../../tests/e2e/helpers/readiness/testing-capability-readiness";
import { requireSingleTestingNangoConnection } from "../../../tests/e2e/helpers/readiness/testing-provider-readiness";
import {
  candidateFromManifestEntry,
  classifyBoldSignRequest,
  classifyCalendarEvent,
  classifyGoogleDriveItem,
  classifyMicrosoftOneDriveItem,
  classifyMondayItem,
  dedupeCandidates,
} from "./classify";
import { AUDIT_SEARCH_QUERIES, AUDITED_TESTING_CAPABILITIES } from "./providers";
import { formatAuditMarkdown } from "./report-format";
import {
  installTestingDataRuntime,
  parseTestingDataSharedArgs,
  profileFlagsFromArgv,
  usage,
} from "./runtime";
import { reviewTestingDataCandidatesWithCursor } from "./semantic-review";
import type {
  IntegrationDataAuditReport,
  IntegrationDataCandidate,
  ProviderAuditSection,
} from "./types";
import { TESTING_PROFILE_ID } from "./types";

const auditArgsSchema = z.object({
  out: z.string().trim().min(1).optional(),
  "runs-dir": z.string().trim().min(1).optional(),
  judge: z.boolean().optional(),
});

function defaultAuditPaths(): { markdownPath: string; jsonPath: string; auditId: string } {
  const auditId = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+$/, "")
    .replace("T", "-");
  const base = path.join(repoRoot(import.meta.url), "tmp", "integration-audits", auditId);
  return {
    auditId,
    markdownPath: `${base}.md`,
    jsonPath: `${base}.json`,
  };
}

function calendarSearchWindow(): { timeMin: string; timeMax: string } {
  const now = Date.now();
  const yearMs = 365 * 24 * 60 * 60 * 1000;
  return {
    timeMin: new Date(now - yearMs).toISOString(),
    timeMax: new Date(now + yearMs).toISOString(),
  };
}

async function auditConnectionHealth(db: SupabaseServiceClient): Promise<ProviderAuditSection[]> {
  const sections: ProviderAuditSection[] = [];
  for (const requirement of Object.values(AUDITED_TESTING_CAPABILITIES)) {
    try {
      await requireTestingCapabilityConnected(db, requirement);
      sections.push({
        provider: requirement.provider,
        capabilitySlug: requirement.capabilitySlug,
        status: "ok",
        connectionSummary: `Connected healthy binding for ${requirement.label}.`,
        rawSamples: [],
        candidates: [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sections.push({
        provider: requirement.provider,
        capabilitySlug: requirement.capabilitySlug,
        status: "blocked",
        connectionSummary: "Connection check failed.",
        errorMessage: message,
        rawSamples: [],
        candidates: [],
      });
    }
  }
  return sections;
}

function loadManifestCandidates(runsDir: string): IntegrationDataCandidate[] {
  const manifestPaths = findFixtureManifestPaths(runsDir);
  const candidates: IntegrationDataCandidate[] = [];
  for (const manifestPath of manifestPaths) {
    const events = readFixtureManifestEvents(manifestPath);
    for (const active of activeFixtureCandidatesFromEvents(manifestPath, events)) {
      const classified = candidateFromManifestEntry(active);
      if (classified) candidates.push(classified);
    }
  }
  return candidates;
}

async function auditMonday(db: SupabaseServiceClient): Promise<ProviderAuditSection> {
  const capabilitySlug = "monday";
  try {
    const boardList = await mondayBoardList({ db, profileId: TESTING_PROFILE_ID, limit: 50 });
    const searches: Array<{ titleContains: string }> = [
      { titleContains: "E2E" },
      { titleContains: "AI Assistants" },
      { titleContains: "testing-" },
    ];

    const candidates: IntegrationDataCandidate[] = [];
    const rawSamples: Record<string, unknown>[] = [];

    for (const board of boardList.boards) {
      for (const search of searches) {
        const result = await mondayItemList({
          db,
          profileId: TESTING_PROFILE_ID,
          boardId: board.boardId,
          limit: 100,
          titleContains: search.titleContains,
        });
        rawSamples.push({
          boardId: board.boardId,
          boardName: board.name,
          search,
          itemCount: result.items.length,
        });
        for (const item of result.items) {
          candidates.push(
            classifyMondayItem({
              itemId: item.itemId,
              title: item.name,
              fieldsByKey: Object.fromEntries(
                Object.entries(item.columnValuesById).map(([columnId, value]) => [
                  columnId,
                  value.text ?? value.value,
                ]),
              ),
            }),
          );
        }
      }
      const allItems = await mondayItemList({
        db,
        profileId: TESTING_PROFILE_ID,
        boardId: board.boardId,
        limit: 100,
      });
      const clientMatches = allItems.items.filter((item) =>
        Object.values(item.columnValuesById).some(
          (value) =>
            value.text === TESTING_FIXTURE_CLIENT.company.name ||
            value.value === TESTING_FIXTURE_CLIENT.company.name,
        ),
      );
      rawSamples.push({
        boardId: board.boardId,
        boardName: board.name,
        search: { company: TESTING_FIXTURE_CLIENT.company.name },
        itemCount: clientMatches.length,
      });
      for (const item of clientMatches) {
        candidates.push(
          classifyMondayItem({
            itemId: item.itemId,
            title: item.name,
            fieldsByKey: Object.fromEntries(
              Object.entries(item.columnValuesById).map(([columnId, value]) => [
                columnId,
                value.text ?? value.value,
              ]),
            ),
          }),
        );
      }
    }

    return {
      provider: "monday",
      capabilitySlug,
      status: "ok",
      connectionSummary: `Listed Monday items across ${boardList.boards.length} board(s) for ${searches.length + 1} audit query types.`,
      rawSamples,
      candidates,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      provider: "monday",
      capabilitySlug,
      status: "blocked",
      connectionSummary: "Monday audit failed.",
      errorMessage: message,
      rawSamples: [],
      candidates: [],
    };
  }
}

async function auditCalendar(db: SupabaseServiceClient): Promise<ProviderAuditSection> {
  const capabilitySlug = "google-calendar";
  const { timeMin, timeMax } = calendarSearchWindow();
  try {
    const fixture = await requireSingleTestingNangoConnection(
      db,
      AUDITED_TESTING_CAPABILITIES.googleCalendar,
    );
    if (fixture.capabilityAccountLink.provider !== "google-calendar") {
      return {
        provider: "google-calendar",
        capabilitySlug,
        status: "blocked",
        connectionSummary: "Calendar event search audit requires Google Calendar.",
        errorMessage: `Connected calendar provider is ${fixture.capabilityAccountLink.provider}; google_calendar_events_search is Google-only.`,
        rawSamples: [],
        candidates: [],
      };
    }

    const candidates: IntegrationDataCandidate[] = [];
    const rawSamples: Record<string, unknown>[] = [];
    for (const query of AUDIT_SEARCH_QUERIES) {
      const result = await executeGoogleCalendarReadTool(
        db,
        TESTING_PROFILE_ID,
        "google_calendar_events_search",
        {
          connectedAccountId: fixture.connectedAccount.id,
          calendarId: "primary",
          query,
          timeMin,
          timeMax,
          maxResults: 50,
        },
      );
      if ("error" in result) {
        rawSamples.push({ query, error: result.error.message });
        continue;
      }
      const data = toolContractByName(
        googleCalendarToolContracts,
        "google_calendar_events_search",
      ).outputSchema.parse(result.data);
      rawSamples.push({ query, eventCount: data.events.length });
      for (const event of data.events) {
        candidates.push(
          classifyCalendarEvent({
            eventId: event.id,
            calendarId: event.calendarId,
            title: event.title,
            location: event.location,
          }),
        );
      }
    }
    return {
      provider: "google-calendar",
      capabilitySlug,
      status: "ok",
      connectionSummary: `Searched primary calendar with ${AUDIT_SEARCH_QUERIES.length} queries.`,
      rawSamples,
      candidates,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      provider: "google-calendar",
      capabilitySlug,
      status: "blocked",
      connectionSummary: "Calendar audit failed.",
      errorMessage: message,
      rawSamples: [],
      candidates: [],
    };
  }
}

async function auditGoogleDrive(db: SupabaseServiceClient): Promise<ProviderAuditSection> {
  const capabilitySlug = "google-drive";
  try {
    const fixture = await requireSingleTestingNangoConnection(
      db,
      AUDITED_TESTING_CAPABILITIES.googleDrive,
    );
    const connectedAccountId = fixture.connectedAccount.id;
    const candidates: IntegrationDataCandidate[] = [];
    const rawSamples: Record<string, unknown>[] = [];

    for (const query of AUDIT_SEARCH_QUERIES) {
      const result = await executeGoogleDriveReadAndArtifactTool(
        db,
        TESTING_PROFILE_ID,
        "google_drive_search",
        {
          connectedAccountId,
          query,
          pageSize: 50,
        },
      );
      if ("error" in result) {
        rawSamples.push({ query, error: result.error.message });
        continue;
      }
      const envelope = backendToolResultSchema.parse(result);
      if (!("data" in envelope)) continue;
      const data = envelope.data as Record<string, unknown>;
      const files = (data.files ?? data.records ?? []) as unknown[];
      rawSamples.push({ query, fileCount: files.length });
      for (const file of files) {
        if (!file || typeof file !== "object") continue;
        const record = file as Record<string, unknown>;
        const fileId = typeof record.id === "string" ? record.id : null;
        if (!fileId) continue;
        candidates.push(
          classifyGoogleDriveItem({
            fileId,
            name: typeof record.name === "string" ? record.name : null,
            mimeType: typeof record.mimeType === "string" ? record.mimeType : null,
          }),
        );
      }
    }

    return {
      provider: "google-drive",
      capabilitySlug,
      status: "ok",
      connectionSummary: `Searched Drive with ${AUDIT_SEARCH_QUERIES.length} queries.`,
      rawSamples,
      candidates,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      provider: "google-drive",
      capabilitySlug,
      status: "blocked",
      connectionSummary: "Google Drive audit failed.",
      errorMessage: message,
      rawSamples: [],
      candidates: [],
    };
  }
}

async function auditMicrosoftOneDrive(db: SupabaseServiceClient): Promise<ProviderAuditSection> {
  const capabilitySlug = "microsoft-onedrive";
  try {
    const fixture = await requireSingleTestingNangoConnection(
      db,
      AUDITED_TESTING_CAPABILITIES.microsoftOneDrive,
    );
    const connectedAccountId = fixture.connectedAccount.id;
    const candidates: IntegrationDataCandidate[] = [];
    const rawSamples: Record<string, unknown>[] = [];

    for (const query of AUDIT_SEARCH_QUERIES) {
      const result = await executeMicrosoftOnedriveReadAndArtifactTool(
        db,
        TESTING_PROFILE_ID,
        "microsoft_onedrive_files_search",
        {
          connectedAccountId,
          query,
        },
      );
      if ("error" in result) {
        rawSamples.push({ query, error: result.error.message });
        continue;
      }
      const envelope = backendToolResultSchema.parse(result);
      if (!("data" in envelope)) continue;
      const data = toolContractByName(
        microsoftOnedriveToolContracts,
        "microsoft_onedrive_files_search",
      ).outputSchema.parse(envelope.data);
      rawSamples.push({ query, itemCount: data.items.length });
      for (const item of data.items) {
        candidates.push(
          classifyMicrosoftOneDriveItem({
            itemId: item.id,
            name: item.name,
            type: item.type,
          }),
        );
      }
    }

    return {
      provider: "microsoft-onedrive",
      capabilitySlug,
      status: "ok",
      connectionSummary: `Searched OneDrive with ${AUDIT_SEARCH_QUERIES.length} queries.`,
      rawSamples,
      candidates,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      provider: "microsoft-onedrive",
      capabilitySlug,
      status: "blocked",
      connectionSummary: "Microsoft OneDrive audit failed.",
      errorMessage: message,
      rawSamples: [],
      candidates: [],
    };
  }
}

async function auditBoldSign(db: SupabaseServiceClient): Promise<ProviderAuditSection> {
  const capabilitySlug = "boldsign";
  try {
    const candidates: IntegrationDataCandidate[] = [];
    const rawSamples: Record<string, unknown>[] = [];
    for (const query of AUDIT_SEARCH_QUERIES) {
      const result = await executeBoldSignReadTool(
        db,
        TESTING_PROFILE_ID,
        "boldsign_signature_requests_list",
        { query, limit: 50 },
      );
      if ("error" in result) {
        rawSamples.push({ query, error: result.error.message });
        continue;
      }
      const data = toolContractByName(
        boldsignToolContracts,
        "boldsign_signature_requests_list",
      ).outputSchema.parse(result.data);
      rawSamples.push({ query, requestCount: data.requests.length });
      for (const request of data.requests) {
        if (!request.documentId) continue;
        candidates.push(
          classifyBoldSignRequest({
            documentId: request.documentId,
            title: request.title,
            status: request.status,
            sentAt: request.sentAt,
          }),
        );
      }
    }
    return {
      provider: "boldsign",
      capabilitySlug,
      status: "ok",
      connectionSummary: `Listed BoldSign requests for ${AUDIT_SEARCH_QUERIES.length} queries.`,
      rawSamples,
      candidates,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      provider: "boldsign",
      capabilitySlug,
      status: "blocked",
      connectionSummary: "BoldSign audit failed.",
      errorMessage: message,
      rawSamples: [],
      candidates: [],
    };
  }
}

export async function runTestingDataAudit(argv: readonly string[]): Promise<void> {
  if (argv[0] !== "audit") {
    throw new Error(`Expected testing-data subcommand audit.\n\n${usage()}`);
  }
  const { profile, profileId } = parseTestingDataSharedArgs([
    "audit",
    ...profileFlagsFromArgv(argv),
  ]);

  const args = parseCli(
    argv
      .slice(1)
      .filter((arg) => !arg.startsWith("--profile=") && !arg.startsWith("--profile-id=")),
    {
      options: {
        out: { type: "string" },
        "runs-dir": { type: "string" },
        judge: { type: "boolean" },
      },
      allowPositionals: false,
      schema: auditArgsSchema,
    },
  );

  const defaults = defaultAuditPaths();
  const markdownPath = args.out
    ? path.isAbsolute(args.out)
      ? args.out
      : path.join(repoRoot(import.meta.url), args.out)
    : defaults.markdownPath;
  const jsonPath = markdownPath.replace(/\.md$/i, ".json");
  const runsDir = args["runs-dir"] ?? path.join(repoRoot(import.meta.url), "tmp", "e2e", "runs");

  const db = installTestingDataRuntime(profile);
  const connectionSections = await auditConnectionHealth(db);
  const providerSections = await Promise.all([
    auditCalendar(db),
    auditGoogleDrive(db),
    auditMonday(db),
    auditMicrosoftOneDrive(db),
    auditBoldSign(db),
  ]);

  const manifestCandidates = loadManifestCandidates(runsDir);
  const sections = [...connectionSections, ...providerSections];
  const deterministicCandidates = dedupeCandidates([
    ...manifestCandidates,
    ...sections.flatMap((section) => section.candidates),
  ]);
  const semanticReview = args.judge
    ? await reviewTestingDataCandidatesWithCursor({
        profile,
        candidates: deterministicCandidates,
      })
    : null;
  const candidates = semanticReview?.candidates ?? deterministicCandidates;

  const semanticJudge: NonNullable<IntegrationDataAuditReport["semanticJudge"]> = semanticReview
    ? {
        enabled: true,
        status: semanticReview.status,
        ...(semanticReview.cacheStatus ? { cacheStatus: semanticReview.cacheStatus } : {}),
        reviewedCandidates: semanticReview.reviewedCandidates,
        promotedCandidates: semanticReview.promotedCandidates,
        ...(semanticReview.errorMessage ? { errorMessage: semanticReview.errorMessage } : {}),
      }
    : {
        enabled: false,
        status: "not_requested",
        reviewedCandidates: 0,
        promotedCandidates: 0,
      };

  const report: IntegrationDataAuditReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    profileId: profileId as typeof TESTING_PROFILE_ID,
    runtimeProfile: profile,
    markdownPath,
    semanticJudge,
    sections,
    candidates,
    manifestActiveCount: manifestCandidates.length,
  };

  mkdirSync(path.dirname(markdownPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, `${formatAuditMarkdown(report)}\n`, "utf8");

  console.log(`[testing-data] audit markdown: ${markdownPath}`);
  console.log(`[testing-data] audit json: ${jsonPath}`);
  console.log(
    `[testing-data] candidates=${candidates.length} manifest=${manifestCandidates.length} semantic=${semanticJudge.status} promoted=${semanticJudge.promotedCandidates}`,
  );
}
