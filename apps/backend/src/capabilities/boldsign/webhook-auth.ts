import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { backendApiEnv } from "../../shared/env";

type BoldSignSignatureHeader = {
  timestamp: number;
  signatures: string[];
};

function signingSecrets(): string[] {
  const env = backendApiEnv();
  return [env.boldSignWebhookSigningSecret, env.boldSignWebhookSigningSecretOld].filter(
    (value): value is string => Boolean(value),
  );
}

function parseSignatureHeader(value: string | null): BoldSignSignatureHeader {
  if (!value?.trim()) {
    throw new DomainError(domainCodes.UNAUTHORIZED, "BoldSign webhook signature is missing.");
  }
  const parsed: BoldSignSignatureHeader = { timestamp: -1, signatures: [] };
  for (const part of value.split(",")) {
    const [key, raw] = part.trim().split("=", 2);
    if (key === "t" && raw) parsed.timestamp = Number.parseInt(raw, 10);
    if ((key === "s0" || key === "s1") && raw) parsed.signatures.push(raw);
  }
  if (!Number.isInteger(parsed.timestamp) || parsed.timestamp <= 0) {
    throw new DomainError(
      domainCodes.UNAUTHORIZED,
      "BoldSign webhook signature timestamp is invalid.",
    );
  }
  if (parsed.signatures.length === 0) {
    throw new DomainError(
      domainCodes.UNAUTHORIZED,
      "BoldSign webhook signature values are missing.",
    );
  }
  return parsed;
}

function secureCompareHex(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyBoldSignWebhookSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  nowMs?: number;
  toleranceSeconds?: number;
}): void {
  const parsed = parseSignatureHeader(input.signatureHeader);
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (tolerance > 0 && Math.abs(nowSeconds - parsed.timestamp) > tolerance) {
    throw new DomainError(
      domainCodes.UNAUTHORIZED,
      "BoldSign webhook signature timestamp is stale.",
    );
  }

  const signedPayload = `${parsed.timestamp}.${input.rawBody}`;
  for (const secret of signingSecrets()) {
    const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
    if (parsed.signatures.some((signature) => secureCompareHex(expected, signature))) return;
  }
  throw new DomainError(domainCodes.UNAUTHORIZED, "BoldSign webhook signature is invalid.");
}
