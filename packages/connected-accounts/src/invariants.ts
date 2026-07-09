/**
 * Connected-account control-plane invariants (pre-launch, no compatibility shims).
 *
 * - profile_capabilities: one assistant surface per (profile_id, capability_slug).
 * - connected_provider_accounts: one row per real external account/token.
 * - capability_account_links: capability-specific link to a connected account.
 * - provider_connect_intents: short-lived OAuth attempts; no durable row until success.
 *
 * Agent-visible account selection uses connectedAccountId (connected_provider_accounts.id).
 * Capability-specific jobs/webhooks/receipts store capabilityAccountLinkId.
 */

export const CONNECTED_ACCOUNT_SELECTOR_FIELD = "connectedAccountId" as const;
export const CAPABILITY_ACCOUNT_LINK_SELECTOR_FIELD = "capabilityAccountLinkId" as const;

/** Providers that use profile_capabilities only (no external account slots). */
export const CAPABILITY_ONLY_PROVIDERS = ["document-tools"] as const;

export function isCapabilityOnlyProvider(provider: string): boolean {
  return (CAPABILITY_ONLY_PROVIDERS as readonly string[]).includes(provider);
}
