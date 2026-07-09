import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import type { NangoPostConnectHook } from "../registry/post-connect-hooks";
import { enqueueOutlookMailSubscriptionRenewJob } from "./subscription";

export const outlookMailNangoPostConnectHook: NangoPostConnectHook = async (input) => {
  const { db, profileId, capabilityAccountLinkId, providerConfigKey, link, connectedAccount } =
    input;
  if (
    link.capability_slug !== "outlook-mail" ||
    (link.provider !== "outlook-mail" && providerConfigKey !== "ai-assistants-outlook")
  ) {
    return;
  }

  const subscriptionJob = await enqueueOutlookMailSubscriptionRenewJob(db, {
    profileId,
    capabilityAccountLinkId,
    connectedProviderAccountId: connectedAccount.id,
  });
  if (!subscriptionJob.enqueued) return;
  emitDiagnostic(backendDiagnosticLogger(), "outlook_mail.subscription_renewal.enqueued", {
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
