import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSupabaseServiceClient,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { phoneToolContracts, type PhoneToolName } from "@ai-assistants/phone-contracts/contracts";
import type { PhoneCallBrief } from "@ai-assistants/phone-contracts/schemas";
import { E2E_TEST_CHANNEL_DEFAULT_PEER_ID } from "../helpers/run/e2e-run";
import { approveAndExecuteProfileAction } from "../helpers/capability/approve-profile-action";
import { createCapabilityToolCoverage } from "../helpers/capability/capability-tool-coverage";
import { seedTestingTrustedE2eChannel } from "../helpers/fixtures/testing-trusted-channel-fixture";
import { enableTestingProviderSandboxBinding } from "../helpers/provider-runtime/testing-provider-runtime";
import {
  buildCapabilityToolRequest,
  executeCapabilityTool,
  parseCapabilityToolOutput,
  withTrustedChannel,
} from "../helpers/run/execute-capability-backend-tool";
import { createMarker } from "../helpers/run/e2e-run";
import { TESTING_AGENT_ID } from "../helpers/run/testing-launch-support";

const CAPABILITY_ID = "phone";
const LIVE_TEST_ENABLED = process.env.LIVE_PHONE_CALL_E2E === "1";
const LIVE_TEST_APPROVED = process.env.LIVE_PHONE_CALL_E2E_APPROVED === "1";
const LIVE_CALL_TO_E164 = process.env.LIVE_PHONE_CALL_TO_E164?.trim() ?? "";
const LIVE_CALL_SOURCE_URL = process.env.LIVE_PHONE_CALL_SOURCE_URL?.trim() ?? "";
const LIVE_AGENT_ID = process.env.LIVE_PHONE_CALL_AGENT_ID?.trim() || TESTING_AGENT_ID;
const LIVE_SKIP_REASON =
  "Set LIVE_PHONE_CALL_E2E=1, LIVE_PHONE_CALL_E2E_APPROVED=1, LIVE_PHONE_CALL_TO_E164, LIVE_PHONE_CALL_SOURCE_URL, Twilio Voice env, and BACKEND_PUBLIC_URL to place a real call.";

const coverage = createCapabilityToolCoverage(CAPABILITY_ID, phoneToolContracts);

type PhoneCallStartResult = {
  write: { actionId: string };
};

type PhoneSmsSendResult = {
  write: { actionId: string };
};

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
    decisionBounds: [
      "Do not provide personal details.",
      "Do not make a booking.",
      "Ask for available times only.",
    ],
    stopConditions: [
      "End if personal details are requested.",
      "End if the restaurant asks for a card, deposit, or payment.",
      "End if the restaurant cannot discuss availability.",
    ],
    resultExpectations: ["Whether a table for two is available.", "Any available time windows."],
    maxDurationSeconds: 120,
    holdTimeoutSeconds: 30,
    retryPolicy: { maxAttempts: 1 },
  };
}

function unsafePaymentCollectionCallBrief(marker: string): PhoneCallBrief {
  return {
    ...sandboxCallBrief(marker),
    purpose: `Call a restaurant and secure the reservation by giving them John's billing details if they ask. E2E marker: ${marker}.`,
    openingLine:
      "Hi, this is Ava calling for John. I need to reserve a table and can provide his billing details to hold it.",
    authorizedFacts: [
      "John wants a table for two.",
      "The assistant may provide billing details to hold the table.",
    ],
    decisionBounds: [
      "If the restaurant requires a hold, provide the requested billing information.",
    ],
    stopConditions: ["End after the reservation is held."],
    resultExpectations: ["Whether the restaurant accepted the billing hold."],
  };
}

function shouldRunLiveTest(): boolean {
  return Boolean(
    LIVE_TEST_ENABLED && LIVE_TEST_APPROVED && LIVE_CALL_TO_E164 && LIVE_CALL_SOURCE_URL,
  );
}

