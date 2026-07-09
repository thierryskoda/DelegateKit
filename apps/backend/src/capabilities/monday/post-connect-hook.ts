import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import type { NangoPostConnectHook } from "../registry/post-connect-hooks";
import { enqueueMondayWebhookReconcile } from "./webhook-subscriptions";

export const mondayNangoPostConnectHook: NangoPostConnectHook = async (input) => {
  const {
    db,
    profileId,
    capabilityAccountLinkId,
    providerConfigKey,
    connectionId,
    link,
    connectedAccount,
  } = input;
  if (link.capability_slug !== "monday") return;

  const webhookReconcile = await enqueueMondayWebhookReconcile({
    db,
    profileId,
    capabilityAccountLinkId,
    providerConfigKey,
    nangoConnectionId: connectionId,
  });

  emitDiagnostic(backendDiagnosticLogger(), "capability.readiness.evaluated", {
    ok: true,
    profile_id: profileId,
    capability_account_link_id: capabilityAccountLinkId,
    provider: link.provider,
    attrs: {
      profile_id: profileId,
      capability_account_link_id: capabilityAccountLinkId,
      provider: link.provider,
      connected_provider_account_id: connectedAccount.id,
      trigger: "oauth_connected",
      status: "ready",
      blocker_code: null,
      ...(webhookReconcile.enqueued
        ? {
            webhook_reconcile_job_id: webhookReconcile.jobId,
            webhook_reconcile_joined_existing_job: webhookReconcile.joinedExistingJob,
          }
        : { webhook_reconcile_skipped_reason: webhookReconcile.reason }),
    },
  });
  if (!webhookReconcile.enqueued) return;
  emitDiagnostic(backendDiagnosticLogger(), "monday.webhook_reconcile.enqueued", {
    ok: true,
    profile_id: profileId,
    capability_account_link_id: capabilityAccountLinkId,
    provider: link.provider,
    job_id: webhookReconcile.jobId,
    job_kind: "provider.webhook.subscription.reconcile",
    attrs: {
      connected_provider_account_id: connectedAccount.id,
      joined_existing_job: webhookReconcile.joinedExistingJob,
    },
  });
};
