import { createHash } from "node:crypto";
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
  loadProviderWebhookSubscriptionById,
  providerWebhookPublicHeaders,
  receiveProviderWebhookNotification,
} from "../../integrations/provider-webhooks/substrate";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { verifyBoldSignWebhookSignature } from "./webhook-auth";
import { loadBoldSignWebhookSubscriptionForConnectedAccount } from "./webhook-subscriptions";
import {
  BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY,
  BOLDSIGN_WEBHOOK_PROCESS_PRIORITY,
  BOLDSIGN_WEBHOOK_PROVIDER_KEY,
  boldSignWebhookStateSchema,
  isMeaningfulBoldSignWebhookEvent,
  type BoldSignWebhookState,
} from "./webhook-types";
import {
  resolveBoldSignWebhookDocumentOwnership,
  updateBoldSignDocumentOwnershipFromWebhook,
} from "./document-ownership";

const boldSignWebhookEventSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    created: z.union([z.string(), z.number()]).optional(),
    eventType: z.string().trim().min(1),
    environment: z.string().trim().min(1).optional(),
    clientId: z.string().trim().min(1).optional(),
  })
  .passthrough();

const boldSignWebhookBodySchema = z
  .object({
    event: boldSignWebhookEventSchema,
    context: z.record(z.string(), z.unknown()).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

function unixTimestampToIso(value: string | number | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value))
    return new Date(value * 1000).toISOString();
  if (typeof value !== "string" || !value.trim()) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return new Date(asNumber * 1000).toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function payloadHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function signerSummaries(data: Record<string, unknown>): Array<Record<string, Json>> {
  const signers = Array.isArray(data.signerDetails) ? data.signerDetails : [];
  return signers
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === "object"),
    )
    .map(
      (entry) =>
        requireJsonObject(
          {
            id: firstString(entry.id),
            name: firstString(entry.signerName),
            email: firstString(entry.signerEmail),
            status: firstString(entry.status),
            isDeliveryFailed:
              typeof entry.isDeliveryFailed === "boolean" ? entry.isDeliveryFailed : null,
            isViewed: typeof entry.isViewed === "boolean" ? entry.isViewed : null,
          },
          "boldSignWebhook.signer",
        ) as Record<string, Json>,
    );
}

function normalizedPayload(input: {
  parsed: z.infer<typeof boldSignWebhookBodySchema>;
  state: BoldSignWebhookState;
}): {
  documentId: string;
  eventType: string;
  documentStatus: string | null;
  title: string | null;
  occurredAt: string | null;
  payload: Record<string, Json>;
} {
  const data = input.parsed.data ?? {};
  const documentId = firstString(data.documentId, data.document_id, data.id);
  if (!documentId) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "BoldSign webhook payload is missing documentId.",
    );
  }
  const eventType = input.parsed.event.eventType;
  const title = firstString(data.messageTitle, data.documentTitle, data.title, data.fileName);
  const documentStatus = firstString(data.status, data.documentStatus);
  const occurredAt = unixTimestampToIso(input.parsed.event.created);
  const sender =
    data.senderDetail && typeof data.senderDetail === "object" ? data.senderDetail : {};
  return {
    documentId,
    eventType,
    documentStatus,
    title,
    occurredAt,
    payload: requireJsonObject(
      {
        provider: "boldsign",
        connectedProviderAccountId: input.state.connected_provider_account_id,
        capabilityAccountLinkId: input.state.capability_account_link_id,
        documentId,
        eventType,
        documentStatus,
        title,
        occurredAt,
        environment: input.parsed.event.environment ?? null,
        boldsignClientId: input.parsed.event.clientId ?? null,
        senderEmail: firstString(Reflect.get(sender, "emailAddress"), data.onBehalfOf),
        signerSummaries: signerSummaries(data),
      },
      "boldSignSignatureRequestChanged.payload",
    ) as Record<string, Json>,
  };
}

function eventSummary(input: {
  eventType: string;
  documentStatus: string | null;
  title: string | null;
  documentId: string;
}): string {
  const label = input.title ?? input.documentId;
  const status = input.documentStatus ? ` (${input.documentStatus})` : "";
  return `BoldSign signature request ${input.eventType}${status}: ${label}`;
}

