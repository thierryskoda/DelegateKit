import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  enqueueAssistantWorkItem,
  type AssistantWorkItemKind,
} from "../../../../apps/backend/src/test-support/work-items";

export type SeedTestingAssistantWorkItemInput = {
  profileId: string;
  dedupeKey: string;
  title: string;
  detail: string;
  instructions: string;
  kind?: AssistantWorkItemKind;
  priority?: number;
};

export type SeededTestingAssistantWorkItem = {
  workItemId: string;
  dedupeKey: string;
};

export async function seedTestingAssistantWorkItem(
  db: SupabaseServiceClient,
  input: SeedTestingAssistantWorkItemInput,
): Promise<SeededTestingAssistantWorkItem> {
  const result = await enqueueAssistantWorkItem(db, {
    profileId: input.profileId,
    kind: input.kind ?? "scheduled.task",
    priority: input.priority ?? 10,
    dedupeKey: input.dedupeKey,
    payload: {
      title: input.title,
      detail: input.detail,
      instructions: input.instructions,
    },
  });
  return {
    workItemId: result.workItem.id,
    dedupeKey: input.dedupeKey,
  };
}
