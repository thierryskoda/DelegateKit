import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  profileProposalRowSchema,
  profileProposalStatusSchema,
} from "@ai-assistants/control-plane-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { z } from "zod";
import { createProfileActionAttempt } from "../actions/action-attempts";
import { decideProfileActionFromPortal } from "../actions/action-decisions";
import { requireProposalKindContract, type ProposalKind } from "./proposal-kind-registry";

type ProfileProposalStatus = z.infer<typeof profileProposalStatusSchema>;

const PROPOSAL_APPROVAL_TTL_MS = 36 * 60 * 60_000;

function requireProposalObject(value: unknown, label: string): object {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(domainCodes.BAD_REQUEST, `${label} must be a JSON object.`);
  }
  return value;
}

export type CreateProfileProposalInput = {
  profileId: string;
  proposalKind: ProposalKind;
  title: string;
  summary: string;
  proposalPayload: unknown;
  evidence?: Record<string, unknown>;
  expiresAt?: string | null;
  sourceWorkItemId?: string | null;
  sourceScheduledTaskId?: string | null;
};

export function proposalConnectDetail(proposal: TableRow<"profile_proposals">) {
  const contract = requireProposalKindContract(proposal.proposal_kind);
  const payload = contract.payloadSchema.parse(proposal.proposal_payload);
  return contract.buildReviewDetail(proposal, payload);
}

export async function createProfileProposal(
  db: SupabaseServiceClient,
  input: CreateProfileProposalInput,
): Promise<{ proposal: TableRow<"profile_proposals">; created: boolean }> {
  const contract = requireProposalKindContract(input.proposalKind);
  const payload = contract.payloadSchema.parse(input.proposalPayload);
  const sourceCheckedAt =
    payload && typeof payload === "object" && "sourceCheckedAt" in payload
      ? Reflect.get(payload, "sourceCheckedAt")
      : undefined;
  const evidence = contract.evidenceSchema.parse({
    ...(input.evidence ?? {}),
    generatedAt: input.evidence?.generatedAt ?? new Date().toISOString(),
    ...(typeof sourceCheckedAt === "string" ? { sourceCheckedAt } : {}),
  });
  const equivalenceKey = contract.buildEquivalenceKey(payload);
  const inserted = await db
    .from("profile_proposals")
    .insert({
      profile_id: input.profileId,
      proposal_kind: contract.kind,
      status: "proposed",
      title: input.title,
      summary: input.summary,
      proposal_payload: requireJsonObject(
        requireProposalObject(payload, "proposal.payload"),
        "proposal.payload",
      ),
      review_payload: requireJsonObject({}, "proposal.reviewPayload"),
      evidence: requireJsonObject(evidence, "proposal.evidence"),
      equivalence_key: equivalenceKey,
      expires_at: input.expiresAt ?? new Date(Date.now() + PROPOSAL_APPROVAL_TTL_MS).toISOString(),
      source_work_item_id: input.sourceWorkItemId ?? null,
      source_scheduled_task_id: input.sourceScheduledTaskId ?? null,
    })
    .select()
    .maybeSingle();
  if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
  if (inserted.data)
    return { proposal: profileProposalRowSchema.parse(inserted.data), created: true };

  const existing = await db
    .from("profile_proposals")
    .select()
    .eq("profile_id", input.profileId)
    .eq("proposal_kind", contract.kind)
    .eq("equivalence_key", equivalenceKey)
    .in("status", ["proposed", "blocked", "converting"])
    .maybeSingle();
  const proposal = requireSupabaseData(
    "Load existing active proposal",
    existing.data,
    existing.error,
  );
  return { proposal: profileProposalRowSchema.parse(proposal), created: false };
}

export async function listPortalProfileProposals(
  db: SupabaseServiceClient,
  profileId: string,
  statuses: ProfileProposalStatus[] = [
    "proposed",
    "blocked",
    "converting",
    "converted",
    "rejected",
    "expired",
    "superseded",
  ],
): Promise<TableRow<"profile_proposals">[]> {
  const result = await db
    .from("profile_proposals")
    .select()
    .eq("profile_id", profileId)
    .in("status", statuses)
    .order("updated_at", { ascending: false })
    .limit(100);
  const proposals = requireSupabaseRows("List profile proposals", result.data, result.error).map(
    (row) => profileProposalRowSchema.parse(row),
  );
  const normalized: TableRow<"profile_proposals">[] = [];
  for (const proposal of proposals) {
    const next =
      proposal.status === "proposed" &&
      proposal.expires_at &&
      Date.parse(proposal.expires_at) <= Date.now()
        ? await markProposalExpired(db, proposal)
        : proposal;
    if (statuses.some((status) => status === next.status)) normalized.push(next);
  }
  return normalized;
}

export async function getPortalProfileProposal(
  db: SupabaseServiceClient,
  profileId: string,
  proposalId: string,
): Promise<TableRow<"profile_proposals">> {
  const result = await db
    .from("profile_proposals")
    .select()
    .eq("profile_id", profileId)
    .eq("id", proposalId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data)
    throw new DomainError(domainCodes.NOT_FOUND, `Profile proposal ${proposalId} was not found.`);
  return profileProposalRowSchema.parse(result.data);
}

