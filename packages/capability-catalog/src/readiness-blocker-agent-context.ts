import type { CapabilityReadinessBlockerCode } from "./capability-metadata";

/**
 * Neutral, descriptive copy for assistants — state context only, not prescribed next steps.
 */
export const capabilityReadinessBlockerAgentSummary: Record<
  CapabilityReadinessBlockerCode,
  { summary: string }
> = {
  credential_required: {
    summary:
      "This external provider capability has no healthy credential yet; connection or secrets are missing.",
  },
  reconnect_required: {
    summary:
      "The stored credential needs re-authorization before the provider capability can run again.",
  },
  provider_setup_required: {
    summary:
      "The provider credential is connected, but the backing provider integration is missing required setup such as enabled actions.",
  },
  monday_activation_metadata_incomplete: {
    summary:
      "Monday capability is missing activation metadata (e.g. schema fingerprint) the backend expects in capability config.",
  },
  ambiguous_account: {
    summary: "Multiple provider accounts match; the capability needs a clearer account binding.",
  },
};

export function capabilityReadinessBlockerSummaryForCode(
  code: CapabilityReadinessBlockerCode | null,
): string | null {
  if (!code) return null;
  return capabilityReadinessBlockerAgentSummary[code].summary;
}
