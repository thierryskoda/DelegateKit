import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";
import { backendApiEnv } from "../../shared/env";

/** BoldSign Canada REST base (includes `/v1`). This repo uses the CA data center only. */
const BOLDSIGN_API_BASE_URL_CA = "https://api-ca.boldsign.com/v1" as const;

const boldSignDataCenterSchema = z.literal("ca");

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

/**
 * Resolves the BoldSign REST base URL (includes `/v1`).
 * Only the Canada data center is supported (`https://api-ca.boldsign.com/v1`).
 */
export function resolveBoldSignApiBaseUrl(): string {
  const env = backendApiEnv();
  const explicitBaseUrl = env.boldSignApiBaseUrl?.trim();
  if (explicitBaseUrl) {
    const normalized = normalizeBaseUrl(explicitBaseUrl);
    if (normalized !== BOLDSIGN_API_BASE_URL_CA) {
      throw new DomainError(
        domainCodes.BAD_REQUEST,
        `BOLDSIGN_API_BASE_URL must be ${BOLDSIGN_API_BASE_URL_CA}; got ${JSON.stringify(normalized)}.`,
      );
    }
    return normalized;
  }

  const dataCenter = env.boldSignDataCenter?.trim();
  if (dataCenter) {
    boldSignDataCenterSchema.parse(dataCenter);
  }

  return BOLDSIGN_API_BASE_URL_CA;
}
