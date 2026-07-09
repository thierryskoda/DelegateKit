import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createPhoneCallTurnToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPhoneCallTurnToken(token) };
}

function hashPhoneCallTurnToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyPhoneCallTurnToken(input: {
  token: string;
  expectedTokenHash: string | null;
}): boolean {
  if (!input.expectedTokenHash) return false;
  const actual = Buffer.from(hashPhoneCallTurnToken(input.token), "hex");
  const expected = Buffer.from(input.expectedTokenHash, "hex");
  if (actual.byteLength !== expected.byteLength) return false;
  return timingSafeEqual(actual, expected);
}
