import { TESTING_FIXTURE_CLIENT } from "../../../tests/e2e/helpers/test-data/testing-realistic-data";
import type { StaleFixtureCandidate } from "../../repo-tooling/e2e-fixtures/cleanup-stale-fixtures";
import type { CleanupAction, IntegrationDataCandidate, IntegrationDataCategory } from "./types";

const STALE_MARKER_PATTERNS = [
  /\bE2E\b/i,
  /AI Assistants/i,
  /testing-[a-z0-9-]{4,}/i,
  /@example\.test\b/i,
  /signer-[a-z0-9-]+@example\.test/i,
] as const;

const PROTECTED_TEXT_PATTERNS = [
  /jordan\s+rowan/i,
  /\bmenard\b/i,
  new RegExp(TESTING_FIXTURE_CLIENT.person.email.replaceAll(".", "\\."), "i"),
  new RegExp(TESTING_FIXTURE_CLIENT.company.name.replaceAll(" ", "\\s+"), "i"),
] as const;

function textHaystack(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((part) => typeof part === "string" && part.trim()).join(" ");
}

function hasStaleMarker(text: string): boolean {
  return STALE_MARKER_PATTERNS.some((pattern) => pattern.test(text));
}

function hasProtectedBaselineSignal(text: string): boolean {
  return PROTECTED_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function candidateId(provider: string, kind: string, resourceId: string): string {
  return `${provider}:${kind}:${resourceId}`;
}

function classifyText(
  haystack: string,
  input: {
    provider: string;
    kind: string;
    resourceId: string;
    label: string;
    defaultCleanupAction: CleanupAction;
    evidence: Record<string, unknown>;
    manifestBacked?: boolean;
    blockedReason?: string;
  },
): IntegrationDataCandidate {
  if (input.blockedReason) {
    return {
      id: candidateId(input.provider, input.kind, input.resourceId),
      provider: input.provider,
      kind: input.kind,
      label: input.label,
      category: "blocked",
      cleanupAction: "report_only",
      reason: input.blockedReason,
      evidence: input.evidence,
    };
  }

  if (input.manifestBacked) {
    return {
      id: candidateId(input.provider, input.kind, input.resourceId),
      provider: input.provider,
      kind: input.kind,
      label: input.label,
      category: "manifest_backed",
      cleanupAction: input.defaultCleanupAction,
      reason: "Active E2E fixture manifest entry.",
      evidence: input.evidence,
    };
  }

  if (hasProtectedBaselineSignal(haystack) && !hasStaleMarker(haystack)) {
    return {
      id: candidateId(input.provider, input.kind, input.resourceId),
      provider: input.provider,
      kind: input.kind,
      label: input.label,
      category: "protected_baseline",
      cleanupAction: "report_only",
      reason: "Matches Jordan Rowan testing baseline fixture signals without stale run markers.",
      evidence: input.evidence,
    };
  }

  if (hasStaleMarker(haystack)) {
    return {
      id: candidateId(input.provider, input.kind, input.resourceId),
      provider: input.provider,
      kind: input.kind,
      label: input.label,
      category: "likely_stale",
      cleanupAction: input.defaultCleanupAction,
      reason: "Contains explicit E2E/AI Assistants/testing marker patterns.",
      evidence: input.evidence,
    };
  }

  return {
    id: candidateId(input.provider, input.kind, input.resourceId),
    provider: input.provider,
    kind: input.kind,
    label: input.label,
    category: "manual_review",
    cleanupAction: "report_only",
    reason: "No automatic stale marker; review before cleanup.",
    evidence: input.evidence,
  };
}

export function classifyMondayItem(input: {
  itemId: string;
  title: string | null;
  fieldsByKey: Record<string, unknown>;
  manifestBacked?: boolean;
}): IntegrationDataCandidate {
  const haystack = textHaystack([
    input.title,
    JSON.stringify(input.fieldsByKey),
    typeof input.fieldsByKey.company === "string" ? input.fieldsByKey.company : null,
    typeof input.fieldsByKey.primary_contact === "string"
      ? input.fieldsByKey.primary_contact
      : null,
  ]);
  return classifyText(haystack, {
    provider: "monday",
    kind: "item",
    resourceId: input.itemId,
    label: input.title ?? input.itemId,
    defaultCleanupAction: "archive_monday_item",
    manifestBacked: input.manifestBacked,
    evidence: {
      itemId: input.itemId,
      title: input.title,
      fieldsByKey: input.fieldsByKey,
    },
  });
}

export function classifyGoogleDriveItem(input: {
  fileId: string;
  name: string | null;
  mimeType?: string | null;
  manifestBacked?: boolean;
}): IntegrationDataCandidate {
  const kind = input.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file";
  const haystack = textHaystack([input.name]);
  return classifyText(haystack, {
    provider: "google-drive",
    kind,
    resourceId: input.fileId,
    label: input.name ?? input.fileId,
    defaultCleanupAction: "trash_google_drive_file",
    manifestBacked: input.manifestBacked,
    evidence: {
      fileId: input.fileId,
      name: input.name,
      mimeType: input.mimeType ?? null,
    },
  });
}

export function classifyCalendarEvent(input: {
  eventId: string;
  calendarId: string;
  title: string | null;
  location: string | null;
}): IntegrationDataCandidate {
  const haystack = textHaystack([input.title, input.location]);
  return classifyText(haystack, {
    provider: "google-calendar",
    kind: "event",
    resourceId: input.eventId,
    label: input.title ?? input.eventId,
    defaultCleanupAction: "report_only",
    evidence: {
      eventId: input.eventId,
      calendarId: input.calendarId,
      title: input.title,
      location: input.location,
    },
  });
}

export function classifyMicrosoftOneDriveItem(input: {
  itemId: string;
  name: string | null;
  type: string;
}): IntegrationDataCandidate {
  const kind = input.type === "folder" ? "folder" : "file";
  const haystack = textHaystack([input.name]);
  return classifyText(haystack, {
    provider: "microsoft-onedrive",
    kind,
    resourceId: input.itemId,
    label: input.name ?? input.itemId,
    defaultCleanupAction: "delete_microsoft_onedrive_item",
    evidence: {
      itemId: input.itemId,
      name: input.name,
      type: input.type,
    },
  });
}

export function classifyBoldSignRequest(input: {
  documentId: string;
  title: string | null;
  status: string;
  sentAt: string | null;
}): IntegrationDataCandidate {
  const haystack = textHaystack([input.title, input.status]);
  const base = classifyText(haystack, {
    provider: "boldsign",
    kind: "signature_request",
    resourceId: input.documentId,
    label: input.title ?? input.documentId,
    defaultCleanupAction: "revoke_boldsign_document",
    evidence: {
      documentId: input.documentId,
      title: input.title,
      status: input.status,
      sentAt: input.sentAt,
    },
  });
  if (
    base.category === "likely_stale" &&
    /completed|signed|declined|revoked|cancelled/i.test(input.status)
  ) {
    return {
      ...base,
      category: "manual_review",
      cleanupAction: "report_only",
      reason: `BoldSign request has terminal status ${input.status}; revoke manually if still needed.`,
    };
  }
  return base;
}

export function candidateFromManifestEntry(
  candidate: StaleFixtureCandidate,
): IntegrationDataCandidate | null {
  const resource = candidate.resource;
  if (resource.kind === "monday.item") {
    const mondayResource = resource as Extract<
      StaleFixtureCandidate["resource"],
      { kind: "monday.item" }
    >;
    return classifyMondayItem({
      itemId: mondayResource.itemId,
      title: mondayResource.label,
      fieldsByKey: {},
      manifestBacked: true,
    });
  }
  if (resource.kind === "profile.artifact") {
    const artifactResource = resource as Extract<
      StaleFixtureCandidate["resource"],
      { kind: "profile.artifact" }
    >;
    return {
      id: candidateId("profile", "artifact", artifactResource.artifactId),
      provider: "profile",
      kind: "artifact",
      label: artifactResource.label,
      category: "manifest_backed",
      cleanupAction: "delete_profile_artifact",
      reason: "Active E2E fixture manifest entry.",
      evidence: { ...artifactResource },
    };
  }
  return null;
}

export function groupCandidatesByCategory(
  candidates: readonly IntegrationDataCandidate[],
): Record<IntegrationDataCategory, IntegrationDataCandidate[]> {
  const grouped: Record<IntegrationDataCategory, IntegrationDataCandidate[]> = {
    protected_baseline: [],
    manifest_backed: [],
    likely_stale: [],
    manual_review: [],
    blocked: [],
  };
  for (const candidate of candidates) {
    grouped[candidate.category].push(candidate);
  }
  return grouped;
}

export function dedupeCandidates(
  candidates: readonly IntegrationDataCandidate[],
): IntegrationDataCandidate[] {
  const byId = new Map<string, IntegrationDataCandidate>();
  for (const candidate of candidates) {
    const existing = byId.get(candidate.id);
    if (!existing) {
      byId.set(candidate.id, candidate);
      continue;
    }
    const priority: Record<IntegrationDataCategory, number> = {
      manifest_backed: 5,
      likely_stale: 4,
      protected_baseline: 3,
      manual_review: 2,
      blocked: 1,
    };
    if (priority[candidate.category] > priority[existing.category]) {
      byId.set(candidate.id, candidate);
    }
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
