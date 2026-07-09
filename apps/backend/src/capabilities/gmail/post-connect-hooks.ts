import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import type { NangoPostConnectHook } from "../registry/post-connect-hooks";
import { enqueueGmailWatchRenewJob } from "./jobs";

export const gmailNangoPostConnectHook: NangoPostConnectHook = async (input) => {
  const { db, profileId, capabilityAccountLinkId, providerConfigKey, link, connectedAccount } =
    input;
  if (
    link.capability_slug !== "gmail" ||
    link.provider !== "gmail" ||
    providerConfigKey !== "ai-assistants-google"
  ) {
    return;
  }

  const watchJob = await enqueueGmailWatchRenewJob(db, {
    profileId,
    capabilityAccountLinkId,
    connectedProviderAccountId: connectedAccount.id,
  });
  if (!watchJob.enqueued) return;
  emitDiagnostic(backendDiagnosticLogger(), "gmail.watch_renewal.enqueued", {
    ok: true,
    profile_id: profileId,
    capability_account_link_id: capabilityAccountLinkId,
    provider: link.provider,
    job_id: watchJob.jobId,
    job_kind: "provider.webhook.subscription.reconcile",
    attrs: {
      profile_id: profileId,
      capability_account_link_id: capabilityAccountLinkId,
      connected_provider_account_id: connectedAccount.id,
      joined_existing_job: watchJob.joinedExistingJob,
    },
  });
};
