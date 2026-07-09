import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import {
  createProfileAssistantWorkRoute,
  deleteProfileAssistantWorkRoute,
  updateProfileAssistantWorkRoute,
} from "../assistant-work-items/profile-assistant-work-routes";
import {
  createAssistantScheduledTask,
  deleteAssistantScheduledTask,
  pauseAssistantScheduledTask,
  updateAssistantScheduledTask,
} from "../assistant-scheduled-tasks/assistant-scheduled-tasks";
import {
  archiveProfileGuidance,
  createProfileGuidance,
  updateProfileGuidance,
} from "../profile-guidance/profile-guidance";
import {
  claimLearningReviewCandidateForApply,
  updateLearningReviewCandidateStatus,
  type ProfileLearningReviewCandidate,
} from "./storage";
import {
  parseProfileLearningReviewCandidateEvidence,
  parseProfileLearningReviewCandidatePatch,
} from "./types";

type ApplyOutcome =
  | "applying"
  | "auto_applied"
  | "client_applied"
  | "rejected"
  | "skipped"
  | "failed";

async function loadAssistantForProfile(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<TableRow<"assistants">> {
  const result = await db.from("assistants").select().eq("profile_id", profileId).limit(1).single();
  return requireSupabaseData(`Load assistant for profile ${profileId}`, result.data, result.error);
}

function evidenceRefs(candidate: ProfileLearningReviewCandidate): string[] {
  return parseProfileLearningReviewCandidateEvidence(candidate.evidence).supportingRefs;
}

function hasOnlyExplicitClientEvidence(candidate: ProfileLearningReviewCandidate): boolean {
  const refs = evidenceRefs(candidate);
  return refs.length > 0 && refs.every((ref) => ref.startsWith("channel_message:"));
}

function isHighConfidence(candidate: ProfileLearningReviewCandidate): boolean {
  return candidate.confidence === "high";
}

function changedText(current: string, next: string): boolean {
  return current.trim().replace(/\s+/g, " ") !== next.trim().replace(/\s+/g, " ");
}

function assertScheduledTaskCandidateRevision(
  task: TableRow<"assistant_scheduled_tasks">,
  expectedRevision: number,
): void {
  if (task.revision !== expectedRevision) {
    throw new Error(
      `Scheduled task ${task.id} revision is ${task.revision}, not ${expectedRevision}.`,
    );
  }
}

async function applyScheduledTaskUpdate(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  const patch = parseProfileLearningReviewCandidatePatch({
    candidateType: "scheduled_task_instructions_update",
    proposedPatch: candidate.proposed_patch,
  });
  if (!input.clientApproved && !isHighConfidence(candidate)) {
    throw new Error("Scheduled task instruction update requires high confidence.");
  }
  if (!candidate.target_id) throw new Error("Scheduled task update candidate requires target_id.");
  if (!patch.instructions) {
    throw new Error("Scheduled task update candidate requires proposedPatch.instructions.");
  }
  const existingResult = await db
    .from("assistant_scheduled_tasks")
    .select()
    .eq("profile_id", candidate.profile_id)
    .eq("id", candidate.target_id)
    .maybeSingle();
  const existing = requireSupabaseData(
    `Load scheduled task ${candidate.target_id}`,
    existingResult.data,
    existingResult.error,
  );
  if (existing.status === "deleted") throw new Error("Scheduled task has been deleted.");
  assertScheduledTaskCandidateRevision(existing, patch.expectedRevision);
  if (!changedText(existing.instructions, patch.instructions)) {
    return { scheduled_task_id: existing.id, changed: false };
  }
  const task = await updateAssistantScheduledTask(db, {
    profileId: candidate.profile_id,
    scheduledTaskId: existing.id,
    expectedRevision: patch.expectedRevision,
    instructions: patch.instructions,
  });
  return { scheduled_task_id: task.id, revision: task.revision, changed: true };
}

async function applyScheduledTaskCreate(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  const patch = parseProfileLearningReviewCandidatePatch({
    candidateType: "scheduled_task_create",
    proposedPatch: candidate.proposed_patch,
  });
  if (!input.clientApproved) {
    throw new Error("Scheduled task create requires client approval.");
  }
  const assistant = await loadAssistantForProfile(db, candidate.profile_id);
  const task = await createAssistantScheduledTask(db, {
    profileId: candidate.profile_id,
    title: patch.title,
    instructions: patch.instructions,
    schedule: patch.schedule,
    origin: { agentId: assistant.assistant_id },
  });
  return { scheduled_task_id: task.id, revision: task.revision, next_run_at: task.next_run_at };
}

async function applyScheduledTaskFullUpdate(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  const patch = parseProfileLearningReviewCandidatePatch({
    candidateType: "scheduled_task_update",
    proposedPatch: candidate.proposed_patch,
  });
  if (!input.clientApproved) {
    throw new Error("Scheduled task update requires client approval.");
  }
  if (!candidate.target_id) throw new Error("Scheduled task update candidate requires target_id.");
  const existingResult = await db
    .from("assistant_scheduled_tasks")
    .select()
    .eq("profile_id", candidate.profile_id)
    .eq("id", candidate.target_id)
    .maybeSingle();
  const existing = requireSupabaseData(
    `Load scheduled task ${candidate.target_id}`,
    existingResult.data,
    existingResult.error,
  );
  if (existing.status === "deleted") throw new Error("Scheduled task has been deleted.");
  const task = await updateAssistantScheduledTask(db, {
    profileId: candidate.profile_id,
    scheduledTaskId: existing.id,
    expectedRevision: patch.expectedRevision,
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.instructions === undefined ? {} : { instructions: patch.instructions }),
    ...(patch.schedule === undefined ? {} : { schedule: patch.schedule }),
  });
  return { scheduled_task_id: task.id, revision: task.revision };
}

