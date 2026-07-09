import { profileProposalCreateInputRuntimeSchema, profileProposalSummarySchema } from "@ai-assistants/proposals-contracts/schemas";
import { proposalsToolContracts } from "@ai-assistants/proposals-contracts/contracts";
import { DomainError } from "@ai-assistants/errors";
import type { TableRow } from "@ai-assistants/control-db";
import type { BackendImmediateToolHandlers } from "../registry/backend-capability-module";
import { backendToolData, backendToolDomainError } from "../../shared/tool-result";
import { createProfileProposal } from "../../product/proposals/proposals";

function profileProposalSummaryDto(proposal: TableRow<"profile_proposals">) {
  return profileProposalSummarySchema.parse({
    proposalId: proposal.id,
    kind: proposal.proposal_kind,
    status: proposal.status,
    revision: proposal.revision,
    title: proposal.title,
    summary: proposal.summary,
    expiresAt: proposal.expires_at,
    blockerSummary: proposal.blocker_summary,
  });
}

export const proposalHandlers = {
  async proposal_create(ctx) {
    const parsed = profileProposalCreateInputRuntimeSchema.parse(ctx.params);
    try {
      const result = await createProfileProposal(ctx.db, {
        profileId: ctx.profile.id,
        proposalKind: parsed.proposalKind,
        title: parsed.title,
        summary: parsed.summary,
        proposalPayload: parsed.proposalPayload,
        evidence: parsed.evidence,
        ...(parsed.expiresAt === undefined ? {} : { expiresAt: parsed.expiresAt }),
        ...(parsed.sourceWorkItemId === undefined ? {} : { sourceWorkItemId: parsed.sourceWorkItemId }),
        ...(parsed.sourceScheduledTaskId === undefined ? {} : { sourceScheduledTaskId: parsed.sourceScheduledTaskId }),
      });
      return backendToolData(proposalsToolContracts, "proposal_create", {
        proposal: profileProposalSummaryDto(result.proposal),
        created: result.created,
      });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
} satisfies BackendImmediateToolHandlers<typeof proposalsToolContracts>;
