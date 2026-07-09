import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  twilioSmsReceivedEventSchema,
  type TwilioSmsReceivedEvent,
} from "@ai-assistants/phone-contracts/schemas";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { BackendJob } from "@ai-assistants/backend-jobs";
import {
  enqueueRoutedAssistantWorkItem,
} from "../../../product/assistant-work-items/profile-assistant-work-routes";
import {
  loadProviderWebhookDelivery,
  providerWebhookPublicHeaders,
  receiveProviderWebhookNotification,
  type ProviderWebhookAdapter,
  type ProviderWebhookReceiveResult,
} from "../../../integrations/provider-webhooks/substrate";
import {
  providerRuntimeModeForCapabilityLink,
  requireEnabledCapabilityAccountLink,
} from "../../../integrations/provider-runtime";
import { backendApiEnv } from "../../../shared/env";
import { updatePhoneSmsAttemptFromProvider } from "./store";
import { verifyTwilioWebhookSignature } from "../shared/twilio-auth";

const TWILIO_MESSAGING_PROVIDER_KEY = "twilio-messaging";
const TWILIO_MESSAGING_ADAPTER_KEY = "twilio.messaging";
const TWILIO_SMS_RECEIVED_EVENT_TYPE = "twilio.sms.received";
const TWILIO_SMS_ADAPTER_SYNTHETIC_REQUEST_URL =
  "https://twilio-sandbox.invalid/webhooks/twilio/sms";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseTwilioSmsWebhookForm(rawBody: string): TwilioSmsReceivedEvent {
  const form = new URLSearchParams(rawBody);
  const payload = Object.fromEntries(form.entries());
  const messageSid = stringField(payload, "MessageSid") ?? stringField(payload, "SmsSid");
  const from = stringField(payload, "From");
  const to = stringField(payload, "To");
  const body = stringField(payload, "Body");
  if (!messageSid || !from || !to || !body) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "Twilio SMS webhook requires MessageSid, From, To, and Body.",
    );
  }
  return twilioSmsReceivedEventSchema.parse({
    provider: TWILIO_MESSAGING_PROVIDER_KEY,
    messageSid,
    fromPhoneE164: from,
    toPhoneE164: to,
    bodyText: body,
    mediaCount: Number.parseInt(stringField(payload, "NumMedia") ?? "0", 10),
    accountSid: stringField(payload, "AccountSid"),
  });
}

function productStatusFromTwilioMessageStatus(
  status: string,
): "queued" | "sent" | "delivered" | "undelivered" | "failed" | "unknown" {
  const normalized = status.toLowerCase().replaceAll(/[\s_-]+/g, "-");
  if (["queued", "accepted", "scheduled"].includes(normalized)) return "queued";
  if (["sending", "sent"].includes(normalized)) return "sent";
  if (normalized === "delivered") return "delivered";
  if (normalized === "undelivered") return "undelivered";
  if (["failed", "canceled", "cancelled"].includes(normalized)) return "failed";
  return "unknown";
}

