import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSupabaseServiceClient,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  outlookMailToolContracts,
  type OutlookMailToolName,
} from "@ai-assistants/outlook-mail-contracts/contracts";
import { E2E_TEST_CHANNEL_DEFAULT_PEER_ID } from "../helpers/run/e2e-run";
import { approveAndExecuteProfileAction } from "../helpers/capability/approve-profile-action";
import { createCapabilityToolCoverage } from "../helpers/capability/capability-tool-coverage";
import {
  cleanupRenderedDocumentArtifacts,
  ensureProfileArtifactsBucket,
  seedDocumentArtifact,
} from "../helpers/fixtures/document-render-fixture";
import { seedTestingTrustedE2eChannel } from "../helpers/fixtures/testing-trusted-channel-fixture";
import { TESTING_OUTLOOK_EMAIL_CAPABILITY } from "../helpers/readiness/testing-capability-readiness";
import { requireSingleTestingNangoConnection } from "../helpers/readiness/testing-provider-readiness";
import {
  assertLiveProviderHasSentOutlookMessage,
  cleanupSentLiveOutlookMessage,
  findLiveOutlookInboxMessageFromSender,
  getLiveOutlookMessage,
  outlookMessageAttachments,
} from "../helpers/fixtures/outlook-live-provider-message-fixture";
import { markerEmailLocalPart } from "../helpers/test-data/testing-realistic-data";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import {
  buildCapabilityToolRequest,
  withTrustedChannel,
  executeCapabilityTool,
  parseCapabilityToolOutput,
} from "../helpers/run/execute-capability-backend-tool";
import { requireTestingProvidersLive } from "../helpers/provider-runtime/testing-provider-runtime";
import { requireTestingE2eAgent } from "../helpers/run/testing-launch-support";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { asRecord } from "../helpers/utils/as-record";

const CAPABILITY_ID = "outlook-mail";
const outlookMailCoverage = createCapabilityToolCoverage(CAPABILITY_ID, outlookMailToolContracts);

/** Durable mailbox folder/trash semantics not safely reversible in capability E2E without scenario fixtures. */
export const OUTLOOK_MAIL_CAPABILITY_E2E_WAIVED_TOOLS = [
  "outlook_mail_message_move",
  "outlook_mail_message_delete",
] as const satisfies readonly OutlookMailToolName[];

async function typedOutlookMailTool<const T extends OutlookMailToolName>(
  db: SupabaseServiceClient,
  toolName: T,
  params: Record<string, unknown>,
  options?: { trusted?: boolean },
) {
  outlookMailCoverage.exercise(toolName);
  let request = buildCapabilityToolRequest({
    capabilityId: CAPABILITY_ID,
    toolName,
    params,
  });
  if (options?.trusted !== false) {
    request = withTrustedChannel(request, CAPABILITY_ID);
  }
  const result = await executeCapabilityTool(db, request);
  return parseCapabilityToolOutput(result, outlookMailToolContracts, toolName);
}