async function findBoldSignWebhookSubscription(input: {
  db: SupabaseServiceClient;
  documentId: string;
  connectedProviderAccountId?: string | null;
}): Promise<{
  state: BoldSignWebhookState;
  ownershipId: string;
} | null> {
  const supportingConnectedProviderAccountId =
    input.connectedProviderAccountId ??
    (await findSupportingReceiptConnectedProviderAccountId(input.db, input.documentId));
  const ownership = await resolveBoldSignWebhookDocumentOwnership(input.db, {
    documentId: input.documentId,
    connectedProviderAccountId: supportingConnectedProviderAccountId,
  });
  if (ownership.status !== "resolved") {
    emitDiagnostic(backendDiagnosticLogger(), "boldsign.webhook.unmatched_document_ownership", {
      ok: true,
      level: "warn",
      provider: "boldsign",
      attrs: {
        document_id: input.documentId,
        connected_provider_account_id: supportingConnectedProviderAccountId ?? null,
        resolution_status: ownership.status,
        candidate_count: ownership.status === "ambiguous" ? ownership.candidateCount : 0,
      },
    });
    return null;
  }
  const state = await loadBoldSignWebhookSubscriptionForConnectedAccount(
    input.db,
    ownership.document.connected_provider_account_id,
  );
  return { state, ownershipId: ownership.document.id };
}

async function findSupportingReceiptConnectedProviderAccountId(
  db: SupabaseServiceClient,
  documentId: string,
): Promise<string | null> {
  const receiptResult = await db
    .from("provider_write_receipts")
    .select()
    .eq("provider_key", "boldsign")
    .eq("capability_slug", "boldsign")
    .eq("external_resource_type", "boldsign.document")
    .eq("external_resource_id", documentId)
    .order("finished_at", { ascending: false })
    .limit(20);
  if (receiptResult.error) {
    throw new DomainError(domainCodes.CONFLICT, "Could not inspect BoldSign write receipts.", {
      cause: receiptResult.error,
      details: { documentId },
    });
  }
  const receipt = receiptResult.data[0];
  return receipt?.connected_provider_account_id ?? null;
}

function webhookCompletedAt(input: {
  eventType: string;
  documentStatus: string | null;
  occurredAt: string | null;
}): string | null {
  const eventType = input.eventType.toLowerCase();
  const documentStatus = input.documentStatus?.toLowerCase() ?? "";
  if (eventType.includes("completed") || documentStatus === "completed") {
    return input.occurredAt;
  }
  return null;
}

export async function applyBoldSignWebhook(input: {
  db: SupabaseServiceClient;
  rawBody: string;
  headers: Headers;
}): Promise<
  | { ok: true; handled: true; verification: true }
  | { ok: true; handled: false; ignored: true; reason: string }
  | {
      ok: true;
      handled: true;
      subscriptionId: string;
      backendJobId: string;
      joinedExistingJob: boolean;
    }
> {
  if (input.headers.get("x-boldsign-event") === "Verification") {
    return { ok: true, handled: true, verification: true };
  }

  verifyBoldSignWebhookSignature({
    rawBody: input.rawBody,
    signatureHeader: input.headers.get("x-boldsign-signature"),
  });
  let raw: unknown;
  try {
    raw = JSON.parse(input.rawBody) as unknown;
  } catch (error) {
    throw new DomainError(domainCodes.BAD_REQUEST, "BoldSign webhook body must be JSON.", {
      cause: error,
    });
  }
  const parsed = boldSignWebhookBodySchema.parse(raw);
  const data = parsed.data ?? {};
  const documentId = firstString(data.documentId, data.document_id, data.id);
  if (!documentId) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "BoldSign webhook payload is missing documentId.",
    );
  }
  const route = await findBoldSignWebhookSubscription({
    db: input.db,
    documentId,
    connectedProviderAccountId: input.headers.get("x-ai-assistants-provider-connection-id"),
  });
  if (!route) {
    return {
      ok: true,
      handled: false,
      ignored: true,
      reason: "no_assigned_boldsign_document_ownership",
    };
  }
  const normalized = normalizedPayload({ parsed, state: route.state });
  await updateBoldSignDocumentOwnershipFromWebhook(input.db, {
    ownershipId: route.ownershipId,
    providerStatus: normalized.documentStatus,
    title: normalized.title,
    completedAt: webhookCompletedAt({
      eventType: normalized.eventType,
      documentStatus: normalized.documentStatus,
      occurredAt: normalized.occurredAt,
    }),
  });
  const deliveryKey = parsed.event.id ?? `boldsign:${payloadHash(input.rawBody)}`;
  const result = await receiveProviderWebhookNotification(input.db, {
    profileId: route.state.profile_id,
    capabilityAccountLinkId: route.state.capability_account_link_id,
    providerKey: BOLDSIGN_WEBHOOK_PROVIDER_KEY,
    adapterKey: BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY,
    subscriptionId: route.state.id,
    priority: BOLDSIGN_WEBHOOK_PROCESS_PRIORITY,
    deliveryKey,
    authenticated: true,
    requestHeaders: providerWebhookPublicHeaders(input.headers),
    payload: {
      ...normalized.payload,
      eventId: parsed.event.id ?? null,
      deliveryKey,
      rawEvent: requireJsonObject(parsed.event, "boldSignWebhook.event"),
      rawContext: requireJsonObject(parsed.context ?? {}, "boldSignWebhook.context"),
    },
  });
  return {
    ok: true,
    handled: true,
    subscriptionId: route.state.id,
    backendJobId: result.backendJobId,
    joinedExistingJob: result.joinedExistingJob,
  };
}

