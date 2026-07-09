import type { BackendJob } from "@ai-assistants/backend-jobs";
import {
  requireJsonObject,
  type Json,
  type SupabaseServiceClient,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import { findMatchingProviderWriteReceipt } from "../../product/actions/execution/provider-write-receipts";
import { enqueueRoutedAssistantWorkItem } from "../../product/assistant-work-items/profile-assistant-work-routes";
import {
  loadProviderWebhookDelivery,
  providerWebhookPublicHeaders,
  receiveProviderWebhookNotification,
} from "../../integrations/provider-webhooks/substrate";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { requireMondayNango } from "./connection";
import { mondayLiveGetItem } from "./live-graphql";
import { verifyMondayWebhookAuthorization } from "./webhook-auth";
import {
  loadMondayWebhookStateBySubscription,
  markMondayWebhookState,
  maybeLoadMondayWebhookStateBySubscription,
  mondayWebhookPublicUrl,
} from "./webhook-subscriptions";
import {
  cleanMondayString,
  isKnownMondayWebhookPayloadType,
  MONDAY_BOARD_WEBHOOK_ADAPTER_KEY,
  mondayItemEventTypeForKind,
  MONDAY_WEBHOOK_PROCESS_PRIORITY,
  MONDAY_WEBHOOK_PROVIDER_KEY,
  type MondayItemEventType,
  type MondayWebhookState,
} from "./webhook-types";

const mondayWebhookEventSchema = z
  .object({
    subscriptionId: z.union([z.string(), z.number()]),
    boardId: z.union([z.string(), z.number()]),
    pulseId: z.union([z.string(), z.number()]).optional(),
    itemId: z.union([z.string(), z.number()]).optional(),
    type: z.string().trim().min(1),
    triggerUuid: z.string().trim().min(1).optional(),
    triggerTime: z.string().trim().min(1).optional(),
  })
  .passthrough();

const mondayWebhookBodySchema = z
  .object({
    challenge: z.string().trim().min(1).optional(),
    event: mondayWebhookEventSchema.optional(),
  })
  .passthrough();

function mondayWebhookJobDedupeKey(input: {
  subscriptionId: string;
  boardId: string;
  itemId: string;
  eventType: string;
  triggerUuid: string | null;
  triggerTime: string | null;
}): string {
  if (input.triggerUuid) return `monday-webhook:${input.subscriptionId}:${input.triggerUuid}`;
  return [
    "monday-webhook",
    input.subscriptionId,
    input.boardId,
    input.itemId,
    input.eventType,
    input.triggerTime ?? "no-trigger-time",
  ].join(":");
}

function mondayItemEventDedupeKey(input: {
  connectedProviderAccountId: string;
  boardId: string;
  itemId: string;
  eventType: MondayItemEventType;
  mondayEventKind: string;
  triggerUuid: string | null;
  triggerTime: string | null;
}): string {
  if (input.eventType === "monday.item.created") {
    return `monday.item.created:${input.connectedProviderAccountId}:${input.boardId}:${input.itemId}`;
  }
  if (input.triggerUuid) {
    return `monday.item.updated:${input.connectedProviderAccountId}:${input.triggerUuid}`;
  }
  return [
    "monday.item.updated",
    input.connectedProviderAccountId,
    input.boardId,
    input.itemId,
    input.mondayEventKind,
    input.triggerTime ?? "no-trigger-time",
  ].join(":");
}

function requireMatchingBoard(input: { state: MondayWebhookState; boardId: string }): void {
  if (input.state.resource_id !== input.boardId) {
    throw new DomainError(
      domainCodes.CONFLICT,
      [
        "Monday webhook event board did not match subscription state.",
        `subscription_board=${input.state.resource_id}`,
        `event_board=${input.boardId}`,
      ].join(" "),
    );
  }
}

function baseMondayItemPayload(input: {
  state: MondayWebhookState;
  boardId: string;
  itemId: string;
  rawPayloadType: string;
  triggerUuid: string | null;
  triggerTime: string | null;
  rawEvent: Record<string, unknown>;
}): Record<string, Json> {
  return requireJsonObject(
    {
      provider: "monday",
      connectedProviderAccountId: input.state.connected_provider_account_id,
      capabilityAccountLinkId: input.state.capability_account_link_id,
      providerBoardId: input.boardId,
      providerBoardName: input.state.provider_state.providerBoardName,
      providerItemId: input.itemId,
      mondayWebhookId: input.state.external_subscription_id,
      mondayWebhookEventKind: input.state.provider_state.mondayEventKind,
      rawPayloadType: input.rawPayloadType,
      triggerUuid: input.triggerUuid,
      triggerTime: input.triggerTime,
      rawEvent: input.rawEvent,
    },
    "mondayItemEvent.payload",
  ) as Record<string, Json>;
}

function itemEventSummary(input: {
  eventType: MondayItemEventType;
  titleOrItemId: string;
  mode: "live" | "missing";
}): string {
  if (input.mode === "missing") {
    return input.eventType === "monday.item.created"
      ? `Monday item created but item is no longer available: ${input.titleOrItemId}`
      : `Monday item updated but item is no longer available: ${input.titleOrItemId}`;
  }
  return input.eventType === "monday.item.created"
    ? `Monday item created: ${input.titleOrItemId}`
    : `Monday item updated: ${input.titleOrItemId}`;
}

function isMissingMondayItemError(error: unknown): boolean {
  return error instanceof DomainError && error.code === domainCodes.NOT_FOUND;
}

export async function applyMondayWebhook(input: {
  db: SupabaseServiceClient;
  body: unknown;
  authorizationHeader: string | null;
  headers?: Headers;
}): Promise<
  | { ok: true; handled: true; challenge: string }
  | { ok: true; handled: boolean; ignored: true; subscriptionId: string; reason: string }
  | {
      ok: true;
      handled: true;
      subscriptionId: string;
      backendJobId: string;
      joinedExistingJob: boolean;
    }
> {
  const parsed = mondayWebhookBodySchema.parse(input.body);
  if (parsed.challenge) return { ok: true, handled: true, challenge: parsed.challenge };

  verifyMondayWebhookAuthorization({
    authorizationHeader: input.authorizationHeader,
    expectedAudience: mondayWebhookPublicUrl(),
  });
  if (!parsed.event) {
    throw new DomainError(domainCodes.BAD_REQUEST, "Monday webhook body is missing event.");
  }

  const subscriptionId = cleanMondayString(parsed.event.subscriptionId);
  const boardId = cleanMondayString(parsed.event.boardId);
  const itemId = cleanMondayString(parsed.event.pulseId ?? parsed.event.itemId);
  if (!subscriptionId || !boardId || !itemId) {
    throw new DomainError(domainCodes.BAD_REQUEST, "Monday webhook event is missing required ids.");
  }

  const state = await maybeLoadMondayWebhookStateBySubscription(input.db, subscriptionId);
  if (!state) {
    return {
      ok: true,
      handled: false,
      ignored: true,
      subscriptionId,
      reason: "unknown_subscription",
    };
  }
  requireMatchingBoard({ state, boardId });
  const triggerUuid = parsed.event.triggerUuid ?? null;
  const triggerTime = parsed.event.triggerTime ?? null;

  if (!isKnownMondayWebhookPayloadType(parsed.event.type)) {
    emitDiagnostic(backendDiagnosticLogger(), "monday.webhook.ignored", {
      ok: true,
      profile_id: state.profile_id,
      capability_account_link_id: state.capability_account_link_id,
      attrs: {
        subscription_id: subscriptionId,
        provider_board_id: boardId,
        provider_item_id: itemId,
        raw_payload_type: parsed.event.type,
        reason: "unsupported_payload_type",
      },
    });
    await markMondayWebhookState(input.db, state.id, {
      status: "active",
      last_error: null,
      last_notification_at: new Date().toISOString(),
    });
    return {
      ok: true,
      handled: true,
      ignored: true,
      subscriptionId,
      reason: "unsupported_payload_type",
    };
  }

  const result = await receiveProviderWebhookNotification(input.db, {
    profileId: state.profile_id,
    capabilityAccountLinkId: state.capability_account_link_id,
    providerKey: MONDAY_WEBHOOK_PROVIDER_KEY,
    adapterKey: MONDAY_BOARD_WEBHOOK_ADAPTER_KEY,
    subscriptionId: state.id,
    priority: MONDAY_WEBHOOK_PROCESS_PRIORITY,
    deliveryKey: mondayWebhookJobDedupeKey({
      subscriptionId,
      boardId,
      itemId,
      eventType: parsed.event.type,
      triggerUuid,
      triggerTime,
    }),
    authenticated: true,
    requestHeaders: input.headers ? providerWebhookPublicHeaders(input.headers) : {},
    payload: {
      subscriptionId,
      boardId,
      itemId,
      eventType: parsed.event.type,
      triggerUuid,
      triggerTime,
      rawEvent: requireJsonObject(parsed.event, "mondayWebhook.event") as Record<string, unknown>,
    },
  });
  await markMondayWebhookState(input.db, state.id, {
    status: "active",
    last_error: null,
    last_notification_at: new Date().toISOString(),
  });
  return {
    ok: true,
    handled: true,
    subscriptionId,
    backendJobId: result.backendJobId,
    joinedExistingJob: result.joinedExistingJob,
  };
}

export async function processMondayWebhookJob(
  db: SupabaseServiceClient,
  input: { job: BackendJob; deliveryId: string },
): Promise<{ eventType: MondayItemEventType; createdEvents: number; enqueuedWorkItems: number }> {
  const delivery = await loadProviderWebhookDelivery(db, input.deliveryId);
  const payload = z
    .object({
      subscriptionId: z.string().trim().min(1),
      boardId: z.string().trim().min(1),
      itemId: z.string().trim().min(1),
      eventType: z.string().trim().min(1),
      triggerUuid: z.string().trim().min(1).nullable(),
      triggerTime: z.string().trim().min(1).nullable(),
      rawEvent: z.record(z.string(), z.unknown()),
    })
    .parse(delivery.payload);
  const state = await loadMondayWebhookStateBySubscription(db, payload.subscriptionId);
  requireMatchingBoard({ state, boardId: payload.boardId });

  const eventType = mondayItemEventTypeForKind(state.provider_state.mondayEventKind);
  const dedupeKey = mondayItemEventDedupeKey({
    connectedProviderAccountId: state.connected_provider_account_id,
    boardId: payload.boardId,
    itemId: payload.itemId,
    eventType,
    mondayEventKind: state.provider_state.mondayEventKind,
    triggerUuid: payload.triggerUuid,
    triggerTime: payload.triggerTime,
  });

  const basePayload = baseMondayItemPayload({
    state,
    boardId: payload.boardId,
    itemId: payload.itemId,
    rawPayloadType: payload.eventType,
    triggerUuid: payload.triggerUuid,
    triggerTime: payload.triggerTime,
    rawEvent: payload.rawEvent,
  });

  const binding = await requireMondayNango(db, state.profile_id, {
    capabilityAccountLinkId: state.capability_account_link_id,
  });
  let item: Awaited<ReturnType<typeof mondayLiveGetItem>>;
  try {
    item = await mondayLiveGetItem({
      providerConfigKey: binding.nangoProviderConfigKey,
      connectionId: binding.nangoConnectionId,
      providerItemId: payload.itemId,
    });
  } catch (error) {
    if (!isMissingMondayItemError(error)) throw error;
    item = null;
  }
  if (!item) {
    const workItem = await enqueueRoutedAssistantWorkItem(db, {
      profileId: state.profile_id,
      eventType,
      connectedProviderAccountId: state.connected_provider_account_id,
      kind: eventType,
      payload: {
        ...basePayload,
        snapshotStatus: "missing",
        title: itemEventSummary({ eventType, titleOrItemId: payload.itemId, mode: "missing" }),
      },
      dedupeKey,
    });
    return {
      eventType,
      createdEvents: 0,
      enqueuedWorkItems: workItem.workItem && !workItem.joinedExisting ? 1 : 0,
    };
  }

  const baseLivePayload = requireJsonObject(
    {
      ...basePayload,
      snapshotStatus: "live",
      item: {
        itemId: item.id,
        name: item.name,
        state: item.state,
        boardId: item.boardId,
        boardName: item.boardName,
        groupId: item.groupId,
        groupTitle: item.groupTitle,
      },
      columnValuesById: Object.fromEntries(
        item.columnValues.map((column) => [
          column.id,
          { text: column.text, type: column.type, value: column.value },
        ]),
      ),
    },
    "mondayItemEvent.payload",
  ) as Record<string, Json>;
  const matchingReceipt = await findMatchingProviderWriteReceipt(db, {
    profileId: state.profile_id,
    connectedProviderAccountId: state.connected_provider_account_id,
    providerKey: "monday",
    capabilitySlug: "monday",
    externalResourceType: "monday.item",
    externalResourceId: payload.itemId,
    operation: eventType === "monday.item.created" ? "create" : "update",
    occurredAt: payload.triggerTime,
  });
  const eventPayload = matchingReceipt
    ? (requireJsonObject(
        {
          ...baseLivePayload,
          selfOriginated: true,
          originProfileActionId: matchingReceipt.profile_action_id,
          providerWriteReceiptId: matchingReceipt.id,
        },
        "mondayItemEvent.payload",
      ) as Record<string, Json>)
    : baseLivePayload;
  const title = item.name?.trim() || payload.itemId;
  if (matchingReceipt) {
    emitDiagnostic(backendDiagnosticLogger(), "monday.webhook.self_origin_detected", {
      ok: true,
      profile_id: state.profile_id,
      capability_account_link_id: state.capability_account_link_id,
      attrs: {
        connected_provider_account_id: state.connected_provider_account_id,
        provider_board_id: payload.boardId,
        provider_item_id: payload.itemId,
        effect_type: eventType,
        provider_write_receipt_id: matchingReceipt.id,
        origin_profile_action_id: matchingReceipt.profile_action_id,
      },
    });
    return {
      eventType,
      createdEvents: 0,
      enqueuedWorkItems: 0,
    };
  }
  const workItem = await enqueueRoutedAssistantWorkItem(db, {
    profileId: state.profile_id,
    eventType,
    connectedProviderAccountId: state.connected_provider_account_id,
    kind: eventType,
    payload: {
      ...eventPayload,
      title: itemEventSummary({ eventType, titleOrItemId: title, mode: "live" }),
      detail: item.boardName ?? payload.boardId,
    },
    dedupeKey,
  });
  return {
    eventType,
    createdEvents: 0,
    enqueuedWorkItems: workItem.workItem && !workItem.joinedExisting ? 1 : 0,
  };
}
