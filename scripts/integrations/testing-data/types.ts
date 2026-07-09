export const TESTING_PROFILE_ID = "testing" as const;

export type IntegrationDataCategory =
  | "protected_baseline"
  | "manifest_backed"
  | "likely_stale"
  | "manual_review"
  | "blocked";

export type CleanupAction =
  | "archive_monday_item"
  | "delete_profile_artifact"
  | "trash_google_drive_file"
  | "delete_microsoft_onedrive_item"
  | "revoke_boldsign_document"
  | "report_only";

export type IntegrationDataCandidate = {
  id: string;
  provider: string;
  kind: string;
  label: string;
  category: IntegrationDataCategory;
  cleanupAction: CleanupAction;
  reason: string;
  semanticReview?: {
    category: Extract<IntegrationDataCategory, "likely_stale" | "manual_review">;
    cleanupAction: CleanupAction;
    confidence: number;
    reason: string;
  };
  evidence: Record<string, unknown>;
};

export type ProviderAuditSection = {
  provider: string;
  capabilitySlug: string;
  status: "ok" | "blocked";
  connectionSummary: string;
  errorMessage?: string;
  rawSamples: Record<string, unknown>[];
  candidates: IntegrationDataCandidate[];
};

export type IntegrationDataAuditReport = {
  schemaVersion: 1;
  generatedAt: string;
  profileId: typeof TESTING_PROFILE_ID;
  runtimeProfile: "dev" | "e2e" | "prod";
  markdownPath: string;
  semanticJudge?: {
    enabled: boolean;
    status: "not_requested" | "succeeded" | "failed";
    cacheStatus?: string;
    reviewedCandidates: number;
    promotedCandidates: number;
    errorMessage?: string;
  };
  sections: ProviderAuditSection[];
  candidates: IntegrationDataCandidate[];
  manifestActiveCount: number;
};

export type CleanupResultEntry = {
  candidateId: string;
  status: "planned" | "cleaned" | "skipped" | "failed";
  message: string;
};

export type IntegrationDataCleanupReport = {
  schemaVersion: 1;
  sourceReportPath: string;
  generatedAt: string;
  execute: boolean;
  candidateIds: string[];
  results: CleanupResultEntry[];
};
