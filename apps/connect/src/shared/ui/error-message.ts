import { BackendApiError } from "../api/backend-api";
import { domainCodes } from "@ai-assistants/errors";

const profileUnavailableMessage = "This assistant is not available for this sign-in.";

function rawMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isProfileAccessError(error: unknown, message: string): boolean {
  if (/^Profile ".+" is not available for the authenticated (portal )?user\.$/.test(message))
    return true;
  if (/^Assistant ".+" is not available for the signed-in user\.$/.test(message)) return true;
  if (!(error instanceof BackendApiError)) return false;
  const profileish = /\bprofile\b/i.test(message);
  const byStatus = error.status === 403 || error.status === 404;
  const byCode = error.code === domainCodes.FORBIDDEN || error.code === domainCodes.NOT_FOUND;
  return profileish && (byStatus || byCode);
}

export function userFacingErrorMessage(error: unknown): string {
  const message = rawMessage(error);
  if (isProfileAccessError(error, message)) return profileUnavailableMessage;
  return message;
}
