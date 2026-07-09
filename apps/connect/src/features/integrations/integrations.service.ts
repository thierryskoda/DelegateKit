import type { IntegrationAccount, IntegrationGroup } from "./integrations.api";

export function canDisconnectIntegration(account: IntegrationAccount): boolean {
  return account.disconnectable === true;
}

function isClientManageableAccount(account: IntegrationAccount): boolean {
  if (!account.connectable) return false;
  return (
    account.state === "connected" ||
    account.state === "syncing" ||
    account.state === "not_connected" ||
    account.state === "needs_attention"
  );
}

export function manageableAccountsInGroup(group: IntegrationGroup): IntegrationAccount[] {
  return group.accounts.filter(isClientManageableAccount);
}

function groupHasManageableAccounts(group: IntegrationGroup): boolean {
  return manageableAccountsInGroup(group).length > 0;
}

export function canAddAccountToGroup(group: IntegrationGroup): boolean {
  return group.addAccountProvider !== null;
}

export function visibleIntegrationGroups(groups: IntegrationGroup[]): IntegrationGroup[] {
  return groups.filter((group) => groupHasManageableAccounts(group) || canAddAccountToGroup(group));
}