export async function receiveTwilioSmsStatusWebhook(input: {
  db: SupabaseServiceClient;
  rawBody: string;
  headers: Headers;
  requestUrl: string;
}): Promise<{ ok: true; handled: boolean; attemptId: string | null }> {
  const form = new URLSearchParams(input.rawBody);
  const payload = Object.fromEntries(form.entries());
  const messageSid = stringField(payload, "MessageSid") ?? stringField(payload, "SmsSid");
  const providerStatus = stringField(payload, "MessageStatus") ?? stringField(payload, "SmsStatus");
  if (!messageSid || !providerStatus) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "Twilio SMS status webhook requires MessageSid and MessageStatus.",
    );
  }
  const attemptResult = await input.db
    .from("phone_sms_attempts")
    .select("id, profile_id")
    .eq("provider", TWILIO_MESSAGING_PROVIDER_KEY)
    .eq("provider_message_sid", messageSid)
    .maybeSingle();
  const attempt = requireSupabaseData(
    `Load SMS attempt for Twilio MessageSid ${messageSid}`,
    attemptResult.data,
    attemptResult.error,
  );
  if (!attempt) return { ok: true, handled: false, attemptId: null };
  const link = await requireEnabledCapabilityAccountLink(input.db, {
    profileId: attempt.profile_id,
    capabilitySlugs: ["phone"],
    providers: [TWILIO_MESSAGING_PROVIDER_KEY],
  });
  verifyTwilioWebhookSignature({
    authMode: providerRuntimeModeForCapabilityLink(link) === "sandbox" ? "sandbox" : "live",
    headers: input.headers,
    requestUrl: input.requestUrl,
    params: payload,
  });
  const status = productStatusFromTwilioMessageStatus(providerStatus);
  await input.db.from("phone_sms_events").upsert(
    {
      profile_id: attempt.profile_id,
      phone_sms_attempt_id: attempt.id,
      provider: TWILIO_MESSAGING_PROVIDER_KEY,
      provider_message_sid: messageSid,
      event_kind: `sms.${status === "unknown" ? "sent" : status}`,
      dedupe_key: `twilio.sms.status:${messageSid}:${providerStatus}`,
      provider_payload: requireJsonObject(payload, "twilio.smsStatusWebhook.payload"),
    },
    { onConflict: "dedupe_key" },
  );
  await updatePhoneSmsAttemptFromProvider(input.db, {
    attemptId: attempt.id,
    sync: {
      providerMessageSid: messageSid,
      providerStatus,
      status,
      deliveredAt: status === "delivered" ? new Date().toISOString() : null,
      failureKind:
        status === "failed" || status === "undelivered" ? `provider_sms_${status}` : null,
      failureMessage:
        status === "failed" || status === "undelivered"
          ? `Twilio reported message status ${providerStatus}.`
          : null,
    },
  });
  return { ok: true, handled: true, attemptId: attempt.id };
}

function configuredFromNumber(link: TableRow<"capability_account_links">): string | null {
  const config = record(link.config);
  const messaging = record(config.messaging);
  const fromConfig = stringField(messaging, "fromNumber");
  if (fromConfig) return fromConfig;
  return backendApiEnv().twilioFromNumber;
}