async function approveEmailWrite(input: {
  db: SupabaseServiceClient;
  toolName: OutlookMailToolName;
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

test("Testing client: Outlook email capability lifecycle works end-to-end.", async (t) => {
  requireTestingE2eAgent();
  const run = await createE2eRun(t, {
    id: CAPABILITY_ID,
    requiredEnv: ["AI_ASSISTANTS_E2E_GMAIL_TO", "AI_ASSISTANTS_E2E_CLIENT_EMAIL"],
  });
  await attachE2eSupabase(run);
  const db = createSupabaseServiceClient();
  await requireTestingProvidersLive(db, [CAPABILITY_ID]);
  const marker = createMarker("testing-outlook-email");
  const fixture = await requireSingleTestingNangoConnection(db, TESTING_OUTLOOK_EMAIL_CAPABILITY);
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
  assert.ok(recipientEmail, "AI_ASSISTANTS_E2E_GMAIL_TO must be set for Outlook Mail E2E");
  assert.ok(liveClientEmail, "AI_ASSISTANTS_E2E_CLIENT_EMAIL must be set for Outlook Mail E2E");
  const { cleanup: trustedChannelCleanup } = await seedTestingTrustedE2eChannel({
    db,
    profileId: "testing",
    peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
    marker,
    purpose: "email-outlook-e2e",
  });

  const sentMessageIds: string[] = [];
  const seededArtifacts: Array<{ id: string; storage_bucket: string; storage_key: string }> = [];
  const savedAttachmentArtifacts: Array<{
    id: string;
    storage_bucket: string;
    storage_key: string;
  }> = [];

  try {
    await ensureProfileArtifactsBucket(db);
    const accounts = await typedOutlookMailTool(db, "outlook_mail_accounts_list", {});
    assert.ok(
      accounts.accounts.some((account) => account.connectedAccountId === connectedAccountId),
      `outlook_mail_accounts_list must include connected Outlook account ${connectedAccountId}`,
    );

    const inboxMessage = await findLiveOutlookInboxMessageFromSender({
      fixture,
      senderEmail: liveClientEmail,
    });
    assert.ok(
      inboxMessage,
      [
        "Testing requires a Jordan Rowan email in the connected Outlook inbox.",
        `Send mail from ${liveClientEmail} to the testing Outlook account, then rerun.`,
      ].join(" "),
    );
    const inboundMessageId =
      typeof inboxMessage.id === "string" ? inboxMessage.id : String(inboxMessage.id);

    const search = await typedOutlookMailTool(db, "outlook_mail_messages_search", {
      connectedAccountId,
      query: `from:${liveClientEmail}`,
      maxResults: 10,
    });
    assert.equal(search.provider, "outlook-mail");
    assert.ok(
      search.messages.some((message) => message.id === inboundMessageId),
      "Jordan Rowan Outlook inbox search must return the inbound message used for reply",
    );

    const messageGet = await typedOutlookMailTool(db, "outlook_mail_message_get", {
      connectedAccountId,
      messageId: inboundMessageId,
    });
    assert.equal(messageGet.message.id, inboundMessageId);
    assert.equal(messageGet.provider, "outlook-mail");

    const sendSubject = `Jordan Rowan capability follow-up ${markerEmailLocalPart(marker)}`;
    const sendBody =
      "Thanks for the Jordan Rowan materials. I reviewed the notes and will follow up with next steps.";
    const sendAttachmentBytes = Buffer.from(
      `Jordan Rowan Outlook Mail attachment coverage ${marker}`,
      "utf8",
    );
    const sendAttachment = await seedDocumentArtifact(db, {
      profileId: "testing",
      marker,
      filename: `jordan-rowan-outlook-mail-${markerEmailLocalPart(marker)}.txt`,
      artifactType: "email.attachment.test",
      mimeType: "text/plain",
      bytes: sendAttachmentBytes,
    });
    seededArtifacts.push(sendAttachment);
    const sendWrite = await typedOutlookMailTool(
      db,
      "outlook_mail_message_send",
      {
        connectedAccountId,
        to: [recipientEmail],
        subject: sendSubject,
        bodyText: sendBody,
        profileFileIds: [sendAttachment.id],
        expectedProfileFileSha256ById: { [sendAttachment.id]: sendAttachment.sha256 },
      },
      { trusted: true },
    );
    const sendExecuted = await approveEmailWrite({
      db,
      toolName: "outlook_mail_message_send",
      write: sendWrite.write,
      decisionUserId,
    });
    assert.equal(sendExecuted.provider_execution_status, "completed");
    const sendProviderMessageId = await assertLiveProviderHasSentOutlookMessage({
      fixture,
      subject: sendSubject,
      recipientEmail,
    });
    sentMessageIds.push(sendProviderMessageId);
    const sentMessage = await getLiveOutlookMessage({ fixture, messageId: sendProviderMessageId });
    const sentAttachment = outlookMessageAttachments(sentMessage).find((attachment) => {
      const name = attachment.name;
      return typeof name === "string" && name === sendAttachment.filename;
    });
    assert.ok(
      sentAttachment,
      `Outlook sent message must include attachment ${JSON.stringify(sendAttachment.filename)}`,
    );
    assert.equal(
      typeof sentAttachment.id,
      "string",
      `Outlook sent attachment must include a provider id: ${JSON.stringify(sentAttachment)}`,
    );
    const sentAttachmentId = sentAttachment.id;
    const savedAttachment = await typedOutlookMailTool(
      db,
      "outlook_mail_attachment_save",
      {
        connectedAccountId,
        messageId: sendProviderMessageId,
        attachmentId: sentAttachmentId,
        filename: sendAttachment.filename,
      },
      { trusted: true },
    );
    assert.equal(savedAttachment.provider, "outlook-mail");
    assert.equal(savedAttachment.filename, sendAttachment.filename);
    assert.equal(savedAttachment.byteSize, sendAttachment.byte_size);
    assert.equal(savedAttachment.sha256, sendAttachment.sha256);
    const savedAttachmentResult = await db
      .from("artifacts")
      .select("id,storage_bucket,storage_key")
      .eq("id", savedAttachment.profileFileId)
      .single();
    const savedAttachmentRow = requireSupabaseData(
      `Load saved Outlook attachment artifact ${savedAttachment.profileFileId}`,
      savedAttachmentResult.data,
      savedAttachmentResult.error,
    );
    savedAttachmentArtifacts.push(savedAttachmentRow);

    const replyBody =
      "Thanks Jordan — I received your message and will review the attached mandate draft today.";
    const replyWrite = await typedOutlookMailTool(
      db,
      "outlook_mail_message_reply",
      {
        connectedAccountId,
        replyToMessageId: inboundMessageId,
        bodyText: replyBody,
      },
      { trusted: true },
    );
    const replyExecuted = await approveEmailWrite({
      db,
      toolName: "outlook_mail_message_reply",
      write: replyWrite.write,
      decisionUserId,
    });
    assert.equal(replyExecuted.provider_execution_status, "completed");
    const replyPayload = asRecord(
      replyExecuted.result_payload,
      "outlook_mail_message_reply result_payload",
    );
    assert.equal(replyPayload.provider, "outlook-mail");

    const forwardSubjectBase = messageGet.message.subject ?? "";
    const forwardSubject = `Fwd: ${forwardSubjectBase}`.trim();
    const forwardWrite = await typedOutlookMailTool(
      db,
      "outlook_mail_message_forward",
      {
        connectedAccountId,
        forwardMessageId: inboundMessageId,
        to: [recipientEmail],
        additionalComment: "Forwarding the Jordan Rowan thread for internal review.",
      },
      { trusted: true },
    );
    const forwardExecuted = await approveEmailWrite({
      db,
      toolName: "outlook_mail_message_forward",
      write: forwardWrite.write,
      decisionUserId,
    });
    assert.equal(forwardExecuted.provider_execution_status, "completed");
    const forwardProviderMessageId = await assertLiveProviderHasSentOutlookMessage({
      fixture,
      subject: forwardSubject,
      recipientEmail,
    });
    sentMessageIds.push(forwardProviderMessageId);

    const markReadWrite = await typedOutlookMailTool(
      db,
      "outlook_mail_message_mark_read",
      {
        connectedAccountId,
        messageId: inboundMessageId,
        isRead: true,
      },
      { trusted: true },
    );
    await approveEmailWrite({
      db,
      toolName: "outlook_mail_message_mark_read",
      write: markReadWrite.write,
      decisionUserId,
    });

    const markUnreadWrite = await typedOutlookMailTool(
      db,
      "outlook_mail_message_mark_read",
      {
        connectedAccountId,
        messageId: inboundMessageId,
        isRead: false,
      },
      { trusted: true },
    );
    await approveEmailWrite({
      db,
      toolName: "outlook_mail_message_mark_read",
      write: markUnreadWrite.write,
      decisionUserId,
    });

    outlookMailCoverage.assertComplete({ waived: OUTLOOK_MAIL_CAPABILITY_E2E_WAIVED_TOOLS });

    console.log(
      JSON.stringify(
        {
          ok: true,
          marker,
          provider: "outlook-mail",
          connectedAccountId,
          inboundMessageId,
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      for (const providerMessageId of [...sentMessageIds].reverse()) {
        await cleanupSentLiveOutlookMessage({ fixture, providerMessageId });
      }
    } finally {
      await cleanupRenderedDocumentArtifacts(db, savedAttachmentArtifacts);
      await cleanupRenderedDocumentArtifacts(db, seededArtifacts);
      await trustedChannelCleanup();
    }
  }
});
