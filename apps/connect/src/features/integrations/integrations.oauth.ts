import Nango, { type ConnectUI } from "@nangohq/frontend";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateConnectIntegrations } from "../../app/connect-query-cache";
import {
  completeNangoConnectSessionForIntent,
  completeNangoConnectSessionForLink,
  createIntegrationsBrowserHandoff,
  refreshNangoConnectSessionForLink,
  startNangoConnectSessionForIntent,
  startNangoConnectSessionForLink,
  type NangoConnectSessionResponse,
} from "./integrations.api";
import { openExternalUrl } from "../../shared/browser/open-external-url";
import { isTelegramMiniApp, openTelegramExternalLink } from "../telegram/telegram-mini-app.launch";

export type ConnectOAuthTarget =
  | { kind: "connect_intent"; connectIntentId: string }
  | { kind: "capability_link"; capabilityAccountLinkId: string }
  | { kind: "browser_portal" };

export type StartConnectResult =
  | { kind: "browser_portal"; url: string }
  | { kind: "nango"; target: ConnectOAuthTarget; payload: NangoConnectSessionResponse };

const PENDING_RECONNECT_STORAGE_KEY = "aiAssistants.pendingNangoReconnects.v1";
const PENDING_RECONNECT_TTL_MS = 30 * 60_000;
const PENDING_RECONNECT_REFRESH_ATTEMPTS = 24;
const PENDING_RECONNECT_REFRESH_DELAY_MS = 5_000;
const activeReconnectRefreshes = new Set<string>();

type PendingNangoReconnect = {
  profileId: string;
  capabilityAccountLinkId: string;
  expiresAt: number;
};

function shutdownNangoConnectUi(ui: ConnectUI, client: Nango): void {
  ui.close();
  client.clear();
}

function pendingReconnectKey(input: {
  profileId: string;
  capabilityAccountLinkId: string;
}): string {
  return `${input.profileId}:${input.capabilityAccountLinkId}`;
}

function pendingReconnectStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function parsePendingReconnects(raw: string | null): PendingNangoReconnect[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      if (
        typeof record.profileId !== "string" ||
        typeof record.capabilityAccountLinkId !== "string" ||
        typeof record.expiresAt !== "number"
      ) {
        return [];
      }
      return [
        {
          profileId: record.profileId,
          capabilityAccountLinkId: record.capabilityAccountLinkId,
          expiresAt: record.expiresAt,
        },
      ];
    });
  } catch {
    return [];
  }
}

function writePendingReconnects(items: PendingNangoReconnect[]): void {
  const storage = pendingReconnectStorage();
  if (!storage) return;
  if (items.length === 0) {
    storage.removeItem(PENDING_RECONNECT_STORAGE_KEY);
    return;
  }
  storage.setItem(PENDING_RECONNECT_STORAGE_KEY, JSON.stringify(items));
}

function readPendingReconnects(): PendingNangoReconnect[] {
  const storage = pendingReconnectStorage();
  if (!storage) return [];
  const now = Date.now();
  const items = parsePendingReconnects(storage.getItem(PENDING_RECONNECT_STORAGE_KEY)).filter(
    (item) => item.expiresAt > now,
  );
  writePendingReconnects(items);
  return items;
}

function rememberPendingReconnect(profileId: string, target: ConnectOAuthTarget): void {
  if (target.kind !== "capability_link") return;
  const pending = {
    profileId,
    capabilityAccountLinkId: target.capabilityAccountLinkId,
    expiresAt: Date.now() + PENDING_RECONNECT_TTL_MS,
  };
  const key = pendingReconnectKey(pending);
  const existing = readPendingReconnects().filter((item) => pendingReconnectKey(item) !== key);
  writePendingReconnects([...existing, pending]);
}

function forgetPendingReconnect(input: {
  profileId: string;
  capabilityAccountLinkId: string;
}): void {
  const key = pendingReconnectKey(input);
  writePendingReconnects(
    readPendingReconnects().filter((item) => pendingReconnectKey(item) !== key),
  );
}

