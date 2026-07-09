import { Check, ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import { openExternalUrl } from "../../shared/browser/open-external-url";
import { Button } from "../../shared/ui/button";
import { ModalShell } from "../../shared/ui/modal-shell";
import type { IntegrationAccount, IntegrationGroup } from "./integrations.api";
import { IntegrationProviderIcon } from "./integration-provider-icon";
import { canDisconnectIntegration } from "./integrations.service";

function actionForAccount(
  account: IntegrationAccount,
  canDisconnect: boolean,
): { intent: "connect" | "disconnect"; label: string } {
  if (account.state === "connected" && canDisconnect) {
    return { intent: "disconnect", label: "Disconnect" };
  }
  if (account.state === "needs_attention") {
    return {
      intent: "connect",
      label: "Reconnect",
    };
  }
  return {
    intent: "connect",
    label: "Connect",
  };
}

export function IntegrationAccountRow({
  account,
  group,
  connectInBrowser,
  oauthBusy,
  connectBusy,
  disconnectBusy,
  deleteBusy,
  onConnect,
  onDisconnect,
  onDelete,
}: {
  account: IntegrationAccount;
  group: IntegrationGroup;
  connectInBrowser: boolean;
  oauthBusy: boolean;
  connectBusy: boolean;
  disconnectBusy: boolean;
  deleteBusy: boolean;
  onConnect: (capabilityAccountLinkId: string) => void;
  onDisconnect: (capabilityAccountLinkId: string) => void;
  onDelete: (capabilityAccountLinkId: string) => void;
}) {
  const rowBusy = oauthBusy || connectBusy || disconnectBusy || deleteBusy;
  const [showManageModal, setShowManageModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const action = actionForAccount(account, canDisconnectIntegration(account));

  const isConnected = account.state === "connected";
  const needsReconnect = account.state === "needs_attention";

  const title = account.connectedAccountEmail ?? account.displayLabel;
  const subtitle = isConnected ? null : account.statusLabel;
  const modalSubtitle = subtitle ?? group.groupLabel;

  const isPrimaryAction = action.intent === "connect" && account.state !== "needs_attention";
  const isDisconnect = action.intent === "disconnect";
  const canReconnect = isConnected && account.connectable;
  const needsInstallBeforeConnect =
    group.provider === "monday" && Boolean(account.preConnectInstallUrl);

  function handleConnect(): void {
    if (needsInstallBeforeConnect) {
      setShowInstallModal(true);
      return;
    }
    onConnect(account.capabilityAccountLinkId);
  }

  return (
    <>
      <li className="flex items-center justify-between gap-3 px-4 py-3.5 md:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-secondary border border-default shadow-xs">
            <IntegrationProviderIcon
              capabilitySlug={account.capabilities[0]?.capabilitySlug ?? group.provider}
              provider={group.provider}
            />
          </div>
          <div className="min-w-0 flex-1 grid gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-medium text-default leading-snug">{title}</p>
            </div>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-tertiary leading-normal">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end">
          {isDisconnect ? (
            <Button
              aria-label="Manage account"
              className="size-8 shrink-0 inline-flex items-center justify-center rounded-xl"
              disabled={rowBusy}
              loading={connectBusy || disconnectBusy}
              size="icon"
              title="Manage account"
              variant="ghost"
              onClick={() => setShowManageModal(true)}
            >
              <Check className="size-5 text-[oklch(0.62_0.17_145)]" />
            </Button>
          ) : needsReconnect ? (
            <div className="flex items-center justify-end gap-2">
              <Button
                className="shrink-0 h-8 px-3 text-xs font-semibold inline-flex items-center justify-center gap-1.5 rounded-xl"
                disabled={rowBusy}
                loading={connectBusy}
                size="sm"
                variant="secondary"
                onClick={handleConnect}
              >
                {action.label}
                {connectInBrowser ? <ExternalLink className="size-3.5" /> : null}
              </Button>
              <Button
                aria-label={`Delete ${title}`}
                className="size-8 shrink-0 inline-flex items-center justify-center rounded-xl"
                disabled={rowBusy}
                loading={deleteBusy}
                size="icon"
                title="Delete account"
                variant="ghost"
                onClick={() => setShowDeleteConfirmModal(true)}
              >
                <Trash2 className="size-4 text-tertiary" />
              </Button>
            </div>
          ) : (
            <Button
              className="shrink-0 h-8 px-3 text-xs font-semibold inline-flex items-center justify-center gap-1.5 rounded-xl"
              disabled={rowBusy}
              loading={connectBusy}
              size="sm"
              variant={isPrimaryAction ? "primary" : "secondary"}
              onClick={handleConnect}
            >
              {action.label}
              {connectInBrowser ? <ExternalLink className="size-3.5" /> : null}
            </Button>
          )}
        </div>
      </li>
      {showManageModal ? (
        <ManageAccountModal
          accountTitle={title}
          accountSubtitle={modalSubtitle}
          busy={rowBusy}
          canReconnect={canReconnect}
          onCancel={() => setShowManageModal(false)}
          onDisconnect={() => {
            setShowManageModal(false);
            onDisconnect(account.capabilityAccountLinkId);
          }}
          onReconnect={() => {
            setShowManageModal(false);
            handleConnect();
          }}
        />
      ) : null}
      {showDeleteConfirmModal ? (
        <DeleteAccountModal
          accountSubtitle={modalSubtitle}
          accountTitle={title}
          busy={rowBusy}
          onCancel={() => setShowDeleteConfirmModal(false)}
          onDelete={() => {
            setShowDeleteConfirmModal(false);
            onDelete(account.capabilityAccountLinkId);
          }}
        />
      ) : null}
      {showInstallModal && account.preConnectInstallUrl ? (
        <MondayInstallModal
          busy={rowBusy}
          installUrl={account.preConnectInstallUrl}
          onCancel={() => setShowInstallModal(false)}
          onContinue={() => {
            setShowInstallModal(false);
            onConnect(account.capabilityAccountLinkId);
          }}
        />
      ) : null}
    </>
  );
}

function MondayInstallModal({
  busy,
  installUrl,
  onCancel,
  onContinue,
}: {
  busy: boolean;
  installUrl: string;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const [installStarted, setInstallStarted] = useState(false);

  function openInstall(): void {
    setInstallStarted(true);
    openExternalUrl(installUrl);
  }

  return (
    <ModalShell
      title="Connect Monday"
      description="Monday requires the app to be installed before account authorization can finish."
      labelledBy="monday-install-title"
      onClose={onCancel}
    >
      <ol className="grid gap-3">
        <li className="grid grid-cols-[2rem_1fr] gap-3 rounded-2xl border border-default bg-surface-secondary p-3.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
            {installStarted ? <Check className="size-4" /> : "1"}
          </span>
          <div className="grid gap-2">
            <div className="grid gap-0.5">
              <p className="text-sm font-semibold text-default">Install the Monday app</p>
              <p className="text-xs leading-relaxed text-secondary">
                Use a Monday admin account for this workspace, then return here.
              </p>
            </div>
            <Button disabled={busy} variant="secondary" size="sm" onClick={openInstall}>
              Install in Monday
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        </li>

        <li className="grid grid-cols-[2rem_1fr] gap-3 rounded-2xl border border-default p-3.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-surface-secondary text-sm font-semibold text-secondary">
            2
          </span>
          <div className="grid gap-2">
            <div className="grid gap-0.5">
              <p className="text-sm font-semibold text-default">Authorize the account</p>
              <p className="text-xs leading-relaxed text-secondary">
                Continue after the app is installed to finish the secure account connection.
              </p>
            </div>
            <Button disabled={busy} size="sm" onClick={onContinue}>
              Continue connection
            </Button>
          </div>
        </li>
      </ol>
    </ModalShell>
  );
}

function DeleteAccountModal({
  accountTitle,
  accountSubtitle,
  busy,
  onCancel,
  onDelete,
}: {
  accountTitle: string;
  accountSubtitle: string;
  busy: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <ModalShell
      title="Delete account?"
      description={
        <>
          <p>
            This will remove <span className="font-medium text-default">{accountTitle}</span> from
            your assistant. Add it again later if you need it.
          </p>
          <p className="mt-1 text-xs text-tertiary">{accountSubtitle}</p>
        </>
      }
      labelledBy="delete-account-title"
      onClose={onCancel}
    >
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button disabled={busy} variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={busy} variant="danger" size="sm" onClick={onDelete}>
          Delete
        </Button>
      </div>
    </ModalShell>
  );
}

function ManageAccountModal({
  accountTitle,
  accountSubtitle,
  busy,
  canReconnect,
  onCancel,
  onDisconnect,
  onReconnect,
}: {
  accountTitle: string;
  accountSubtitle: string;
  busy: boolean;
  canReconnect: boolean;
  onCancel: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}) {
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  if (showDisconnectConfirm) {
    return (
      <ModalShell
        title="Disconnect account?"
        description={
          <>
            <p>
              This will remove <span className="font-medium text-default">{accountTitle}</span> from
              your assistant. You can reconnect it later.
            </p>
            <p className="mt-1 text-xs text-tertiary">{accountSubtitle}</p>
          </>
        }
        labelledBy="disconnect-confirm-title"
        onClose={onCancel}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button disabled={busy} variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={busy} variant="danger" size="sm" onClick={onDisconnect}>
            Disconnect
          </Button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="Manage account"
      description={
        <>
          <p className="font-medium text-default">{accountTitle}</p>
          <p className="text-xs text-tertiary">{accountSubtitle}</p>
        </>
      }
      labelledBy="manage-account-title"
      onClose={onCancel}
    >
      <div className="grid gap-2">
        {canReconnect ? (
          <Button disabled={busy} size="sm" onClick={onReconnect}>
            Reconnect
          </Button>
        ) : null}
        <Button
          disabled={busy}
          variant="danger"
          size="sm"
          onClick={() => setShowDisconnectConfirm(true)}
        >
          Disconnect
        </Button>
      </div>
    </ModalShell>
  );
}