async function markProposalBlocked(
  db: SupabaseServiceClient,
  proposal: TableRow<"profile_proposals">,
  input: { blockerCode: string; blockerSummary: string },
): Promise<TableRow<"profile_proposals">> {
  const result = await db
    .from("profile_proposals")
    .update({
      status: "blocked",
      blocker_code: input.blockerCode,
      blocker_summary: input.blockerSummary,
      revision: proposal.revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposal.id)
    .eq("revision", proposal.revision)
    .select()
    .single();
  return profileProposalRowSchema.parse(
    requireSupabaseData("Block profile proposal", result.data, result.error),
  );
}

async function markProposalExpired(
  db: SupabaseServiceClient,
  proposal: TableRow<"profile_proposals">,
): Promise<TableRow<"profile_proposals">> {
  const result = await db
    .from("profile_proposals")
    .update({
      status: "expired",
      blocker_code: "expired",
      blocker_summary: "This proposal expired before approval.",
      revision: proposal.revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposal.id)
    .eq("revision", proposal.revision)
    .select()
    .single();
  return profileProposalRowSchema.parse(
    requireSupabaseData("Expire profile proposal", result.data, result.error),
  );
}

export async function rejectProfileProposalFromPortal(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    proposalId: string;
    expectedRevision: number;
    userId: string;
    reason?: string;
  },
): Promise<TableRow<"profile_proposals">> {
  const current = await getPortalProfileProposal(db, input.profileId, input.proposalId);
  if (current.status !== "proposed" && current.status !== "blocked") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Proposal ${current.id} is already ${current.status}.`,
    );
  }
  if (current.revision !== input.expectedRevision) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Proposal ${current.id} revision is ${current.revision}, not ${input.expectedRevision}.`,
    );
  }
  const result = await db
    .from("profile_proposals")
    .update({
      status: "rejected",
      decision: "rejected",
      decision_source: "portal",
      decided_by_user_id: input.userId,
      decided_at: new Date().toISOString(),
      blocker_summary: input.reason ?? current.blocker_summary,
      revision: current.revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .eq("profile_id", input.profileId)
    .eq("revision", input.expectedRevision)
    .in("status", ["proposed", "blocked"])
    .select()
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data)
    throw new DomainError(
      domainCodes.CONFLICT,
      `Proposal ${current.id} changed before it could be rejected.`,
    );
  return profileProposalRowSchema.parse(result.data);
}

export async function approveProfileProposalFromPortal(
  db: SupabaseServiceClient,
  input: { profileId: string; proposalId: string; expectedRevision: number; userId: string },
): Promise<{
  proposal: TableRow<"profile_proposals">;
  action: TableRow<"profile_actions"> | null;
}> {
  const current = await getPortalProfileProposal(db, input.profileId, input.proposalId);
  if (current.status !== "proposed") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Proposal ${current.id} is ${current.status}, not proposed.`,
    );
  }
  if (current.revision !== input.expectedRevision) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Proposal ${current.id} revision is ${current.revision}, not ${input.expectedRevision}.`,
    );
  }
  if (current.expires_at && Date.parse(current.expires_at) <= Date.now()) {
    return {
      proposal: await markProposalExpired(db, current),
      action: null,
    };
  }

  const contract = requireProposalKindContract(current.proposal_kind);
  const payload = contract.payloadSchema.parse(current.proposal_payload);
  const validation = await contract.revalidate(db, current, payload);
  if (!validation.ok) {
    return {
      proposal: await markProposalBlocked(db, current, validation),
      action: null,
    };
  }

  const claimed = await db
    .from("profile_proposals")
    .update({
      status: "converting",
      decision: "approved",
      decision_source: "portal",
      decided_by_user_id: input.userId,
      decided_at: new Date().toISOString(),
      blocker_code: null,
      blocker_summary: null,
      revision: current.revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .eq("profile_id", input.profileId)
    .eq("revision", input.expectedRevision)
    .eq("status", "proposed")
    .select()
    .maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data)
    throw new DomainError(
      domainCodes.CONFLICT,
      `Proposal ${current.id} changed before approval could be claimed.`,
    );
  const converting = profileProposalRowSchema.parse(claimed.data);

  const actionIntent = contract.convertToProfileAction({
    proposal: current,
    payload,
    validation,
  });
  const attempt = await createProfileActionAttempt(db, {
    profileId: input.profileId,
    toolName: actionIntent.toolName,
    actionType: actionIntent.actionType,
    targetId: actionIntent.targetId ?? null,
    toolCallId: actionIntent.toolCallId ?? null,
    requestHash: actionIntent.requestHash,
    equivalentActionKey: actionIntent.equivalentActionKey ?? null,
    executionPayload: actionIntent.executionPayload,
    status: "pending_approval",
    title: actionIntent.title,
    reviewPayload: actionIntent.reviewPayload,
    expiresAt: current.expires_at ?? new Date(Date.now() + PROPOSAL_APPROVAL_TTL_MS).toISOString(),
    requesterAssistantId: null,
  });
  const decision = await decideProfileActionFromPortal(db, {
    profileId: input.profileId,
    actionId: attempt.action.id,
    userId: input.userId,
    decision: "approve",
  });
  if (!decision.action) {
    throw new DomainError(domainCodes.INTERNAL, "Proposal approval created no profile action.");
  }
  const converted = await db
    .from("profile_proposals")
    .update({
      status: "converted",
      converted_profile_action_id: decision.action.id,
      revision: converting.revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .eq("status", "converting")
    .select()
    .single();
  return {
    proposal: profileProposalRowSchema.parse(
      requireSupabaseData("Convert profile proposal", converted.data, converted.error),
    ),
    action: decision.action,
  };
}