async function applyScheduledTaskPause(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  const patch = parseProfileLearningReviewCandidatePatch({
    candidateType: "scheduled_task_pause",
    proposedPatch: candidate.proposed_patch,
  });
  if (!input.clientApproved) {
    throw new Error("Scheduled task pause requires client approval.");
  }
  if (!candidate.target_id) throw new Error("Scheduled task pause candidate requires target_id.");
  const task = await pauseAssistantScheduledTask(db, {
    profileId: candidate.profile_id,
    scheduledTaskId: candidate.target_id,
    expectedRevision: patch.expectedRevision,
  });
  return { scheduled_task_id: task.id, revision: task.revision };
}

async function applyScheduledTaskDelete(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  const patch = parseProfileLearningReviewCandidatePatch({
    candidateType: "scheduled_task_delete",
    proposedPatch: candidate.proposed_patch,
  });
  if (!input.clientApproved) {
    throw new Error("Scheduled task delete requires client approval.");
  }
  if (!candidate.target_id) throw new Error("Scheduled task delete candidate requires target_id.");
  const task = await deleteAssistantScheduledTask(db, {
    profileId: candidate.profile_id,
    scheduledTaskId: candidate.target_id,
    expectedRevision: patch.expectedRevision,
  });
  return { scheduled_task_id: task.id, revision: task.revision };
}

async function applyWorkRouteUpdate(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  const patch = parseProfileLearningReviewCandidatePatch({
    candidateType: "work_route_instructions_update",
    proposedPatch: candidate.proposed_patch,
  });
  if (!input.clientApproved && !isHighConfidence(candidate)) {
    throw new Error("Work route instruction update requires high confidence.");
  }
  if (!candidate.target_id) throw new Error("Work route update candidate requires target_id.");
  if (!patch.instructions) {
    throw new Error("Work route update candidate requires proposedPatch.instructions.");
  }
  const route = await updateProfileAssistantWorkRoute(db, {
    profileId: candidate.profile_id,
    workRouteId: candidate.target_id,
    instructions: patch.instructions,
  });
  return { work_route_id: route.id, event_type: route.event_type };
}

async function applyWorkRouteCreate(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  const patch = parseProfileLearningReviewCandidatePatch({
    candidateType: "work_route_create",
    proposedPatch: candidate.proposed_patch,
  });
  if (!input.clientApproved) {
    throw new Error("Work route create requires client approval.");
  }
  const route = await createProfileAssistantWorkRoute(db, {
    profileId: candidate.profile_id,
    eventType: patch.eventType,
    instructions: patch.instructions,
    ...(patch.priority === undefined || patch.priority === null
      ? {}
      : { priority: patch.priority }),
  });
  return { work_route_id: route.id, event_type: route.event_type };
}

async function applyWorkRouteFullUpdate(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  const patch = parseProfileLearningReviewCandidatePatch({
    candidateType: "work_route_update",
    proposedPatch: candidate.proposed_patch,
  });
  if (!input.clientApproved) {
    throw new Error("Work route update requires client approval.");
  }
  if (!candidate.target_id) throw new Error("Work route update candidate requires target_id.");
  const route = await updateProfileAssistantWorkRoute(db, {
    profileId: candidate.profile_id,
    workRouteId: candidate.target_id,
    ...(patch.instructions === undefined ? {} : { instructions: patch.instructions }),
    ...(patch.priority === undefined ? {} : { priority: patch.priority }),
  });
  return { work_route_id: route.id, event_type: route.event_type };
}

