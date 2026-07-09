import type { Hono } from "hono";
import { requireJsonObject, requireSupabaseData } from "@ai-assistants/control-db";
import {
  receiveTwilioSmsStatusWebhook,
  receiveTwilioSmsWebhook,
} from "../../capabilities/phone/sms/twilio-webhooks";
import {
  appendPhoneCallEvent,
  appendPhoneCallTranscriptEntry,
  preparePhoneCallGatherTurn,
  terminalizePhoneCallFromGather,
} from "../../capabilities/phone/calls/lifecycle";
import { updatePhoneCallAttemptFromProvider } from "../../capabilities/phone/calls/store";
import {
  buildPhoneCallAnswerTwiML,
  buildPhoneCallTerminalTwiML,
} from "../../capabilities/phone/calls/twiml";
import {
  createPhoneCallTurnToken,
  verifyPhoneCallTurnToken,
} from "../../capabilities/phone/calls/turn-tokens";
import {
  parseTwilioForm,
  readBoundedTwilioWebhookBody,
  stringField,
  twilioWebhookUrl,
  verifyTwilioWebhookSignature,
  withTwilioWebhookInFlight,
  type TwilioWebhookAuthMode,
} from "../../capabilities/phone/shared/twilio-auth";
import {
  providerRuntimeModeForCapabilityLink,
  requireEnabledCapabilityAccountLink,
} from "../../integrations/provider-runtime";
import { controlDb } from "../control-db";

const EMPTY_TWIML_RESPONSE = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>";

function productStatusFromTwilioCallStatus(
  status: string,
): "pending_start" | "starting" | "in_progress" | "completed" | "no_answer" | "failed" | "unknown" {
  const normalized = status.toLowerCase().replaceAll(/[\s_-]+/g, "-");
  if (normalized === "completed") return "completed";
  if (["busy", "no-answer"].includes(normalized)) return "no_answer";
  if (["failed", "canceled", "cancelled"].includes(normalized)) return "failed";
  if (["queued", "initiated", "ringing", "in-progress"].includes(normalized)) return "in_progress";
  return "unknown";
}

async function voiceAuthModeForProfile(profileId: string): Promise<TwilioWebhookAuthMode> {
  const link = await requireEnabledCapabilityAccountLink(controlDb(), {
    profileId,
    capabilitySlugs: ["phone"],
    providers: ["twilio-voice"],
  });
  return providerRuntimeModeForCapabilityLink(link) === "sandbox" ? "sandbox" : "live";
}

