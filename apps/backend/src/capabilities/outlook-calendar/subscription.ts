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
  OUTLOOK_CALENDAR_ADAPTER_KEY,
  OUTLOOK_CALENDAR_PROVIDER_KEY,
  listOutlookCalendarSubscriptionsForConnection,
  outlookCalendarProviderState,
  requireOutlookCalendarConnectionByProviderConnectionId,
  type OutlookCalendarConnectionContext,
} from "./connection";
import { graphCalendarSubscriptionResponseSchema } from "./schemas";

const OUTLOOK_CALENDAR_EVENTS_RESOURCE = "me/events";
const OUTLOOK_CALENDAR_CHANGE_TYPE = "created,updated,deleted";

const OUTLOOK_CALENDAR_SUBSCRIPTION_RENEW_PRIORITY = 30;
const OUTLOOK_CALENDAR_SUBSCRIPTION_DURATION_MS = 6 * 24 * 60 * 60 * 1000;
const OUTLOOK_CALENDAR_RENEW_BEFORE_EXPIRATION_MS = 2 * 24 * 60 * 60 * 1000;
const outlookCalendarSubscriptionCreateBodySchema = z
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
const outlookCalendarSubscriptionRenewBodySchema = z
  .object({ expirationDateTime: z.string().trim().min(1) })
  .strict();

function subscriptionRenewDedupeKey(connectedProviderAccountId: string, runAfter: Date): string {
  return `outlook-calendar-subscription-renew:${connectedProviderAccountId}:${runAfter.toISOString().slice(0, 10)}`;
}

function outlookCalendarWebhookPublicUrl(): string {
  const base = backendApiEnv().backendPublicUrl;
  return `${base}/webhooks/outlook-calendar`;
}

function newClientState(): string {
  return randomBytes(32).toString("hex");
}

function subscriptionExpirationDate(now = Date.now()): Date {
  return new Date(now + OUTLOOK_CALENDAR_SUBSCRIPTION_DURATION_MS);
}