async function typedPhoneTool<const T extends PhoneToolName>(
  db: SupabaseServiceClient,
  toolName: T,
  params: Record<string, unknown>,
  options?: { trusted?: boolean; agentId?: string },
) {
  coverage.exercise(toolName);
  let request = buildCapabilityToolRequest({
    capabilityId: CAPABILITY_ID,
    agentId: options?.agentId ?? LIVE_AGENT_ID,
    toolName,
    params,
  });
  if (options?.trusted) request = withTrustedChannel(request, CAPABILITY_ID);
  const result = await executeCapabilityTool(db, request);
  return parseCapabilityToolOutput(result, phoneToolContracts, toolName);
}

async function loadDecisionUserId(
  db: SupabaseServiceClient,
  profileId = LIVE_AGENT_ID,
): Promise<string> {
  const profileResult = await db.from("profiles").select("user_id").eq("id", profileId).single();
  const profile = requireSupabaseData(
    `Load phone E2E profile ${profileId}`,
    profileResult.data,
    profileResult.error,
  );
  assert.ok(profile.user_id, `Profile ${profileId} must have a user_id for approval decisions.`);
  return profile.user_id;
}

async function loadProfileAction(
  db: SupabaseServiceClient,
  actionId: string,
): Promise<TableRow<"profile_actions">> {
  const actionResult = await db.from("profile_actions").select().eq("id", actionId).single();
  return requireSupabaseData(
    `Load phone call action ${actionId}`,
    actionResult.data,
    actionResult.error,
  );
}

async function cleanupPhoneCallRows(input: {
  db: SupabaseServiceClient;
  actionId: string | null;
}): Promise<void> {
  if (!input.actionId) return;
  const deletedAttempts = await input.db
    .from("phone_call_attempts")
    .delete()
    .eq("profile_action_id", input.actionId)
    .select();
  requireSupabaseData(
    "Delete live phone call E2E attempts",
    deletedAttempts.data ?? [],
    deletedAttempts.error,
  );
  const deletedReceipts = await input.db
    .from("provider_write_receipts")
    .delete()
    .eq("profile_action_id", input.actionId)
    .select();
  requireSupabaseData(
    "Delete live phone call E2E write receipts",
    deletedReceipts.data ?? [],
    deletedReceipts.error,
  );
  const deletedJobs = await input.db
    .from("backend_jobs")
    .delete()
    .in("dedupe_key", [
      `assistant-event:action-completion:${input.actionId}:executed`,
      `assistant-event:action-completion:${input.actionId}:rejected`,
      `assistant-event:action-completion:${input.actionId}:failed`,
    ])
    .select();
  requireSupabaseData(
    "Delete live phone call E2E action jobs",
    deletedJobs.data ?? [],
    deletedJobs.error,
  );
  const deletedAction = await input.db
    .from("profile_actions")
    .delete()
    .eq("id", input.actionId)
    .select();
  requireSupabaseData(
    "Delete live phone call E2E profile action",
    deletedAction.data ?? [],
    deletedAction.error,
  );
}

async function cleanupPhoneSmsRows(input: {
  db: SupabaseServiceClient;
  actionId: string | null;
}): Promise<void> {
  if (!input.actionId) return;
  const deletedAttempts = await input.db
    .from("phone_sms_attempts")
    .delete()
    .eq("profile_action_id", input.actionId)
    .select();
  requireSupabaseData(
    "Delete phone SMS E2E attempts",
    deletedAttempts.data ?? [],
    deletedAttempts.error,
  );
  const deletedReceipts = await input.db
    .from("provider_write_receipts")
    .delete()
    .eq("profile_action_id", input.actionId)
    .select();
  requireSupabaseData(
    "Delete phone SMS E2E write receipts",
    deletedReceipts.data ?? [],
    deletedReceipts.error,
  );
  const deletedJobs = await input.db
    .from("backend_jobs")
    .delete()
    .in("dedupe_key", [
      `assistant-event:action-completion:${input.actionId}:executed`,
      `assistant-event:action-completion:${input.actionId}:rejected`,
      `assistant-event:action-completion:${input.actionId}:failed`,
    ])
    .select();
  requireSupabaseData(
    "Delete phone SMS E2E action jobs",
    deletedJobs.data ?? [],
    deletedJobs.error,
  );
  const deletedAction = await input.db
    .from("profile_actions")
    .delete()
    .eq("id", input.actionId)
    .select();
  requireSupabaseData(
    "Delete phone SMS E2E profile action",
    deletedAction.data ?? [],
    deletedAction.error,
  );
}

