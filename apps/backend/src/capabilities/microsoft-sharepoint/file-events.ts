import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { ProviderAssistantWorkEventType } from "@ai-assistants/tool-contracts";
import { enqueueRoutedAssistantWorkItem } from "../../product/assistant-work-items/profile-assistant-work-routes";

export async function recordMicrosoftSharepointFileEventAndEnqueueWorkItem(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    connectedProviderAccountId: string;
    eventType: Extract<
      ProviderAssistantWorkEventType,
      | "microsoft_sharepoint.file.created"
      | "microsoft_sharepoint.file.updated"
      | "microsoft_sharepoint.file.deleted"
    >;
    dedupeKey: string;
    payload: Record<string, unknown>;
  },
): Promise<{ enqueuedWorkItem: boolean; joinedExistingWorkItem: boolean }> {
  const name =
    typeof input.payload.name === "string" && input.payload.name.trim()
      ? input.payload.name.trim()
      : typeof input.payload.itemId === "string"
        ? input.payload.itemId
        : "SharePoint file";
  const site =
    typeof input.payload.siteName === "string" && input.payload.siteName.trim()
      ? ` (${input.payload.siteName.trim()})`
      : "";
  const workItem = await enqueueRoutedAssistantWorkItem(db, {
    profileId: input.profileId,
    eventType: input.eventType,
    connectedProviderAccountId: input.connectedProviderAccountId,
    kind: input.eventType,
    payload: {
      ...input.payload,
      title:
        input.eventType === "microsoft_sharepoint.file.created"
          ? `SharePoint file created${site}: ${name}`
          : input.eventType === "microsoft_sharepoint.file.deleted"
            ? `SharePoint file deleted${site}: ${name}`
            : `SharePoint file updated${site}: ${name}`,
      detail:
        typeof input.payload.webUrl === "string" && input.payload.webUrl.trim()
          ? input.payload.webUrl.trim()
          : null,
    },
    dedupeKey: input.dedupeKey,
  });
  return {
    enqueuedWorkItem: Boolean(workItem.workItem && !workItem.joinedExisting),
    joinedExistingWorkItem: workItem.joinedExisting,
  };
}
