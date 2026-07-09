import type { Context, Hono } from "hono";
import {
  connectProposalDecisionRequestSchema,
  proposalDecisionResponseSchema,
  proposalParamsSchema,
  proposalResponseSchema,
  proposalsResponseSchema,
  profileParamsSchema,
} from "@ai-assistants/connect-api-contracts";
import { requireOwnedProfile } from "../../auth/profile-access";
import { parseJsonBody, parseRouteParams } from "../../shared/http-validation";
import { authenticatedUser } from "../http-auth";
import { controlDb } from "../control-db";
import {
  approveProfileProposalFromPortal,
  getPortalProfileProposal,
  listPortalProfileProposals,
  rejectProfileProposalFromPortal,
} from "../../product/proposals/proposals";
import {
  toConnectProposalActionDto,
  toConnectProposalDto,
} from "../../product/proposals/connect-proposal-dtos";

async function decideProfileProposal(c: Context, decision: "approve" | "reject") {
  const user = await authenticatedUser(c);
  const { profileId, proposalId } = parseRouteParams(
    c,
    proposalParamsSchema,
    "Profile proposal decision route params",
  );
  await requireOwnedProfile(controlDb(), user, profileId);
  const body = await parseJsonBody(
    c,
    connectProposalDecisionRequestSchema,
    "Profile proposal decision payload",
  );
  const result =
    decision === "approve"
      ? await approveProfileProposalFromPortal(controlDb(), {
          profileId,
          proposalId,
          userId: user.id,
          expectedRevision: body.expectedRevision,
        })
      : {
          proposal: await rejectProfileProposalFromPortal(controlDb(), {
            profileId,
            proposalId,
            userId: user.id,
            expectedRevision: body.expectedRevision,
            ...(body.reason === undefined ? {} : { reason: body.reason }),
          }),
          action: null,
        };
  return c.json(
    proposalDecisionResponseSchema.parse({
      ok: true,
      status: result.proposal.status,
      proposal: toConnectProposalDto(result.proposal),
      action: result.action ? toConnectProposalActionDto(result.action) : null,
    }),
  );
}

export function registerPortalProposalRoutes(app: Hono) {
  app.get("/profiles/:profileId/proposals", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId } = parseRouteParams(
      c,
      profileParamsSchema,
      "Profile proposals route params",
    );
    await requireOwnedProfile(controlDb(), user, profileId);
    return c.json(
      proposalsResponseSchema.parse({
        ok: true,
        proposals: (await listPortalProfileProposals(controlDb(), profileId)).map(
          toConnectProposalDto,
        ),
      }),
    );
  });

  app.get("/profiles/:profileId/proposals/:proposalId", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId, proposalId } = parseRouteParams(
      c,
      proposalParamsSchema,
      "Profile proposal route params",
    );
    await requireOwnedProfile(controlDb(), user, profileId);
    return c.json(
      proposalResponseSchema.parse({
        ok: true,
        proposal: toConnectProposalDto(
          await getPortalProfileProposal(controlDb(), profileId, proposalId),
        ),
      }),
    );
  });

  app.post("/profiles/:profileId/proposals/:proposalId/approve", (c) =>
    decideProfileProposal(c, "approve"),
  );
  app.post("/profiles/:profileId/proposals/:proposalId/reject", (c) =>
    decideProfileProposal(c, "reject"),
  );
}
