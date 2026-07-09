import { createHash } from "node:crypto";
import {
  enqueueBackendJob,
  requireBackendJobPayload,
  type BackendJob,
} from "@ai-assistants/backend-jobs";
import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type Json,
  type SupabaseServiceClient,
  type TableInsert,
  type TableRow,
  type TableUpdate,
} from "@ai-assistants/control-db";
import {
  providerWebhookDeliveryRowSchema,
  providerWebhookSubscriptionRowSchema,
} from "@ai-assistants/control-plane-contracts";
import { DomainError, domainCodes, formatUnknownError } from "@ai-assistants/errors";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { parseCapabilityAccountLinkConfig } from "../provider-runtime";

const providerWebhookAdapterKeySchema = z.enum([
  "boldsign.signature_request",
  "gmail.mailbox",
  "outlook_mail.mailbox",
  "twilio.messaging",
  "google_calendar.events",
  "outlook_calendar.events",
  "monday.board",
  "google_drive.changes",
  "microsoft_onedrive.drive",
  "microsoft_sharepoint.drive",
]);

export type ProviderWebhookAdapterKey = z.infer<typeof providerWebhookAdapterKeySchema>;

const providerWebhookProcessJobPayloadSchema = z
  .object({
    adapterKey: providerWebhookAdapterKeySchema,
    deliveryId: z.string().uuid(),
  })
  .strict();

const providerWebhookSubscriptionReconcileJobPayloadSchema = z
  .object({
    adapterKey: providerWebhookAdapterKeySchema,
    connectedProviderAccountId: z.string().uuid().optional(),
    subscriptionId: z.string().uuid().optional(),
  })
  .strict()
  .refine((payload) => payload.connectedProviderAccountId || payload.subscriptionId, {
    message: "connectedProviderAccountId or subscriptionId is required.",
  });