async function applyWorkRouteDelete(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  parseProfileLearningReviewCandidatePatch({
    candidateType: "work_route_delete",
    proposedPatch: candidate.proposed_patch,
  });
  if (!input.clientApproved) {
    throw new Error("Work route delete requires client approval.");
  }
  if (!candidate.target_id) throw new Error("Work route delete candidate requires target_id.");
  const route = await deleteProfileAssistantWorkRoute(db, {
    profileId: candidate.profile_id,
    workRouteId: candidate.target_id,
  });
  return { work_route_id: route.id, event_type: route.event_type };
}

async function loadProfileGuidanceForCandidate(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
): Promise<TableRow<"profile_guidance">> {
  if (!candidate.target_id) throw new Error("Guidance candidate requires target_id.");
  const result = await db
    .from("profile_guidance")
    .select()
    .eq("profile_id", candidate.profile_id)
    .eq("id", candidate.target_id)
    .maybeSingle();
  return requireSupabaseData(
    `Load profile guidance ${candidate.target_id}`,
    result.data,
    result.error,
  );
}

async function applyGuidanceCreate(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  if (!input.clientApproved) throw new Error("Guidance create requires portal approval.");
  const patch = parseProfileLearningReviewCandidatePatch({
    candidateType: "guidance_create",
    proposedPatch: candidate.proposed_patch,
  });
  const guidance = await createProfileGuidance(db, {
    profileId: candidate.profile_id,
    guidance: {
      key: patch.key,
      title: patch.title,
      selectorDescription: patch.selectorDescription,
      bodyMarkdown: patch.bodyMarkdown,
    },
  });
  return {
    profile_guidance_id: guidance.id,
    revision: guidance.revision,
    status: guidance.status,
  };
}

async function applyGuidanceUpdate(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  if (!input.clientApproved) throw new Error("Guidance update requires portal approval.");
  const patch = parseProfileLearningReviewCandidatePatch({
    candidateType: "guidance_update",
    proposedPatch: candidate.proposed_patch,
  });
  const existing = await loadProfileGuidanceForCandidate(db, candidate);
  if (existing.status !== "active") throw new Error("Profile guidance has been archived.");
  const guidance = await updateProfileGuidance(db, candidate.profile_id, {
    guidanceId: existing.id,
    expectedRevision: patch.expectedRevision,
    ...(patch.title === undefined ? {} : { title: patch.title }),
    ...(patch.selectorDescription === undefined
      ? {}
      : { selectorDescription: patch.selectorDescription }),
    ...(patch.bodyMarkdown === undefined ? {} : { bodyMarkdown: patch.bodyMarkdown }),
  });
  return {
    profile_guidance_id: guidance.id,
    previous_revision: patch.expectedRevision,
    revision: guidance.revision,
    status: guidance.status,
  };
}

async function applyGuidanceArchive(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  if (!input.clientApproved) throw new Error("Guidance archive requires portal approval.");
  const patch = parseProfileLearningReviewCandidatePatch({
    candidateType: "guidance_archive",
    proposedPatch: candidate.proposed_patch,
  });
  const existing = await loadProfileGuidanceForCandidate(db, candidate);
  if (existing.status !== "active") throw new Error("Profile guidance has been archived.");
  const guidance = await archiveProfileGuidance(db, candidate.profile_id, {
    guidanceId: existing.id,
    expectedRevision: patch.expectedRevision,
  });
  return {
    profile_guidance_id: guidance.id,
    previous_revision: patch.expectedRevision,
    revision: guidance.revision,
    status: guidance.status,
  };
}

async function applyCandidateMutation(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: { clientApproved: boolean },
): Promise<Record<string, unknown>> {
  switch (candidate.candidate_type) {
    case "scheduled_task_create":
      return applyScheduledTaskCreate(db, candidate, input);
    case "scheduled_task_update":
      return applyScheduledTaskFullUpdate(db, candidate, input);
    case "scheduled_task_pause":
      return applyScheduledTaskPause(db, candidate, input);
    case "scheduled_task_delete":
      return applyScheduledTaskDelete(db, candidate, input);
    case "scheduled_task_instructions_update":
      return applyScheduledTaskUpdate(db, candidate, input);
    case "work_route_create":
      return applyWorkRouteCreate(db, candidate, input);
    case "work_route_update":
      return applyWorkRouteFullUpdate(db, candidate, input);
    case "work_route_delete":
      return applyWorkRouteDelete(db, candidate, input);
    case "work_route_instructions_update":
      return applyWorkRouteUpdate(db, candidate, input);
    case "guidance_create":
      return applyGuidanceCreate(db, candidate, input);
    case "guidance_update":
      return applyGuidanceUpdate(db, candidate, input);
    case "guidance_archive":
      return applyGuidanceArchive(db, candidate, input);
    case "no_action":
      throw new Error("No-action candidates are not applied.");
    default:
      throw new Error(`Unsupported learning review candidate type: ${candidate.candidate_type}.`);
  }
}

