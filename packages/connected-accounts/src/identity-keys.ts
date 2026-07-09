/**
 * Canonical external-account identity for duplicate detection during OAuth reconcile.
 *
 * Primary key: (profile_id, provider, provider_account_id) on connected_provider_accounts.
 * Display/principal: account_email when the provider exposes a mailbox or user principal.
 */
export type ConnectedAccountIdentity = {
  provider: string;
  providerAccountId: string;
  principal: string | null;
};

export function connectedAccountIdentityFromNango(input: {
  provider: string;
  connectionId: string;
  accountId?: string | null;
  endUserEmail?: string | null;
}): ConnectedAccountIdentity {
  const providerAccountId = input.accountId?.trim() || input.connectionId.trim();
  const principal = input.endUserEmail?.trim() || null;
  return {
    provider: input.provider,
    providerAccountId,
    principal,
  };
}

export function duplicateConnectedAccountMessage(input: {
  principal: string | null;
  provider: string;
  existingLinkLabel: string | null;
}): string {
  const who = input.principal ?? input.provider;
  const label = input.existingLinkLabel?.trim();
  return label
    ? `This account (${who}) is already connected as "${label}". Reconnect that account instead of adding it again.`
    : `This account (${who}) is already connected for this profile. Reconnect the existing account instead of adding it again.`;
}
