const EXPIRING_SOON_WINDOW_MS = 24 * 60 * 60 * 1_000;

function decisionExpiryTime(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isNaN(expiresAtMs) ? null : expiresAtMs;
}

export function isDecisionExpiringSoon(expiresAt: string | null, nowMs = Date.now()): boolean {
  const expiresAtMs = decisionExpiryTime(expiresAt);
  if (expiresAtMs === null) return false;
  const timeRemainingMs = expiresAtMs - nowMs;
  return timeRemainingMs > 0 && timeRemainingMs <= EXPIRING_SOON_WINDOW_MS;
}

export function expiringSoonDecisions<T extends { expiresAt: string | null }>(
  decisions: readonly T[],
  nowMs = Date.now(),
): T[] {
  return decisions
    .filter((decision) => isDecisionExpiringSoon(decision.expiresAt, nowMs))
    .sort(
      (a, b) =>
        (decisionExpiryTime(a.expiresAt) ?? Number.MAX_SAFE_INTEGER) -
        (decisionExpiryTime(b.expiresAt) ?? Number.MAX_SAFE_INTEGER),
    );
}
