import { isTelegramMiniApp } from "../telegram/telegram-mini-app.launch";
import { InlineNotice } from "../../shared/ui/inline-notice";
import { ErrorState, EmptyState, LoadingState } from "../../shared/ui/page-state";
import { PageHeader } from "../../shared/ui/panel";
import { IntegrationGroupPanel } from "./integration-group";
import { visibleIntegrationGroups } from "./integrations.service";
import {
  useAddIntegrationAccountMutation,
  useDeleteIntegrationMutation,
  useDisconnectIntegrationMutation,
  useIntegrationsQuery,
  useStartNangoConnectSessionMutation,
} from "./integrations.queries";

export function IntegrationsPage({ profileId }: { profileId: string }) {
  const integrationsQuery = useIntegrationsQuery(profileId);
  const connect = useStartNangoConnectSessionMutation(profileId);
  const disconnect = useDisconnectIntegrationMutation(profileId);
  const deleteAccount = useDeleteIntegrationMutation(profileId);
  const addAccount = useAddIntegrationAccountMutation(profileId);
  const oauthBusy = connect.isPending || addAccount.isPending;
  const connectInBrowser = isTelegramMiniApp();
  const groups = integrationsQuery.data ? visibleIntegrationGroups(integrationsQuery.data) : [];

  function startConnect(capabilityAccountLinkId: string): void {
    connect.mutate({ kind: "capability_link", capabilityAccountLinkId });
  }

  function startBrowserPortalConnect(): void {
    connect.mutate({ kind: "browser_portal" });
  }

  return (
    <section className="grid gap-4">
      <PageHeader description="Connect the accounts your assistant can use." title="Integrations" />
      {connectInBrowser ? (
        <InlineNotice title="Connect in your browser">
          For account sign-in, open the browser portal. Telegram is only used to launch this page.
        </InlineNotice>
      ) : null}
      {integrationsQuery.error ? <ErrorState error={integrationsQuery.error} /> : null}
      {integrationsQuery.isPending && !integrationsQuery.error ? (
        <LoadingState label="Loading integrations" />
      ) : null}
      {integrationsQuery.data && groups.length === 0 ? (
        <EmptyState title="Everything is connected.">
          You do not need to connect anything right now.
        </EmptyState>
      ) : null}
      {groups.length > 0 ? (
        <div className="grid gap-4">
          {groups.map((group) => (
            <IntegrationGroupPanel
              addAccountBusy={addAccount.isPending}
              connectInBrowser={connectInBrowser}
              connectPendingLinkId={
                connect.isPending && connect.variables?.kind === "capability_link"
                  ? connect.variables.capabilityAccountLinkId
                  : undefined
              }
              disconnectPendingLinkId={disconnect.isPending ? disconnect.variables : undefined}
              deletePendingLinkId={deleteAccount.isPending ? deleteAccount.variables : undefined}
              key={group.groupKey}
              oauthBusy={oauthBusy}
              onAddAccount={(input) =>
                connectInBrowser
                  ? startBrowserPortalConnect()
                  : addAccount.mutate(input, {
                      onSuccess: (connectIntentId) => {
                        connect.mutate({ kind: "connect_intent", connectIntentId });
                      },
                    })
              }
              onConnect={startConnect}
              onDelete={(capabilityAccountLinkId) => deleteAccount.mutate(capabilityAccountLinkId)}
              onDisconnect={(capabilityAccountLinkId) => disconnect.mutate(capabilityAccountLinkId)}
              group={group}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
