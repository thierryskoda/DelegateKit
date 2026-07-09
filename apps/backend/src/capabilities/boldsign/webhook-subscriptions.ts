import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { backendApiEnv } from "../../shared/env";
import {
  deleteProviderWebhookSubscriptionAndDeliveries,
  enqueueProviderWebhookSubscriptionReconcile,
  listProviderWebhookSubscriptionsForConnectedAccount,
  type ProviderWebhookSubscriptionReconcileEnqueueResult,
  upsertProviderWebhookSubscription,
} from "../../integrations/provider-webhooks/substrate";
import {
  BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY,
  BOLDSIGN_WEBHOOK_EVENT_SCOPE,
  BOLDSIGN_WEBHOOK_PROVIDER_KEY,
  BOLDSIGN_WEBHOOK_RECONCILE_PRIORITY,
  BOLDSIGN_WEBHOOK_RESOURCE_TYPE,
  boldSignWebhookStateSchema,
  type BoldSignWebhookState,
} from "./webhook-types";

type BoldSignWebhookConnection = {
  link: TableRow<"capability_account_links">;
  account: TableRow<"connected_provider_accounts">;
};

function boldSignWebhookPublicUrl(): string {
  const base = backendApiEnv().backendPublicUrl;
  return `${base}/webhooks/boldsign`;
}

function isDesiredBoldSignWebhookSubscription(input: {
  row: { resource_type: string; resource_id: string; event_scope: string };
  connectedProviderAccountId: string;
}): boolean {
  return (
    input.row.resource_type === BOLDSIGN_WEBHOOK_RESOURCE_TYPE &&
    input.row.resource_id === input.connectedProviderAccountId &&
    input.row.event_scope === BOLDSIGN_WEBHOOK_EVENT_SCOPE
  );
}

async function requireBoldSignWebhookConnectionByConnectedProviderAccountId(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<BoldSignWebhookConnection> {
  const connectionResult = await db
    .from("connected_provider_accounts")
    .select()
    .eq("id", connectedProviderAccountId)
    .maybeSingle();
  const connection = requireSupabaseData(
    "Load BoldSign provider connection",
    connectionResult.data,
    connectionResult.error,
  );
  const bindingsResult = await db
    .from("capability_account_links")
    .select()
    .eq("connected_provider_account_id", connection.id)
    .eq("status", "enabled");
  const bindings = requireSupabaseRows(
    "Load BoldSign provider connection bindings",
    bindingsResult.data,
    bindingsResult.error,
  );
  const binding = bindings[0];
  if (!binding || bindings.length !== 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `BoldSign provider connection ${connection.id} has ${bindings.length} active capability bindings; expected exactly one.`,
    );
  }
  if (binding.capability_slug !== "boldsign" || binding.provider !== "boldsign") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Provider connection ${connection.id} is not bound to a BoldSign capability instance.`,
    );
  }
  return { link: binding, account: connection };
}

async function upsertBoldSignWebhookSubscription(
  db: SupabaseServiceClient,
  input: BoldSignWebhookConnection,
): Promise<BoldSignWebhookState> {
  const rows = await listProviderWebhookSubscriptionsForConnectedAccount({
    db,
    connectedProviderAccountId: input.account.id,
    adapterKey: BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY,
  });
  for (const row of rows) {
    if (isDesiredBoldSignWebhookSubscription({ row, connectedProviderAccountId: input.account.id })) {
      continue;
    }
    await deleteProviderWebhookSubscriptionAndDeliveries(db, row.id);
  }
  const state = await upsertProviderWebhookSubscription(db, {
    profileId: input.account.profile_id,
    capabilityAccountLinkId: input.link.id,
    connectedProviderAccountId: input.account.id,
    providerKey: BOLDSIGN_WEBHOOK_PROVIDER_KEY,
    adapterKey: BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY,
    resourceType: BOLDSIGN_WEBHOOK_RESOURCE_TYPE,
    resourceId: input.account.id,
    eventScope: BOLDSIGN_WEBHOOK_EVENT_SCOPE,
    status: "active",
    providerState: {
      accountEmail: input.account.account_email,
      credentialKind: "backend_secret",
      managedCredential: "BOLDSIGN_API_KEY",
      webhookUrl: boldSignWebhookPublicUrl(),
    },
    lastErrorCode: null,
    lastErrorMessage: null,
  });
  return boldSignWebhookStateSchema.parse(state);
}

export async function loadBoldSignWebhookSubscriptionForConnectedAccount(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<BoldSignWebhookState> {
  const rows = await listProviderWebhookSubscriptionsForConnectedAccount({
    db,
    connectedProviderAccountId,
    adapterKey: BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY,
  });
  const state = rows.find((row) =>
    isDesiredBoldSignWebhookSubscription({ row, connectedProviderAccountId }),
  );
  if (!state) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `BoldSign provider connection ${connectedProviderAccountId} has no webhook subscription row.`,
    );
  }
  return boldSignWebhookStateSchema.parse(state);
}

export async function reconcileBoldSignWebhookSubscription(
  db: SupabaseServiceClient,
  connectedProviderAccountId: string,
): Promise<{ subscriptionId: string; webhookUrl: string }> {
  const connection = await requireBoldSignWebhookConnectionByConnectedProviderAccountId(
    db,
    connectedProviderAccountId,
  );
  const subscription = await upsertBoldSignWebhookSubscription(db, connection);
  return { subscriptionId: subscription.id, webhookUrl: boldSignWebhookPublicUrl() };
}

export async function enqueueBoldSignWebhookReconcile(
  db: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string;
    connectedProviderAccountId: string;
  },
): Promise<ProviderWebhookSubscriptionReconcileEnqueueResult> {
  return enqueueProviderWebhookSubscriptionReconcile(db, {
    profileId: input.profileId,
    capabilityAccountLinkId: input.capabilityAccountLinkId,
    connectedProviderAccountId: input.connectedProviderAccountId,
    adapterKey: BOLDSIGN_SIGNATURE_WEBHOOK_ADAPTER_KEY,
    priority: BOLDSIGN_WEBHOOK_RECONCILE_PRIORITY,
    dedupeKey: `provider.webhook.subscription.reconcile:boldsign.signature_request:${input.connectedProviderAccountId}`,
  });
}