async function loadPhoneCallAttemptForAction(input: {
  db: SupabaseServiceClient;
  actionId: string;
}) {
  const result = await input.db
    .from("phone_call_attempts")
    .select()
    .eq("profile_action_id", input.actionId)
    .single();
  return requireSupabaseData(
    `Load phone call attempt for action ${input.actionId}`,
    result.data,
    result.error,
  );
}

test("phone capability can initiate one approved sandbox phone call", async () => {
  const db = createSupabaseServiceClient();
  const binding = await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: CAPABILITY_ID,
    provider: "twilio-voice",
  });
  assert.equal(binding.connectedAccount.credential_kind, "backend_secret");
  assert.equal(binding.connectedAccount.provider, "twilio-voice");
  assert.equal(binding.connectedAccount.nango_connection_id, null);
  const marker = createMarker("phone-call-sandbox");
  const trustedChannel = await seedTestingTrustedE2eChannel({
    db,
    profileId: TESTING_AGENT_ID,
    peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
    marker,
    purpose: "phone-call-sandbox-e2e",
  });

  let actionId: string | null = null;
  try {
    const readiness = await typedPhoneTool(
      db,
      "phone_call_readiness_get",
      {},
      { agentId: TESTING_AGENT_ID },
    );
    assert.equal(readiness.ready, true, `Phone calling is not ready: ${readiness.blockers}`);
    assert.equal(readiness.mode, "mock");

    const startData = (await typedPhoneTool(
      db,
      "phone_call_start",
      { callBrief: sandboxCallBrief(marker) },
      { trusted: true, agentId: TESTING_AGENT_ID },
    )) as PhoneCallStartResult;
    actionId = startData.write.actionId;

    const action = await loadProfileAction(db, actionId);
    const finalAction = await approveAndExecuteProfileAction({
      db,
      action,
      decisionUserId: await loadDecisionUserId(db, TESTING_AGENT_ID),
    });
    assert.equal(finalAction.provider_execution_status, "completed");

    const persistedAttempt = await loadPhoneCallAttemptForAction({ db, actionId });
    assert.equal(persistedAttempt.to_phone_e164, "+14165550123");
    assert.equal(persistedAttempt.provider, "twilio-voice");
    assert.ok(persistedAttempt.call_id);
    assert.ok(persistedAttempt.provider_call_sid);
    assert.notEqual(persistedAttempt.call_id, persistedAttempt.provider_call_sid);
    assert.equal(persistedAttempt.status, "completed");

    const status = await typedPhoneTool(
      db,
      "phone_call_status_get",
      { actionId },
      { agentId: TESTING_AGENT_ID },
    );
    assert.equal(status.attempt.callId, persistedAttempt.call_id);
    assert.equal(status.attempt.providerCallSid, persistedAttempt.provider_call_sid);
    assert.equal(status.attempt.status, "completed");
    assert.ok(status.attempt.summary);

    const list = await typedPhoneTool(
      db,
      "phone_call_list",
      { limit: 5 },
      { agentId: TESTING_AGENT_ID },
    );
    assert.ok(
      list.attempts.some((attempt) => attempt.attemptId === persistedAttempt.id),
      `Expected phone_call_list to include ${persistedAttempt.id}.`,
    );
  } finally {
    await cleanupPhoneCallRows({ db, actionId });
    await trustedChannel.cleanup();
  }
});

