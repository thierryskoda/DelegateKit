import type { Hono } from "hono";
import { z } from "zod";
import {
  capabilityAccountLinksResponseSchema,
  capabilitySlugParamsSchema,
  connectCapabilityAccountLinkDtoSchema,
  connectIntentResponseSchema,
  createConnectIntentRequestSchema,
  profileParamsSchema,
} from "@ai-assistants/connect-api-contracts";
import { createProviderConnectIntent } from "../../product/connected-accounts/connect-intents";
import { listCapabilityAccountLinksForCapability } from "../../product/connected-accounts/connected-accounts";
import { deleteNangoRemoteConnection } from "../../integrations/nango/remote-connection-lifecycle";
import { deleteCapabilityAccountLink } from "../../product/connected-accounts/connected-account-lifecycle";
import { requireOwnedProfile } from "../../auth/profile-access";
import { parseJsonBody, parseRouteParams } from "../../shared/http-validation";
import { authenticatedUser } from "../http-auth";
import { controlDb } from "../control-db";

const capabilityAccountLinkRouteParamsSchema = z
  .object({
    profileId: profileParamsSchema.shape.profileId,
    capabilityAccountLinkId: z.string().trim().uuid(),
  })
  .strict();

function capabilityAccountLinkDto(link: {
  id: string;
  connected_provider_account_id: string | null;
  capability_slug: string;
  provider: string;
  label: string;
  readiness_status: string;
}) {
  return connectCapabilityAccountLinkDtoSchema.parse({
    id: link.id,
    connectedAccountId: link.connected_provider_account_id,
    capabilitySlug: link.capability_slug,
    provider: link.provider,
    linkLabel: link.label,
    readinessStatus: link.readiness_status,
  });
}

export function registerPortalConnectedAccountRoutes(app: Hono) {
  app.post("/profiles/:profileId/connect-intents", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId } = parseRouteParams(
      c,
      profileParamsSchema,
      "Create connect intent route params",
    );
    const body = await parseJsonBody(
      c,
      createConnectIntentRequestSchema,
      "Create connect intent body",
    );
    await requireOwnedProfile(controlDb(), user, profileId);
    const intent = await createProviderConnectIntent({
      db: controlDb(),
      profileId,
      capabilitySlug: body.capabilitySlug,
      provider: body.provider,
      requestedLabel: body.requestedLabel ?? null,
    });
    return c.json(
      connectIntentResponseSchema.parse({
        ok: true,
        connectIntentId: intent.id,
      }),
    );
  });

  app.get(
    "/profiles/:profileId/capabilities/:capabilitySlug/capability-account-links",
    async (c) => {
      const user = await authenticatedUser(c);
      const { profileId, capabilitySlug } = parseRouteParams(
        c,
        capabilitySlugParamsSchema,
        "List capability account links route params",
      );
      await requireOwnedProfile(controlDb(), user, profileId);
      const links = await listCapabilityAccountLinksForCapability(
        controlDb(),
        profileId,
        capabilitySlug,
      );
      return c.json(
        capabilityAccountLinksResponseSchema.parse({
          ok: true,
          capabilitySlug,
          capabilityAccountLinks: links.map(capabilityAccountLinkDto),
        }),
      );
    },
  );

  app.delete(
    "/profiles/:profileId/capability-account-links/:capabilityAccountLinkId",
    async (c) => {
      const user = await authenticatedUser(c);
      const { profileId, capabilityAccountLinkId } = parseRouteParams(
        c,
        capabilityAccountLinkRouteParamsSchema,
        "Delete capability account link route params",
      );
      await requireOwnedProfile(controlDb(), user, profileId);
      await deleteCapabilityAccountLink(controlDb(), {
        profileId,
        capabilityAccountLinkId,
        deleteRemoteConnection: deleteNangoRemoteConnection,
      });
      return c.json({ ok: true as const });
    },
  );
}
