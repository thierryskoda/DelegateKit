import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { Hono } from "hono";
import { z } from "zod";
import {
  capabilityAccountLinkParamsSchema,
  disconnectCapabilityResponseSchema,
  emptyObjectSchema,
  capabilitiesResponseSchema,
  nangoConnectCompleteRequestSchema,
  nangoConnectCompleteResponseSchema,
  nangoConnectSessionHttpResponseSchema,
  profileParamsSchema,
} from "@ai-assistants/connect-api-contracts";
import { createNangoConnectSessionForConnectIntent } from "../../integrations/nango/nango-connect-session";
import { deleteNangoRemoteConnection } from "../../integrations/nango/remote-connection-lifecycle";
import {
  bindExistingNangoAuthConnection,
  reconcileNangoAuthConnection,
} from "../../integrations/nango/reconcile-auth-connection";
import { disconnectCapabilityAccountLinkCredential } from "../../product/connected-accounts/connected-account-lifecycle";
import {
  connectIntegrationAccountPayload,
  connectIntegrationGroupsPayload,
} from "../../product/profile-capabilities/connect-integration-presenter";
import { capabilityOverviewForProfile } from "../../product/profile-capabilities/profile-capability-overview";
import { requireOwnedProfile } from "../../auth/profile-access";
import { parseJsonBody, parseRouteParams } from "../../shared/http-validation";
import { authenticatedUser } from "../http-auth";
import { controlDb } from "../control-db";

const connectIntentRouteParamsSchema = z
  .object({
    profileId: profileParamsSchema.shape.profileId,
    connectIntentId: z.string().trim().uuid(),
  })
  .strict();

function portalCapabilitiesResponsePayload(
  overview: Awaited<ReturnType<typeof capabilityOverviewForProfile>>,
) {
  return capabilitiesResponseSchema.parse({
    ok: true,
    profileId: overview.profileId,
    groups: connectIntegrationGroupsPayload(overview),
  });
}

async function nangoCompleteResponseForLink(profileId: string, capabilityAccountLinkId: string) {
  const overview = await capabilityOverviewForProfile(controlDb(), profileId);
  const capability = overview.capabilities.find((item) => item.id === capabilityAccountLinkId);
  if (!capability) {
    throw new DomainError(domainCodes.NOT_FOUND, "Capability account link not found.");
  }
  return nangoConnectCompleteResponseSchema.parse({
    ok: true,
    capability: connectIntegrationAccountPayload(capability),
  });
}

async function existingNangoConnectionForLink(
  profileId: string,
  capabilityAccountLinkId: string,
): Promise<{ providerConfigKey: string; connectionId: string }> {
  const db = controlDb();
  const linkResult = await db
    .from("capability_account_links")
    .select("connected_provider_account_id")
    .eq("profile_id", profileId)
    .eq("id", capabilityAccountLinkId)
    .eq("status", "enabled")
    .maybeSingle();
  if (linkResult.error) throw linkResult.error;
  const connectedProviderAccountId = linkResult.data?.connected_provider_account_id?.trim();
  if (!connectedProviderAccountId) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Capability account link has no existing Nango connection to refresh.",
    );
  }

  const accountResult = await db
    .from("connected_provider_accounts")
    .select("nango_provider_config_key,nango_connection_id")
    .eq("profile_id", profileId)
    .eq("id", connectedProviderAccountId)
    .maybeSingle();
  if (accountResult.error) throw accountResult.error;
  const providerConfigKey = accountResult.data?.nango_provider_config_key?.trim();
  const connectionId = accountResult.data?.nango_connection_id?.trim();
  if (!providerConfigKey || !connectionId) {
    throw new DomainError(
      domainCodes.CONFLICT,
      "Connected provider account has no existing Nango connection to refresh.",
    );
  }
  return { providerConfigKey, connectionId };
}