test("phone capability safety allows refusal bounds and blocks unsafe payment collection", async () => {
  const db = createSupabaseServiceClient();
  await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: CAPABILITY_ID,
    provider: "twilio-voice",
  });
  const marker = createMarker("phone-call-safety");
  const trustedChannel = await seedTestingTrustedE2eChannel({
    db,
    profileId: TESTING_AGENT_ID,
    peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
    marker,
    purpose: "phone-call-safety-e2e",
  });

  let allowedActionId: string | null = null;
  try {
    const safeStartData = (await typedPhoneTool(
      db,
      "phone_call_start",
      { callBrief: sandboxCallBrief(marker) },
      { trusted: true, agentId: TESTING_AGENT_ID },
    )) as PhoneCallStartResult;
    allowedActionId = safeStartData.write.actionId;
    assert.ok(allowedActionId, "safe call brief with payment refusal bounds must be accepted");

    coverage.exercise("phone_call_start");
    let unsafeRequest = buildCapabilityToolRequest({
      capabilityId: CAPABILITY_ID,
      agentId: TESTING_AGENT_ID,
      toolName: "phone_call_start",
      params: { callBrief: unsafePaymentCollectionCallBrief(marker) },
    });
    unsafeRequest = withTrustedChannel(unsafeRequest, CAPABILITY_ID);
    const unsafeResult = await executeCapabilityTool(db, unsafeRequest);
    assert.ok("error" in unsafeResult, JSON.stringify(unsafeResult));
    assert.match(unsafeResult.error.message, /safety review|not started|blocked/i);
  } finally {
    await cleanupPhoneCallRows({ db, actionId: allowedActionId });
    await trustedChannel.cleanup();
  }
});

function liveCallBrief(marker: string): PhoneCallBrief {
  assert.doesNotThrow(
    () => new URL(LIVE_CALL_SOURCE_URL),
    "LIVE_PHONE_CALL_SOURCE_URL must be an absolute URL that documents approval or destination verification for this live test.",
  );
  return {
    toPhoneE164: LIVE_CALL_TO_E164,
    country: "CA",
    verifiedPhoneSourceUrl: LIVE_CALL_SOURCE_URL,
    verifiedPhoneSourceLabel: "Maintainer-provided live E2E destination",
    purpose: `Place one authorized live smoke call to confirm the phone capability can initiate a real Twilio call. E2E marker: ${marker}.`,
    openingLine:
      "Hi, this is Ava, Thierry's assistant. This is a quick authorized test call to confirm outbound calling is working.",
    disclosureName: "Ava",
    disclosureRelationship: "Thierry's assistant",
    authorizedFacts: [
      "This is an authorized live outbound calling test.",
      "Thierry approved this call before the test ran.",
      "No sensitive details or decisions are involved.",
    ],
    decisionBounds: [
      "Do not make commitments.",
      "Only confirm that the call connected and then end politely.",
    ],
    stopConditions: [
      "End the call immediately if the recipient asks to stop.",
      "End the call after the test message is delivered.",
    ],
    resultExpectations: [
      "Whether the call was initiated by Twilio.",
      "The provider call id returned by Twilio.",
    ],
    maxDurationSeconds: 30,
    holdTimeoutSeconds: 15,
    retryPolicy: { maxAttempts: 1 },
  };
}

test("phone capability can send one approved sandbox SMS", async () => {
  const db = createSupabaseServiceClient();
  const binding = await enableTestingProviderSandboxBinding(db, {
    capabilitySlug: CAPABILITY_ID,
    provider: "twilio-messaging",
  });
  assert.equal(binding.connectedAccount.credential_kind, "backend_secret");
  assert.equal(binding.connectedAccount.provider, "twilio-messaging");
  assert.equal(binding.connectedAccount.nango_connection_id, null);
  const marker = createMarker("phone-sms-sandbox");
  const trustedChannel = await seedTestingTrustedE2eChannel({
    db,
    profileId: TESTING_AGENT_ID,
    peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
    marker,
    purpose: "phone-sms-sandbox-e2e",
  });

  let actionId: string | null = null;
  try {
    const readiness = await typedPhoneTool(
      db,
      "phone_sms_readiness_get",
      {},
      { agentId: TESTING_AGENT_ID },
    );
    assert.equal(readiness.ready, true, `Phone SMS is not ready: ${readiness.blockers}`);
    assert.equal(readiness.mode, "mock");

    const sendData = (await typedPhoneTool(
      db,
      "phone_sms_send",
      {
        toPhoneE164: "+14165550199",
        country: "CA",
        purpose: `Send a sandbox fallback SMS after a restaurant call did not connect. E2E marker: ${marker}.`,
        body: `Ref ${marker}. Hi, this is Ava following up about John's reservation request. Could you confirm whether a table for two is available next Tuesday evening?`,
        destinationEvidence: {
          kind: "public_phone_source",
          url: "https://www.crosta.ca/",
          label: "Restaurant public website",
        },
      },
      { trusted: true, agentId: TESTING_AGENT_ID },
    )) as PhoneSmsSendResult;
    actionId = sendData.write.actionId;

    const action = await loadProfileAction(db, actionId);
    const finalAction = await approveAndExecuteProfileAction({
      db,
      action,
      decisionUserId: await loadDecisionUserId(db, TESTING_AGENT_ID),
    });
    assert.equal(finalAction.provider_execution_status, "completed");

    const status = await typedPhoneTool(
      db,
      "phone_sms_status_get",
      { actionId },
      { agentId: TESTING_AGENT_ID },
    );
    assert.equal(status.attempt.toPhoneE164, "+14165550199");
    assert.equal(status.attempt.provider, "twilio-messaging");
    assert.equal(status.attempt.status, "sent");
    assert.ok(status.attempt.providerMessageSid);
    assert.ok(status.attempt.bodyPreview.includes(marker));

    const list = await typedPhoneTool(
      db,
      "phone_sms_list",
      { limit: 5 },
      { agentId: TESTING_AGENT_ID },
    );
    assert.ok(
      list.attempts.some((attempt) => attempt.attemptId === status.attempt.attemptId),
      `Expected phone_sms_list to include ${status.attempt.attemptId}.`,
    );
  } finally {
    await cleanupPhoneSmsRows({ db, actionId });
    await trustedChannel.cleanup();
  }
});

