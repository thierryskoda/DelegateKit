import {
  toolError,
  type ToolContract,
  ToolOutputValidationError,
  ToolParamsValidationError,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import { DomainError, domainCodes } from "@ai-assistants/errors";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

const INTERNAL_PROVIDER_ERROR_PATTERNS = [
  /\bsandbox\b/i,
  /\bseeded\b/i,
  /\bnango\b/i,
  /\bprovider config\b/i,
  /\bconnection id\b/i,
  /\bprofile[_ -]?id\b/i,
  /\bsession[_ -]?key\b/i,
  /\btool[_ -]?name\b/i,
];

function capabilityLabel(contract: ToolContract | undefined): string {
  const pluginId = contract?.pluginId ?? "";
  if (/gmail/i.test(pluginId) || /^gmail_/i.test(contract?.name ?? "")) return "Gmail";
  if (/google-drive/i.test(pluginId) || /^google_drive_/i.test(contract?.name ?? "")) return "Google Drive";
  if (/monday/i.test(pluginId) || /^monday_/i.test(contract?.name ?? "")) return "Monday";
  if (/boldsign/i.test(pluginId) || /^boldsign_/i.test(contract?.name ?? "")) return "BoldSign";
  if (/outlook-mail/i.test(pluginId) || /^outlook_mail_/i.test(contract?.name ?? "")) return "Outlook Mail";
  if (/calendar/i.test(pluginId) || /calendar/i.test(contract?.name ?? "")) return "Calendar";
  return contract?.label ?? "That tool";
}

function shouldHideDomainErrorMessage(error: DomainError): boolean {
  if (error.code === domainCodes.INTERNAL) return true;
  return INTERNAL_PROVIDER_ERROR_PATTERNS.some((pattern) => pattern.test(error.message));
}

export function expectedBackendToolErrorToResult(
  error: unknown,
  contract?: ToolContract,
): BackendToolResult | null {
  if (error instanceof ToolParamsValidationError) {
    return toolError({
      message: error.message,
      details: { toolName: error.toolName, issues: error.details },
    });
  }
  if (error instanceof ToolOutputValidationError) {
    return toolError({
      message: error.message,
      details: { toolName: error.toolName, issues: error.details },
    });
  }
  if (!(error instanceof DomainError)) return null;
  if (shouldHideDomainErrorMessage(error)) {
    return toolError({
      message: `${capabilityLabel(contract)} could not be checked for this request.`,
      details: { code: error.code },
    });
  }
  const details = record(error.details);
  return toolError({
    message: error.message,
    ...(details ? { details } : {}),
  });
}