function shouldAttemptAutoApply(candidate: ProfileLearningReviewCandidate): boolean {
  if (candidate.status !== "proposed") return false;
  if (candidate.confidence !== "high") return false;
  switch (candidate.candidate_type) {
    case "scheduled_task_instructions_update":
    case "work_route_instructions_update":
      return hasOnlyExplicitClientEvidence(candidate);
    default:
      return false;
  }
}

async function markCandidate(
  db: SupabaseServiceClient,
  candidate: ProfileLearningReviewCandidate,
  input: {
    status: ApplyOutcome;
    appliedReference?: Record<string, unknown>;
    failureMessage?: string;
  },
): Promise<ProfileLearningReviewCandidate> {
  const updated = await updateLearningReviewCandidateStatus(db, {
    candidateId: candidate.id,
    profileId: candidate.profile_id,
    status: input.status,
    ...(input.appliedReference === undefined ? {} : { appliedReference: input.appliedReference }),
    ...(input.failureMessage === undefined ? {} : { failureMessage: input.failureMessage }),
  });
  emitDiagnostic(backendDiagnosticLogger(), "profile_learning_review.candidate_applied", {
    ok: input.status === "auto_applied" || input.status === "client_applied",
    profile_id: candidate.profile_id,
    attrs: {
      candidate_id: candidate.id,
      candidate_type: candidate.candidate_type,
      target_kind: candidate.target_kind,
      target_id: candidate.target_id,
      status: input.status,
      ...(input.failureMessage === undefined ? {} : { failure_message: input.failureMessage }),
    },
  });
  return updated;
}

export async function applyProfileLearningReviewCandidates(
  db: SupabaseServiceClient,
  candidates: readonly ProfileLearningReviewCandidate[],
): Promise<{ applied: number; skipped: number; failed: number }> {
  const out = { applied: 0, skipped: 0, failed: 0 };
  for (const candidate of candidates) {
    if (candidate.status !== "proposed") {
      out.skipped += 1;
      continue;
    }
    if (!shouldAttemptAutoApply(candidate)) {
      out.skipped += 1;
      continue;
    }
    let claimed: ProfileLearningReviewCandidate;
    try {
      claimed = await claimLearningReviewCandidateForApply(db, {
        candidateId: candidate.id,
        profileId: candidate.profile_id,
      });
    } catch {
      out.skipped += 1;
      continue;
    }
    try {
      const appliedReference = await applyCandidateMutation(db, claimed, {
        clientApproved: true,
      });
      await markCandidate(db, claimed, {
        status: "auto_applied",
        appliedReference,
      });
      out.applied += 1;
    } catch (error) {
      await markCandidate(db, claimed, {
        status: "failed",
        failureMessage: error instanceof Error ? error.message : String(error),
      });
      out.failed += 1;
    }
  }
  return out;
}

export async function approveProfileLearningReviewCandidateFromPortal(
  db: SupabaseServiceClient,
  input: { profileId: string; candidate: ProfileLearningReviewCandidate },
): Promise<ProfileLearningReviewCandidate> {
  if (input.candidate.profile_id !== input.profileId) {
    throw new Error("Learning recommendation does not belong to the requested profile.");
  }
  if (input.candidate.candidate_type === "no_action") {
    return markCandidate(db, input.candidate, {
      status: "skipped",
      failureMessage: "No state change is needed for this learning recommendation.",
    });
  }
  const claimed = await claimLearningReviewCandidateForApply(db, {
    candidateId: input.candidate.id,
    profileId: input.profileId,
  });
  try {
    const appliedReference = await applyCandidateMutation(db, claimed, {
      clientApproved: true,
    });
    return markCandidate(db, claimed, {
      status: "client_applied",
      appliedReference,
    });
  } catch (error) {
    await markCandidate(db, claimed, {
      status: "failed",
      failureMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function rejectProfileLearningReviewCandidateFromPortal(
  db: SupabaseServiceClient,
  input: { profileId: string; candidate: ProfileLearningReviewCandidate },
): Promise<ProfileLearningReviewCandidate> {
  if (input.candidate.profile_id !== input.profileId) {
    throw new Error("Learning recommendation does not belong to the requested profile.");
  }
  const claimed = await claimLearningReviewCandidateForApply(db, {
    candidateId: input.candidate.id,
    profileId: input.profileId,
  });
  return markCandidate(db, claimed, {
    status: "rejected",
    failureMessage: "Rejected by client.",
  });
}
