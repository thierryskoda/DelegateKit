import { z } from "zod";
import {
  capabilitiesResponseSchema,
  capabilityAccountLinkParamsSchema,
  connectIntentResponseSchema,
  createConnectIntentRequestSchema,
  type ConnectIntegrationAccountDto,
  type ConnectIntegrationGroupDto,
  disconnectCapabilityResponseSchema,
  nangoConnectCompleteRequestSchema,
  nangoConnectCompleteResponseSchema,
  nangoConnectSessionHttpResponseSchema,
  portalBrowserHandoffRequestSchema,
  portalBrowserHandoffResponseSchema,
  profileIdParamSchema,
} from "@ai-assistants/connect-api-contracts";
import { backendFetch } from "../../shared/api/backend-api";

export type IntegrationAccount = ConnectIntegrationAccountDto;
export type IntegrationGroup = ConnectIntegrationGroupDto;

const connectIntentParamsSchema = z
  .object({
    profileId: profileIdParamSchema,
    connectIntentId: z.string().trim().uuid(),
  })
  .strict();

const capabilityAccountLinkInputSchema = z
  .object({
    profileId: profileIdParamSchema,
    capabilityAccountLinkId: capabilityAccountLinkParamsSchema.shape.capabilityAccountLinkId,
  })
  .strict();

const createConnectIntentInputSchema = z
  .object({
    profileId: profileIdParamSchema,
    capabilitySlug: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    requestedLabel: z.string().trim().min(1).optional(),
  })
  .strict();

export async function listIntegrationGroups(profileId: string): Promise<IntegrationGroup[]> {
  const parsedProfileId = profileIdParamSchema.parse(profileId);
  const payload = await backendFetch(
    `/profiles/${encodeURIComponent(parsedProfileId)}/capabilities`,
    capabilitiesResponseSchema,
  );
  return payload.groups;
}

export async function createIntegrationsBrowserHandoff(profileId: string): Promise<string> {
  const parsedProfileId = profileIdParamSchema.parse(profileId);
  const payload = await backendFetch(
    `/profiles/${encodeURIComponent(parsedProfileId)}/portal/browser-handoff`,
    portalBrowserHandoffResponseSchema,
    {
      method: "POST",
      body: JSON.stringify(portalBrowserHandoffRequestSchema.parse({ section: "integrations" })),
    },
  );
  return payload.url;
}

export async function createConnectIntent(input: unknown): Promise<string> {
  const { profileId, capabilitySlug, provider, requestedLabel } =
    createConnectIntentInputSchema.parse(input);
  const payload = await backendFetch(
    `/profiles/${encodeURIComponent(profileId)}/connect-intents`,
    connectIntentResponseSchema,
    {
      method: "POST",
      body: JSON.stringify(
        createConnectIntentRequestSchema.parse({
          capabilitySlug,
          provider,
          ...(requestedLabel ? { requestedLabel } : {}),
        }),
      ),
    },
  );
  return payload.connectIntentId;
}

export type NangoConnectSessionResponse = z.infer<typeof nangoConnectSessionHttpResponseSchema>;

export async function startNangoConnectSessionForIntent(
  input: unknown,
): Promise<NangoConnectSessionResponse> {
  const { profileId, connectIntentId } = connectIntentParamsSchema.parse(input);
  return backendFetch(
    `/profiles/${encodeURIComponent(profileId)}/connect-intents/${encodeURIComponent(connectIntentId)}/nango/connect-session`,
    nangoConnectSessionHttpResponseSchema,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function startNangoConnectSessionForLink(
  input: unknown,
): Promise<NangoConnectSessionResponse> {
  const { profileId, capabilityAccountLinkId } = capabilityAccountLinkInputSchema.parse(input);
  return backendFetch(
    `/profiles/${encodeURIComponent(profileId)}/capability-account-links/${encodeURIComponent(capabilityAccountLinkId)}/nango/connect-session`,
    nangoConnectSessionHttpResponseSchema,
    { method: "POST", body: JSON.stringify({}) },
  );
}

const completeNangoConnectSessionForIntentInputSchema = connectIntentParamsSchema
  .extend({
    connectionId: nangoConnectCompleteRequestSchema.shape.connectionId,
    providerConfigKey: nangoConnectCompleteRequestSchema.shape.providerConfigKey,
  })
  .strict();

export async function completeNangoConnectSessionForIntent(
  input: unknown,
): Promise<IntegrationAccount> {
  const { profileId, connectIntentId, connectionId, providerConfigKey } =
    completeNangoConnectSessionForIntentInputSchema.parse(input);
  const payload = await backendFetch(
    `/profiles/${encodeURIComponent(profileId)}/connect-intents/${encodeURIComponent(connectIntentId)}/nango/complete`,
    nangoConnectCompleteResponseSchema,
    {
      method: "POST",
      body: JSON.stringify(
        nangoConnectCompleteRequestSchema.parse({ connectionId, providerConfigKey }),
      ),
    },
  );
  return payload.capability;
}

const completeNangoConnectSessionForLinkInputSchema = capabilityAccountLinkInputSchema
  .extend({
    connectionId: nangoConnectCompleteRequestSchema.shape.connectionId,
    providerConfigKey: nangoConnectCompleteRequestSchema.shape.providerConfigKey,
  })
  .strict();

export async function completeNangoConnectSessionForLink(
  input: unknown,
): Promise<IntegrationAccount> {
  const { profileId, capabilityAccountLinkId, connectionId, providerConfigKey } =
    completeNangoConnectSessionForLinkInputSchema.parse(input);
  const payload = await backendFetch(
    `/profiles/${encodeURIComponent(profileId)}/capability-account-links/${encodeURIComponent(capabilityAccountLinkId)}/nango/complete`,
    nangoConnectCompleteResponseSchema,
    {
      method: "POST",
      body: JSON.stringify(
        nangoConnectCompleteRequestSchema.parse({ connectionId, providerConfigKey }),
      ),
    },
  );
  return payload.capability;
}

export async function refreshNangoConnectSessionForLink(
  input: unknown,
): Promise<IntegrationAccount> {
  const { profileId, capabilityAccountLinkId } = capabilityAccountLinkInputSchema.parse(input);
  const payload = await backendFetch(
    `/profiles/${encodeURIComponent(profileId)}/capability-account-links/${encodeURIComponent(capabilityAccountLinkId)}/nango/refresh`,
    nangoConnectCompleteResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
  return payload.capability;
}

export async function disconnectCapabilityAccountLink(input: unknown): Promise<void> {
  const { profileId, capabilityAccountLinkId } = capabilityAccountLinkInputSchema.parse(input);
  await backendFetch(
    `/profiles/${encodeURIComponent(profileId)}/capability-account-links/${encodeURIComponent(capabilityAccountLinkId)}/disconnect`,
    disconnectCapabilityResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function deleteCapabilityAccountLink(input: unknown): Promise<void> {
  const { profileId, capabilityAccountLinkId } = capabilityAccountLinkInputSchema.parse(input);
  await backendFetch(
    `/profiles/${encodeURIComponent(profileId)}/capability-account-links/${encodeURIComponent(capabilityAccountLinkId)}`,
    disconnectCapabilityResponseSchema,
    { method: "DELETE" },
  );
}