function hasPendingReconnect(input: {
  profileId: string;
  capabilityAccountLinkId: string;
}): boolean {
  const key = pendingReconnectKey(input);
  return readPendingReconnects().some((item) => pendingReconnectKey(item) === key);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function refreshPendingReconnect(
  pending: PendingNangoReconnect,
  handlers: {
    queryClient: QueryClient;
    onConnectSuccess: () => void;
  },
): Promise<void> {
  const key = pendingReconnectKey(pending);
  if (activeReconnectRefreshes.has(key)) return;
  activeReconnectRefreshes.add(key);
  try {
    for (let attempt = 1; attempt <= PENDING_RECONNECT_REFRESH_ATTEMPTS; attempt += 1) {
      if (!hasPendingReconnect(pending)) return;
      try {
        await refreshNangoConnectSessionForLink({
          profileId: pending.profileId,
          capabilityAccountLinkId: pending.capabilityAccountLinkId,
        });
        forgetPendingReconnect(pending);
        await invalidateConnectIntegrations(handlers.queryClient, pending.profileId);
        handlers.onConnectSuccess();
        return;
      } catch {
        if (attempt === PENDING_RECONNECT_REFRESH_ATTEMPTS) return;
        await wait(PENDING_RECONNECT_REFRESH_DELAY_MS);
      }
    }
  } finally {
    activeReconnectRefreshes.delete(key);
  }
}

export function resumePendingNangoReconnects(
  profileId: string,
  handlers: {
    queryClient: QueryClient;
    onConnectSuccess: () => void;
  },
): void {
  const pending = readPendingReconnects().filter((item) => item.profileId === profileId);
  for (const item of pending) {
    void refreshPendingReconnect(item, handlers);
  }
}

function openNangoConnectUi(
  payload: Extract<NangoConnectSessionResponse, { status: "session_created" }>,
  handlers: {
    onConnected: (connection: {
      connectionId: string;
      providerConfigKey: string;
    }) => void | Promise<void>;
    onError: (message: string) => void;
  },
): void {
  const client = new Nango({
    host: payload.nangoApiUrl,
    connectSessionToken: payload.sessionToken,
  });

  const ui = client.openConnectUI({
    baseURL: payload.nangoConnectUiUrl,
    apiURL: payload.nangoApiUrl,
    onEvent: async (event) => {
      if (event.type === "error") {
        handlers.onError(event.payload.errorMessage);
        shutdownNangoConnectUi(ui, client);
        return;
      }

      if (event.type !== "connect") return;

      try {
        await handlers.onConnected({
          connectionId: event.payload.connectionId,
          providerConfigKey: event.payload.providerConfigKey,
        });
      } catch (error) {
        handlers.onError(error instanceof Error ? error.message : String(error));
      } finally {
        shutdownNangoConnectUi(ui, client);
      }
    },
  });
}

async function startConnectSession(
  profileId: string,
  target: ConnectOAuthTarget,
): Promise<NangoConnectSessionResponse> {
  if (target.kind === "browser_portal") {
    throw new Error("Browser portal handoff does not use a Nango connect session.");
  }
  if (target.kind === "connect_intent") {
    return startNangoConnectSessionForIntent({
      profileId,
      connectIntentId: target.connectIntentId,
    });
  }
  return startNangoConnectSessionForLink({
    profileId,
    capabilityAccountLinkId: target.capabilityAccountLinkId,
  });
}

async function completeConnectSession(
  profileId: string,
  target: ConnectOAuthTarget,
  connection: { connectionId: string; providerConfigKey: string },
): Promise<void> {
  if (target.kind === "browser_portal") {
    throw new Error("Browser portal handoff does not complete a Nango session.");
  }
  if (target.kind === "connect_intent") {
    await completeNangoConnectSessionForIntent({
      profileId,
      connectIntentId: target.connectIntentId,
      ...connection,
    });
    return;
  }
  await completeNangoConnectSessionForLink({
    profileId,
    capabilityAccountLinkId: target.capabilityAccountLinkId,
    ...connection,
  });
}

export async function beginIntegrationConnect(
  profileId: string,
  target: ConnectOAuthTarget,
): Promise<StartConnectResult> {
  if (isTelegramMiniApp() || target.kind === "browser_portal") {
    return { kind: "browser_portal", url: await createIntegrationsBrowserHandoff(profileId) };
  }
  const payload = await startConnectSession(profileId, target);
  return { kind: "nango", target, payload };
}

function openNangoConnectLink(connectLink: string, openLink: (url: string) => void): void {
  openLink(connectLink);
}

export function presentIntegrationConnectResult(
  profileId: string,
  result: StartConnectResult,
  handlers: {
    queryClient: QueryClient;
    onExternalConnect: () => void;
    onConnectSuccess: () => void;
    onError: (message: string) => void;
  },
): void {
  if (result.kind === "browser_portal") {
    openNangoConnectLink(
      result.url,
      isTelegramMiniApp() ? openTelegramExternalLink : openExternalUrl,
    );
    handlers.onExternalConnect();
    return;
  }

  const { target, payload } = result;
  rememberPendingReconnect(profileId, target);
  resumePendingNangoReconnects(profileId, {
    queryClient: handlers.queryClient,
    onConnectSuccess: handlers.onConnectSuccess,
  });
  openNangoConnectUi(payload, {
    onConnected: async (connection) => {
      await completeConnectSession(profileId, target, connection);
      if (target.kind === "capability_link") {
        forgetPendingReconnect({
          profileId,
          capabilityAccountLinkId: target.capabilityAccountLinkId,
        });
      }
      await invalidateConnectIntegrations(handlers.queryClient, profileId);
      handlers.onConnectSuccess();
    },
    onError: handlers.onError,
  });
}
