import {
  connectActionDetailSchema,
  connectLearningRecommendationDtoSchema,
  type ConnectActionDetailDto,
  type ConnectLearningRecommendationDto,
} from "@ai-assistants/connect-api-contracts";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { loadClientDurableState, type ClientDurableState } from "../client-state/read-model";
import type { ProfileLearningReviewCandidate } from "./storage";
import { parseProfileLearningReviewCandidateEvidence } from "./types";

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}...`;
}

function scheduledTaskTargetSummary(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = stringField(record.kind);
  if (kind === "assistant_instructions") return "Assistant instructions";
  return kind;
}

function scheduleSummary(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const kind = stringField(record.kind);
  if (kind === "at") {
    const at = stringField(record.at);
    return at ? `Once at ${at}` : "One-time schedule";
  }
  if (kind === "every") {
    const everySeconds = numberField(record.everySeconds);
    return everySeconds === null ? "Fixed interval schedule" : `Every ${everySeconds} seconds`;
  }
  if (kind === "cron") {
    const expr = stringField(record.expr);
    const timezone = stringField(record.timezone);
    return [expr ? `Cron ${expr}` : "Cron schedule", timezone].filter(Boolean).join(" in ");
  }
  return kind;
}

function candidateWritesInstructions(candidate: ProfileLearningReviewCandidate): boolean {
  switch (candidate.candidate_type) {
    case "scheduled_task_create":
    case "scheduled_task_update":
    case "scheduled_task_instructions_update":
    case "work_route_create":
    case "work_route_update":
    case "work_route_instructions_update":
      return true;
    default:
      return false;
  }
}

function patchObject(candidate: ProfileLearningReviewCandidate): Record<string, unknown> {
  const patch = candidate.proposed_patch;
  return patch && typeof patch === "object" && !Array.isArray(patch)
    ? (patch as Record<string, unknown>)
    : {};
}

function routeInstructions(config: unknown): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  return stringField((config as Record<string, unknown>).instructions);
}

function targetSummaryFromState(
  candidate: ProfileLearningReviewCandidate,
  state: Pick<
    ClientDurableState,
    "scheduledTasks" | "workRoutes" | "profileGuidance"
  >,
): string | null {
  if (!candidate.target_id || candidate.target_kind === "none") return null;
  if (candidate.target_kind === "assistant_scheduled_task") {
    const task = state.scheduledTasks.find((entry) => entry.id === candidate.target_id);
    return task?.title ?? null;
  }
  if (candidate.target_kind === "profile_assistant_work_route") {
    const route = state.workRoutes.find((entry) => entry.id === candidate.target_id);
    if (!route) return null;
    const instructions = routeInstructions(route.config);
    return instructions
      ? `${route.event_type}: ${truncateText(instructions, 140)}`
      : route.event_type;
  }
  if (candidate.target_kind === "profile_guidance") {
    const guidance = state.profileGuidance.find((entry) => entry.id === candidate.target_id);
    return guidance ? `${guidance.title} (${guidance.key})` : null;
  }
  const exhaustive: never = candidate.target_kind;
  return exhaustive;
}

export async function learningRecommendationTargetSummary(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
): Promise<string | null> {
  const state = await loadClientDurableState(db, {
    profileId: candidate.profile_id,
    mode: "snapshot",
    limit: 1_000,
  });
  return targetSummaryFromState(candidate, state);
}

export async function learningRecommendationTargetSummaries(
  db: SupabaseServiceClient,
  profileId: string,
  candidates: readonly ProfileLearningReviewCandidate[],
): Promise<Map<string, string | null>> {
  const state = await loadClientDurableState(db, {
    profileId,
    mode: "snapshot",
    limit: 1_000,
  });
  return new Map(
    candidates.map((candidate) => [candidate.id, targetSummaryFromState(candidate, state)]),
  );
}

function targetLabel(candidate: ProfileLearningReviewCandidate): string {
  switch (candidate.target_kind) {
    case "assistant_scheduled_task":
      return "Scheduled task";
    case "profile_assistant_work_route":
      return "Email or event behavior";
    case "profile_guidance":
      return "Assistant guidance";
    case "none":
      return "Assistant profile";
    default:
      return "Assistant profile";
  }
}

function titleForCandidate(candidate: ProfileLearningReviewCandidate): string {
  switch (candidate.candidate_type) {
    case "scheduled_task_create":
      return "Create a scheduled task";
    case "scheduled_task_update":
      return "Update a scheduled task";
    case "scheduled_task_pause":
      return "Pause a scheduled task";
    case "scheduled_task_delete":
      return "Delete a scheduled task";
    case "scheduled_task_instructions_update":
      return "Update a scheduled task";
    case "work_route_create":
      return "Create an event trigger";
    case "work_route_update":
      return "Update event handling";
    case "work_route_delete":
      return "Delete an event trigger";
    case "work_route_instructions_update":
      return "Update email handling";
    case "guidance_create":
      return "Create assistant guidance";
    case "guidance_update":
      return "Update assistant guidance";
    case "guidance_archive":
      return "Archive assistant guidance";
    default:
      return "Review assistant learning";
  }
}

function summaryForCandidate(candidate: ProfileLearningReviewCandidate): string {
  const patch = patchObject(candidate);
  return (
    stringField(patch.changeSummary) ??
    stringField(patch.title) ??
    stringField(patch.selectorDescription) ??
    stringField(patch.eventType) ??
    stringField(patch.summary) ??
    stringField(patch.bodyMarkdown) ??
    stringField(patch.instructions) ??
    candidate.rationale
  );
}

function previewBody(
  candidate: ProfileLearningReviewCandidate,
): { label: string; value: string } | null {
  const patch = patchObject(candidate);
  const bodyMarkdown = stringField(patch.bodyMarkdown);
  if (bodyMarkdown) return { label: "Proposed guidance", value: bodyMarkdown };
  const instructions = stringField(patch.instructions);
  if (candidateWritesInstructions(candidate) && instructions) {
    return { label: "Proposed instructions", value: instructions };
  }
  const target = scheduledTaskTargetSummary(patch.target);
  if (target) return { label: "Scheduled task target", value: target };
  const schedule = scheduleSummary(patch.schedule);
  if (schedule) return { label: "Schedule", value: schedule };
  if (instructions) return { label: "New instructions", value: instructions };
  const summary = stringField(patch.summary);
  if (summary) return { label: "Summary", value: summary };
  const eventType = stringField(patch.eventType);
  if (eventType) return { label: "Event type", value: eventType };
  return null;
}

function connectStatus(
  candidate: ProfileLearningReviewCandidate,
): ConnectLearningRecommendationDto["status"] {
  switch (candidate.status) {
    case "proposed":
    case "applying":
    case "client_applied":
    case "rejected":
    case "skipped":
    case "failed":
      return candidate.status;
    case "auto_applied":
      return "client_applied";
    default: {
      const exhaustive: never = candidate.status;
      return exhaustive;
    }
  }
}

function learningRecommendationConnectDetail(
  candidate: ProfileLearningReviewCandidate,
  input: { targetSummary: string | null },
): ConnectActionDetailDto {
  const patch = patchObject(candidate);
  const evidence = parseProfileLearningReviewCandidateEvidence(candidate.evidence);
  const verifierReason = evidence.verifier?.reason ?? null;
  const detail = {
    kind: "profile_learning_recommendation",
    headline: titleForCandidate(candidate),
    preview: {
      label: "Improve how your assistant handles this next time",
      sections: [
        {
          title: "Recommendation",
          fields: [
            { label: "Area", value: targetLabel(candidate) },
            ...(input.targetSummary ? [{ label: "Target", value: input.targetSummary }] : []),
            { label: "Confidence", value: candidate.confidence },
          ],
          body: previewBody(candidate),
          changes: [
            ...(stringField(patch.title)
              ? [{ label: "Title", after: stringField(patch.title) }]
              : []),
            ...(stringField(patch.key) ? [{ label: "Key", after: stringField(patch.key) }] : []),
            ...(stringField(patch.selectorDescription)
              ? [{ label: "When to use", after: stringField(patch.selectorDescription) }]
              : []),
            ...(stringField(patch.changeSummary)
              ? [{ label: "Change", after: stringField(patch.changeSummary) }]
              : []),
            ...(stringField(patch.eventType)
              ? [{ label: "Event type", after: stringField(patch.eventType) }]
              : []),
            ...(scheduledTaskTargetSummary(patch.target)
              ? [{ label: "Target", after: scheduledTaskTargetSummary(patch.target) }]
              : []),
            ...(scheduleSummary(patch.schedule)
              ? [{ label: "Schedule", after: scheduleSummary(patch.schedule) }]
              : []),
            ...(candidateWritesInstructions(candidate) && stringField(patch.instructions)
              ? [{ label: "Instructions", after: stringField(patch.instructions) }]
              : []),
            ...(numberField(patch.priority) !== null
              ? [{ label: "Priority", after: String(numberField(patch.priority)) }]
              : []),
          ],
        },
        {
          title: "Why",
          fields: [
            { label: "Supporting examples", value: String(evidence.supportingRefs.length) },
            ...(evidence.counterRefs.length > 0
              ? [
                  {
                    label: "Possible conflicts checked",
                    value: String(evidence.counterRefs.length),
                  },
                ]
              : []),
          ],
          body: { label: "Reason", value: candidate.rationale },
          changes: [],
        },
        ...(verifierReason
          ? [
              {
                title: "Check",
                fields: [],
                body: { label: "Why this is worth reviewing", value: verifierReason },
                changes: [],
              },
            ]
          : []),
      ],
    },
  } satisfies ConnectActionDetailDto;
  return connectActionDetailSchema.parse(detail);
}

export function toConnectLearningRecommendationDto(
  candidate: ProfileLearningReviewCandidate,
  input: { targetSummary?: string | null } = {},
): ConnectLearningRecommendationDto {
  const targetSummary = input.targetSummary ?? null;
  const dto = {
    id: candidate.id,
    status: connectStatus(candidate),
    candidateType: candidate.candidate_type,
    targetKind: candidate.target_kind,
    targetSummary,
    confidence: candidate.confidence,
    title: titleForCandidate(candidate),
    summary: summaryForCandidate(candidate),
    rationale: candidate.rationale,
    detail: learningRecommendationConnectDetail(candidate, { targetSummary }),
    createdAt: candidate.created_at,
  } satisfies ConnectLearningRecommendationDto;
  return connectLearningRecommendationDtoSchema.parse(dto);
}