const providerSyncProcessJobPayloadSchema = z
  .object({
    adapterKey: providerWebhookAdapterKeySchema,
    subscriptionId: z.string().uuid(),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type ProviderWebhookSubscription = TableRow<"provider_webhook_subscriptions">;
export type ProviderWebhookDelivery = TableRow<"provider_webhook_deliveries">;

export type ProviderWebhookSubscriptionReconcileEnqueueResult =
  | { enqueued: true; jobId: string; joinedExistingJob: boolean }
  | { enqueued: false; reason: "subscription_management_disabled" };

export type ProviderWebhookAdapter = {
  adapterKey: ProviderWebhookAdapterKey;
  providerKey: string;
  receive(input: ProviderWebhookReceiveInput): Promise<ProviderWebhookReceiveResult>;
  processDelivery(input: ProviderWebhookProcessDeliveryInput): Promise<Record<string, unknown>>;
  reconcileSubscription(
    input: ProviderWebhookReconcileSubscriptionInput,
  ): Promise<Record<string, unknown>>;
  reconcileConnection(
    input: ProviderWebhookReconcileConnectionInput,
  ): Promise<Record<string, unknown>>;
  processSync(input: ProviderWebhookProcessSyncInput): Promise<Record<string, unknown>>;
};

type ProviderWebhookReceiveInput = {
  db: SupabaseServiceClient;
  headers: Headers;
  body?: unknown;
  rawBody?: string;
};

export type ProviderWebhookReceiveResult =
  | { ok: true; handled: true; challenge: string }
  | {
      ok: true;
      handled: boolean;
      ignored?: boolean;
      deliveryId?: string;
      subscriptionId?: string;
      backendJobId?: string;
      joinedExistingJob?: boolean;
      reason?: string;
      notifications?: number;
      ignoredNotifications?: number;
      enqueuedJobs?: number;
    };

type ProviderWebhookProcessDeliveryInput = {
  db: SupabaseServiceClient;
  job: BackendJob;
  deliveryId: string;
};

type ProviderWebhookReconcileSubscriptionInput = {
  db: SupabaseServiceClient;
  job: BackendJob;
  subscriptionId: string;
};

type ProviderWebhookReconcileConnectionInput = {
  db: SupabaseServiceClient;
  job: BackendJob;
  connectedProviderAccountId: string;
};

type ProviderWebhookProcessSyncInput = {
  db: SupabaseServiceClient;
  job: BackendJob;
  subscriptionId: string;
  payload: Record<string, unknown>;
};

export type ProviderWebhookSubscriptionUpsertInput = {
  profileId: string;
  capabilityAccountLinkId: string;
  connectedProviderAccountId: string;
  providerKey: string;
  adapterKey: ProviderWebhookAdapterKey;
  externalSubscriptionId?: string | null;
  resourceType: string;
  resourceId: string;
  eventScope: string;
  status?: "active" | "unhealthy" | "disabled";
  expiresAt?: string | null;
  nextReconcileAt?: string | null;
  cursor?: Record<string, unknown>;
  providerState?: Record<string, unknown>;
  lastNotificationAt?: string | null;
  lastSuccessAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
};

export type ProviderWebhookDeliveryInput = {
  providerKey: string;
  adapterKey: ProviderWebhookAdapterKey;
  subscriptionId?: string | null;
  deliveryKey: string;
  authenticated: boolean;
  requestHeaders?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

const adapterRegistry = new Map<ProviderWebhookAdapterKey, ProviderWebhookAdapter>();

function parseProviderWebhookSubscription(row: unknown): ProviderWebhookSubscription {
  return providerWebhookSubscriptionRowSchema.parse(row);
}

function parseProviderWebhookDelivery(row: unknown): ProviderWebhookDelivery {
  return providerWebhookDeliveryRowSchema.parse(row);
}

function payloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

async function loadProviderWebhookSubscriptionPolicy(
  db: SupabaseServiceClient,
  capabilityAccountLinkId: string,
): Promise<{
  manageSubscriptions: boolean;
  profileId: string;
  capabilitySlug: string;
  provider: string;
}> {
  const result = await db
    .from("capability_account_links")
    .select("profile_id, capability_slug, provider, config")
    .eq("id", capabilityAccountLinkId)
    .maybeSingle();
  const link = requireSupabaseData(
    "Load capability account link provider webhook policy",
    result.data,
    result.error,
  );
  const parsed = parseCapabilityAccountLinkConfig(link);
  return {
    manageSubscriptions: parsed.providerWebhooks?.manageSubscriptions ?? true,
    profileId: link.profile_id,
    capabilitySlug: link.capability_slug,
    provider: link.provider,
  };
}

function emitProviderWebhookSubscriptionManagementSkipped(input: {
  profileId: string;
  capabilityAccountLinkId: string;
  capabilitySlug: string;
  provider: string;
  adapterKey: ProviderWebhookAdapterKey;
  source: "enqueue" | "worker";
}): void {
  try {
    emitDiagnostic(backendDiagnosticLogger(), "provider.webhook.subscription_management.skipped", {
      profile_id: input.profileId,
      capability_account_link_id: input.capabilityAccountLinkId,
      provider: input.provider,
      attrs: {
        capability_slug: input.capabilitySlug,
        adapter_key: input.adapterKey,
        source: input.source,
        reason: "subscription_management_disabled",
      },
    });
  } catch (error) {
    const message = formatUnknownError(error);
    if (message.includes("Diagnostic runtime root is required")) return;
    console.warn(
      `[provider-webhooks] subscription management skipped for ${input.profileId}/${input.capabilitySlug}, but diagnostic emission failed: ${message}`,
    );
  }
}

export function registerProviderWebhookAdapter(adapter: ProviderWebhookAdapter): void {
  const existing = adapterRegistry.get(adapter.adapterKey);
  if (existing && existing !== adapter) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Provider webhook adapter already registered: ${adapter.adapterKey}`,
    );
  }
  adapterRegistry.set(adapter.adapterKey, adapter);
}

function requireProviderWebhookAdapter(
  adapterKey: ProviderWebhookAdapterKey,
): ProviderWebhookAdapter {
  const adapter = adapterRegistry.get(adapterKey);
  if (!adapter) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `No provider webhook adapter registered for ${adapterKey}.`,
    );
  }
  return adapter;
}

export function providerWebhookPublicHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower.includes("token") || lower.includes("signature")) {
      out[lower] = "[redacted]";
      continue;
    }
    out[lower] = value;
  }
  return out;
}

export async function upsertProviderWebhookSubscription(
  db: SupabaseServiceClient,
  input: ProviderWebhookSubscriptionUpsertInput,
): Promise<ProviderWebhookSubscription> {
  const row = {
    profile_id: input.profileId,
    capability_account_link_id: input.capabilityAccountLinkId,
    connected_provider_account_id: input.connectedProviderAccountId,
    provider_key: input.providerKey,
    adapter_key: input.adapterKey,
    external_subscription_id: input.externalSubscriptionId ?? null,
    resource_type: input.resourceType,
    resource_id: input.resourceId,
    event_scope: input.eventScope,
    status: input.status ?? "active",
    expires_at: input.expiresAt ?? null,
    next_reconcile_at: input.nextReconcileAt ?? null,
    cursor: requireJsonObject(input.cursor ?? {}, "providerWebhookSubscription.cursor") as Json,
    provider_state: requireJsonObject(
      input.providerState ?? {},
      "providerWebhookSubscription.providerState",
    ) as Json,
    last_notification_at: input.lastNotificationAt ?? null,
    last_success_at: input.lastSuccessAt ?? null,
    last_error_code: input.lastErrorCode ?? null,
    last_error_message: input.lastErrorMessage ?? null,
  } satisfies TableInsert<"provider_webhook_subscriptions">;
  const result = await db
    .from("provider_webhook_subscriptions")
    .upsert(row, {
      onConflict: "connected_provider_account_id,adapter_key,resource_type,resource_id,event_scope",
    })
    .select()
    .single();
  return parseProviderWebhookSubscription(
    requireSupabaseData("Upsert provider webhook subscription", result.data, result.error),
  );
}

export async function loadProviderWebhookSubscriptionById(
  db: SupabaseServiceClient,
  id: string,
): Promise<ProviderWebhookSubscription> {
  const result = await db
    .from("provider_webhook_subscriptions")
    .select()
    .eq("id", id)
    .maybeSingle();
  return parseProviderWebhookSubscription(
    requireSupabaseData("Load provider webhook subscription", result.data, result.error),
  );
}

export async function loadProviderWebhookSubscriptionByExternalId(input: {
  db: SupabaseServiceClient;
  providerKey: string;
  adapterKey: ProviderWebhookAdapterKey;
  externalSubscriptionId: string;
}): Promise<ProviderWebhookSubscription> {
  const result = await input.db
    .from("provider_webhook_subscriptions")
    .select()
    .eq("provider_key", input.providerKey)
    .eq("adapter_key", input.adapterKey)
    .eq("external_subscription_id", input.externalSubscriptionId)
    .maybeSingle();
  return parseProviderWebhookSubscription(
    requireSupabaseData(
      "Load provider webhook subscription by external id",
      result.data,
      result.error,
    ),
  );
}

export async function maybeLoadProviderWebhookSubscriptionByExternalId(input: {
  db: SupabaseServiceClient;
  providerKey: string;
  adapterKey: ProviderWebhookAdapterKey;
  externalSubscriptionId: string;
}): Promise<ProviderWebhookSubscription | null> {
  const result = await input.db
    .from("provider_webhook_subscriptions")
    .select()
    .eq("provider_key", input.providerKey)
    .eq("adapter_key", input.adapterKey)
    .eq("external_subscription_id", input.externalSubscriptionId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data ? parseProviderWebhookSubscription(result.data) : null;
}

export async function listProviderWebhookSubscriptionsForConnectedAccount(input: {
  db: SupabaseServiceClient;
  connectedProviderAccountId: string;
  adapterKey: ProviderWebhookAdapterKey;
}): Promise<ProviderWebhookSubscription[]> {
  const result = await input.db
    .from("provider_webhook_subscriptions")
    .select()
    .eq("connected_provider_account_id", input.connectedProviderAccountId)
    .eq("adapter_key", input.adapterKey);
  return requireSupabaseRows(
    "List provider webhook subscriptions for connection",
    result.data,
    result.error,
  ).map((row) => parseProviderWebhookSubscription(row));
}

export async function listProviderWebhookSubscriptionsByAdapter(input: {
  db: SupabaseServiceClient;
  providerKey: string;
  adapterKey: ProviderWebhookAdapterKey;
}): Promise<ProviderWebhookSubscription[]> {
  const result = await input.db
    .from("provider_webhook_subscriptions")
    .select()
    .eq("provider_key", input.providerKey)
    .eq("adapter_key", input.adapterKey);
  return requireSupabaseRows(
    "List provider webhook subscriptions by adapter",
    result.data,
    result.error,
  ).map((row) => parseProviderWebhookSubscription(row));
}

export async function patchProviderWebhookSubscription(
  db: SupabaseServiceClient,
  id: string,
  patch: Partial<{
    status: "active" | "unhealthy" | "disabled";
    external_subscription_id: string | null;
    expires_at: string | null;
    next_reconcile_at: string | null;
    cursor: Record<string, unknown>;
    provider_state: Record<string, unknown>;
    last_notification_at: string | null;
    last_success_at: string | null;
    last_error_code: string | null;
    last_error_message: string | null;
  }>,
): Promise<ProviderWebhookSubscription> {
  const { cursor, provider_state, ...rest } = patch;
  const updatePatch = {
    ...rest,
    ...(cursor ? { cursor: requireJsonObject(cursor, "subscription.cursor") } : {}),
    ...(provider_state
      ? {
          provider_state: requireJsonObject(provider_state, "subscription.providerState"),
        }
      : {}),
  } satisfies TableUpdate<"provider_webhook_subscriptions">;
  const result = await db
    .from("provider_webhook_subscriptions")
    .update(updatePatch)
    .eq("id", id)
    .select()
    .single();
  return parseProviderWebhookSubscription(
    requireSupabaseData("Patch provider webhook subscription", result.data, result.error),
  );
}

export async function deleteProviderWebhookSubscriptionAndDeliveries(
  db: SupabaseServiceClient,
  subscriptionId: string,
): Promise<void> {
  const deliveriesResult = await db
    .from("provider_webhook_deliveries")
    .delete()
    .eq("subscription_id", subscriptionId);
  if (deliveriesResult.error) throw deliveriesResult.error;

  const subscriptionResult = await db
    .from("provider_webhook_subscriptions")
    .delete()
    .eq("id", subscriptionId);
  if (subscriptionResult.error) throw subscriptionResult.error;
}

async function createProviderWebhookDelivery(
  db: SupabaseServiceClient,
  input: ProviderWebhookDeliveryInput,
): Promise<{ delivery: ProviderWebhookDelivery; created: boolean }> {
  const payload = requireJsonObject(input.payload ?? {}, "providerWebhookDelivery.payload");
  const requestHeaders = requireJsonObject(
    input.requestHeaders ?? {},
    "providerWebhookDelivery.requestHeaders",
  );
  const deliveryInsert = {
    provider_key: input.providerKey,
    adapter_key: input.adapterKey,
    subscription_id: input.subscriptionId ?? null,
    delivery_key: input.deliveryKey,
    authenticated: input.authenticated,
    request_headers: requestHeaders,
    payload,
    payload_hash: payloadHash(payload as Record<string, unknown>),
    status: "queued",
  } satisfies TableInsert<"provider_webhook_deliveries">;
  const insertResult = await db
    .from("provider_webhook_deliveries")
    .insert(deliveryInsert)
    .select()
    .single();

  if (!insertResult.error && insertResult.data) {
    return {
      delivery: parseProviderWebhookDelivery(insertResult.data),
      created: true,
    };
  }
  if (!isUniqueViolation(insertResult.error)) throw insertResult.error;

  const existingResult = await db
    .from("provider_webhook_deliveries")
    .select()
    .eq("provider_key", input.providerKey)
    .eq("adapter_key", input.adapterKey)
    .eq("delivery_key", input.deliveryKey)
    .maybeSingle();
  return {
    delivery: parseProviderWebhookDelivery(
      requireSupabaseData(
        "Load duplicate provider webhook delivery",
        existingResult.data,
        existingResult.error,
      ),
    ),
    created: false,
  };
}

export async function loadProviderWebhookDelivery(
  db: SupabaseServiceClient,
  id: string,
): Promise<ProviderWebhookDelivery> {
  const result = await db.from("provider_webhook_deliveries").select().eq("id", id).maybeSingle();
  return parseProviderWebhookDelivery(
    requireSupabaseData("Load provider webhook delivery", result.data, result.error),
  );
}

async function enqueueProviderWebhookDelivery(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string;
    adapterKey: ProviderWebhookAdapterKey;
    delivery: ProviderWebhookDelivery;
    priority?: number;
  },
): Promise<{ backendJobId: string; joinedExistingJob: boolean }> {
  if (input.delivery.backend_job_id) {
    return { backendJobId: input.delivery.backend_job_id, joinedExistingJob: true };
  }
  const payload = providerWebhookProcessJobPayloadSchema.parse({
    adapterKey: input.adapterKey,
    deliveryId: input.delivery.id,
  });
  const job = await enqueueBackendJob(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    kind: "provider.webhook.process",
    payload,
    priority: input.priority ?? 10,
    dedupeKey: `provider.webhook.process:${input.delivery.provider_key}:${input.delivery.adapter_key}:${input.delivery.delivery_key}`,
  });
  const updateResult = await db
    .from("provider_webhook_deliveries")
    .update({ backend_job_id: job.job.id })
    .eq("id", input.delivery.id);
  if (updateResult.error) throw updateResult.error;
  return { backendJobId: job.job.id, joinedExistingJob: job.joinedExistingJob };
}

export async function receiveProviderWebhookNotification(
  db: SupabaseServiceClient,
  input: ProviderWebhookDeliveryInput & {
    profileId: string;
    capabilityAccountLinkId: string;
    priority?: number;
  },
): Promise<{
  delivery: ProviderWebhookDelivery;
  created: boolean;
  backendJobId: string;
  joinedExistingJob: boolean;
}> {
  const { delivery, created } = await createProviderWebhookDelivery(db, input);
  const enqueued = await enqueueProviderWebhookDelivery(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    adapterKey: input.adapterKey,
    delivery,
    ...(input.priority === undefined ? {} : { priority: input.priority }),
  });
  return { delivery, created, ...enqueued };
}

export async function enqueueProviderWebhookSubscriptionReconcile(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string;
    adapterKey: ProviderWebhookAdapterKey;
    connectedProviderAccountId?: string;
    subscriptionId?: string;
    runAfter?: Date;
    priority?: number;
    dedupeKey: string;
  },
): Promise<ProviderWebhookSubscriptionReconcileEnqueueResult> {
  const payload = providerWebhookSubscriptionReconcileJobPayloadSchema.parse({
    adapterKey: input.adapterKey,
    ...(input.connectedProviderAccountId
      ? { connectedProviderAccountId: input.connectedProviderAccountId }
      : {}),
    ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
  });
  const policy = await loadProviderWebhookSubscriptionPolicy(db, input.capabilityAccountLinkId);
  if (!policy.manageSubscriptions) {
    emitProviderWebhookSubscriptionManagementSkipped({
      profileId: policy.profileId,
      capabilityAccountLinkId: input.capabilityAccountLinkId,
      capabilitySlug: policy.capabilitySlug,
      provider: policy.provider,
      adapterKey: input.adapterKey,
      source: "enqueue",
    });
    return { enqueued: false, reason: "subscription_management_disabled" };
  }
  const result = await enqueueBackendJob(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    kind: "provider.webhook.subscription.reconcile",
    payload,
    priority: input.priority ?? 30,
    ...(input.runAfter ? { runAfter: input.runAfter.toISOString() } : {}),
    dedupeKey: input.dedupeKey,
  });
  return { enqueued: true, jobId: result.job.id, joinedExistingJob: result.joinedExistingJob };
}

export async function enqueueProviderSyncProcess(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string;
    adapterKey: ProviderWebhookAdapterKey;
    subscriptionId: string;
    payload?: Record<string, unknown>;
    priority?: number;
    dedupeKey: string;
  },
): Promise<{ jobId: string; joinedExistingJob: boolean }> {
  const payload = providerSyncProcessJobPayloadSchema.parse({
    adapterKey: input.adapterKey,
    subscriptionId: input.subscriptionId,
    ...(input.payload ? { payload: input.payload } : {}),
  });
  const result = await enqueueBackendJob(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    kind: "provider.sync.process",
    payload,
    priority: input.priority ?? 10,
    dedupeKey: input.dedupeKey,
  });
  return { jobId: result.job.id, joinedExistingJob: result.joinedExistingJob };
}

export async function processProviderWebhookJob(
  db: SupabaseServiceClient,
  job: BackendJob,
): Promise<Record<string, unknown>> {
  const payload = providerWebhookProcessJobPayloadSchema.parse(
    requireBackendJobPayload(job, "provider.webhook.process"),
  );
  const adapter = requireProviderWebhookAdapter(payload.adapterKey);
  await patchProviderWebhookDeliveryStatus(db, payload.deliveryId, { status: "processing" });
  try {
    const result = await adapter.processDelivery({ db, job, deliveryId: payload.deliveryId });
    await patchProviderWebhookDeliveryStatus(db, payload.deliveryId, {
      status: "processed",
      processed_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
    });
    return result;
  } catch (error) {
    await patchProviderWebhookDeliveryStatus(db, payload.deliveryId, {
      status: "failed",
      error_code: error instanceof DomainError ? error.code : domainCodes.INTERNAL,
      error_message: formatUnknownError(error),
    });
    throw error;
  }
}

export async function reconcileProviderWebhookSubscriptionJob(
  db: SupabaseServiceClient,
  job: BackendJob,
): Promise<Record<string, unknown>> {
  const payload = providerWebhookSubscriptionReconcileJobPayloadSchema.parse(
    requireBackendJobPayload(job, "provider.webhook.subscription.reconcile"),
  );
  const capabilityAccountLinkId = job.capability_account_link_id;
  if (!capabilityAccountLinkId) {
    throw new DomainError(
      domainCodes.INTERNAL,
      "Provider webhook reconcile job is missing capability_account_link_id.",
    );
  }
  const policy = await loadProviderWebhookSubscriptionPolicy(db, capabilityAccountLinkId);
  if (!policy.manageSubscriptions) {
    emitProviderWebhookSubscriptionManagementSkipped({
      profileId: policy.profileId,
      capabilityAccountLinkId,
      capabilitySlug: policy.capabilitySlug,
      provider: policy.provider,
      adapterKey: payload.adapterKey,
      source: "worker",
    });
    return { skipped: true, reason: "subscription_management_disabled" };
  }
  const adapter = requireProviderWebhookAdapter(payload.adapterKey);
  if (payload.subscriptionId) {
    return adapter.reconcileSubscription({ db, job, subscriptionId: payload.subscriptionId });
  }
  if (payload.connectedProviderAccountId) {
    return adapter.reconcileConnection({
      db,
      job,
      connectedProviderAccountId: payload.connectedProviderAccountId,
    });
  }
  throw new DomainError(
    domainCodes.INTERNAL,
    "Provider webhook reconcile job requires subscriptionId or connectedProviderAccountId.",
  );
}

export async function processProviderSyncJob(
  db: SupabaseServiceClient,
  job: BackendJob,
): Promise<Record<string, unknown>> {
  const payload = providerSyncProcessJobPayloadSchema.parse(
    requireBackendJobPayload(job, "provider.sync.process"),
  );
  const adapter = requireProviderWebhookAdapter(payload.adapterKey);
  return adapter.processSync({
    db,
    job,
    subscriptionId: payload.subscriptionId,
    payload: payload.payload ?? {},
  });
}

async function patchProviderWebhookDeliveryStatus(
  db: SupabaseServiceClient,
  id: string,
  patch: Partial<
    Pick<ProviderWebhookDelivery, "status" | "processed_at" | "error_code" | "error_message">
  >,
): Promise<void> {
  const result = await db.from("provider_webhook_deliveries").update(patch).eq("id", id);
  if (result.error) throw result.error;
}