export function registerTwilioWebhookRoutes(app: Hono) {
  app.post("/webhooks/twilio/sms", async (c) => {
    return withTwilioWebhookInFlight("twilio.sms.inbound", async () => {
      const rawBody = await readBoundedTwilioWebhookBody(c);
      await receiveTwilioSmsWebhook({
        db: controlDb(),
        rawBody,
        headers: c.req.raw.headers,
        requestUrl: c.req.url,
      });
      return c.body(EMPTY_TWIML_RESPONSE, 200, {
        "Content-Type": "text/xml; charset=utf-8",
      });
    });
  });

  app.post("/webhooks/twilio/sms/status", async (c) => {
    return withTwilioWebhookInFlight("twilio.sms.status", async () => {
      const rawBody = await readBoundedTwilioWebhookBody(c);
      await receiveTwilioSmsStatusWebhook({
        db: controlDb(),
        rawBody,
        headers: c.req.raw.headers,
        requestUrl: c.req.url,
      });
      return c.body(EMPTY_TWIML_RESPONSE, 200, {
        "Content-Type": "text/xml; charset=utf-8",
      });
    });
  });

  app.post("/webhooks/twilio/voice/answer", async (c) => {
    return withTwilioWebhookInFlight("twilio.voice.answer", async () => {
      const rawBody = await readBoundedTwilioWebhookBody(c);
      const payload = parseTwilioForm(rawBody);
      const attemptId = c.req.query("attemptId");
      if (!attemptId) return c.text("attemptId is required.", 400);
      const result = await controlDb()
        .from("phone_call_attempts")
        .select("id, profile_id, call_id, provider_call_sid, opening_line, hold_timeout_seconds")
        .eq("id", attemptId)
        .maybeSingle();
      const attempt = requireSupabaseData(
        `Load phone call attempt ${attemptId} for TwiML answer`,
        result.data,
        result.error,
      );
      if (!attempt) return c.text("Call attempt not found.", 404);
      const authMode = await voiceAuthModeForProfile(attempt.profile_id);
      verifyTwilioWebhookSignature({
        authMode,
        headers: c.req.raw.headers,
        requestUrl: c.req.url,
        params: payload,
      });
      const { token, tokenHash } = createPhoneCallTurnToken();
      const turnIndex = 0;
      const preparedAttempt = await preparePhoneCallGatherTurn(controlDb(), {
        attemptId: attempt.id,
        turnIndex,
        turnTokenHash: tokenHash,
      });
      const event = await appendPhoneCallEvent(controlDb(), {
        attempt: preparedAttempt,
        eventKind: "call.answered",
        dedupeKey: `twilio.voice.answer:${attempt.id}:${stringField(payload, "CallSid") ?? "unknown"}`,
        providerPayload: requireJsonObject(payload, "twilio.voiceAnswerWebhook.payload"),
        turnIndex,
        turnTokenHash: tokenHash,
      });
      await appendPhoneCallTranscriptEntry(controlDb(), {
        attempt: preparedAttempt,
        speaker: "assistant",
        text: attempt.opening_line,
        turnIndex,
        providerEventId: event.id,
      });
      const gatherActionPath = `/webhooks/twilio/voice/gather?attemptId=${attempt.id}&turnIndex=${turnIndex}&turnToken=${encodeURIComponent(token)}`;
      const gatherActionUrl =
        authMode === "sandbox"
          ? new URL(gatherActionPath, c.req.url).toString()
          : twilioWebhookUrl(gatherActionPath);
      const twiml = buildPhoneCallAnswerTwiML({
        openingLine: attempt.opening_line,
        gatherActionUrl,
        timeoutSeconds: Math.min(Math.max(attempt.hold_timeout_seconds, 5), 30),
      });
      return c.body(twiml, 200, {
        "Content-Type": "text/xml; charset=utf-8",
      });
    });
  });

  app.post("/webhooks/twilio/voice/gather", async (c) => {
    return withTwilioWebhookInFlight("twilio.voice.gather", async () => {
      const rawBody = await readBoundedTwilioWebhookBody(c);
      const payload = parseTwilioForm(rawBody);
      const attemptId = c.req.query("attemptId");
      const turnToken = c.req.query("turnToken");
      const turnIndexRaw = c.req.query("turnIndex");
      const turnIndex = turnIndexRaw ? Number.parseInt(turnIndexRaw, 10) : NaN;
      if (!attemptId || !turnToken || !Number.isInteger(turnIndex) || turnIndex < 0) {
        return c.text("attemptId, turnIndex, and turnToken are required.", 400);
      }
      const db = controlDb();
      const result = await db
        .from("phone_call_attempts")
        .select("id, profile_id, call_id, provider_call_sid, turn_index, current_turn_token_hash")
        .eq("id", attemptId)
        .maybeSingle();
      const attempt = requireSupabaseData(
        `Load phone call attempt ${attemptId} for Twilio gather`,
        result.data,
        result.error,
      );
      if (!attempt) return c.text("Call attempt not found.", 404);
      verifyTwilioWebhookSignature({
        authMode: await voiceAuthModeForProfile(attempt.profile_id),
        headers: c.req.raw.headers,
        requestUrl: c.req.url,
        params: payload,
      });
      if (
        attempt.turn_index !== turnIndex ||
        !verifyPhoneCallTurnToken({
          token: turnToken,
          expectedTokenHash: attempt.current_turn_token_hash,
        })
      ) {
        return c.text("Twilio gather turn token is invalid or stale.", 409);
      }

      const speechResult = stringField(payload, "SpeechResult");
      const digits = stringField(payload, "Digits");
      const providerCallSid = stringField(payload, "CallSid") ?? attempt.provider_call_sid;
      const durationSeconds =
        Number.parseInt(stringField(payload, "CallDuration") ?? "", 10) || null;
      const eventKind = speechResult ? "call.speech" : digits ? "call.dtmf" : "call.silence";
      const calleeText = speechResult
        ? speechResult
        : digits
          ? `DTMF digits: ${digits}`
          : "No speech or DTMF input was received.";
      const event = await appendPhoneCallEvent(db, {
        attempt: { ...attempt, provider_call_sid: providerCallSid },
        eventKind,
        dedupeKey: `twilio.voice.gather:${attempt.id}:${turnIndex}:${providerCallSid ?? "unknown"}:${calleeText}`,
        providerPayload: requireJsonObject(payload, "twilio.voiceGatherWebhook.payload"),
        turnIndex,
        turnTokenHash: attempt.current_turn_token_hash,
      });
      await appendPhoneCallTranscriptEntry(db, {
        attempt,
        speaker: speechResult || digits ? "callee" : "system",
        text: calleeText,
        turnIndex,
        providerEventId: event.id,
      });
      const summary = speechResult
        ? `Call recipient said: ${speechResult}`
        : digits
          ? `Call recipient entered DTMF digits: ${digits}`
          : "Call ended after no speech or DTMF input was received.";
      await terminalizePhoneCallFromGather(db, {
        attemptId: attempt.id,
        providerCallSid,
        providerStatus: "gather_completed",
        terminalReason: speechResult || digits ? "gather_result_received" : "gather_no_input",
        summary,
        durationSeconds,
      });
      await appendPhoneCallTranscriptEntry(db, {
        attempt,
        speaker: "assistant",
        text: "Thanks, I have what I need. Goodbye.",
        turnIndex: turnIndex + 1,
      });
      const twiml = buildPhoneCallTerminalTwiML({
        spoken: "Thanks, I have what I need. Goodbye.",
      });
      return c.body(twiml, 200, {
        "Content-Type": "text/xml; charset=utf-8",
      });
    });
  });

  app.post("/webhooks/twilio/voice/status", async (c) => {
    return withTwilioWebhookInFlight("twilio.voice.status", async () => {
      const rawBody = await readBoundedTwilioWebhookBody(c);
      const payload = parseTwilioForm(rawBody);
      const providerCallSid = stringField(payload, "CallSid");
      const providerStatus = stringField(payload, "CallStatus");
      if (!providerCallSid || !providerStatus) {
        return c.text("CallSid and CallStatus are required.", 400);
      }
      const db = controlDb();
      const attemptResult = await db
        .from("phone_call_attempts")
        .select("id, profile_id, call_id, summary, failure_kind, failure_message")
        .eq("provider", "twilio-voice")
        .eq("provider_call_sid", providerCallSid)
        .maybeSingle();
      const attempt = requireSupabaseData(
        `Load phone call attempt for Twilio CallSid ${providerCallSid}`,
        attemptResult.data,
        attemptResult.error,
      );
      verifyTwilioWebhookSignature({
        authMode: attempt ? await voiceAuthModeForProfile(attempt.profile_id) : "live",
        headers: c.req.raw.headers,
        requestUrl: c.req.url,
        params: payload,
      });
      if (!attempt) {
        return c.body(EMPTY_TWIML_RESPONSE, 200, {
          "Content-Type": "text/xml; charset=utf-8",
        });
      }
      const productStatus = productStatusFromTwilioCallStatus(providerStatus);
      await db.from("phone_call_events").upsert(
        {
          profile_id: attempt.profile_id,
          phone_call_attempt_id: attempt.id,
          call_id: attempt.call_id,
          provider: "twilio-voice",
          provider_call_sid: providerCallSid,
          event_kind:
            productStatus === "completed" || productStatus === "no_answer"
              ? "call.ended"
              : productStatus === "failed"
                ? "call.error"
                : "call.started",
          dedupe_key: `twilio.voice.status:${providerCallSid}:${providerStatus}`,
          provider_payload: requireJsonObject(payload, "twilio.voiceStatusWebhook.payload"),
        },
        { onConflict: "dedupe_key" },
      );
      await updatePhoneCallAttemptFromProvider(db, {
        attemptId: attempt.id,
        sync: {
          providerCallSid,
          providerParentCallSid: stringField(payload, "ParentCallSid"),
          providerStatus,
          status: productStatus,
          endedAt:
            productStatus === "completed" || productStatus === "no_answer" || productStatus === "failed"
              ? new Date().toISOString()
              : null,
          durationSeconds: Number.parseInt(stringField(payload, "CallDuration") ?? "", 10) || null,
          terminalReason:
            productStatus === "completed" || productStatus === "no_answer" || productStatus === "failed"
              ? providerStatus
              : null,
          summary: attempt.summary,
          failureKind: productStatus === "failed" ? "provider_call_failed" : attempt.failure_kind,
          failureMessage:
            productStatus === "failed"
              ? `Twilio reported call status ${providerStatus}.`
              : attempt.failure_message,
        },
      });
      return c.body(EMPTY_TWIML_RESPONSE, 200, {
        "Content-Type": "text/xml; charset=utf-8",
      });
    });
  });
}
