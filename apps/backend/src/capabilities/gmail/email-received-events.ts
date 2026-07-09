import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  gmailEmailReceivedEventSchema,
  type GmailEmailReceivedEvent,
} from "@ai-assistants/gmail-contracts/schemas";
import { enqueueRoutedAssistantWorkItem } from "../../product/assistant-work-items/profile-assistant-work-routes";

function formatGmailAddressForTitle(
  address: GmailEmailReceivedEvent["from"],
): string {
  if (!address) return "unknown sender";
  const name = address.name?.trim();
  return name ? `${name} <${address.email}>` : address.email;
}

export async function recordGmailEmailReceivedAndEnqueueWorkItem(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    sourceId: string;
    connectedProviderAccountId: string;
    dedupeKey: string;
    payload: GmailEmailReceivedEvent;
    occurredAt?: string;
  },
): Promise<{
  enqueuedWorkItem: boolean;
  joinedExistingWorkItem: boolean;
}> {
  const event = gmailEmailReceivedEventSchema.parse(input.payload);
  if (event.gmailMessageId !== input.sourceId) {
    throw new Error(
      `Gmail email received sourceId ${input.sourceId} does not match payload gmailMessageId ${event.gmailMessageId}.`,
    );
  }
  const subject = event.subject?.trim() ? event.subject : "(no subject)";
  const from = formatGmailAddressForTitle(event.from);
  const eventType = "gmail.email.received";
  const storedPayload = {
    ...event,
    gmailMessageId: input.sourceId,
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
