import { DomainError, domainCodes } from "@ai-assistants/errors";
import { z } from "zod";

const nangoConnectionPayloadSchema = z
  .object({
    credentials: z
      .object({
        type: z.string(),
        access_token: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

/**
 * Parses Nango `getConnection` response payloads for OAuth2 access tokens.
 */
export function extractNangoOAuthAccessToken(connectionPayload: unknown): string {
  const parsed = nangoConnectionPayloadSchema.safeParse(connectionPayload);
  if (!parsed.success) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Nango getConnection returned unexpected credentials shape: ${JSON.stringify(connectionPayload)}`,
    );
  }
  const token = parsed.data.credentials.access_token?.trim();
  if (!token) {
    throw new DomainError(
      domainCodes.INTERNAL,
      "Nango OAuth2 credentials are missing access_token.",
    );
  }
  return token;
}
