import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import type { NangoPostConnectHook } from "../registry/post-connect-hooks";
import { MICROSOFT_SHAREPOINT_NANGO_PROVIDER_CONFIG_KEY } from "./connection";
import { enqueueMicrosoftSharepointSubscriptionReconcileJob } from "./jobs";

export const microsoftSharepointNangoPostConnectHook: NangoPostConnectHook = async (input) => {
  if (
    input.link.capability_slug !== "microsoft-sharepoint" ||
    input.link.provider !== "microsoft-sharepoint" ||
    input.providerConfigKey !== MICROSOFT_SHAREPOINT_NANGO_PROVIDER_CONFIG_KEY
  ) {
    return;
  }
  const result = await enqueueMicrosoftSharepointSubscriptionReconcileJob(input.db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    connectedProviderAccountId: input.connectedAccount.id,
  });
  if (!result.enqueued) return;
  emitDiagnostic(backendDiagnosticLogger(), "microsoft_sharepoint.subscription_reconcile.enqueued", {
    ok: true,
    profile_id: input.profileId,
    capability_account_link_id: input.capabilityAccountLinkId,
    provider: input.link.provider,
    job_id: result.jobId,
    job_kind: "provider.webhook.subscription.reconcile",
    attrs: {
      connected_provider_account_id: input.connectedAccount.id,
      joined_existing_job: result.joinedExistingJob,
    },
  });
};