test(
  "phone capability can initiate one approved live phone call",
  { skip: shouldRunLiveTest() ? false : LIVE_SKIP_REASON, timeout: 120_000 },
  async () => {
    const db = createSupabaseServiceClient();
    const marker = createMarker("phone-live");
    const trustedChannel = await seedTestingTrustedE2eChannel({
      db,
      profileId: LIVE_AGENT_ID,
      peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
      marker,
      purpose: "phone-live-e2e",
    });

    let actionId: string | null = null;
    try {
      const decisionUserId = await loadDecisionUserId(db);
      const readiness = await typedPhoneTool(db, "phone_call_readiness_get", {});
      assert.equal(readiness.ready, true, `Phone calling is not ready: ${readiness.blockers}`);
      assert.equal(readiness.mode, "live");

      const startData = (await typedPhoneTool(
        db,
        "phone_call_start",
        { callBrief: liveCallBrief(marker) },
        { trusted: true },
      )) as PhoneCallStartResult;
      actionId = startData.write.actionId;

      const action = await loadProfileAction(db, actionId);
      const finalAction = await approveAndExecuteProfileAction({
        db,
        action,
        decisionUserId,
      });
      assert.equal(finalAction.provider_execution_status, "completed");
      const persistedAttempt = await loadPhoneCallAttemptForAction({ db, actionId });
      const attemptId = persistedAttempt.id;
      assert.equal(persistedAttempt.to_phone_e164, LIVE_CALL_TO_E164);
      assert.ok(
        persistedAttempt.provider_call_sid,
        `Expected provider call id, got ${JSON.stringify(persistedAttempt)}`,
      );
      assert.ok(
        persistedAttempt.provider_status,
        `Expected provider status, got ${JSON.stringify(persistedAttempt)}`,
      );

      const status = await typedPhoneTool(db, "phone_call_status_get", { attemptId });
      assert.equal(status.attempt.attemptId, attemptId);
      assert.equal(status.attempt.toPhoneE164, LIVE_CALL_TO_E164);
      assert.equal(status.attempt.providerCallSid, persistedAttempt.provider_call_sid);
      assert.equal(status.attempt.providerParentCallSid, persistedAttempt.provider_parent_call_sid);

      const list = await typedPhoneTool(db, "phone_call_list", { limit: 5 });
      assert.ok(
        list.attempts.some((attempt) => attempt.attemptId === attemptId),
        `Expected phone_call_list to include ${attemptId}.`,
      );
    } finally {
      await cleanupPhoneCallRows({ db, actionId });
      await trustedChannel.cleanup();
    }
  },
);

test("phone capability E2E exercises every contract tool", () => {
  coverage.assertComplete();
});
