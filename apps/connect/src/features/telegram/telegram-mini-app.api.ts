import {
  telegramMiniAppSessionRequestSchema,
  telegramMiniAppSessionResponseSchema,
} from "@ai-assistants/connect-api-contracts";
import { BackendApiError } from "../../shared/api/backend-api";
import { requireConnectConfig } from "../../shared/api/config";

export type TelegramMiniAppSession = {
  profileId: string;
  destinationPath: string;
  portalAccessUrl: string;
};

export async function createTelegramMiniAppSession(input: {
  initData: string;
}): Promise<TelegramMiniAppSession> {
  const config = requireConnectConfig();
  const response = await fetch(`${config.backendUrl}/auth/telegram-mini-app/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(telegramMiniAppSessionRequestSchema.parse(input)),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Telegram sign-in failed with HTTP ${response.status}.`;
    throw new BackendApiError(message, response.status, payload);
  }
  const parsed = telegramMiniAppSessionResponseSchema.parse(payload);
  return {
    profileId: parsed.profileId,
    destinationPath: parsed.destinationPath,
    portalAccessUrl: parsed.portalAccessUrl,
  };
}