export async function processBoldSignWebhookJob(
  db: SupabaseServiceClient,
  input: { job: BackendJob; deliveryId: string },
): Promise<{ eventType: string; createdEvents: number; enqueuedWorkItems: number }> {
  const delivery = await loadProviderWebhookDelivery(db, input.deliveryId);
  if (!delivery.subscription_id) {
    throw new DomainError(domainCodes.CONFLICT, "BoldSign webhook delivery has no subscription.");
  }
  const state = boldSignWebhookStateSchema.parse(
    await loadProviderWebhookSubscriptionById(db, delivery.subscription_id),
  );
  const payload = z
    .object({
      documentId: z.string().trim().min(1),
      eventType: z.string().trim().min(1),
      documentStatus: z.string().trim().min(1).nullable(),
      title: z.string().trim().min(1).nullable(),
      occurredAt: z.string().trim().min(1).nullable().optional(),
    })
    .passthrough()
    .parse(delivery.payload);
  const matchingReceipt =
    payload.eventType === "Sent"
      ? await findMatchingProviderWriteReceipt(db, {
          profileId: state.profile_id,
          connectedProviderAccountId: state.connected_provider_account_id,
          providerKey: "boldsign",
          capabilitySlug: "boldsign",
          externalResourceType: "boldsign.document",
          externalResourceId: payload.documentId,
          operation: "send",
          occurredAt: delivery.received_at,
        })
      : null;
  const eventPayload = requireJsonObject(
    {
      ...(delivery.payload as Record<string, unknown>),
      selfOriginated: Boolean(matchingReceipt),
      originProfileActionId: matchingReceipt?.profile_action_id ?? null,
      providerWriteReceiptId: matchingReceipt?.id ?? null,
    },
    "boldSignWebhook.eventPayload",
  ) as Record<string, Json>;
  const dedupeKey = `boldsign.signature_request.changed:boldsign:${state.connected_provider_account_id}:${payload.eventType}:${payload.documentId}:${delivery.delivery_key}`;
  const shouldNotify =
    !matchingReceipt && isMeaningfulBoldSignWebhookEvent(payload.eventType, payload.documentStatus);
  const workItemPayload = {
    ...eventPayload,
    title: eventSummary({
      eventType: payload.eventType,
      documentStatus: payload.documentStatus,
      title: payload.title,
      documentId: payload.documentId,
    }),
    detail: payload.documentStatus,
  };
  const workItem = shouldNotify
    ? await enqueueRoutedAssistantWorkItem(db, {
        profileId: state.profile_id,
        eventType: "boldsign.signature_request.changed",
        connectedProviderAccountId: state.connected_provider_account_id,
        kind: "boldsign.signature_request.changed",
        priority: 25,
        dedupeKey,
        payload: workItemPayload,
        origin: {},
      })
    : null;
  if (matchingReceipt) {
    emitDiagnostic(backendDiagnosticLogger(), "boldsign.webhook.self_origin_detected", {
      ok: true,
      profile_id: state.profile_id,
      capability_account_link_id: state.capability_account_link_id,
      attrs: {
        connected_provider_account_id: state.connected_provider_account_id,
        document_id: payload.documentId,
        provider_write_receipt_id: matchingReceipt.id,
        origin_profile_action_id: matchingReceipt.profile_action_id,
      },
    });
  }
  return {
    eventType: payload.eventType,
    createdEvents: 0,
    enqueuedWorkItems: workItem?.workItem && !workItem.joinedExisting ? 1 : 0,
  };
}
