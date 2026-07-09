import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { requireSupabaseRows } from "@ai-assistants/control-db";
import { isCapabilityOnlyProvider } from "@ai-assistants/connected-accounts";
import {
  assertKnownSlugProviderPair,
  requireCapabilityActivationPolicyForSlug,
} from "@ai-assistants/capability-catalog";
import { DomainError, domainCodes } from "@ai-assistants/errors";

export async function requireProfileCapability(
  db: SupabaseServiceClient,
  profileId: string,
  capabilitySlug: string,
): Promise<TableRow<"profile_capabilities">> {
  const result = await db
    .from("profile_capabilities")
    .select()
    .eq("profile_id", profileId)
    .eq("capability_slug", capabilitySlug)
    .eq("status", "enabled")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) {
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Capability ${capabilitySlug} is not enabled for profile ${profileId}.`,
    );
  }
  return result.data;
}

export async function listCapabilityAccountLinksForCapability(
  db: SupabaseServiceClient,
  profileId: string,
  capabilitySlug: string,
): Promise<TableRow<"capability_account_links">[]> {
  const capability = await requireProfileCapability(db, profileId, capabilitySlug);
  const result = await db
    .from("capability_account_links")
    .select()
    .eq("profile_id", profileId)
    .eq("profile_capability_id", capability.id)
    .eq("status", "enabled")
    .order("label");
  return requireSupabaseRows("List capability account links", result.data, result.error);
}

export async function createCapabilityAccountLink(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilitySlug: string;
  provider: string;
  label: string;
}): Promise<TableRow<"capability_account_links">> {
  const policy = requireCapabilityActivationPolicyForSlug(input.capabilitySlug);
  if (policy.credentialMode === "none") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Capability ${input.capabilitySlug} does not support external account links.`,
    );
  }
  if (isCapabilityOnlyProvider(input.provider)) {
    throw new DomainError(domainCodes.CONFLICT, `Provider ${input.provider} is not an OAuth account.`);
  }
  assertKnownSlugProviderPair(input.capabilitySlug, input.provider);
  if (!policy.providers.includes(input.provider)) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider ${input.provider} is not allowed for capability ${input.capabilitySlug}.`,
    );
  }

  const capability = await requireProfileCapability(input.db, input.profileId, input.capabilitySlug);
  const cleanLabel = input.label.trim();
  if (!cleanLabel) throw new DomainError(domainCodes.BAD_REQUEST, "Account link label is required.");

  const insert = await input.db
    .from("capability_account_links")
    .insert({
      profile_id: input.profileId,
      profile_capability_id: capability.id,
      capability_slug: input.capabilitySlug,
      provider: input.provider,
      label: cleanLabel,
      status: "enabled",
      is_default: false,
      required: false,
      config: {},
      readiness_status: "not_connected",
      readiness_blocker_code: null,
      readiness_metadata: {},
    })
    .select()
    .single();
  if (insert.error) throw insert.error;
  if (!insert.data) {
    throw new DomainError(domainCodes.INTERNAL, "Capability account link insert returned no row.");
  }
  return insert.data;
}
