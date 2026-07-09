import {
  createDeepSeekModel,
  generateLlmObject,
  llmErrorDiagnostics,
} from "@ai-assistants/llm-client";
import {
  compactProfileGuidanceIndex,
  guidanceSelectionSchema,
  renderGuidanceSelectorPrompt,
  resolveRuntimeGuidance,
} from "@ai-assistants/runtime-guidance";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import type { ProviderAssistantWorkEventType } from "@ai-assistants/tool-contracts";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import {
  listActiveProfileGuidanceIndex,
  loadActiveProfileGuidanceMarkdown,
} from "../profile-guidance/profile-guidance";
import { CHEAP_STRUCTURED_DECISION_MODEL } from "../llm-decisions/cheap-structured-decision";
import { parseAssistantWorkItemPayload, type AssistantWorkItem } from "./assistant-work-items";

const deterministicGuidanceByEventType = {
  "google_calendar.event.changed": ["google_calendar_tools"],
  "outlook_calendar.event.changed": ["outlook_calendar_tools"],
  "gmail.email.received": ["gmail_tools"],
  "outlook_mail.email.received": ["outlook_mail_tools"],
  "twilio.sms.received": ["phone_tools"],
  "monday.item.created": ["monday"],
  "monday.item.updated": ["monday"],
  "boldsign.signature_request.changed": ["boldsign_signature"],
  "google_drive.file.created": ["google_drive_files"],
  "google_drive.file.updated": ["google_drive_files"],
  "google_drive.file.deleted": ["google_drive_files"],
  "microsoft_onedrive.file.created": ["microsoft_onedrive"],
  "microsoft_onedrive.file.updated": ["microsoft_onedrive"],
  "microsoft_onedrive.file.deleted": ["microsoft_onedrive"],
  "microsoft_sharepoint.file.created": ["microsoft_sharepoint"],
  "microsoft_sharepoint.file.updated": ["microsoft_sharepoint"],
  "microsoft_sharepoint.file.deleted": ["microsoft_sharepoint"],
} satisfies Record<ProviderAssistantWorkEventType, readonly string[]>;

function uniqGuidanceIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function uniqProfileGuidanceDbIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export function deterministicGuidanceIdsForEvent(
  eventType: ProviderAssistantWorkEventType,
): string[] {
  return uniqGuidanceIds([...deterministicGuidanceByEventType[eventType], "work_items"]);
}

async function selectWorkItemGuidance(input: {
  db: SupabaseServiceClient;
  profileId: string;
  kind: string;
  title: string;
  detail?: string | null;
  instructions: string;
  payload: Record<string, unknown>;
  baseGuidanceIds: readonly string[];
}): Promise<{ guidanceIds: string[]; profileGuidanceDbIds: string[] }> {
  const profileGuidanceIndex = await listActiveProfileGuidanceIndex(input.db, input.profileId);
  if (profileGuidanceIndex.length === 0) {
    return { guidanceIds: [], profileGuidanceDbIds: [] };
  }
  try {
    const task = JSON.stringify(
      {
        kind: input.kind,
        title: input.title,
        detail: input.detail ?? null,
        instructions: input.instructions,
        payload: input.payload,
        alreadySelectedGuidanceIds: input.baseGuidanceIds,
      },
      null,
      2,
    );
    const selection = await generateLlmObject({
      model: createDeepSeekModel({ model: CHEAP_STRUCTURED_DECISION_MODEL }),
      schema: guidanceSelectionSchema,
      outputName: "GuidanceSelection",
      outputDescription: "Runtime guidance ids selected from the supplied guidance index.",
      instructions: "Return only known guidance ids that are clearly useful.",
      input: renderGuidanceSelectorPrompt({
        profileId: input.profileId,
        compactGuidanceIndex: "",
        compactProfileGuidanceIndex: compactProfileGuidanceIndex(profileGuidanceIndex),
        task,
      }),
      temperature: 0,
      timeout: 4_000,
      callAttempts: 1,
      repairAttempts: 0,
    });
    const validProfileGuidanceDbIds = new Set(profileGuidanceIndex.map((entry) => entry.id));
    const selected: string[] = [];
    const selectedProfileGuidanceDbIds = uniqProfileGuidanceDbIds(
      selection.profileGuidanceDbIds.filter((id) => validProfileGuidanceDbIds.has(id)),
    );
    emitDiagnostic(backendDiagnosticLogger(), "runtime_guidance.work_item_selected", {
      ok: true,
      profile_id: input.profileId,
      attrs: {
        work_item_kind: input.kind,
        model: CHEAP_STRUCTURED_DECISION_MODEL,
        guidance_ids: selected,
        profile_guidance_db_ids: selectedProfileGuidanceDbIds,
      },
    });
    return { guidanceIds: selected, profileGuidanceDbIds: selectedProfileGuidanceDbIds };
  } catch (error) {
    emitDiagnostic(backendDiagnosticLogger(), "runtime_guidance.work_item_selection_failed", {
      ok: false,
      profile_id: input.profileId,
      attrs: {
        work_item_kind: input.kind,
        model: CHEAP_STRUCTURED_DECISION_MODEL,
        error: llmErrorDiagnostics(error),
      },
    });
    return { guidanceIds: [], profileGuidanceDbIds: [] };
  }
}

export async function selectAdditionalWorkItemGuidance(input: {
  db: SupabaseServiceClient;
  profileId: string;
  eventType: ProviderAssistantWorkEventType;
  title: string;
  detail?: string | null;
  instructions: string;
  payload: Record<string, unknown>;
  baseGuidanceIds: readonly string[];
}): Promise<{ guidanceIds: string[]; profileGuidanceDbIds: string[] }> {
  const request = {
    db: input.db,
    profileId: input.profileId,
    kind: input.eventType,
    title: input.title,
    instructions: input.instructions,
    payload: input.payload,
    baseGuidanceIds: input.baseGuidanceIds,
  };
  return selectWorkItemGuidance(
    input.detail === undefined ? request : { ...request, detail: input.detail },
  );
}

export async function resolvedWorkItemGuidanceMarkdown(
  db: SupabaseServiceClient,
  workItem: AssistantWorkItem,
): Promise<string | null> {
  const payload = parseAssistantWorkItemPayload(workItem.kind, workItem.payload);
  const payloadGuidanceIds = payload.guidanceIds;
  const payloadProfileGuidanceDbIds = payload.profileGuidanceDbIds;
  const sourceGuidanceIds = mergeGuidanceIds(
    payloadGuidanceIds.length > 0 ? payloadGuidanceIds : ["work_items"],
  );
  const profileGuidance =
    payloadProfileGuidanceDbIds.length > 0
      ? await loadActiveProfileGuidanceMarkdown(db, {
          profileId: workItem.profile_id,
          guidanceIds: payloadProfileGuidanceDbIds,
        })
      : [];
  return resolveRuntimeGuidance(null, sourceGuidanceIds, profileGuidance).markdown;
}

export function mergeGuidanceIds(...groups: readonly (readonly string[] | undefined)[]): string[] {
  return uniqGuidanceIds(groups.flatMap((group) => group ?? []));
}
