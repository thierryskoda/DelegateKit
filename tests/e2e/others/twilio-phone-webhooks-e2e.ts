#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BackendJob } from "@ai-assistants/backend-jobs";
import { backendJobRowSchema } from "@ai-assistants/control-plane-contracts";
import { requireSupabaseData, type SupabaseServiceClient } from "@ai-assistants/control-db";
import { phoneToolContracts } from "@ai-assistants/phone-contracts/contracts";
import type { PhoneCallBrief } from "@ai-assistants/phone-contracts/schemas";
import { twilioMessagingWebhookAdapter } from "../../../apps/backend/src/test-support/capabilities/phone";
import {
  processProviderWebhookJob,
  registerProviderWebhookAdapter,
} from "../../../apps/backend/src/test-support/provider-webhooks";
import { approveAndExecuteProfileAction } from "../helpers/capability/approve-profile-action";
import { enableTestingProviderSandboxBinding } from "../helpers/provider-runtime/testing-provider-runtime";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { startBackend } from "../helpers/processes/start-backend";
import { seedTestingTrustedE2eChannel } from "../helpers/fixtures/testing-trusted-channel-fixture";
import { E2E_TEST_CHANNEL_DEFAULT_PEER_ID } from "../helpers/run/e2e-run";
import { useE2eDb } from "../helpers/db/e2e-db";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import {
  buildCapabilityToolRequest,
  executeCapabilityTool,
  parseCapabilityToolOutput,
  withTrustedChannel,
} from "../helpers/run/execute-capability-backend-tool";
import { TESTING_AGENT_ID } from "../helpers/run/testing-launch-support";
import { expectPersistedProseJudgePass } from "../helpers/agent/persisted-prose-judge";

const PROFILE_ID = "testing";
const EVENT_TYPE = "twilio.sms.received";
const TESTING_TWILIO_TO = "+14165550100";

function twilioSmsWebhookBody(input: {
  marker: string;
  messageSid: string;
  fromPhoneE164: string;
  toPhoneE164: string;
}): string {
  return new URLSearchParams({
    AccountSid: "AC00000000000000000000000000000000",
    MessageSid: input.messageSid,
    SmsSid: input.messageSid,
    From: input.fromPhoneE164,
    To: input.toPhoneE164,
    Body: `Yes, we can do Tuesday evening. Please text back the party name. Ref ${input.marker}.`,
    NumMedia: "0",
  }).toString();
}

function sandboxCallBrief(marker: string): PhoneCallBrief {
  return {
    toPhoneE164: "+14165550123",
    country: "CA",
    verifiedPhoneSourceUrl: "https://www.crosta.ca/",
    verifiedPhoneSourceLabel: "Restaurant public website",
    purpose: `Call a restaurant to ask about a table for two next Tuesday evening. E2E marker: ${marker}.`,
    openingLine:
      "Hi, this is Ava calling for John. I am checking whether you have a table for two next Tuesday evening.",
    disclosureName: "Ava",
    disclosureRelationship: "John's assistant",
    authorizedFacts: [
      "John is looking for a table for two.",
      "Tuesday evening is the preferred timing.",
      "This is a sandbox provider run and no real call is placed.",
    ],
    decisionBounds: ["Do not provide personal details.", "Do not make a booking."],
    stopConditions: ["End if personal details are requested.", "End after one response."],
    resultExpectations: ["Whether a table is available.", "Any available time windows."],
    maxDurationSeconds: 120,
    holdTimeoutSeconds: 30,
    retryPolicy: { maxAttempts: 1 },
  };
}

async function startApprovedSandboxPhoneCall(input: {
  db: SupabaseServiceClient;
  marker: string;
}): Promise<{ actionId: string; attemptId: string }> {
  const request = withTrustedChannel(
    buildCapabilityToolRequest({
      capabilityId: "phone",
      agentId: TESTING_AGENT_ID,
      toolName: "phone_call_start",
      params: { callBrief: sandboxCallBrief(input.marker) },
    }),
    "phone",
  );
  const result = await executeCapabilityTool(input.db, request);
  const startData = parseCapabilityToolOutput(result, phoneToolContracts, "phone_call_start") as {
    write: { actionId: string };
  };
  const actionResult = await input.db
    .from("profile_actions")
    .select()
    .eq("id", startData.write.actionId)
    .single();
  const action = requireSupabaseData(
    "Load phone call action",
    actionResult.data,
    actionResult.error,
  );
  const profileResult = await input.db
    .from("profiles")
    .select("user_id")
    .eq("id", TESTING_AGENT_ID)
    .single();
  const profile = requireSupabaseData(
    "Load testing profile user",
    profileResult.data,
    profileResult.error,
  );
  assert.ok(profile.user_id);
  await approveAndExecuteProfileAction({
    db: input.db,
    action,
    decisionUserId: profile.user_id,
  });
  const attemptResult = await input.db
    .from("phone_call_attempts")
    .select("id")
    .eq("profile_action_id", startData.write.actionId)
    .single();
  const attempt = requireSupabaseData(
    "Load phone call attempt",
    attemptResult.data,
    attemptResult.error,
  );
  return { actionId: startData.write.actionId, attemptId: attempt.id };
}

