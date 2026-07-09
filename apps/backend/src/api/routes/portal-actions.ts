import type { Context, Hono } from "hono";
import {
  actionApprovalResponseSchema,
  actionParamsSchema,
  actionResponseSchema,
  actionsResponseSchema,
  profileActionListQuerySchema,
  profileParamsSchema,
} from "@ai-assistants/connect-api-contracts";
import { decideProfileActionFromPortal } from "../../product/actions/action-decisions";
import { toConnectPortalActionDto } from "../../product/actions/connect-action-dtos";
import { profileActionDecisionRequestBodySchema } from "@ai-assistants/control-plane-contracts";
import {
  getPortalProfileAction,
  listPortalProfileActions,
} from "../../product/profiles/portal-queries";
import { requireOwnedProfile } from "../../auth/profile-access";
import { parseJsonBody, parseQuery, parseRouteParams } from "../../shared/http-validation";
import { authenticatedUser } from "../http-auth";
import { controlDb } from "../control-db";

async function decideProfileAction(c: Context, decision: "approve" | "reject") {
  const user = await authenticatedUser(c);
  const { profileId, actionId } = parseRouteParams(
    c,
    actionParamsSchema,
    "Profile action decision route params",
  );
  await requireOwnedProfile(controlDb(), user, profileId);
  await parseJsonBody(
    c,
    profileActionDecisionRequestBodySchema,
    "Profile action decision payload",
  );
  const result = await decideProfileActionFromPortal(controlDb(), {
    profileId,
    actionId,
    userId: user.id,
    decision,
  });
  return c.json(
    actionApprovalResponseSchema.parse({
      ...result,
      action: toConnectPortalActionDto(result.action),
    }),
  );
}

export function registerPortalActionRoutes(app: Hono) {
  app.get("/profiles/:profileId/actions", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId } = parseRouteParams(c, profileParamsSchema, "Profile actions route params");
    await requireOwnedProfile(controlDb(), user, profileId);
    const query = parseQuery(c, profileActionListQuerySchema, "Profile actions query");
    return c.json(
      actionsResponseSchema.parse({
        ok: true,
        actions: (await listPortalProfileActions(controlDb(), profileId, query)).map(
          toConnectPortalActionDto,
        ),
      }),
    );
  });

  app.get("/profiles/:profileId/actions/:actionId", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId, actionId } = parseRouteParams(
      c,
      actionParamsSchema,
      "Profile action route params",
    );
    await requireOwnedProfile(controlDb(), user, profileId);
    return c.json(
      actionResponseSchema.parse({
        ok: true,
        action: toConnectPortalActionDto(
          await getPortalProfileAction(controlDb(), profileId, actionId),
        ),
      }),
    );
  });

  app.post("/profiles/:profileId/actions/:actionId/approve", (c) =>
    decideProfileAction(c, "approve"),
  );
  app.post("/profiles/:profileId/actions/:actionId/reject", (c) =>
    decideProfileAction(c, "reject"),
  );
}
