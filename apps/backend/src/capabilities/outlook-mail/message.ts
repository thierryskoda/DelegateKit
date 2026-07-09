import type { BackendJob } from "@ai-assistants/backend-jobs";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { requireOutlookConnectionByProviderConnectionId } from "./connection";
import { recordOutlookMailEmailReceivedAndEnqueueWorkItem } from "./email-received-events";
import { fetchNormalizedOutlookMailMessage } from "./fetch-outlook-mail-message";
import { buildOutlookMailEmailReceivedEventPayload } from "./outlook-mail-email-received-payload";

function providerHttpStatus(error: unknown): number | null {
  if (!(error instanceof DomainError)) return null;
  const details = z
    .object({ httpStatus: z.number().nullable().optional() })
    .passthrough()
    .safeParse(error.details);
  return details.success ? (details.data.httpStatus ?? null) : null;
}

export async function processOutlookMessageJob(
  db: SupabaseServiceClient,
  input: {
    job: BackendJob;
    connectedProviderAccountId: string;
    graphSubscriptionId: string;
    messageId: string;
  },
): Promise<Record<string, unknown>> {
  const connection = await requireOutlookConnectionByProviderConnectionId(
    db,
    input.connectedProviderAccountId,
  );
  let fetched: Awaited<ReturnType<typeof fetchNormalizedOutlookMailMessage>>;
  try {
    fetched = await fetchNormalizedOutlookMailMessage(connection, input.messageId);
  } catch (error) {
    const status = providerHttpStatus(error);
    if (status === 404 || status === 410) {
      emitDiagnostic(backendDiagnosticLogger(), "outlook_mail.message.missing", {
        ok: true,
        profile_id: connection.profileId,
        capability_account_link_id: connection.capabilityAccountLinkId,
        job_id: input.job.id,
        job_kind: input.job.kind,
        attrs: {
          connected_provider_account_id: input.connectedProviderAccountId,
          outlook_message_id: input.messageId,
          graph_subscription_id: input.graphSubscriptionId,
          http_status: status,
        },
      });
      return {
        connectedProviderAccountId: input.connectedProviderAccountId,
        messageId: input.messageId,
        processedMessages: 0,
        reason: "message_not_found",
      };
    }
    throw error;
  }

  const { message, messageIdHeader, isDraft } = fetched;
  if (isDraft) {
    return {
      connectedProviderAccountId: input.connectedProviderAccountId,
      messageId: input.messageId,
      processedMessages: 0,
      reason: "draft_message",
    };
  }

  const eventPayload = buildOutlookMailEmailReceivedEventPayload({
    connection,
    message,
    graphSubscriptionId: input.graphSubscriptionId,
    messageIdHeader,
  });
  const recorded = await recordOutlookMailEmailReceivedAndEnqueueWorkItem(db, {
    profileId: connection.profileId,
    dedupeKey: `outlook_mail.email.received:outlook-mail:${connection.connectedProviderAccount.id}:${message.id}`,
    payload: eventPayload,
    sourceId: message.id,
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    ...(eventPayload.receivedAt ? { occurredAt: eventPayload.receivedAt } : {}),
  });

  emitDiagnostic(backendDiagnosticLogger(), "outlook_mail.mailbox_message.synced", {
    ok: true,
    profile_id: connection.profileId,
    capability_account_link_id: connection.capabilityAccountLinkId,
    job_id: input.job.id,
    job_kind: input.job.kind,
    attrs: {
      connected_provider_account_id: input.connectedProviderAccountId,
      outlook_message_id: message.id,
      graph_subscription_id: input.graphSubscriptionId,
      enqueued_work_item: recorded.enqueuedWorkItem,
    },
  });

  return {
    connectedProviderAccountId: input.connectedProviderAccountId,
    messageId: message.id,
    processedMessages: 1,
    enqueuedWorkItems: recorded.enqueuedWorkItem ? 1 : 0,
  };
}
