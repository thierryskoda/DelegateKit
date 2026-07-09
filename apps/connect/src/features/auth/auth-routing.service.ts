import type { AuthStatus } from "./auth.store";

export function authLandingDestination(
  status: AuthStatus,
  hasSession: boolean,
): "/assistants" | "/login" | null {
  if (status === "loading") return null;
  return hasSession ? "/assistants" : "/login";
}
