import type { IntegrationDataAuditReport, IntegrationDataCleanupReport } from "./types";
import { groupCandidatesByCategory } from "./classify";

function renderCandidateList(
  title: string,
  candidates: IntegrationDataAuditReport["candidates"],
): string {
  if (candidates.length === 0) return `## ${title}\n\n_None._\n`;
  const lines = candidates.map(
    (candidate) => {
      const semantic = candidate.semanticReview
        ? `\n  - semantic: ${candidate.semanticReview.category} (${candidate.semanticReview.confidence.toFixed(2)}) — ${candidate.semanticReview.reason}`
        : "";
      return `- \`${candidate.id}\` (${candidate.provider}/${candidate.kind}) — ${candidate.label}\n  - category: ${candidate.category}\n  - cleanup: ${candidate.cleanupAction}\n  - reason: ${candidate.reason}${semantic}`;
    },
  );
  return `## ${title}\n\n${lines.join("\n")}\n`;
}

export function formatAuditMarkdown(report: IntegrationDataAuditReport): string {
  const grouped = groupCandidatesByCategory(report.candidates);
  const sections = report.sections
    .map((section) => {
      const header = `### ${section.provider} (${section.capabilitySlug})\n\n- status: ${section.status}\n- connection: ${section.connectionSummary}`;
      if (section.errorMessage) {
        return `${header}\n- error: ${section.errorMessage}\n`;
      }
      const sampleCount = section.rawSamples.length;
      return `${header}\n- samples: ${sampleCount}\n- section candidates: ${section.candidates.length}\n`;
    })
    .join("\n");

  return [
    `# Testing integration data audit`,
    ``,
    `- generatedAt: ${report.generatedAt}`,
    `- profileId: ${report.profileId}`,
    `- runtimeProfile: ${report.runtimeProfile}`,
    `- manifest active fixtures: ${report.manifestActiveCount}`,
    `- total candidates: ${report.candidates.length}`,
    report.semanticJudge
      ? `- semantic judge: ${report.semanticJudge.status} (${report.semanticJudge.reviewedCandidates} reviewed, ${report.semanticJudge.promotedCandidates} promoted${report.semanticJudge.cacheStatus ? `, cache ${report.semanticJudge.cacheStatus}` : ""})`
      : `- semantic judge: not_requested`,
    report.semanticJudge?.errorMessage ? `- semantic judge error: ${report.semanticJudge.errorMessage}` : null,
    ``,
    `Review this report before cleanup. Prefer \`manifest_backed\` and explicit \`likely_stale\` ids only.`,
    ``,
    `## Provider sections`,
    ``,
    sections,
    renderCandidateList("Protected baseline", grouped.protected_baseline),
    renderCandidateList("Manifest-backed stale fixtures", grouped.manifest_backed),
    renderCandidateList("Likely stale run artifacts", grouped.likely_stale),
    renderCandidateList("Manual review required", grouped.manual_review),
    renderCandidateList("Blocked", grouped.blocked),
    `## Next steps`,
    ``,
    `\`\`\`bash`,
    `npm run integrations -- testing-data cleanup --profile=${report.runtimeProfile} --report=${report.markdownPath.replace(/\.md$/, ".json")}`,
    `npm run integrations -- testing-data cleanup --profile=${report.runtimeProfile} --report=${report.markdownPath.replace(/\.md$/, ".json")} --candidate=<id> --execute`,
    `\`\`\``,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function formatCleanupMarkdown(report: IntegrationDataCleanupReport): string {
  const lines = report.results.map(
    (entry) => `- \`${entry.candidateId}\`: ${entry.status} — ${entry.message}`,
  );
  return [
    `# Testing integration data cleanup`,
    ``,
    `- generatedAt: ${report.generatedAt}`,
    `- sourceReport: ${report.sourceReportPath}`,
    `- mode: ${report.execute ? "execute" : "dry-run"}`,
    `- candidateIds: ${report.candidateIds.join(", ") || "(none)"}`,
    ``,
    lines.length > 0 ? lines.join("\n") : "_No cleanup actions._",
    ``,
  ].join("\n");
}