export function registerPortalCapabilityRoutes(app: Hono) {
  app.get("/profiles/:profileId/capabilities", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId } = parseRouteParams(
      c,
      profileParamsSchema,
      "Profile capabilities route params",
    );
    await requireOwnedProfile(controlDb(), user, profileId);
    const overview = await capabilityOverviewForProfile(controlDb(), profileId);
    return c.json(portalCapabilitiesResponsePayload(overview));
  });

  app.post(
    "/profiles/:profileId/connect-intents/:connectIntentId/nango/connect-session",
    async (c) => {
      const user = await authenticatedUser(c);
      const { profileId, connectIntentId } = parseRouteParams(
        c,
        connectIntentRouteParamsSchema,
        "Nango Connect session route params",
      );
      await parseJsonBody(c, emptyObjectSchema, "Nango Connect session payload");
      const payload = await createNangoConnectSessionForConnectIntent({
        db: controlDb(),
        user,
        profileId,
        connectIntentId,
      });
      return c.json(nangoConnectSessionHttpResponseSchema.parse({ ok: true, ...payload }));
    },
  );

  app.post("/profiles/:profileId/connect-intents/:connectIntentId/nango/complete", async (c) => {
    const user = await authenticatedUser(c);
    const { profileId, connectIntentId } = parseRouteParams(
      c,
      connectIntentRouteParamsSchema,
      "Nango Connect completion route params",
    );
    const body = await parseJsonBody(
      c,
      nangoConnectCompleteRequestSchema,
      "Nango Connect completion payload",
    );
    await requireOwnedProfile(controlDb(), user, profileId);
    const lifecycleResult = await reconcileNangoAuthConnection({
      db: controlDb(),
      profileId,
      connectIntentId,
      providerConfigKey: body.providerConfigKey,
      connectionId: body.connectionId,
    });
    const overview = await capabilityOverviewForProfile(controlDb(), profileId);
    const capability = overview.capabilities.find(
      (item) => item.id === lifecycleResult.primaryLink.id,
    );
    if (!capability) {
      throw new DomainError(domainCodes.NOT_FOUND, "Capability account link not found.");
    }
    return c.json(
      nangoConnectCompleteResponseSchema.parse({
        ok: true,
        capability: connectIntegrationAccountPayload(capability),
      }),
    );
  });

  app.post(
    "/profiles/:profileId/capability-account-links/:capabilityAccountLinkId/nango/connect-session",
    async (c) => {
      const user = await authenticatedUser(c);
      const { profileId, capabilityAccountLinkId } = parseRouteParams(
        c,
        capabilityAccountLinkParamsSchema,
        "Nango reconnect session route params",
      );
      await parseJsonBody(c, emptyObjectSchema, "Nango reconnect session payload");
      const payload = await createNangoConnectSessionForConnectIntent({
        db: controlDb(),
        user,
        profileId,
        capabilityAccountLinkId,
      });
      return c.json(nangoConnectSessionHttpResponseSchema.parse({ ok: true, ...payload }));
    },
  );

  app.post(
    "/profiles/:profileId/capability-account-links/:capabilityAccountLinkId/nango/complete",
    async (c) => {
      const user = await authenticatedUser(c);
      const { profileId, capabilityAccountLinkId } = parseRouteParams(
        c,
        capabilityAccountLinkParamsSchema,
        "Nango reconnect completion route params",
      );
      const body = await parseJsonBody(
        c,
        nangoConnectCompleteRequestSchema,
        "Nango reconnect completion payload",
      );
      await requireOwnedProfile(controlDb(), user, profileId);
      const lifecycleResult = await reconcileNangoAuthConnection({
        db: controlDb(),
        profileId,
        capabilityAccountLinkId,
        providerConfigKey: body.providerConfigKey,
        connectionId: body.connectionId,
      });
      return c.json(await nangoCompleteResponseForLink(profileId, lifecycleResult.primaryLink.id));
    },
  );

  app.post(
    "/profiles/:profileId/capability-account-links/:capabilityAccountLinkId/nango/refresh",
    async (c) => {
      const user = await authenticatedUser(c);
      const { profileId, capabilityAccountLinkId } = parseRouteParams(
        c,
        capabilityAccountLinkParamsSchema,
        "Nango reconnect refresh route params",
      );
      await parseJsonBody(c, emptyObjectSchema, "Nango reconnect refresh payload");
      await requireOwnedProfile(controlDb(), user, profileId);
      const { providerConfigKey, connectionId } = await existingNangoConnectionForLink(
        profileId,
        capabilityAccountLinkId,
      );
      const lifecycleResult = await bindExistingNangoAuthConnection({
        db: controlDb(),
        profileId,
        capabilityAccountLinkId,
        providerConfigKey,
        connectionId,
      });
      return c.json(await nangoCompleteResponseForLink(profileId, lifecycleResult.primaryLink.id));
    },
  );

  app.post(
    "/profiles/:profileId/capability-account-links/:capabilityAccountLinkId/disconnect",
    async (c) => {
      const user = await authenticatedUser(c);
      const { profileId, capabilityAccountLinkId } = parseRouteParams(
        c,
        capabilityAccountLinkParamsSchema,
        "Disconnect capability account link route params",
      );
      await parseJsonBody(c, emptyObjectSchema, "Disconnect capability account link payload");
      await requireOwnedProfile(controlDb(), user, profileId);
      await disconnectCapabilityAccountLinkCredential(controlDb(), {
        profileId,
        capabilityAccountLinkId,
        deleteRemoteConnection: deleteNangoRemoteConnection,
      });
      return c.json(
        disconnectCapabilityResponseSchema.parse({
          ok: true,
        }),
      );
    },
  );
}
