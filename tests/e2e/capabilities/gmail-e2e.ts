import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSupabaseServiceClient,
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { gmailToolContracts, type GmailToolName } from "@ai-assistants/gmail-contracts/contracts";
import { E2E_TEST_CHANNEL_DEFAULT_PEER_ID } from "../helpers/run/e2e-run";
import {
  downloadArtifactBytes,
  loadArtifact,
} from "../../../apps/backend/src/test-support/actions";
import { approveAndExecuteProfileAction } from "../helpers/capability/approve-profile-action";
import { createCapabilityToolCoverage } from "../helpers/capability/capability-tool-coverage";
import {
  assertLiveProviderHasSentGmailMessage,
  cleanupSentLiveGmailMessage,
} from "../helpers/fixtures/gmail-live-provider-message-fixture";
import { seedTestingTrustedE2eChannel } from "../helpers/fixtures/testing-trusted-channel-fixture";
import { loadTestingClientMessagesWithAttachments } from "../helpers/readiness/testing-mailbox-readiness";
import { requireSingleTestingNangoConnection } from "../helpers/readiness/testing-provider-readiness";
import { markerEmailLocalPart } from "../helpers/test-data/testing-realistic-data";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import {
  buildCapabilityToolRequest,
  withTrustedChannel,
  executeCapabilityTool,
  parseCapabilityToolOutput,
} from "../helpers/run/execute-capability-backend-tool";
import { requireTestingE2eAgent, TESTING_AGENT_ID } from "../helpers/run/testing-launch-support";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { asRecord } from "../helpers/utils/as-record";
import { requireTestingProvidersLive } from "../helpers/provider-runtime/testing-provider-runtime";

const CAPABILITY_ID = "gmail";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const gmailCoverage = createCapabilityToolCoverage(CAPABILITY_ID, gmailToolContracts);

/** Durable mailbox folder/trash semantics not safely reversible in capability E2E without scenario fixtures. */
export const CAPABILITY_E2E_WAIVED_TOOLS = [
  "gmail_message_move",
  "gmail_message_delete",
] as const satisfies readonly GmailToolName[];

type SavedArtifact = {
  id: string;
  deleted: boolean;
};

type SentGmailMessage = {
  providerMessageId: string;
  trashed: boolean;
};

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function executedGmailWriteProviderMessageId(
  action: TableRow<"profile_actions">,
  label: string,
): string {
  assert.equal(action.status, "executed");
  assert.equal(action.provider_execution_status, "completed");
  const payload = asRecord(action.result_payload, `${label} result_payload`);
  assert.equal(payload.status, "executed");
  assert.equal(payload.provider, "gmail");
  const result = asRecord(payload.result, `${label} provider result`);
  return requireNonEmptyString(result.id, `${label} provider result.id`);
}

function expectedReplySubject(originalSubject: string | null): string {
  const subjBase = originalSubject ?? "";
  return subjBase.toLowerCase().startsWith("re:") ? subjBase : `Re: ${subjBase}`.trim();
}

async function typedGmailTool<const T extends GmailToolName>(
  db: SupabaseServiceClient,
  toolName: T,
  params: Record<string, unknown>,
  options?: { trusted?: boolean },
) {
  gmailCoverage.exercise(toolName);
  let request = buildCapabilityToolRequest({
    capabilityId: CAPABILITY_ID,
    toolName,
    params,
  });
  if (options?.trusted !== false) {
    request = withTrustedChannel(request, CAPABILITY_ID);
  }
  const result = await executeCapabilityTool(db, request);
  return parseCapabilityToolOutput(result, gmailToolContracts, toolName);
}

async function approveEmailWrite(input: {
  db: SupabaseServiceClient;
  toolName: GmailToolName;
  write: { actionId: string };
  decisionUserId: string;
}): Promise<TableRow<"profile_actions">> {
  const actionResult = await input.db
    .from("profile_actions")
    .select()
    .eq("id", input.write.actionId)
    .single();
  const action = requireSupabaseData(
    `Load email write action ${input.write.actionId}`,
    actionResult.data,
    actionResult.error,
  );
  return approveAndExecuteProfileAction({
    db: input.db,
    action,
    decisionUserId: input.decisionUserId,
  });
}

