import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import type { NangoPostConnectHook } from "../registry/post-connect-hooks";
import { GOOGLE_DRIVE_NANGO_PROVIDER_CONFIG_KEY, GOOGLE_DRIVE_PROVIDER_KEY } from "./connection";
import { enqueueGoogleDriveSubscriptionReconcileJob } from "./jobs";

export const googleDriveNangoPostConnectHook: NangoPostConnectHook = async (input) => {
  if (
    input.link.capability_slug !== GOOGLE_DRIVE_PROVIDER_KEY ||
    input.link.provider !== GOOGLE_DRIVE_PROVIDER_KEY ||
    input.providerConfigKey !== GOOGLE_DRIVE_NANGO_PROVIDER_CONFIG_KEY
  ) {
    return;
  }
  const result = await enqueueGoogleDriveSubscriptionReconcileJob(input.db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    connectedProviderAccountId: input.connectedAccount.id,
  });
  if (!result.enqueued) return;
  emitDiagnostic(backendDiagnosticLogger(), "google_drive.subscription_reconcile.enqueued", {
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
