import type { IntegrationGroup } from "./integrations.api";

function requireAccountInGroups(groups: IntegrationGroup[], capabilityAccountLinkId: string): void {
  const found = groups.some((group) =>
    group.accounts.some((account) => account.capabilityAccountLinkId === capabilityAccountLinkId),
  );
  if (!found) {
    throw new Error(
      `Integration account link ${capabilityAccountLinkId} is not in the integrations cache snapshot.`,
    );
  }
}

export function disconnectIntegrationAccount(
  groups: IntegrationGroup[],
  capabilityAccountLinkId: string,
): IntegrationGroup[] {
  requireAccountInGroups(groups, capabilityAccountLinkId);
  return groups.map((group) => {
    const hasTarget = group.accounts.some(
      (account) => account.capabilityAccountLinkId === capabilityAccountLinkId,
    );
    if (!hasTarget) return group;
    return {
      ...group,
      accounts: group.accounts.map((account) =>
        account.capabilityAccountLinkId === capabilityAccountLinkId
          ? {
              ...account,
              connectedAccountId: null,
              connectedAccountEmail: null,
              displayLabel: account.linkLabel,
              state: "not_connected",
              statusLabel: "Not connected",
              disconnectable: false,
              capabilities: account.capabilities.map((capability) => ({
                ...capability,
                state: "not_connected",
                statusLabel: "Not connected",
              })),
            }
          : account,
      ),
    };
  });
}

export function deleteIntegrationAccount(
  groups: IntegrationGroup[],
  capabilityAccountLinkId: string,
): IntegrationGroup[] {
  requireAccountInGroups(groups, capabilityAccountLinkId);
  return groups.map((group) => ({
    ...group,
    accounts: group.accounts.filter(
      (account) => account.capabilityAccountLinkId !== capabilityAccountLinkId,
    ),
  }));
}
