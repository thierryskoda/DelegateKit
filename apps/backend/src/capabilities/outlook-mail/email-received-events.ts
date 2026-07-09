import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  outlookMailEmailReceivedEventSchema,
  type OutlookMailEmailReceivedEvent,
} from "@ai-assistants/outlook-mail-contracts/schemas";
import { enqueueRoutedAssistantWorkItem } from "../../product/assistant-work-items/profile-assistant-work-routes";

function formatOutlookMailAddressForTitle(
  address: OutlookMailEmailReceivedEvent["from"],
): string {
  if (!address) return "unknown sender";
  const name = address.name?.trim();
  return name ? `${name} <${address.email}>` : address.email;
}

export async function recordOutlookMailEmailReceivedAndEnqueueWorkItem(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    sourceId: string;
    connectedProviderAccountId: string;
    dedupeKey: string;
    payload: OutlookMailEmailReceivedEvent;
    occurredAt?: string;
  },
): Promise<{
  enqueuedWorkItem: boolean;
  joinedExistingWorkItem: boolean;
}> {
  const event = outlookMailEmailReceivedEventSchema.parse(input.payload);
  if (event.outlookMessageId !== input.sourceId) {
    throw new Error(
      `Outlook Mail email received sourceId ${input.sourceId} does not match payload outlookMessageId ${event.outlookMessageId}.`,
    );
  }
  const subject = event.subject?.trim() ? event.subject : "(no subject)";
  const from = formatOutlookMailAddressForTitle(event.from);
  const eventType = "outlook_mail.email.received";
  const storedPayload = {
    ...event,
    outlookMessageId: input.sourceId,
    connectedProviderAccountId: event.connectedProviderAccountId,
    title: `Received email from ${from}: ${subject}`,
    detail: event.snippet?.trim() ? event.snippet.trim() : null,
  };

  const availableAt = input.occurredAt ?? event.receivedAt ?? undefined;
  const workItem = await enqueueRoutedAssistantWorkItem(db, {
    profileId: input.profileId,
    eventType,
    connectedProviderAccountId: input.connectedProviderAccountId,
    kind: eventType,
    payload: storedPayload,
    dedupeKey: input.dedupeKey,
    ...(availableAt ? { availableAt } : {}),
  });
  return {
    enqueuedWorkItem: Boolean(workItem.workItem && !workItem.joinedExisting),
    joinedExistingWorkItem: workItem.joinedExisting,
  };
}
