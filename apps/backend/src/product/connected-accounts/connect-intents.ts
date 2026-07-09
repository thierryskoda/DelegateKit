import { randomUUID } from "node:crypto";
import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  assertKnownSlugProviderPair,
  requireCapabilityActivationPolicyForSlug,
} from "@ai-assistants/capability-catalog";
import { requireProfileCapability } from "./connected-accounts";

const CONNECT_INTENT_TTL_MS = 60 * 60_000;

export async function createProviderConnectIntent(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilitySlug: string;
  provider: string;
  requestedLabel?: string | null;
  capabilityAccountLinkId?: string | null;
}): Promise<TableRow<"provider_connect_intents">> {
  const policy = requireCapabilityActivationPolicyForSlug(input.capabilitySlug);
  if (policy.credentialMode !== "oauth") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Capability ${input.capabilitySlug} does not use OAuth/Nango Connect.`,
    );
  }
  assertKnownSlugProviderPair(input.capabilitySlug, input.provider);
  if (!policy.providers.includes(input.provider)) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider ${input.provider} is not allowed for capability ${input.capabilitySlug}.`,
    );
  }

  const capability = await requireProfileCapability(input.db, input.profileId, input.capabilitySlug);
  const reconnectLinkId = input.capabilityAccountLinkId?.trim() || null;
  if (reconnectLinkId) {
    const linkResult = await input.db
      .from("capability_account_links")
      .select()
      .eq("profile_id", input.profileId)
      .eq("id", reconnectLinkId)
      .eq("status", "enabled")
      .maybeSingle();
    if (linkResult.error) throw linkResult.error;
    if (!linkResult.data) {
      throw new DomainError(domainCodes.NOT_FOUND, "Capability account link not found.");
    }
    if (
      linkResult.data.capability_slug !== input.capabilitySlug ||
      linkResult.data.provider !== input.provider
    ) {
      throw new DomainError(
        domainCodes.CONFLICT,
        "Capability account link does not match the requested capability provider.",
      );
    }
  }

  const now = new Date();
  const insert = await input.db
    .from("provider_connect_intents")
    .insert({
      id: randomUUID(),
      profile_id: input.profileId,
      profile_capability_id: capability.id,
      capability_slug: input.capabilitySlug,
      provider: input.provider,
      requested_label: input.requestedLabel?.trim() || null,
      capability_account_link_id: reconnectLinkId,
      status: "pending",
      expires_at: new Date(now.getTime() + CONNECT_INTENT_TTL_MS).toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .select()
    .single();
  if (insert.error) throw insert.error;
  if (!insert.data) {
    throw new DomainError(domainCodes.INTERNAL, "Provider connect intent insert returned no row.");
  }
  return insert.data;
}

export async function requirePendingProviderConnectIntent(
  db: SupabaseServiceClient,
  input: { profileId: string; connectIntentId: string },
): Promise<TableRow<"provider_connect_intents">> {
  const result = await db
    .from("provider_connect_intents")
    .select()
    .eq("profile_id", input.profileId)
    .eq("id", input.connectIntentId)
    .maybeSingle();
  if (result.error) throw result.error;
  const intent = result.data;
  if (!intent) {
    throw new DomainError(domainCodes.NOT_FOUND, "Provider connect intent not found.");
  }
  if (intent.status !== "pending") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connect intent ${intent.id} is ${intent.status}; expected pending.`,
    );
  }
  if (Date.parse(intent.expires_at) <= Date.now()) {
    const expired = await db
      .from("provider_connect_intents")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", intent.id)
      .eq("status", "pending");
    if (expired.error) throw expired.error;
    throw new DomainError(domainCodes.CONFLICT, "Provider connect intent has expired.");
  }
  return intent;
}