function nextRenewRunAfter(expirationIso: string): Date {
  const expirationMs = Date.parse(expirationIso);
  if (!Number.isFinite(expirationMs)) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Outlook Calendar subscription expiration is invalid: ${JSON.stringify(expirationIso)}.`,
    );
  }
  return new Date(Math.max(Date.now(), expirationMs - OUTLOOK_CALENDAR_RENEW_BEFORE_EXPIRATION_MS));
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

function isDesiredOutlookCalendarSubscription(row: ProviderWebhookSubscription): boolean {
  return (
    row.resource_type === "microsoft.graph.resource" &&
    row.resource_id === OUTLOOK_CALENDAR_EVENTS_RESOURCE &&
    row.event_scope === OUTLOOK_CALENDAR_CHANGE_TYPE
  );
}

async function upsertOutlookCalendarSubscriptionState(
  db: SupabaseServiceClient,
  input: OutlookCalendarConnectionContext & {
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
    providerKey: OUTLOOK_CALENDAR_PROVIDER_KEY,
    adapterKey: OUTLOOK_CALENDAR_ADAPTER_KEY,
    externalSubscriptionId: input.graphSubscriptionId ?? null,
    resourceType: "microsoft.graph.resource",
    resourceId: input.resource ?? OUTLOOK_CALENDAR_EVENTS_RESOURCE,
    eventScope: input.changeType ?? OUTLOOK_CALENDAR_CHANGE_TYPE,
    status: "active",
    expiresAt: input.subscriptionExpirationAt ?? null,
    providerState: {
      nangoProviderConfigKey: input.nangoProviderConfigKey,
      nangoConnectionId: input.nangoConnectionId,
      accountEmail: input.accountEmail,
      clientState: input.clientState,
      resource: input.resource ?? OUTLOOK_CALENDAR_EVENTS_RESOURCE,
      changeType: input.changeType ?? OUTLOOK_CALENDAR_CHANGE_TYPE,
    },
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

export async function enqueueOutlookCalendarSubscriptionRenewJob(
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
    adapterKey: OUTLOOK_CALENDAR_ADAPTER_KEY,
    connectedProviderAccountId: input.connectedProviderAccountId,
    priority: OUTLOOK_CALENDAR_SUBSCRIPTION_RENEW_PRIORITY,
    runAfter,
    dedupeKey: subscriptionRenewDedupeKey(input.connectedProviderAccountId, runAfter),
  });
}

export async function startOrRenewOutlookCalendarSubscription(
  db: SupabaseServiceClient,
  input: { connectedProviderAccountId: string },
): Promise<Record<string, unknown>> {
  const connection = await requireOutlookCalendarConnectionByProviderConnectionId(
    db,
    input.connectedProviderAccountId,
  );
  const rows = await listOutlookCalendarSubscriptionsForConnection(
    db,
    connection.connectedProviderAccount.id,
  );
  for (const row of rows) {
    if (isDesiredOutlookCalendarSubscription(row)) continue;
    await deleteOutlookCalendarSubscriptionState({ db, connection, state: row });
  }
  const existing = rows.find((row) => isDesiredOutlookCalendarSubscription(row)) ?? null;
  const existingState = existing ? outlookCalendarProviderState(existing) : null;
  const clientState = existingState?.clientState ?? newClientState();
  const resource = OUTLOOK_CALENDAR_EVENTS_RESOURCE;
  const changeType = OUTLOOK_CALENDAR_CHANGE_TYPE;

  const expirationDateTime = subscriptionExpirationDate().toISOString();
  const notificationUrl = outlookCalendarWebhookPublicUrl();
  const response = await createOrRenewOutlookCalendarSubscription({
    connection,
    graphSubscriptionId: existing?.external_subscription_id?.trim() || null,
    changeType,
    resource,
    expirationDateTime,
    notificationUrl,
    clientState,
  });

  const state = await upsertOutlookCalendarSubscriptionState(db, {
    ...connection,
    clientState,
    graphSubscriptionId: response.id,
    resource: response.resource ?? resource,
    changeType: response.changeType ?? changeType,
    subscriptionExpirationAt: response.expirationDateTime,
  });
  const next = await enqueueOutlookCalendarSubscriptionRenewJob(db, {
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

async function createOutlookCalendarSubscription(input: {
  connection: OutlookCalendarConnectionContext;
  changeType: string;
  resource: string;
  expirationDateTime: string;
  notificationUrl: string;
  clientState: string;
}) {
  return nangoProxyRequestJson({
    operation: "outlook_calendar.subscription.create",
    publicSummary: "Outlook Calendar webhook subscription creation failed",
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
    bodySchema: outlookCalendarSubscriptionCreateBodySchema,
    responseSchema: graphCalendarSubscriptionResponseSchema,
    evidence: {
      connected_provider_account_id: input.connection.connectedProviderAccount.id,
      capability_account_link_id: input.connection.capabilityAccountLinkId,
    },
  });
}

async function renewOutlookCalendarSubscription(input: {
  connection: OutlookCalendarConnectionContext;
  graphSubscriptionId: string;
  expirationDateTime: string;
}) {
  return nangoProxyRequestJson({
    operation: "outlook_calendar.subscription.renew",
    publicSummary: "Outlook Calendar webhook subscription renewal failed",
    providerConfigKey: input.connection.nangoProviderConfigKey,
    connectionId: input.connection.nangoConnectionId,
    method: "patch",
    endpoint: `/v1.0/subscriptions/${encodeURIComponent(input.graphSubscriptionId)}`,
    data: { expirationDateTime: input.expirationDateTime },
    bodySchema: outlookCalendarSubscriptionRenewBodySchema,
    responseSchema: graphCalendarSubscriptionResponseSchema,
    evidence: {
      connected_provider_account_id: input.connection.connectedProviderAccount.id,
      capability_account_link_id: input.connection.capabilityAccountLinkId,
    },
  });
}

async function deleteOutlookCalendarGraphSubscription(input: {
  connection: OutlookCalendarConnectionContext;
  graphSubscriptionId: string;
}) {
  await nangoProxyRequestJson({
    operation: "outlook_calendar.subscription.delete",
    publicSummary: "Outlook Calendar webhook subscription deletion failed",
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

async function deleteOutlookCalendarSubscriptionState(input: {
  db: SupabaseServiceClient;
  connection: OutlookCalendarConnectionContext;
  state: ProviderWebhookSubscription;
}): Promise<void> {
  const graphSubscriptionId = input.state.external_subscription_id?.trim() || null;
  if (graphSubscriptionId) {
    try {
      await deleteOutlookCalendarGraphSubscription({
        connection: input.connection,
        graphSubscriptionId,
      });
    } catch (error) {
      if (!isAlreadyGoneProviderError(error)) throw error;
    }
  }
  await deleteProviderWebhookSubscriptionAndDeliveries(input.db, input.state.id);
}

async function createOrRenewOutlookCalendarSubscription(input: {
  connection: OutlookCalendarConnectionContext;
  graphSubscriptionId: string | null;
  changeType: string;
  resource: string;
  expirationDateTime: string;
  notificationUrl: string;
  clientState: string;
}) {
  if (!input.graphSubscriptionId) return createOutlookCalendarSubscription(input);
  try {
    return await renewOutlookCalendarSubscription({
      connection: input.connection,
      graphSubscriptionId: input.graphSubscriptionId,
      expirationDateTime: input.expirationDateTime,
    });
  } catch (error) {
    const status = providerHttpStatus(error);
    if (status !== 404 && status !== 410) throw error;
    return createOutlookCalendarSubscription(input);
  }
}
