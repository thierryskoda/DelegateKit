import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import type { NangoPostConnectHook } from "../registry/post-connect-hooks";
import { enqueueGoogleCalendarWatchReconcileJob } from "./jobs";

export const googleCalendarNangoPostConnectHook: NangoPostConnectHook = async (input) => {
  const { db, profileId, capabilityAccountLinkId, providerConfigKey, link, connectedAccount } =
    input;
  if (
    link.capability_slug !== "google-calendar" ||
    link.provider !== "google-calendar" ||
    providerConfigKey !== "ai-assistants-google"
  ) {
    return;
  }

  const watchJob = await enqueueGoogleCalendarWatchReconcileJob(db, {
    profileId,
    capabilityAccountLinkId,
    connectedProviderAccountId: connectedAccount.id,
  });
  if (!watchJob.enqueued) return;
  emitDiagnostic(backendDiagnosticLogger(), "google_calendar.watch_reconcile.enqueued", {
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
