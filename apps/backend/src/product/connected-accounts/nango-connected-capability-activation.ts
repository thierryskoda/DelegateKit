import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { evaluateCapabilityActivation } from "@ai-assistants/capability-lifecycle";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { nangoPostConnectHooks } from "../../capabilities/registry/post-connect-hooks";
import { checkNangoConnectionReady } from "../../integrations/nango/nango-connection-readiness";
import { backendDiagnosticLogger } from "../../shared/diagnostics";

export async function activateCapabilityAfterNangoConnection(input: {
  db: SupabaseServiceClient;
  profileId: string;
  capabilityAccountLinkId: string;
  providerConfigKey: string;
  connectionId: string;
  link: TableRow<"capability_account_links">;
  connectedAccount: TableRow<"connected_provider_accounts">;
}): Promise<void> {
  const { db, profileId, capabilityAccountLinkId, link } = input;
  let skipReadinessEvaluation = false;
  for (const hook of nangoPostConnectHooks) {
    const result = await hook(input);
    skipReadinessEvaluation = skipReadinessEvaluation || Boolean(result?.skipReadinessEvaluation);
  }
  if (skipReadinessEvaluation) return;

  const activation = await evaluateCapabilityActivation(db, {
    profileId,
    capabilityAccountLinkId,
    trigger: "oauth_connected",
    readyPrerequisiteCheck: checkNangoConnectionReady,
  });
  emitDiagnostic(backendDiagnosticLogger(), "capability.readiness.evaluated", {
    ok: activation.status === "ready",
    level: activation.status === "ready" ? "info" : "warn",
    profile_id: profileId,
    capability_account_link_id: capabilityAccountLinkId,
    provider: link.provider,
    job_id: activation.job?.id ?? null,
    job_kind: activation.job?.kind ?? null,
    attrs: {
      profile_id: profileId,
      capability_account_link_id: capabilityAccountLinkId,
      provider: link.provider,
      trigger: "oauth_connected",
      status: activation.status,
      blocker_code: activation.blockerCode,
      readiness_capability_account_link_id: activation.readiness?.id ?? null,
      job_id: activation.job?.id ?? null,
      joined_existing_job: activation.joinedExistingJob,
    },
  });
}