async function loadInboundSmsCapabilityLink(input: {
  db: SupabaseServiceClient;
  toPhoneE164: string;
}): Promise<TableRow<"capability_account_links">> {
  const result = await input.db
    .from("capability_account_links")
    .select()
    .eq("capability_slug", "phone")
    .eq("provider", TWILIO_MESSAGING_PROVIDER_KEY)
    .eq("status", "enabled");
  const rows = requireSupabaseData(
    "Load Twilio messaging capability links",
    result.data,
    result.error,
  );
  const matches = rows.filter((link) => configuredFromNumber(link) === input.toPhoneE164);
  if (matches.length !== 1) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Expected exactly one enabled Twilio messaging capability link for ${input.toPhoneE164}; found ${matches.length}.`,
    );
  }
  return matches[0]!;
}

export async function receiveTwilioSmsWebhook(input: {
  db: SupabaseServiceClient;
  rawBody: string;
  headers: Headers;
  requestUrl: string;
}): Promise<ProviderWebhookReceiveResult> {
  const event = parseTwilioSmsWebhookForm(input.rawBody);
  const link = await loadInboundSmsCapabilityLink({
    db: input.db,
    toPhoneE164: event.toPhoneE164,
  });
  const auth = verifyTwilioWebhookSignature({
    authMode: providerRuntimeModeForCapabilityLink(link) === "sandbox" ? "sandbox" : "live",
    headers: input.headers,
    requestUrl: input.requestUrl,
    params: Object.fromEntries(new URLSearchParams(input.rawBody).entries()),
  });
  const received = await receiveProviderWebhookNotification(input.db, {
    profileId: link.profile_id,
    capabilityAccountLinkId: link.id,
    providerKey: TWILIO_MESSAGING_PROVIDER_KEY,
    adapterKey: TWILIO_MESSAGING_ADAPTER_KEY,
    deliveryKey: event.messageSid,
    authenticated: auth.authenticated,
    requestHeaders: providerWebhookPublicHeaders(input.headers),
    payload: {
      ...event,
      connectedProviderAccountId: link.connected_provider_account_id,
    },
    priority: 5,
  });
  return {
    ok: true,
    handled: true,
    deliveryId: received.delivery.id,
    backendJobId: received.backendJobId,
    joinedExistingJob: received.joinedExistingJob,
    notifications: 1,
  };
}

async function recordTwilioSmsReceivedAndEnqueueWorkItem(input: {
  db: SupabaseServiceClient;
  profileId: string;
  event: TwilioSmsReceivedEvent;
  connectedProviderAccountId: string | null;
}): Promise<{ workItemId: string | null; routeFound: boolean; joinedExisting: boolean }> {
  const payload = {
    title: `SMS from ${input.event.fromPhoneE164}`,
    detail: input.event.bodyText,
    provider: input.event.provider,
    messageSid: input.event.messageSid,
    fromPhoneE164: input.event.fromPhoneE164,
    toPhoneE164: input.event.toPhoneE164,
    bodyText: input.event.bodyText,
    mediaCount: input.event.mediaCount,
    accountSid: input.event.accountSid,
    connectedProviderAccountId: input.connectedProviderAccountId,
  };
  const routed = await enqueueRoutedAssistantWorkItem(input.db, {
    profileId: input.profileId,
    eventType: TWILIO_SMS_RECEIVED_EVENT_TYPE,
    ...(input.connectedProviderAccountId === null
      ? {}
      : { connectedProviderAccountId: input.connectedProviderAccountId }),
    kind: TWILIO_SMS_RECEIVED_EVENT_TYPE,
    payload,
    dedupeKey: `${TWILIO_SMS_RECEIVED_EVENT_TYPE}:${TWILIO_MESSAGING_PROVIDER_KEY}:${input.event.messageSid}`,
    priority: 20,
  });
  return {
    workItemId: routed.workItem?.id ?? null,
    routeFound: routed.routeFound,
    joinedExisting: routed.joinedExisting,
  };
}

export const twilioMessagingWebhookAdapter: ProviderWebhookAdapter = {
  adapterKey: TWILIO_MESSAGING_ADAPTER_KEY,
  providerKey: TWILIO_MESSAGING_PROVIDER_KEY,
  receive: (input) =>
    receiveTwilioSmsWebhook({
      db: input.db,
      rawBody: input.rawBody ?? "",
      headers: input.headers,
      requestUrl: TWILIO_SMS_ADAPTER_SYNTHETIC_REQUEST_URL,
    }),
  async processDelivery(input: { db: SupabaseServiceClient; job: BackendJob; deliveryId: string }) {
    const delivery = await loadProviderWebhookDelivery(input.db, input.deliveryId);
    const deliveryPayload = record(delivery.payload);
    const event = twilioSmsReceivedEventSchema.parse({
      provider: deliveryPayload.provider,
      messageSid: deliveryPayload.messageSid,
      fromPhoneE164: deliveryPayload.fromPhoneE164,
      toPhoneE164: deliveryPayload.toPhoneE164,
      bodyText: deliveryPayload.bodyText,
      mediaCount: deliveryPayload.mediaCount,
      accountSid: deliveryPayload.accountSid,
    });
    return recordTwilioSmsReceivedAndEnqueueWorkItem({
      db: input.db,
      profileId: input.job.profile_id,
      event,
      connectedProviderAccountId:
        typeof deliveryPayload.connectedProviderAccountId === "string"
          ? deliveryPayload.connectedProviderAccountId
          : null,
    });
  },
  async reconcileSubscription() {
    return { skipped: true, reason: "twilio_phone_number_sms_url_is_configured_by_cli" };
  },
  async reconcileConnection() {
    return { skipped: true, reason: "twilio_phone_number_sms_url_is_configured_by_cli" };
  },
  async processSync() {
    return { skipped: true, reason: "twilio_messaging_has_no_provider_sync" };
  },
};