async function loadDelivery(input: { db: SupabaseServiceClient; messageSid: string }) {
  const result = await input.db
    .from("provider_webhook_deliveries")
    .select()
    .eq("provider_key", "twilio-messaging")
    .eq("adapter_key", "twilio.messaging")
    .eq("delivery_key", input.messageSid)
    .single();
  return requireSupabaseData("Load Twilio SMS webhook delivery", result.data, result.error);
}

async function loadBackendJob(db: SupabaseServiceClient, jobId: string): Promise<BackendJob> {
  const result = await db.from("backend_jobs").select().eq("id", jobId).single();
  const row = backendJobRowSchema.parse(
    requireSupabaseData(`Load backend job ${jobId}`, result.data, result.error),
  );
  return row as BackendJob;
}

async function loadWorkItems(input: { db: SupabaseServiceClient; messageSid: string }) {
  const result = await input.db
    .from("assistant_work_items")
    .select()
    .eq("profile_id", PROFILE_ID)
    .eq("kind", EVENT_TYPE)
    .eq("dedupe_key", `${EVENT_TYPE}:twilio-messaging:${input.messageSid}`);
  return requireSupabaseData("Load Twilio SMS received work items", result.data, result.error);
}

function workItemPayload(
  row: Awaited<ReturnType<typeof loadWorkItems>>[number],
): Record<string, unknown> {
  const payload = row.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Twilio SMS work item payload must be an object: ${JSON.stringify(payload)}`);
  }
  return payload;
}

test("Twilio SMS webhook records delivery and routes inbound SMS to assistant work", async (t) => {
  const run = await createE2eRun(t, { id: "twilio-phone-sms-webhook" });
  const supabase = await attachE2eSupabase(run);
  const backend = await startBackend(run, { supabase });
  const db = await useE2eDb();
  registerProviderWebhookAdapter(twilioMessagingWebhookAdapter);
  await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: "phone",
    provider: "twilio-messaging",
  });

  const marker = createMarker("twilio-phone-sms-webhook");
  const messageSid = `SM${marker.replaceAll("-", "").slice(0, 32).padEnd(32, "0")}`;
  const body = twilioSmsWebhookBody({
    marker,
    messageSid,
    fromPhoneE164: "+14165550188",
    toPhoneE164: TESTING_TWILIO_TO,
  });

  run.cleanup.add(async () => {
    const deletedWorkItems = await db
      .from("assistant_work_items")
      .delete()
      .eq("dedupe_key", `${EVENT_TYPE}:twilio-messaging:${messageSid}`);
    if (deletedWorkItems.error) throw deletedWorkItems.error;
    const delivery = await db
      .from("provider_webhook_deliveries")
      .select("backend_job_id")
      .eq("provider_key", "twilio-messaging")
      .eq("adapter_key", "twilio.messaging")
      .eq("delivery_key", messageSid)
      .maybeSingle();
    if (delivery.error) throw delivery.error;
    const deletedDelivery = await db
      .from("provider_webhook_deliveries")
      .delete()
      .eq("provider_key", "twilio-messaging")
      .eq("adapter_key", "twilio.messaging")
      .eq("delivery_key", messageSid);
    if (deletedDelivery.error) throw deletedDelivery.error;
    if (delivery.data?.backend_job_id) {
      const deletedJob = await db
        .from("backend_jobs")
        .delete()
        .eq("id", delivery.data.backend_job_id);
      if (deletedJob.error) throw deletedJob.error;
    }
  });

  const response = await fetch(`${backend.baseUrl}/webhooks/twilio/sms`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  assert.equal(response.status, 200);
  assert.equal(
    await response.text(),
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
  );

  const delivery = await loadDelivery({ db, messageSid });
  assert.equal(delivery.authenticated, false);
  assert.ok(delivery.backend_job_id);
  assert.equal(delivery.status, "queued");

  const job = await loadBackendJob(db, delivery.backend_job_id);
  await processProviderWebhookJob(db, job);

  const workItems = await loadWorkItems({ db, messageSid });
  assert.equal(workItems.length, 1);
  assert.equal(workItems[0]!.status, "pending");
  const payload = workItemPayload(workItems[0]!);
  assert.equal(payload["fromPhoneE164"], "+14165550188");
  assert.equal(payload["messageSid"], messageSid);
  assert.ok(Array.isArray(payload["guidanceIds"]));
  assert.ok(payload["guidanceIds"].includes("phone_tools"));
  assert.ok(payload["guidanceIds"].includes("work_items"));
});

test("Twilio Voice webhooks gather one bounded call result and reject replay", async (t) => {
  const run = await createE2eRun(t, { id: "twilio-phone-webhooks" });
  const supabase = await attachE2eSupabase(run);
  const backend = await startBackend(run, { supabase });
  const db = await useE2eDb();
  await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: "phone",
    provider: "twilio-voice",
  });
  const marker = createMarker("twilio-phone-voice-webhook");
  const trustedChannel = await seedTestingTrustedE2eChannel({
    db,
    profileId: TESTING_AGENT_ID,
    peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
    marker,
    purpose: "twilio-phone-voice-webhook-e2e",
  });
  run.cleanup.add(() => trustedChannel.cleanup());

  const { actionId, attemptId } = await startApprovedSandboxPhoneCall({ db, marker });
  const callSid = `CA${marker.replaceAll("-", "").slice(0, 32).padEnd(32, "0")}`;
  await db
    .from("phone_call_attempts")
    .update({
      status: "in_progress",
      provider_call_sid: callSid,
      provider_status: "in-progress",
      ended_at: null,
      summary: null,
      terminal_reason: null,
      failure_kind: null,
      failure_message: null,
    })
    .eq("id", attemptId);
  run.cleanup.add(async () => {
    await db.from("phone_call_attempts").delete().eq("id", attemptId);
    await db.from("profile_actions").delete().eq("id", actionId);
  });

  const answerBody = new URLSearchParams({
    CallSid: callSid,
    CallStatus: "in-progress",
    From: "+14165550123",
    To: TESTING_TWILIO_TO,
  }).toString();
  const answer = await fetch(
    `${backend.baseUrl}/webhooks/twilio/voice/answer?attemptId=${attemptId}`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: answerBody,
    },
  );
  assert.equal(answer.status, 200);
  const answerTwiML = await answer.text();
  assert.match(answerTwiML, /<Gather input="speech dtmf"/);
  const actionMatch = answerTwiML.match(/action="([^"]+)"/);
  assert.ok(actionMatch?.[1], `Expected Gather action URL in ${answerTwiML}`);
  const gatherUrl = actionMatch[1].replaceAll("&amp;", "&");

  const gatherBody = new URLSearchParams({
    CallSid: callSid,
    SpeechResult: "We have a table for two at eight fifteen.",
    Confidence: "0.93",
    CallDuration: "42",
  }).toString();
  const gather = await fetch(gatherUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: gatherBody,
  });
  assert.equal(gather.status, 200);
  assert.match(await gather.text(), /<Hangup\/>/);

  const replay = await fetch(gatherUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: gatherBody,
  });
  assert.equal(replay.status, 409);

  const status = await fetch(`${backend.baseUrl}/webhooks/twilio/voice/status`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      CallSid: callSid,
      CallStatus: "completed",
      CallDuration: "43",
    }).toString(),
  });
  assert.equal(status.status, 200);

  const attemptResult = await db.from("phone_call_attempts").select().eq("id", attemptId).single();
  const attempt = requireSupabaseData(
    "Load gathered phone call attempt",
    attemptResult.data,
    attemptResult.error,
  );
  assert.equal(attempt.status, "completed");

  const events = await db
    .from("phone_call_events")
    .select("event_kind")
    .eq("phone_call_attempt_id", attemptId);
  const eventKinds = (events.data ?? []).map((event) => event.event_kind);
  assert.ok(eventKinds.includes("call.answered"));
  assert.ok(eventKinds.includes("call.speech"));
  assert.ok(eventKinds.includes("call.ended"));

  const transcript = await db
    .from("phone_call_transcript_entries")
    .select("speaker, text")
    .eq("phone_call_attempt_id", attemptId);
  const transcriptRows = transcript.data ?? [];
  assert.ok(transcriptRows.some((entry) => entry.speaker === "callee"));
  await expectPersistedProseJudgePass({
    id: "twilio-phone-webhook-summary",
    run,
    marker,
    purpose: "Judge whether the persisted phone call summary reflects gathered callee speech.",
    sourceEvidence: {
      gatheredSpeech: "We have a table for two at eight fifteen.",
      transcriptRows,
      callStatus: "completed",
    },
    persistedProse: {
      attemptSummary: attempt.summary,
    },
    criteria: [
      "The summary reflects that the callee said a table for two is available.",
      "The summary preserves the offered time of eight fifteen.",
      "The summary does not invent a confirmed booking, payment, personal details, or unrelated call outcome.",
    ],
    failIf:
      "the summary omits the available table for two, omits or changes the eight fifteen time, or invents unsupported booking details.",
  });
});
