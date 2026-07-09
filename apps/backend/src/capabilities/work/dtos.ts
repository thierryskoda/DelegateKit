import { requireJsonObject, type Json } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  profileWorkItemListItemFields,
  profileWorkItemListItemSchema,
  profileWorkItemSchema,
  profileWorkRouteSchema,
  type ProfileWorkItem,
  type ProfileWorkItemListItem,
  type ProfileWorkItemStatus,
  type ProfileWorkRoute,
} from "@ai-assistants/work-contracts/schemas";
import {
  parseAssistantWorkItemPayload,
  type AssistantWorkItem,
} from "../../product/assistant-work-items/assistant-work-items";
import type { LoadedProfileAssistantWorkRoute } from "../../product/assistant-work-items/profile-assistant-work-routes";
import { pickFields } from "../../shared/pick-fields";

function profileWorkItemStatus(status: AssistantWorkItem["status"]): ProfileWorkItemStatus {
  return status === "claimed" ? "running" : status;
}

const workItemMetadataPayloadKeys = new Set([
  "title",
  "detail",
  "instructions",
  "relatedActionId",
  "relatedScheduledTaskId",
  "scheduledFireTime",
  "guidanceIds",
  "profileGuidanceDbIds",
]);

function workItemEventFacts(payload: Record<string, unknown>): Record<string, Json> {
  const eventFacts = requireJsonObject(
    Object.fromEntries(
      Object.entries(payload).filter(([key]) => !workItemMetadataPayloadKeys.has(key)),
    ),
    "assistantWorkItem.event",
  );
  if (!eventFacts || Array.isArray(eventFacts) || typeof eventFacts !== "object") {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "assistantWorkItem.event must be a JSON object.",
    );
  }
  return eventFacts as Record<string, Json>;
}

export function workItemDto(workItem: AssistantWorkItem) {
  const payload = parseAssistantWorkItemPayload(workItem.kind, workItem.payload);
  const dto = {
    id: workItem.id,
    kind: workItem.kind,
    status: profileWorkItemStatus(workItem.status),
    title: payload.title,
    detail: payload.detail ?? null,
    instructions: payload.instructions ?? null,
    guidanceIds: payload.guidanceIds,
    profileGuidanceDbIds: payload.profileGuidanceDbIds,
    event: workItemEventFacts(payload),
    dueAt: payload.scheduledFireTime ?? workItem.available_at,
    relatedActionId: payload.relatedActionId ?? null,
    relatedScheduledTaskId:
      workItem.origin_scheduled_task_id ?? payload.relatedScheduledTaskId ?? null,
    lastError: workItem.last_error,
  } satisfies ProfileWorkItem;
  return profileWorkItemSchema.parse(dto);
}

export function workItemListItemDto(workItem: AssistantWorkItem) {
  const dto = workItemDto(workItem);
  const listItem = pickFields(dto, profileWorkItemListItemFields) satisfies ProfileWorkItemListItem;
  return profileWorkItemListItemSchema.parse(listItem);
}

export function workRouteDto(route: LoadedProfileAssistantWorkRoute) {
  if (!route.config.instructions) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Profile trigger ${route.id} requires instructions before it can be shown to the assistant.`,
    );
  }
  const eventType = profileWorkRouteSchema.shape.eventType.parse(route.event_type);
  const dto = {
    id: route.id,
    eventType,
    instructions: route.config.instructions,
    priority: route.config.priority ?? null,
    connectedProviderAccountId: route.connected_provider_account_id,
    connectedAccount: route.connectedAccount
      ? {
          id: route.connectedAccount.id,
          provider: route.connectedAccount.provider,
          accountEmail: route.connectedAccount.account_email,
          displayLabel: route.connectedAccount.display_label,
        }
      : null,
    createdAt: route.created_at,
    updatedAt: route.updated_at,
  } satisfies ProfileWorkRoute;
  return profileWorkRouteSchema.parse(dto);
}
