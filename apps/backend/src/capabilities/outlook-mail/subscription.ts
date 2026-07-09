import { randomBytes } from "node:crypto";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { backendApiEnv } from "../../shared/env";
import { z } from "zod";
import { nangoProxyRequestJson } from "../../integrations/nango/nango-proxy-client";
import {
  deleteProviderWebhookSubscriptionAndDeliveries,
  enqueueProviderWebhookSubscriptionReconcile,
  upsertProviderWebhookSubscription,
  type ProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";
import {
  OUTLOOK_MAIL_ADAPTER_KEY,
  OUTLOOK_MAIL_PROVIDER_KEY,
  listOutlookMailSubscriptionsForConnection,
  outlookMailProviderState,
  requireOutlookConnectionByProviderConnectionId,
  type OutlookConnectionContext,
} from "./connection";
import { graphSubscriptionResponseSchema } from "./schemas";

const OUTLOOK_INBOX_MESSAGES_RESOURCE = "me/mailFolders('inbox')/messages";
const OUTLOOK_CHANGE_TYPE = "created";

const OUTLOOK_SUBSCRIPTION_RENEW_PRIORITY = 30;
const OUTLOOK_SUBSCRIPTION_DURATION_MS = 6 * 24 * 60 * 60 * 1000;
const OUTLOOK_RENEW_BEFORE_EXPIRATION_MS = 2 * 24 * 60 * 60 * 1000;
const outlookSubscriptionCreateBodySchema = z
  .object({
    changeType: z.string().trim().min(1),
    notificationUrl: z.string().trim().url(),
    lifecycleNotificationUrl: z.string().trim().url(),
    resource: z.string().trim().min(1),
    expirationDateTime: z.string().trim().min(1),
    clientState: z.string().trim().min(1),
    latestSupportedTlsVersion: z.literal("v1_2"),
  })
  .strict();
const outlookSubscriptionRenewBodySchema = z
  .object({ expirationDateTime: z.string().trim().min(1) })
  .strict();

function outlookMailSubscriptionRenewDedupeKey(
  connectedProviderAccountId: string,
  runAfter: Date,
): string {
  return `outlook-mail-subscription-renew:${connectedProviderAccountId}:${runAfter.toISOString().slice(0, 10)}`;
}

function outlookMailWebhookPublicUrl(): string {
  const base = backendApiEnv().backendPublicUrl;
  return `${base}/webhooks/outlook-mail`;
}

function newClientState(): string {
  return randomBytes(32).toString("hex");
}

function subscriptionExpirationDate(now = Date.now()): Date {
  return new Date(now + OUTLOOK_SUBSCRIPTION_DURATION_MS);
}

function nextRenewRunAfter(expirationIso: string): Date {
  const expirationMs = Date.parse(expirationIso);
  if (!Number.isFinite(expirationMs)) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Outlook subscription expiration is invalid: ${JSON.stringify(expirationIso)}.`,
    );
  }
  return new Date(Math.max(Date.now(), expirationMs - OUTLOOK_RENEW_BEFORE_EXPIRATION_MS));
}

function providerHttpStatus(error: unknown): number | null {
  if (!(error instanceof DomainError)) return null;
  const details = z
    .object({ httpStatus: z.number().nullable().optional() })
    .passthrough()
    .safeParse(error.details);
  return details.success ? (details.data.httpStatus ?? null) : null;
}

function isAlreadyGoneProviderError(error: unknown): boolean {
  const status = providerHttpStatus(error);
  return status === 404 || status === 410;
}

function isDesiredOutlookMailSubscription(row: ProviderWebhookSubscription): boolean {
  return (
    row.resource_type === "microsoft.graph.resource" &&
    row.resource_id === OUTLOOK_INBOX_MESSAGES_RESOURCE &&
    row.event_scope === OUTLOOK_CHANGE_TYPE
  );
}

async function upsertOutlookSubscriptionState(
  db: SupabaseServiceClient,
  input: OutlookConnectionContext & {
    clientState: string;
    graphSubscriptionId?: string | null;
    resource?: string;
    changeType?: string;
    subscriptionExpirationAt?: string | null;
  },
) {
  return upsertProviderWebhookSubscription(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    connectedProviderAccountId: input.connectedProviderAccount.id,
    providerKey: OUTLOOK_MAIL_PROVIDER_KEY,
    adapterKey: OUTLOOK_MAIL_ADAPTER_KEY,
    externalSubscriptionId: input.graphSubscriptionId ?? null,
    resourceType: "microsoft.graph.resource",
    resourceId: input.resource ?? OUTLOOK_INBOX_MESSAGES_RESOURCE,
    eventScope: input.changeType ?? OUTLOOK_CHANGE_TYPE,
    status: "active",
    expiresAt: input.subscriptionExpirationAt ?? null,
    providerState: {
      nangoProviderConfigKey: input.nangoProviderConfigKey,
      nangoConnectionId: input.nangoConnectionId,
      accountEmail: input.accountEmail,
      clientState: input.clientState,
      resource: input.resource ?? OUTLOOK_INBOX_MESSAGES_RESOURCE,
      changeType: input.changeType ?? OUTLOOK_CHANGE_TYPE,
    },
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

export async function enqueueOutlookMailSubscriptionRenewJob(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string;
    connectedProviderAccountId: string;
    runAfter?: Date;
  },
) {
  const runAfter = input.runAfter ?? new Date();
  return enqueueProviderWebhookSubscriptionReconcile(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    adapterKey: OUTLOOK_MAIL_ADAPTER_KEY,
    connectedProviderAccountId: input.connectedProviderAccountId,
    priority: OUTLOOK_SUBSCRIPTION_RENEW_PRIORITY,
    runAfter,
    dedupeKey: outlookMailSubscriptionRenewDedupeKey(input.connectedProviderAccountId, runAfter),
  });
}

export async function startOrRenewOutlookMailSubscription(
  db: SupabaseServiceClient,
  input: { connectedProviderAccountId: string },
): Promise<Record<string, unknown>> {
  const connection = await requireOutlookConnectionByProviderConnectionId(
    db,
    input.connectedProviderAccountId,
  );
  const rows = await listOutlookMailSubscriptionsForConnection(
    db,
    connection.connectedProviderAccount.id,
  );
  for (const row of rows) {
    if (isDesiredOutlookMailSubscription(row)) continue;
    await deleteOutlookSubscriptionState({ db, connection, state: row });
  }
  const existing = rows.find((row) => isDesiredOutlookMailSubscription(row)) ?? null;
  const existingState = existing ? outlookMailProviderState(existing) : null;
  const clientState = existingState?.clientState ?? newClientState();
  const resource = OUTLOOK_INBOX_MESSAGES_RESOURCE;
  const changeType = OUTLOOK_CHANGE_TYPE;

  const expirationDateTime = subscriptionExpirationDate().toISOString();
  const notificationUrl = outlookMailWebhookPublicUrl();
  const response = await createOrRenewOutlookMailSubscription({
    connection,
    graphSubscriptionId: existing?.external_subscription_id?.trim() || null,
    changeType,
    resource,
    expirationDateTime,
    notificationUrl,
    clientState,
  });

  const state = await upsertOutlookSubscriptionState(db, {
    ...connection,
    clientState,
    graphSubscriptionId: response.id,
    resource: response.resource ?? resource,
    changeType: response.changeType ?? changeType,
    subscriptionExpirationAt: response.expirationDateTime,
  });
  const next = await enqueueOutlookMailSubscriptionRenewJob(db, {
    profileId: connection.profileId,
    capabilityAccountLinkId: connection.capabilityAccountLinkId,
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    runAfter: nextRenewRunAfter(response.expirationDateTime),
  });
  return {
    connectedProviderAccountId: connection.connectedProviderAccount.id,
    graphSubscriptionId: response.id,
    subscriptionStateId: state.id,
    subscriptionExpirationAt: response.expirationDateTime,
    ...(next.enqueued
      ? {
          nextRenewalJobId: next.jobId,
          joinedExistingRenewalJob: next.joinedExistingJob,
        }
      : { nextRenewalSkippedReason: next.reason }),
  };
}

async function createOutlookSubscription(input: {
  connection: OutlookConnectionContext;
  changeType: string;
  resource: string;
  expirationDateTime: string;
  notificationUrl: string;
  clientState: string;
}) {
  return nangoProxyRequestJson({
    operation: "outlook_mail.subscription.create",
    publicSummary: "Outlook Mail webhook subscription creation failed",
    providerConfigKey: input.connection.nangoProviderConfigKey,
    connectionId: input.connection.nangoConnectionId,
    method: "post",
    endpoint: "/v1.0/subscriptions",
    data: {
      changeType: input.changeType,
      notificationUrl: input.notificationUrl,
      lifecycleNotificationUrl: input.notificationUrl,
      resource: input.resource,
      expirationDateTime: input.expirationDateTime,
      clientState: input.clientState,
      latestSupportedTlsVersion: "v1_2",
    },
    bodySchema: outlookSubscriptionCreateBodySchema,
    responseSchema: graphSubscriptionResponseSchema,
    evidence: {
      connected_provider_account_id: input.connection.connectedProviderAccount.id,
      capability_account_link_id: input.connection.capabilityAccountLinkId,
    },
  });
}

async function renewOutlookSubscription(input: {
  connection: OutlookConnectionContext;
  graphSubscriptionId: string;
  expirationDateTime: string;
}) {
  return nangoProxyRequestJson({
    operation: "outlook_mail.subscription.renew",
    publicSummary: "Outlook Mail webhook subscription renewal failed",
    providerConfigKey: input.connection.nangoProviderConfigKey,
    connectionId: input.connection.nangoConnectionId,
    method: "patch",
    endpoint: `/v1.0/subscriptions/${encodeURIComponent(input.graphSubscriptionId)}`,
    data: { expirationDateTime: input.expirationDateTime },
    bodySchema: outlookSubscriptionRenewBodySchema,
    responseSchema: graphSubscriptionResponseSchema,
    evidence: {
      connected_provider_account_id: input.connection.connectedProviderAccount.id,
      capability_account_link_id: input.connection.capabilityAccountLinkId,
    },
  });
}

async function deleteOutlookMailGraphSubscription(input: {
  connection: OutlookConnectionContext;
  graphSubscriptionId: string;
}) {
  await nangoProxyRequestJson({
    operation: "outlook_mail.subscription.delete",
    publicSummary: "Outlook Mail webhook subscription deletion failed",
    providerConfigKey: input.connection.nangoProviderConfigKey,
    connectionId: input.connection.nangoConnectionId,
    method: "delete",
    endpoint: `/v1.0/subscriptions/${encodeURIComponent(input.graphSubscriptionId)}`,
    responseSchema: z.unknown(),
    evidence: {
      connected_provider_account_id: input.connection.connectedProviderAccount.id,
      capability_account_link_id: input.connection.capabilityAccountLinkId,
      graph_subscription_id: input.graphSubscriptionId,
    },
  });
}

async function deleteOutlookSubscriptionState(input: {
  db: SupabaseServiceClient;
  connection: OutlookConnectionContext;
  state: ProviderWebhookSubscription;
}): Promise<void> {
  const graphSubscriptionId = input.state.external_subscription_id?.trim() || null;
  if (graphSubscriptionId) {
    try {
      await deleteOutlookMailGraphSubscription({
        connection: input.connection,
        graphSubscriptionId,
      });
    } catch (error) {
      if (!isAlreadyGoneProviderError(error)) throw error;
    }
  }
  await deleteProviderWebhookSubscriptionAndDeliveries(input.db, input.state.id);
}

async function createOrRenewOutlookMailSubscription(input: {
  connection: OutlookConnectionContext;
  graphSubscriptionId: string | null;
  changeType: string;
  resource: string;
  expirationDateTime: string;
  notificationUrl: string;
  clientState: string;
}) {
  if (!input.graphSubscriptionId) {
    return createOutlookSubscription(input);
  }
  try {
    return await renewOutlookSubscription({
      connection: input.connection,
      graphSubscriptionId: input.graphSubscriptionId,
      expirationDateTime: input.expirationDateTime,
    });
  } catch (error) {
    const status = providerHttpStatus(error);
    if (status !== 404 && status !== 410) throw error;
    return createOutlookSubscription(input);
  }
}
