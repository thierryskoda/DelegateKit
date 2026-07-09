import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { Hono } from "hono";
import { createPortalAccessLinkForProfile } from "../../product/profiles/portal-access-links";
import { listPortalProfiles, portalProfileOverview } from "../../product/profiles/portal-queries";
import { requireOwnedProfile } from "../../auth/profile-access";
import { parseJsonBody, parseRouteParams } from "../../shared/http-validation";
import { authenticatedUser } from "../http-auth";
import { controlDb } from "../control-db";
import {
  portalBrowserHandoffRequestSchema,
  portalBrowserHandoffResponseSchema,
  profileParamsSchema,
  profileResponseSchema,
  profilesResponseSchema,
  toConnectAssistantDto,
  toConnectProfileDto,
} from "@ai-assistants/connect-api-contracts";

export function registerPortalProfileRoutes(app: Hono) {
  app.get("/profiles", async (c) => {
    const user = await authenticatedUser(c);
    return c.json(
      profilesResponseSchema.parse({
        ok: true,
        profiles: (await listPortalProfiles(controlDb(), user)).map(toConnectProfileDto),
      }),
    );
  });

  app.get("/profiles/:profileId", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId } = parseRouteParams(c, profileParamsSchema, "Profile route params");
    const overview = await portalProfileOverview(controlDb(), user, profileId);
    if (!overview.profile)
      throw new DomainError(domainCodes.NOT_FOUND, `Profile ${profileId} does not exist.`);
    return c.json(
      profileResponseSchema.parse({
        ok: true,
        profile: toConnectProfileDto(overview.profile),
        assistants: overview.assistants.map(toConnectAssistantDto),
      }),
    );
  });

  app.post("/profiles/:profileId/portal/browser-handoff", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId } = parseRouteParams(c, profileParamsSchema, "Profile route params");
    const profile = await requireOwnedProfile(controlDb(), user, profileId);
    const body = await parseJsonBody(
      c,
      portalBrowserHandoffRequestSchema,
      "Portal browser handoff payload",
    );
    const link = await createPortalAccessLinkForProfile(controlDb(), profile, {
      section: body.section,
    });
    return c.json(
      portalBrowserHandoffResponseSchema.parse({
        ok: true,
        url: link.url,
        section: link.section,
      }),
    );
  });
}