async function assertProviderWriteReceipt(input: {
  db: SupabaseServiceClient;
  action: TableRow<"profile_actions">;
  toolName: GmailToolName;
  externalResourceId: string;
}) {
  const result = await input.db
    .from("provider_write_receipts")
    .select()
    .eq("profile_action_id", input.action.id)
    .eq("tool_name", input.toolName)
    .eq("external_resource_id", input.externalResourceId);
  const receipts = requireSupabaseRows(
    `Load Gmail provider write receipts for ${input.toolName}`,
    result.data,
    result.error,
  );
  assert.equal(receipts.length, 1, `${input.toolName} should write one provider receipt`);
}

async function cleanupArtifact(db: SupabaseServiceClient, artifact: SavedArtifact): Promise<void> {
  if (artifact.deleted) return;
  const loaded = await db.from("artifacts").select().eq("id", artifact.id).maybeSingle();
  if (loaded.error) throw loaded.error;
  const row = loaded.data;
  if (!row) {
    artifact.deleted = true;
    return;
  }
  const removed = await db.storage.from(row.storage_bucket).remove([row.storage_key]);
  if (removed.error) throw removed.error;
  const deleted = await db.from("artifacts").delete().eq("id", row.id);
  requireSupabaseData(
    "Delete E2E email attachment artifact row",
    deleted.data ?? [],
    deleted.error,
  );
  artifact.deleted = true;
}

async function cleanupSentMessages(input: {
  fixture: Awaited<ReturnType<typeof requireSingleTestingNangoConnection>>;
  sentMessages: SentGmailMessage[];
}): Promise<void> {
  for (const message of [...input.sentMessages].reverse()) {
    if (message.trashed) continue;
    try {
      await cleanupSentLiveGmailMessage({
        fixture: input.fixture,
        providerMessageId: message.providerMessageId,
      });
      message.trashed = true;
    } catch {
      message.trashed = true;
    }
  }
}

