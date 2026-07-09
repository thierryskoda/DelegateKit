import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  requireNangoProviderCapabilityAccount,
  type NangoProviderCapabilityAccountBinding,
} from "../../integrations/provider-runtime";

/** Resolves exactly one enabled, healthy, Nango-backed Monday connection for this profile. */
export async function requireMondayNango(
  db: SupabaseServiceClient,
  profileId: string,
  input: {
    connectedAccountId?: string | null;
    capabilityAccountLinkId?: string | null;
  } = {},
): Promise<NangoProviderCapabilityAccountBinding> {
  return requireNangoProviderCapabilityAccount(db, {
    profileId,
    providers: ["monday"],
    capabilitySlugs: ["monday"],
    connectedAccountId: input.connectedAccountId ?? null,
    capabilityAccountLinkId: input.capabilityAccountLinkId ?? null,
  });
}
