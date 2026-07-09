import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { ProviderAssistantWorkEventType } from "@ai-assistants/tool-contracts";
import { findMatchingProviderWriteReceipt } from "../../product/actions/execution/provider-write-receipts";
import { enqueueRoutedAssistantWorkItem } from "../../product/assistant-work-items/profile-assistant-work-routes";

export async function recordMicrosoftOnedriveFileEventAndEnqueueWorkItem(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    connectedProviderAccountId: string;
    eventType: Extract<
      ProviderAssistantWorkEventType,
      | "microsoft_onedrive.file.created"
      | "microsoft_onedrive.file.updated"
      | "microsoft_onedrive.file.deleted"
    >;
    dedupeKey: string;
    payload: Record<string, unknown>;
    occurredAt?: string | null;
  },
): Promise<{ enqueuedWorkItem: boolean; joinedExistingWorkItem: boolean; selfOriginated: boolean }> {
  const itemId = typeof input.payload.itemId === "string" ? input.payload.itemId : null;
  const operation =
    input.eventType === "microsoft_onedrive.file.created"
      ? "create"
      : input.eventType === "microsoft_onedrive.file.deleted"
        ? "delete"
        : "update";
  const receipt =
    itemId === null
      ? null
      : await findMatchingProviderWriteReceipt(db, {
          profileId: input.profileId,
          connectedProviderAccountId: input.connectedProviderAccountId,
          providerKey: "microsoft-onedrive",
          capabilitySlug: "microsoft-onedrive",
          externalResourceType: "microsoft_onedrive.drive_item",
          externalResourceId: itemId,
          operation,
          ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
        });
  if (receipt) {
    return { enqueuedWorkItem: false, joinedExistingWorkItem: false, selfOriginated: true };
  }
  const name =
    typeof input.payload.name === "string" && input.payload.name.trim()
      ? input.payload.name.trim()
      : itemId ?? "OneDrive file";
  const workItem = await enqueueRoutedAssistantWorkItem(db, {
    profileId: input.profileId,
    eventType: input.eventType,
    connectedProviderAccountId: input.connectedProviderAccountId,
    kind: input.eventType,
    payload: {
      ...input.payload,
      title:
        input.eventType === "microsoft_onedrive.file.created"
          ? `OneDrive file created: ${name}`
          : input.eventType === "microsoft_onedrive.file.deleted"
            ? `OneDrive file deleted: ${name}`
            : `OneDrive file updated: ${name}`,
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
    selfOriginated: false,
  };
}
