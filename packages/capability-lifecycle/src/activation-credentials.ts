import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type {
  CapabilityActivationPolicy,
  CapabilityReadinessBlockerCode,
} from "@ai-assistants/capability-catalog";
import type { ConnectedCredentialState } from "./activation-types";

export async function connectedCredentialState(
  db: SupabaseServiceClient,
  link: TableRow<"capability_account_links">,
  policy: CapabilityActivationPolicy,
): Promise<ConnectedCredentialState> {
  if (policy.credentialMode === "none") return { status: "not_required" };
  const connectedAccountId = link.connected_provider_account_id?.trim();
  if (!connectedAccountId) {
    return {
      status: "blocked",
      blockerCode: "credential_required",
      lastError: `Capability account link ${link.id} has no connected provider account.`,
    };
  }
  const accountResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", connectedAccountId)
    .maybeSingle();
  if (accountResult.error) throw accountResult.error;
  const account = accountResult.data;
  if (!account) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Connected provider account ${connectedAccountId} for capability account link ${link.id} was not found.`,
    );
  }
  if (account.profile_id !== link.profile_id) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Connected provider account ${account.id} profile ${account.profile_id} does not match capability account link ${link.id} profile ${link.profile_id}.`,
    );
  }
  if (account.connection_status !== "connected") {
    return {
      status: "blocked",
      blockerCode: "credential_required",
      lastError: `Connected provider account ${account.id} has connection_status=${JSON.stringify(account.connection_status)}.`,
    };
  }
  if (account.credential_status !== "healthy") {
    const blockerCode: CapabilityReadinessBlockerCode =
      account.credential_status === "reconnect_required"
        ? "reconnect_required"
        : "credential_required";
    return {
      status: "blocked",
      blockerCode,
      lastError: account.last_error?.trim()
        ? account.last_error.trim()
        : `Connected provider account ${account.id} has credential_status=${JSON.stringify(account.credential_status)}.`,
    };
  }
  const credentialKind = account.credential_kind || "nango_oauth";
  if (policy.credentialMode === "backend_secret") {
    if (credentialKind !== "backend_secret") {
      return {
        status: "blocked",
        blockerCode: "credential_required",
        lastError: `Connected provider account ${account.id} uses credential_kind=${JSON.stringify(credentialKind)}; expected backend_secret.`,
      };
    }
    return { status: "ready", account };
  }
  if (credentialKind !== "nango_oauth") {
    return {
      status: "blocked",
      blockerCode: "credential_required",
      lastError: `Connected provider account ${account.id} uses credential_kind=${JSON.stringify(credentialKind)}; expected nango_oauth.`,
    };
  }
  const hasNango = Boolean(
    account.nango_connection_id?.trim() && account.nango_provider_config_key?.trim(),
  );
  if (!hasNango) {
    return {
      status: "blocked",
      blockerCode: "credential_required",
      lastError: `Connected provider account ${account.id} has no Nango binding.`,
    };
  }
  return { status: "ready", account };
}