test("Testing client: Gmail email capability lifecycle works end-to-end.", async (t) => {
  requireTestingE2eAgent();
  const run = await createE2eRun(t, {
    id: CAPABILITY_ID,
    requiredEnv: ["AI_ASSISTANTS_E2E_GMAIL_TO", "AI_ASSISTANTS_E2E_CLIENT_EMAIL"],
  });
  await attachE2eSupabase(run);
  const db = createSupabaseServiceClient();
  await requireTestingProvidersLive(db, [CAPABILITY_ID]);
  const marker = createMarker("testing-email");
  const fixture = await requireSingleTestingNangoConnection(db, {
    capabilitySlug: "gmail",
    provider: "gmail",
    label: "Gmail",
    requiredOAuthScopes: [GMAIL_SEND_SCOPE],
  });
  assert.equal(fixture.capabilityAccountLink.profile_id, "testing");
  const profileResult = await db.from("profiles").select("user_id").eq("id", "testing").single();
  const testingProfile = requireSupabaseData(
    "Load testing profile user for approval decisions",
    profileResult.data,
    profileResult.error,
  );
  assert.ok(
    testingProfile.user_id,
    "testing profile must have a portal user_id for approval decisions",
  );
  const decisionUserId = testingProfile.user_id;
  const connectedAccountId = fixture.connectedAccount.id;
  const recipientEmail = process.env.AI_ASSISTANTS_E2E_GMAIL_TO?.trim();
  const liveClientEmail = process.env.AI_ASSISTANTS_E2E_CLIENT_EMAIL?.trim();
  assert.ok(recipientEmail, "AI_ASSISTANTS_E2E_GMAIL_TO must be set for Gmail E2E");
  assert.ok(liveClientEmail, "AI_ASSISTANTS_E2E_CLIENT_EMAIL must be set for Gmail E2E");
  const sessionKeyPrefix = `e2e:${CAPABILITY_ID}`;
  const { cleanup: trustedChannelCleanup } = await seedTestingTrustedE2eChannel({
    db,
    profileId: "testing",
    peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
    marker,
    purpose: "gmail-e2e",
  });

  const artifacts: SavedArtifact[] = [];
  const sentMessages: SentGmailMessage[] = [];

  try {
    const accounts = await typedGmailTool(db, "gmail_accounts_list", {});
    assert.ok(
      accounts.accounts.some((account) => account.connectedAccountId === connectedAccountId),
      `gmail_accounts_list must include connected Gmail account ${connectedAccountId}`,
    );

    const inboundMessages = await loadTestingClientMessagesWithAttachments({
      db,
      agentId: TESTING_AGENT_ID,
      sessionKeyPrefix,
      sourceEmail: liveClientEmail,
    });
    const inboundMessage = inboundMessages[0];
    assert.ok(inboundMessage, "Testing requires a client fixture inbound message with attachments");
    assert.equal(inboundMessage.provider, "gmail");
    assert.ok(inboundMessage.attachments.length > 0);

    const search = await typedGmailTool(db, "gmail_messages_search", {
      connectedAccountId,
      query: `from:${liveClientEmail}`,
      maxResults: 10,
    });
    assert.equal(search.provider, "gmail");
    assert.equal(search.attachmentMetadataIncluded, false);
    assert.ok(
      search.messages.some((message) => message.id === inboundMessage.id),
      "Client fixture mailbox search must return the inbound message used for attachment save",
    );

    const attachmentAwareSearch = await typedGmailTool(db, "gmail_messages_search", {
      connectedAccountId,
      query: `from:${liveClientEmail}`,
      maxResults: 10,
      includeAttachmentMetadata: true,
    });
    assert.equal(attachmentAwareSearch.attachmentMetadataIncluded, true);
    const attachmentAwareMessage = attachmentAwareSearch.messages.find(
      (message) => message.id === inboundMessage.id,
    );
    assert.ok(
      attachmentAwareMessage,
      "Attachment-aware Gmail search must return the inbound message used for attachment save",
    );
    assert.ok(
      attachmentAwareMessage.attachments.length > 0,
      "Attachment-aware Gmail search must include attachment metadata for the selected message",
    );

    const messageGet = await typedGmailTool(db, "gmail_message_get", {
      connectedAccountId,
      messageId: inboundMessage.id,
    });
    assert.equal(messageGet.message.id, inboundMessage.id);
    assert.ok(messageGet.message.attachments.length > 0);

    const attachment = inboundMessage.attachments[0];
    assert.ok(attachment?.id, "Client fixture inbound message must include an attachment id");
    const attachmentSave = await typedGmailTool(
      db,
      "gmail_attachment_save",
      {
        connectedAccountId,
        messageId: inboundMessage.id,
        attachmentId: attachment.id,
        filename: attachment.filename ?? undefined,
      },
      { trusted: true },
    );
    artifacts.push({ id: attachmentSave.profileFileId, deleted: false });
    assert.equal(attachmentSave.provider, "gmail");
    assert.ok(attachmentSave.byteSize > 0);
    assert.match(attachmentSave.sha256, /^[a-f0-9]{64}$/i);
    const savedArtifact = await loadArtifact(db, "testing", attachmentSave.profileFileId);
    assert.equal(savedArtifact.byte_size, attachmentSave.byteSize);
    assert.equal(savedArtifact.sha256, attachmentSave.sha256);
    const downloaded = await downloadArtifactBytes(db, savedArtifact);
    assert.ok(downloaded.byteLength > 0);

    const sendSubject = `Jordan Rowan capability follow-up ${markerEmailLocalPart(marker)}`;
    const sendBody =
      "Thanks for the Jordan Rowan materials. I reviewed the attached notes and will follow up with next steps.";
    const sendWrite = await typedGmailTool(
      db,
      "gmail_message_send",
      {
        connectedAccountId,
        to: [recipientEmail],
        subject: sendSubject,
        bodyText: sendBody,
      },
      { trusted: true },
    );
    const sendExecuted = await approveEmailWrite({
      db,
      toolName: "gmail_message_send",
      write: sendWrite.write,
      decisionUserId,
    });
    const sendProviderMessageId = executedGmailWriteProviderMessageId(
      sendExecuted,
      "gmail_message_send",
    );
    await assertProviderWriteReceipt({
      db,
      action: sendExecuted,
      toolName: "gmail_message_send",
      externalResourceId: sendProviderMessageId,
    });
    sentMessages.push({ providerMessageId: sendProviderMessageId, trashed: false });
    await assertLiveProviderHasSentGmailMessage({
      fixture,
      providerMessageId: sendProviderMessageId,
      recipientEmail,
      subject: sendSubject,
    });

    const replyBody =
      "Thanks Jordan — I received your message and will review the attached mandate draft today.";
    const replyWrite = await typedGmailTool(
      db,
      "gmail_message_reply",
      {
        connectedAccountId,
        replyToMessageId: inboundMessage.id,
        bodyText: replyBody,
      },
      { trusted: true },
    );
    const replyExecuted = await approveEmailWrite({
      db,
      toolName: "gmail_message_reply",
      write: replyWrite.write,
      decisionUserId,
    });
    const replyProviderMessageId = executedGmailWriteProviderMessageId(
      replyExecuted,
      "gmail_message_reply",
    );
    await assertProviderWriteReceipt({
      db,
      action: replyExecuted,
      toolName: "gmail_message_reply",
      externalResourceId: replyProviderMessageId,
    });
    sentMessages.push({ providerMessageId: replyProviderMessageId, trashed: false });
    await assertLiveProviderHasSentGmailMessage({
      fixture,
      providerMessageId: replyProviderMessageId,
      recipientEmail: liveClientEmail,
      subject: expectedReplySubject(inboundMessage.subject),
    });

    const forwardSubject = `Fwd: message ${inboundMessage.id}`;
    const forwardWrite = await typedGmailTool(
      db,
      "gmail_message_forward",
      {
        connectedAccountId,
        forwardMessageId: inboundMessage.id,
        to: [recipientEmail],
        additionalComment: "Forwarding the Jordan Rowan thread for internal review.",
      },
      { trusted: true },
    );
    const forwardExecuted = await approveEmailWrite({
      db,
      toolName: "gmail_message_forward",
      write: forwardWrite.write,
      decisionUserId,
    });
    const forwardProviderMessageId = executedGmailWriteProviderMessageId(
      forwardExecuted,
      "gmail_message_forward",
    );
    await assertProviderWriteReceipt({
      db,
      action: forwardExecuted,
      toolName: "gmail_message_forward",
      externalResourceId: forwardProviderMessageId,
    });
    sentMessages.push({ providerMessageId: forwardProviderMessageId, trashed: false });
    await assertLiveProviderHasSentGmailMessage({
      fixture,
      providerMessageId: forwardProviderMessageId,
      recipientEmail,
      subject: forwardSubject,
    });

    const markReadWrite = await typedGmailTool(
      db,
      "gmail_message_mark_read",
      {
        connectedAccountId,
        messageId: inboundMessage.id,
        isRead: true,
      },
      { trusted: true },
    );
    const markReadExecuted = await approveEmailWrite({
      db,
      toolName: "gmail_message_mark_read",
      write: markReadWrite.write,
      decisionUserId,
    });
    await assertProviderWriteReceipt({
      db,
      action: markReadExecuted,
      toolName: "gmail_message_mark_read",
      externalResourceId: inboundMessage.id,
    });

    const markUnreadWrite = await typedGmailTool(
      db,
      "gmail_message_mark_read",
      {
        connectedAccountId,
        messageId: inboundMessage.id,
        isRead: false,
      },
      { trusted: true },
    );
    const markUnreadExecuted = await approveEmailWrite({
      db,
      toolName: "gmail_message_mark_read",
      write: markUnreadWrite.write,
      decisionUserId,
    });
    await assertProviderWriteReceipt({
      db,
      action: markUnreadExecuted,
      toolName: "gmail_message_mark_read",
      externalResourceId: inboundMessage.id,
    });

    for (const artifact of [...artifacts].reverse()) {
      await cleanupArtifact(db, artifact);
    }
    await cleanupSentMessages({ fixture, sentMessages });
    gmailCoverage.assertComplete({ waived: CAPABILITY_E2E_WAIVED_TOOLS });

    console.log(
      JSON.stringify(
        {
          ok: true,
          marker,
          connectedAccountId,
          connectionId: connectedAccountId,
          inboundMessageId: inboundMessage.id,
          contractTools: gmailToolContracts.map((contract) => contract.name),
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      for (const artifact of [...artifacts].reverse()) {
        await cleanupArtifact(db, artifact);
      }
      await cleanupSentMessages({ fixture, sentMessages });
    } finally {
      await trustedChannelCleanup();
    }
  }
});
