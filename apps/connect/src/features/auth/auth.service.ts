import { DomainError, domainCodes } from "@ai-assistants/errors";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ConnectConfig } from "../../shared/api/config";
import { createTelegramMiniAppSession } from "../telegram/telegram-mini-app.api";
import { telegramMiniAppInitData } from "../telegram/telegram-mini-app.launch";
import { useAuthStore } from "./auth.store";

type AuthClient = SupabaseClient;
type PortalAccessAuthType = "magiclink" | "email";

let authClient: AuthClient | null = null;
let initialSessionPromise: Promise<string | null> | null = null;

export function configureAuthService(config: ConnectConfig): AuthClient {
  authClient = createClient(config.supabaseUrl, config.supabaseAnonKey);
  return authClient;
}

function getAuthClient(): AuthClient {
  if (!authClient)
    throw new DomainError(domainCodes.INTERNAL, "Supabase auth client was not initialized.");
  return authClient;
}

export function requireAccessToken(): string {
  const session = useAuthStore.getState().session;
  if (!session?.access_token)
    throw new DomainError(domainCodes.UNAUTHORIZED, "Authenticated Supabase session is required.");
  return session.access_token;
}

function portalAccessParamsFromHash(
  hash: string,
): { tokenHash: string; authType: PortalAccessAuthType; nextPath: string | null } | null {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const tokenHash = params.get("oc_token_hash")?.trim();
  const authType = params.get("oc_auth_type")?.trim();
  if (!tokenHash && !authType) return null;
  if (!tokenHash)
    throw new DomainError(domainCodes.BAD_REQUEST, "Portal access link is missing its token.");
  if (authType !== "magiclink" && authType !== "email")
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "Portal access link has an unsupported auth type.",
    );
  return {
    tokenHash,
    authType,
    nextPath: params.get("oc_next"),
  };
}

function safeSameOriginPath(path: string | null, fallback: string): string {
  if (!path) return fallback;
  try {
    const parsed = new URL(path, window.location.origin);
    if (parsed.origin !== window.location.origin) return fallback;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return fallback;
  }
}

function replaceCurrentUrl(path: string): void {
  window.history.replaceState(null, document.title, path);
}

async function consumePortalAccessLink(): Promise<string | null> {
  const access = portalAccessParamsFromHash(window.location.hash);
  if (!access) return null;
  const fallbackPath = `${window.location.pathname}${window.location.search}`;
  const nextPath = safeSameOriginPath(access.nextPath, fallbackPath);
  try {
    const { data, error } = await getAuthClient().auth.verifyOtp({
      token_hash: access.tokenHash,
      type: access.authType,
    });
    if (error) throw error;
    if (!data.session)
      throw new DomainError(domainCodes.INTERNAL, "Portal access link did not return a session.");
    useAuthStore.getState().setSession(data.session);
    return nextPath;
  } finally {
    replaceCurrentUrl(nextPath);
  }
}

async function signInWithPortalAccessUrl(url: string): Promise<string> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url, window.location.origin);
  } catch {
    throw new DomainError(domainCodes.BAD_REQUEST, "Portal access URL is invalid.");
  }
  const access = portalAccessParamsFromHash(parsedUrl.hash);
  if (!access) {
    throw new DomainError(domainCodes.BAD_REQUEST, "Portal access URL has no sign-in token.");
  }
  const fallbackPath = `${parsedUrl.pathname}${parsedUrl.search}`;
  const nextPath = safeSameOriginPath(access.nextPath, fallbackPath);
  const { data, error } = await getAuthClient().auth.verifyOtp({
    token_hash: access.tokenHash,
    type: access.authType,
  });
  if (error) throw error;
  if (!data.session)
    throw new DomainError(domainCodes.INTERNAL, "Portal access link did not return a session.");
  useAuthStore.getState().setSession(data.session);
  return nextPath;
}

async function consumeTelegramMiniAppSession(): Promise<string | null> {
  const initData = telegramMiniAppInitData();
  if (!initData) return null;
  try {
    const session = await createTelegramMiniAppSession({ initData });
    await signInWithPortalAccessUrl(session.portalAccessUrl);
    return safeSameOriginPath(
      session.destinationPath,
      `/assistants/${session.profileId}/approvals`,
    );
  } catch (error) {
    const existing = await getAuthClient().auth.getSession();
    if (existing.error) throw error;
    if (!existing.data.session) throw error;
    useAuthStore.getState().setSession(existing.data.session);
    return null;
  }
}

async function loadInitialSessionNow(): Promise<string | null> {
  useAuthStore.getState().setLoading();
  const telegramDestination = await consumeTelegramMiniAppSession();
  if (telegramDestination) return telegramDestination;
  const portalDestination = await consumePortalAccessLink();
  if (portalDestination) return portalDestination;
  const { data, error } = await getAuthClient().auth.getSession();
  if (error) throw error;
  useAuthStore.getState().setSession(data.session);
  return null;
}

export function loadInitialSession(): Promise<string | null> {
  initialSessionPromise ??= loadInitialSessionNow().catch((error) => {
    initialSessionPromise = null;
    throw error;
  });
  return initialSessionPromise;
}

export function subscribeToAuthChanges(): () => void {
  const { data } = getAuthClient().auth.onAuthStateChange((_event, session) => {
    useAuthStore.getState().setSession(session);
  });
  return () => data.subscription.unsubscribe();
}

export type PasswordLoginInput = {
  email: string;
  password: string;
};

export async function signInWithPassword(input: PasswordLoginInput): Promise<void> {
  const email = input.email.trim();
  if (!email) throw new DomainError(domainCodes.BAD_REQUEST, "Email is required.");
  if (!input.password) throw new DomainError(domainCodes.BAD_REQUEST, "Password is required.");
  const { data, error } = await getAuthClient().auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (error) throw error;
  if (!data.session)
    throw new DomainError(
      domainCodes.INTERNAL,
      "Supabase did not return a session for the password login.",
    );
  useAuthStore.getState().setSession(data.session);
}

export async function signOut(): Promise<void> {
  const { error } = await getAuthClient().auth.signOut();
  if (error) throw error;
  useAuthStore.getState().clearSession();
}

/** Used when the backend returns 401: try remote sign-out, always drop local session if Supabase fails. */
export async function logoutDueToUnauthorized(): Promise<void> {
  try {
    await signOut();
  } catch {
    useAuthStore.getState().clearSession();
  }
}
