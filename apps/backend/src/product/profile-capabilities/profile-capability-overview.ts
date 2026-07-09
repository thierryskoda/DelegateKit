import { requireSupabaseRows, type SupabaseServiceClient } from "@ai-assistants/control-db";
import { evaluateNangoOAuthReadiness } from "@ai-assistants/nango-provisioning";
import {
  capabilityReadinessBlockerSummaryForCode,
  parseCapabilityReadinessBlockerCode,
  requireCapabilityActivationPolicyForSlug,
} from "@ai-assistants/capability-catalog";
import { oauthEvidenceFromConnectedAccount } from "../../integrations/nango/oauth-connection-evidence";

export async function capabilityOverviewForProfile(db: SupabaseServiceClient, profileId: string) {
  const [profileCapabilitiesResult, linksResult, queuedJobsResult, policiesResult] =
    await Promise.all([
      db.from("profile_capabilities").select().eq("profile_id", profileId).eq("status", "enabled"),
      db
        .from("capability_account_links")
        .select()
        .eq("profile_id", profileId)
        .eq("status", "enabled")
        .order("provider"),
      db
        .from("backend_jobs")
        .select()
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("approval_policies").select().eq("profile_id", profileId),
    ]);
  const profileCapabilities = requireSupabaseRows(
    "List profile capabilities",
    profileCapabilitiesResult.data,
    profileCapabilitiesResult.error,
  );
  const links = requireSupabaseRows(
    "List capability account links",
    linksResult.data,
    linksResult.error,
  );
  const connectedAccountIds = [
    ...new Set(
      links
        .map((link) => link.connected_provider_account_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const accountsResult = connectedAccountIds.length
    ? await db.from("connected_provider_accounts").select().in("id", connectedAccountIds)
    : null;
  const accounts = accountsResult
    ? requireSupabaseRows(
        "List connected provider accounts",
        accountsResult.data,
        accountsResult.error,
      )
    : [];
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const queuedJobs = requireSupabaseRows(
    "List backend jobs",
    queuedJobsResult.data,
    queuedJobsResult.error,
  );
  const policies = requireSupabaseRows(
    "List approval policies",
    policiesResult.data,
    policiesResult.error,
  );
  const readiness = links.map((link) => {
    const policy = requireCapabilityActivationPolicyForSlug(link.capability_slug);
    const account = link.connected_provider_account_id
      ? (accountById.get(link.connected_provider_account_id) ?? null)
      : null;
    const connected =
      account !== null &&
      account.connection_status === "connected" &&
      account.credential_status === "healthy";
    const providerConfigKey = account?.nango_provider_config_key?.trim();
    const oauthEvidence = connected && account ? oauthEvidenceFromConnectedAccount(account) : null;
    const oauthReadiness =
      connected && providerConfigKey && oauthEvidence
        ? evaluateNangoOAuthReadiness({
            providerConfigKey,
            grantedScopes: oauthEvidence.grantedScopes,
            refreshCapable: oauthEvidence.refreshCapable,
            credentialStatus: oauthEvidence.credentialStatus,
            nangoErrorTypes: oauthEvidence.nangoErrorTypes,
          })
        : null;
    const hasOAuthReadinessBlocker = Boolean(oauthReadiness && !oauthReadiness.ready);
    const latestJob = queuedJobs.find((job) => job.capability_account_link_id === link.id) ?? null;
    const storedStatus = link.readiness_status;
    const status = hasOAuthReadinessBlocker
      ? "blocked"
      : storedStatus === "not_connected" && policy.credentialMode === "none"
        ? policy.setupBlocker
          ? "blocked"
          : "ready"
        : (storedStatus ??
          (connected || policy.credentialMode === "none" ? "blocked" : "not_connected"));
    let rawBlocker = hasOAuthReadinessBlocker
      ? "reconnect_required"
      : (link.readiness_blocker_code ?? null);
    if (rawBlocker === null) {
      if (status === "not_connected" && policy.credentialMode !== "none") {
        rawBlocker = "credential_required";
      } else if (status === "blocked" && policy.credentialMode === "none" && policy.setupBlocker) {
        rawBlocker = policy.setupBlocker;
      }
    }
    const blockerCode =
      rawBlocker !== null && rawBlocker !== ""
        ? parseCapabilityReadinessBlockerCode(rawBlocker)
        : null;
    const blockerSummary = blockerCode
      ? capabilityReadinessBlockerSummaryForCode(blockerCode)
      : null;
    return {
      provider: link.provider,
      linkId: link.id,
      status,
      blockerCode,
      blockerSummary,
      latestJob: link.readiness_latest_backend_job_id
        ? (queuedJobs.find((job) => job.id === link.readiness_latest_backend_job_id) ?? latestJob)
        : latestJob,
      connected,
      state: link,
    };
  });
  return {
    profileId,
    profileCapabilities,
    enabledCapabilitySlugs: profileCapabilities.map((capability) => capability.capability_slug),
    capabilities: links.map((link) => {
      const policy = requireCapabilityActivationPolicyForSlug(link.capability_slug);
      const account = link.connected_provider_account_id
        ? (accountById.get(link.connected_provider_account_id) ?? null)
        : null;
      return {
        ...link,
        connectedAccount: account,
        readiness: readiness.find((state) => state.linkId === link.id) ?? null,
        credentialMode: policy.credentialMode,
        oauthConnectable: policy.credentialMode === "oauth",
        disconnectable:
          policy.credentialMode === "oauth" &&
          account !== null &&
          account.connection_status === "connected",
        queuedJobs: queuedJobs.filter((job) => job.capability_account_link_id === link.id),
      };
    }),
    approvalPolicies: policies,
    readiness,
  };
}
