import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { enqueueRoutedAssistantWorkItem } from "../../product/assistant-work-items/profile-assistant-work-routes";

function textField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isMeaningfulGoogleCalendarChange(payload: Record<string, unknown>): boolean {
  if (payload.visibility === "private" || payload.sensitivity === "private") return false;
  if (payload.providerStatus === "cancelled" || payload.changeType === "deleted") return true;
  return Boolean(textField(payload, "title") || textField(payload, "startsAt"));
}

export async function recordGoogleCalendarEventChangeAndMaybeEnqueueWorkItem(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    sourceId: string;
    connectedProviderAccountId: string;
    dedupeKey: string;
    payload: Record<string, unknown>;
    occurredAt?: string;
  },
): Promise<{
  enqueuedWorkItem: boolean;
  joinedExistingWorkItem: boolean;
}> {
  const title = textField(input.payload, "title") ?? "(calendar event)";
  const changeType = textField(input.payload, "changeType") ?? "changed";
  if (!isMeaningfulGoogleCalendarChange(input.payload)) {
    return {
      enqueuedWorkItem: false,
      joinedExistingWorkItem: false,
    };
  }
  const eventType = "google_calendar.event.changed";
  const workItem = await enqueueRoutedAssistantWorkItem(db, {
    profileId: input.profileId,
    eventType,
    connectedProviderAccountId: input.connectedProviderAccountId,
    kind: eventType,
    payload: {
      ...input.payload,
      providerEventId: input.sourceId,
      title: `Calendar event ${changeType}: ${title}`,
      detail: null,
    },
    dedupeKey: input.dedupeKey,
  });
  return {
    enqueuedWorkItem: Boolean(workItem.workItem && !workItem.joinedExisting),
    joinedExistingWorkItem: workItem.joinedExisting,
  };
}
