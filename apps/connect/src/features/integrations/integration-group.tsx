import { Plus } from "lucide-react";
import { Button } from "../../shared/ui/button";
import { Panel } from "../../shared/ui/panel";
import type { IntegrationGroup } from "./integrations.api";
import { IntegrationAccountRow } from "./integration-account-row";
import { canAddAccountToGroup, manageableAccountsInGroup } from "./integrations.service";

export function IntegrationGroupPanel({
  group,
  oauthBusy,
  addAccountBusy,
  connectPendingLinkId,
  disconnectPendingLinkId,
  deletePendingLinkId,
  connectInBrowser,
  onConnect,
  onDisconnect,
  onDelete,
  onAddAccount,
}: {
  group: IntegrationGroup;
  oauthBusy: boolean;
  addAccountBusy: boolean;
  connectPendingLinkId: string | undefined;
  disconnectPendingLinkId: string | undefined;
  deletePendingLinkId: string | undefined;
  connectInBrowser: boolean;
  onConnect: (capabilityAccountLinkId: string) => void;
  onDisconnect: (capabilityAccountLinkId: string) => void;
  onDelete: (capabilityAccountLinkId: string) => void;
  onAddAccount: (input: { capabilitySlug: string; provider: string; label: string }) => void;
}) {
  const accounts = manageableAccountsInGroup(group);
  const canAdd = canAddAccountToGroup(group);

  if (accounts.length === 0 && !canAdd) return null;

  function handleAddClick(): void {
    const option = group.addAccountProvider;
    if (!option) return;
    onAddAccount({
      capabilitySlug: option.capabilitySlug,
      provider: option.provider,
      label: group.groupLabel,
    });
  }

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-default px-4 py-3 md:px-5">
        <h2 className="heading-sm text-default leading-none">{group.groupLabel}</h2>
        {canAdd ? (
          <div className="flex shrink-0 items-center justify-end">
            <Button
              disabled={oauthBusy}
              loading={addAccountBusy}
              size="icon"
              variant="secondary"
              className="size-8 rounded-xl shrink-0 inline-flex items-center justify-center"
              onClick={handleAddClick}
              aria-label={`Connect ${group.groupLabel}`}
              title={`Connect ${group.groupLabel}`}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>

      {accounts.length > 0 ? (
        <ul>
          {accounts.map((account) => (
            <IntegrationAccountRow
              account={account}
              group={group}
              connectBusy={connectPendingLinkId === account.capabilityAccountLinkId}
              connectInBrowser={connectInBrowser}
              deleteBusy={deletePendingLinkId === account.capabilityAccountLinkId}
              disconnectBusy={disconnectPendingLinkId === account.capabilityAccountLinkId}
              key={account.id}
              oauthBusy={oauthBusy}
              onConnect={onConnect}
              onDelete={onDelete}
              onDisconnect={onDisconnect}
            />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-secondary md:px-5">No accounts connected yet.</p>
      )}
    </Panel>
  );
}
