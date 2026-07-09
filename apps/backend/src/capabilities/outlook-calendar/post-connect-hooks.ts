import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import type { NangoPostConnectHook } from "../registry/post-connect-hooks";
import { enqueueOutlookCalendarSubscriptionRenewJob } from "./subscription";

export const outlookCalendarNangoPostConnectHook: NangoPostConnectHook = async (input) => {
  const { db, profileId, capabilityAccountLinkId, providerConfigKey, link, connectedAccount } =
    input;
  if (
    link.capability_slug !== "outlook-calendar" ||
    link.provider !== "outlook-calendar" ||
    providerConfigKey !== "ai-assistants-outlook"
  ) {
    return;
  }

  const subscriptionJob = await enqueueOutlookCalendarSubscriptionRenewJob(db, {
    profileId,
    capabilityAccountLinkId,
    connectedProviderAccountId: connectedAccount.id,
  });
  if (!subscriptionJob.enqueued) return;
  emitDiagnostic(backendDiagnosticLogger(), "outlook_calendar.subscription_renewal.enqueued", {
    ok: true,
    profile_id: profileId,
    capability_account_link_id: capabilityAccountLinkId,
    provider: link.provider,
    job_id: subscriptionJob.jobId,
    job_kind: "provider.webhook.subscription.reconcile",
    attrs: {
      profile_id: profileId,
      capability_account_link_id: capabilityAccountLinkId,
      connected_provider_account_id: connectedAccount.id,
      joined_existing_job: subscriptionJob.joinedExistingJob,
    },
  });
};
