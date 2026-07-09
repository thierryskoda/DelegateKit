import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { ProviderAssistantWorkEventType } from "@ai-assistants/tool-contracts";
import { findMatchingProviderWriteReceipt } from "../../product/actions/execution/provider-write-receipts";
import { enqueueRoutedAssistantWorkItem } from "../../product/assistant-work-items/profile-assistant-work-routes";

export async function recordGoogleDriveFileEventAndEnqueueWorkItem(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    connectedProviderAccountId: string;
    eventType: Extract<
      ProviderAssistantWorkEventType,
      "google_drive.file.created" | "google_drive.file.updated" | "google_drive.file.deleted"
    >;
    dedupeKey: string;
    payload: Record<string, unknown>;
    occurredAt?: string | null;
  },
): Promise<{ enqueuedWorkItem: boolean; joinedExistingWorkItem: boolean; selfOriginated: boolean }> {
  const fileId = typeof input.payload.fileId === "string" ? input.payload.fileId : null;
  const operation =
    input.eventType === "google_drive.file.created"
      ? "create"
      : input.eventType === "google_drive.file.deleted"
        ? "delete"
        : "update";
  const receipt =
    fileId === null
      ? null
      : await findMatchingProviderWriteReceipt(db, {
          profileId: input.profileId,
          connectedProviderAccountId: input.connectedProviderAccountId,
          providerKey: "google-drive",
          capabilitySlug: "google-drive",
          externalResourceType: "google_drive.file",
          externalResourceId: fileId,
          operation,
          ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
        });
  if (receipt) {
    return { enqueuedWorkItem: false, joinedExistingWorkItem: false, selfOriginated: true };
  }

  const name =
    typeof input.payload.name === "string" && input.payload.name.trim()
      ? input.payload.name.trim()
      : fileId ?? "Google Drive file";
  const workItem = await enqueueRoutedAssistantWorkItem(db, {
    profileId: input.profileId,
    eventType: input.eventType,
    connectedProviderAccountId: input.connectedProviderAccountId,
    kind: input.eventType,
    payload: {
      ...input.payload,
      title:
        input.eventType === "google_drive.file.created"
          ? `Google Drive file created: ${name}`
          : input.eventType === "google_drive.file.deleted"
            ? `Google Drive file deleted: ${name}`
            : `Google Drive file updated: ${name}`,
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
