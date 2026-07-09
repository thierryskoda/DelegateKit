import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import {
  createSupabaseServiceClient,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  boldsignToolContracts,
  type BoldSignToolName,
} from "@ai-assistants/boldsign-contracts/contracts";
import { documentToolContracts } from "@ai-assistants/document-contracts/contracts";
import { E2E_TEST_CHANNEL_DEFAULT_PEER_ID } from "../helpers/run/e2e-run";
import { documentTemplateRenderTool } from "../../../apps/backend/src/test-support/capabilities/document-tools";
import { approveAndExecuteProfileAction } from "../helpers/capability/approve-profile-action";
import { asRecord } from "../helpers/utils/as-record";
import { createCapabilityToolCoverage } from "../helpers/capability/capability-tool-coverage";
import { createE2eFixtureScope } from "../helpers/fixtures/e2e-fixture-scope";
import { seedTestingTrustedE2eChannel } from "../helpers/fixtures/testing-trusted-channel-fixture";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import {
  buildCapabilityToolRequest,
  executeCapabilityTool,
  executeTypedCapabilityTool,
  parseCapabilityToolOutput,
  withTrustedChannel,
} from "../helpers/run/execute-capability-backend-tool";
import { startBackend } from "../helpers/processes/start-backend";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { requireTestingE2eAgent } from "../helpers/run/testing-launch-support";
import {
  mandateSignatureTitleForMarker,
  markerEmailLocalPart,
  senderEmailForMarker,
  signerNameForMarker,
} from "../helpers/test-data/testing-realistic-data";
import {
  cleanupDocumentTemplateArtifact,
  cleanupRenderedDocumentArtifacts,
  seedDocumentTemplateArtifact,
  ensureProfileArtifactsBucket,
} from "../helpers/fixtures/document-render-fixture";
import { requireTestingProvidersLive } from "../helpers/provider-runtime/testing-provider-runtime";

const CAPABILITY_ID = "boldsign";
const coverage = createCapabilityToolCoverage(CAPABILITY_ID, boldsignToolContracts);

/** Completed signed-document download is not deterministic in testing without signer completion. */
export const CAPABILITY_E2E_WAIVED_TOOLS = [
  "boldsign_file_download",
] as const satisfies readonly BoldSignToolName[];

const LIST_TOOL_NAME = "boldsign_signature_requests_list";
const SEND_TOOL_NAME = "boldsign_send_document_for_signature";
const REMIND_TOOL_NAME = "boldsign_signature_request_remind";
const CANCEL_TOOL_NAME = "boldsign_signature_request_cancel";
const BOLDSIGN_ASYNC_SEND_READY_TIMEOUT_MS = 90_000;
const BOLDSIGN_ASYNC_SEND_POLL_MS = 5_000;

async function typedBoldSignTool<const T extends BoldSignToolName>(
  db: SupabaseServiceClient,
  toolName: T,
  params: Record<string, unknown>,
  options?: { trusted?: boolean },
) {
  coverage.exercise(toolName);
  return executeTypedCapabilityTool(db, boldsignToolContracts, {
    capabilityId: CAPABILITY_ID,
    toolName,
    params,
    ...(options?.trusted ? { trusted: true } : {}),
  });
}

function executedBoldSignDocumentId(action: TableRow<"profile_actions">, label: string): string {
  assert.equal(action.status, "executed");
  const payload = asRecord(action.result_payload, `${label} result_payload`);
  assert.equal(payload.status, "executed");
  assert.equal(payload.provider, "boldsign");
  const result = asRecord(payload.result, `${label} provider result`);
  const documentId = result.documentId ?? result.document_id ?? result.id;
  if (typeof documentId !== "string" || !documentId.trim()) {
    throw new Error(
      `${label} provider result must include documentId; got ${JSON.stringify(result)}`,
    );
  }
  return documentId;
}

async function approveBoldSignWrite(input: {
  db: SupabaseServiceClient;
  actionId: string;
  decisionUserId: string;
}): Promise<TableRow<"profile_actions">> {
  const actionResult = await input.db
    .from("profile_actions")
    .select()
    .eq("id", input.actionId)
    .single();
  const action = requireSupabaseData(
    `Load BoldSign write action ${input.actionId}`,
    actionResult.data,
    actionResult.error,
  );
  return approveAndExecuteProfileAction({
    db: input.db,
    action,
    decisionUserId: input.decisionUserId,
  });
}

async function loadProfileActionById(
  db: SupabaseServiceClient,
  actionId: string,
  label: string,
): Promise<TableRow<"profile_actions">> {
  const actionResult = await db.from("profile_actions").select().eq("id", actionId).single();
  return requireSupabaseData(label, actionResult.data, actionResult.error);
}

async function waitForBoldSignDocumentReady(input: {
  db: SupabaseServiceClient;
  connectedAccountId: string;
  documentId: string;
  marker: string;
}): Promise<void> {
  const deadline = Date.now() + BOLDSIGN_ASYNC_SEND_READY_TIMEOUT_MS;
  let lastListData: Awaited<ReturnType<typeof typedBoldSignTool<typeof LIST_TOOL_NAME>>> | null =
    null;

  while (Date.now() < deadline) {
    const listData = await typedBoldSignTool(input.db, LIST_TOOL_NAME, {
      connectedAccountId: input.connectedAccountId,
      query: input.documentId,
      documentId: input.documentId,
      limit: 10,
    });
    lastListData = listData;
    const matchingRequest = listData.requests.find(
      (request) => request.documentId === input.documentId,
    );
    if (matchingRequest && matchingRequest.status.trim().toLowerCase() === "inprogress") {
      return;
    }

    await delay(BOLDSIGN_ASYNC_SEND_POLL_MS);
  }

  throw new Error(
    [
      `BoldSign document ${input.documentId} for marker ${input.marker} did not become InProgress before reminder/cancel.`,
      `Last list result: ${JSON.stringify(lastListData)}`,
    ].join(" "),
  );
}

async function cleanupProfileActions(
  db: SupabaseServiceClient,
  actions: readonly TableRow<"profile_actions">[],
): Promise<void> {
  for (const action of actions) {
    const deletedJobs = await db
      .from("backend_jobs")
      .delete()
      .eq("profile_id", action.profile_id)
      .in("dedupe_key", [
        `assistant-event:action-completion:${action.id}:executed`,
        `assistant-event:action-completion:${action.id}:rejected`,
        `assistant-event:action-completion:${action.id}:failed`,
      ]);
    requireSupabaseData(
      "Delete BoldSign action backend jobs",
      deletedJobs.data ?? [],
      deletedJobs.error,
    );

    const deletedReceipts = await db
      .from("provider_write_receipts")
      .delete()
      .eq("profile_id", action.profile_id)
      .eq("profile_action_id", action.id);
    requireSupabaseData(
      "Delete BoldSign provider write receipts",
      deletedReceipts.data ?? [],
      deletedReceipts.error,
    );

    const deletedAction = await db.from("profile_actions").delete().eq("id", action.id);
    requireSupabaseData(
      "Delete BoldSign external action",
      deletedAction.data ?? [],
      deletedAction.error,
    );
  }
}

async function loadArtifactById(
  db: SupabaseServiceClient,
  artifactId: string,
  label: string,
): Promise<TableRow<"artifacts">> {
  const result = await db.from("artifacts").select().eq("id", artifactId).single();
  return requireSupabaseData(label, result.data, result.error);
}

async function loadBoldSignOwnershipRow(input: {
  db: SupabaseServiceClient;
  connectedAccountId: string;
  documentId: string;
  label: string;
}): Promise<TableRow<"boldsign_documents">> {
  const result = await input.db
    .from("boldsign_documents")
    .select()
    .eq("profile_id", "testing")
    .eq("connected_provider_account_id", input.connectedAccountId)
    .eq("document_id", input.documentId)
    .single();
  return requireSupabaseData(input.label, result.data, result.error);
}

async function expectUnownedReminderRejected(input: {
  db: SupabaseServiceClient;
  documentId: string;
  connectedAccountId: string;
}): Promise<void> {
  const result = await executeCapabilityTool(
    input.db,
    withTrustedChannel(
      buildCapabilityToolRequest({
        capabilityId: CAPABILITY_ID,
        toolName: REMIND_TOOL_NAME,
        params: {
          connectedAccountId: input.connectedAccountId,
          documentId: input.documentId,
          message: "Jordan Rowan mandate reminder should not send for an unassigned document.",
        },
      }),
      CAPABILITY_ID,
    ),
  );
  assert.equal(
    "error" in result,
    true,
    `unowned BoldSign reminder should fail before provider execution; got ${JSON.stringify(result)}`,
  );
  assert.ok("error" in result);
  assert.match(result.error.message, /NOT_FOUND|not assigned|ownership|BoldSign document/i);
}

async function seedMandatePdfArtifact(
  db: SupabaseServiceClient,
  marker: string,
): Promise<{
  pdfArtifact: TableRow<"artifacts">;
  docxArtifact: TableRow<"artifacts">;
  templateArtifact: TableRow<"artifacts">;
}> {
  await ensureProfileArtifactsBucket(db);
  const templateArtifact = await seedDocumentTemplateArtifact(db, {
    profileId: "testing",
    marker,
    documentBodyXml: `
      <w:p><w:r><w:t>Jordan Rowan mandate for Signature Testing Inc.</w:t></w:r></w:p>
      <w:p><w:r><w:t>Mandate reference: {mandate_reference}</w:t></w:r></w:p>
      <w:p><w:r><w:t>Client: Jordan Rowan</w:t></w:r></w:p>
      <w:p><w:r><w:t>Signature:</w:t></w:r></w:p>
      <w:p><w:r><w:t>{{@clientSig}}</w:t></w:r></w:p>
      <w:p><w:r><w:t>Date signed:</w:t></w:r></w:p>
      <w:p><w:r><w:t>{{@clientDate}}</w:t></w:r></w:p>
    `,
  });
  const rendered = await documentTemplateRenderTool(db, "testing", {
    templateProfileFileId: templateArtifact.id,
    fieldValues: { mandate_reference: marker },
    outputFilename: `Jordan Rowan mandate ${marker}.pdf`,
  });
  const renderData = parseCapabilityToolOutput(
    rendered,
    documentToolContracts,
    "document_template_render",
  );
  return {
    pdfArtifact: await loadArtifactById(
      db,
      renderData.files.pdf.profileFileId,
      "Load rendered BoldSign PDF artifact",
    ),
    docxArtifact: await loadArtifactById(
      db,
      renderData.files.docx.profileFileId,
      "Load rendered BoldSign DOCX artifact",
    ),
    templateArtifact,
  };
}

test("BoldSign capability tools: list, send, remind, and cancel signature requests.", async (t) => {
  requireTestingE2eAgent();
  const run = await createE2eRun(t, {
    id: CAPABILITY_ID,
    requiredEnv: ["BOLDSIGN_API_KEY", "AI_ASSISTANTS_E2E_GMAIL_TO"],
  });
  const signerEmail = process.env.AI_ASSISTANTS_E2E_GMAIL_TO?.trim();
  assert.ok(signerEmail, "AI_ASSISTANTS_E2E_GMAIL_TO must be set for BoldSign E2E");
  const supabase = await attachE2eSupabase(run);
  const db = createSupabaseServiceClient();
  await requireTestingProvidersLive(db, [CAPABILITY_ID]);
  const fixtures = createE2eFixtureScope({ run });
  let fixturesCleaned = false;
  const cleanupFixtures = async () => {
    if (fixturesCleaned) return;
    fixturesCleaned = true;
    await fixtures.cleanup();
  };
  run.cleanup.add(cleanupFixtures);
  const marker = createMarker("testing-boldsign");
  const trackedActions: TableRow<"profile_actions">[] = [];
  const trackedActionIds = new Set<string>();
  const trackedBoldSignDocumentIds = new Set<string>();
  const trackAction = (action: TableRow<"profile_actions">) => {
    if (trackedActionIds.has(action.id)) return;
    trackedActionIds.add(action.id);
    trackedActions.push(action);
  };
  let capabilityAccountLink: TableRow<"capability_account_links"> | null = null;
  let connectedAccount: TableRow<"connected_provider_accounts"> | null = null;
  let seededConnectedAccountId: string | null = null;
  let previousConnectedProviderAccountId: string | null = null;
  let pdfArtifact: TableRow<"artifacts"> | null = null;
  let docxArtifact: TableRow<"artifacts"> | null = null;
  let templateArtifact: TableRow<"artifacts"> | null = null;
  let documentCanceled = false;
  let sentDocumentId: string | null = null;
  let decisionUserId: string | null = null;

  try {
    const profileResult = await db.from("profiles").select("user_id").eq("id", "testing").single();
    const testingProfile = requireSupabaseData(
      "Load testing profile user for BoldSign write decisions",
      profileResult.data,
      profileResult.error,
    );
    assert.ok(
      testingProfile.user_id,
      "testing profile must have a portal user_id for write decisions",
    );
    decisionUserId = testingProfile.user_id;

    const { cleanup: trustedChannelCleanup } = await seedTestingTrustedE2eChannel({
      db,
      profileId: "testing",
      peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
      marker,
      purpose: "boldsign-e2e",
    });
    run.cleanup.add(trustedChannelCleanup);

    const linkResult = await db
      .from("capability_account_links")
      .select()
      .eq("profile_id", "testing")
      .eq("capability_slug", "boldsign")
      .eq("provider", "boldsign")
      .eq("status", "enabled")
      .single();
    capabilityAccountLink = requireSupabaseData(
      "Load testing BoldSign capability account link",
      linkResult.data,
      linkResult.error,
    );
    const existingConnectedProviderAccountId =
      capabilityAccountLink.connected_provider_account_id?.trim() ?? null;
    if (existingConnectedProviderAccountId) {
      const connectedAccountResult = await db
        .from("connected_provider_accounts")
        .select()
        .eq("id", existingConnectedProviderAccountId)
        .maybeSingle();
      const existingConnectedAccount = requireSupabaseData(
        "Load active testing BoldSign connected provider account",
        connectedAccountResult.data,
        connectedAccountResult.error,
      );
      if (
        existingConnectedAccount.provider === "boldsign" &&
        existingConnectedAccount.connection_status === "connected" &&
        existingConnectedAccount.credential_status === "healthy" &&
        existingConnectedAccount.credential_kind === "backend_secret"
      ) {
        connectedAccount = existingConnectedAccount;
      }
    }

    if (!connectedAccount) {
      const now = new Date().toISOString();
      previousConnectedProviderAccountId = existingConnectedProviderAccountId;
      const connectedAccountResult = await db
        .from("connected_provider_accounts")
        .insert({
          profile_id: "testing",
          provider: "boldsign",
          provider_account_id: `e2e-boldsign-${marker}`,
          account_email: senderEmailForMarker(marker),
          display_label: `Jordan Rowan contracts ${markerEmailLocalPart(marker)}`,
          scopes: ["boldsign.signature_request.send"],
          connection_status: "connected",
          credential_kind: "backend_secret",
          nango_provider_config_key: null,
          nango_connection_id: null,
          credential_status: "healthy",
          connected_at: now,
          metadata: {
            marker,
            managedCredential: "BOLDSIGN_API_KEY",
            purpose: "boldsign-e2e",
          },
        })
        .select()
        .single();
      connectedAccount = requireSupabaseData(
        "Seed testing BoldSign managed API connected provider account",
        connectedAccountResult.data,
        connectedAccountResult.error,
      );
      seededConnectedAccountId = connectedAccount.id;
      const linkUpdate = await db
        .from("capability_account_links")
        .update({
          connected_provider_account_id: connectedAccount.id,
          updated_at: now,
        })
        .eq("id", capabilityAccountLink.id);
      requireSupabaseData(
        "Bind seeded BoldSign connected provider account to capability link",
        linkUpdate.data ?? [],
        linkUpdate.error,
      );
    }

    await startBackend(run, { supabase });
    const mandateArtifacts = await seedMandatePdfArtifact(db, marker);
    pdfArtifact = mandateArtifacts.pdfArtifact;
    docxArtifact = mandateArtifacts.docxArtifact;
    templateArtifact = mandateArtifacts.templateArtifact;

    const listData = await typedBoldSignTool(db, LIST_TOOL_NAME, {
      connectedAccountId: connectedAccount.id,
      limit: 5,
    });
    assert.equal(listData.connectedAccountId, connectedAccount.id);

    const sendData = await typedBoldSignTool(
      db,
      SEND_TOOL_NAME,
      {
        artifactId: pdfArtifact.id,
        expectedSha256: pdfArtifact.sha256,
        signerEmail,
        signerName: signerNameForMarker(marker),
        title: mandateSignatureTitleForMarker(marker),
      },
      { trusted: true },
    );
    trackAction(
      await loadProfileActionById(db, sendData.write.actionId, "Load BoldSign send action"),
    );
    assert.equal(sendData.write.status, "completed", JSON.stringify(sendData.write));

    const sendExecuted = await approveBoldSignWrite({
      db,
      actionId: sendData.write.actionId,
      decisionUserId,
    });
    trackAction(sendExecuted);
    const documentId = executedBoldSignDocumentId(sendExecuted, SEND_TOOL_NAME);
    sentDocumentId = documentId;
    trackedBoldSignDocumentIds.add(documentId);
    const ownershipAfterSend = await loadBoldSignOwnershipRow({
      db,
      connectedAccountId: connectedAccount.id,
      documentId,
      label: "Load BoldSign ownership row after send",
    });
    assert.equal(ownershipAfterSend.profile_id, "testing");
    assert.equal(ownershipAfterSend.capability_account_link_id, capabilityAccountLink.id);
    assert.equal(ownershipAfterSend.ownership_status, "pending_provider_confirmation");
    assert.equal(ownershipAfterSend.source, "assistant_send");
    assert.equal(ownershipAfterSend.title, mandateSignatureTitleForMarker(marker));

    await waitForBoldSignDocumentReady({
      db,
      connectedAccountId: connectedAccount.id,
      documentId,
      marker,
    });
    const scopedListData = await typedBoldSignTool(db, LIST_TOOL_NAME, {
      connectedAccountId: connectedAccount.id,
      query: documentId,
      documentId,
      limit: 10,
    });
    assert.ok(
      scopedListData.requests.some((request) => request.documentId === documentId),
      `scoped BoldSign list should include the owned sent document; got ${JSON.stringify(scopedListData.requests)}`,
    );
    const unownedDocumentId = `unassigned-boldsign-${marker}`;
    trackedBoldSignDocumentIds.add(unownedDocumentId);
    await expectUnownedReminderRejected({
      db,
      connectedAccountId: connectedAccount.id,
      documentId: unownedDocumentId,
    });

    const remindData = await typedBoldSignTool(
      db,
      REMIND_TOOL_NAME,
      {
        connectedAccountId: connectedAccount.id,
        documentId,
        message: `Jordan Rowan mandate reminder (${markerEmailLocalPart(marker)})`,
      },
      { trusted: true },
    );
    trackAction(
      await loadProfileActionById(db, remindData.write.actionId, "Load BoldSign remind action"),
    );
    assert.equal(remindData.write.status, "completed", JSON.stringify(remindData.write));
    const remindExecuted = await approveBoldSignWrite({
      db,
      actionId: remindData.write.actionId,
      decisionUserId,
    });
    trackAction(remindExecuted);

    const cancelData = await typedBoldSignTool(
      db,
      CANCEL_TOOL_NAME,
      {
        connectedAccountId: connectedAccount.id,
        documentId,
        message: `Jordan Rowan mandate canceled (${markerEmailLocalPart(marker)})`,
      },
      { trusted: true },
    );
    trackAction(
      await loadProfileActionById(db, cancelData.write.actionId, "Load BoldSign cancel action"),
    );
    assert.equal(cancelData.write.status, "completed", JSON.stringify(cancelData.write));
    const cancelExecuted = await approveBoldSignWrite({
      db,
      actionId: cancelData.write.actionId,
      decisionUserId,
    });
    trackAction(cancelExecuted);
    documentCanceled = true;

    coverage.assertComplete({ waived: CAPABILITY_E2E_WAIVED_TOOLS });

    console.log(
      JSON.stringify(
        {
          ok: true,
          capabilityId: CAPABILITY_ID,
          marker,
          connectedAccountId: connectedAccount.id,
          requestsReturned: listData.requests.length,
          documentId,
          sendActionId: sendExecuted.id,
          remindActionId: remindExecuted.id,
          cancelActionId: cancelExecuted.id,
        },
        null,
        2,
      ),
    );
  } finally {
    if (!documentCanceled && sentDocumentId && connectedAccount && decisionUserId) {
      try {
        await waitForBoldSignDocumentReady({
          db,
          connectedAccountId: connectedAccount.id,
          documentId: sentDocumentId,
          marker,
        });
        const cleanupCancelData = await typedBoldSignTool(
          db,
          CANCEL_TOOL_NAME,
          {
            connectedAccountId: connectedAccount.id,
            documentId: sentDocumentId,
            message: `E2E cleanup canceled Jordan Rowan mandate (${markerEmailLocalPart(marker)})`,
          },
          { trusted: true },
        );
        trackAction(
          await loadProfileActionById(
            db,
            cleanupCancelData.write.actionId,
            "Load BoldSign cleanup cancel action",
          ),
        );
        documentCanceled = cleanupCancelData.write.status === "completed";
        if (!documentCanceled) {
          console.warn(
            `[boldsign-e2e] marker=${marker}: cleanup cancel did not complete: ${JSON.stringify(cleanupCancelData.write)}`,
          );
        }
      } catch (error) {
        console.warn(
          `[boldsign-e2e] marker=${marker}: cleanup cancel failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    await cleanupProfileActions(db, trackedActions);
    if (connectedAccount && trackedBoldSignDocumentIds.size > 0) {
      const deletedBoldSignDocuments = await db
        .from("boldsign_documents")
        .delete()
        .eq("connected_provider_account_id", connectedAccount.id)
        .in("document_id", [...trackedBoldSignDocumentIds]);
      requireSupabaseData(
        "Delete tracked BoldSign ownership rows",
        deletedBoldSignDocuments.data ?? [],
        deletedBoldSignDocuments.error,
      );
    }
    const renderedArtifacts = [pdfArtifact, docxArtifact].filter(
      (artifact): artifact is TableRow<"artifacts"> => artifact !== null,
    );
    if (renderedArtifacts.length > 0) {
      await cleanupRenderedDocumentArtifacts(db, renderedArtifacts);
    }
    if (templateArtifact) {
      await cleanupDocumentTemplateArtifact(db, templateArtifact);
    }
    if (seededConnectedAccountId && capabilityAccountLink) {
      const restoredLink = await db
        .from("capability_account_links")
        .update({
          connected_provider_account_id: previousConnectedProviderAccountId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", capabilityAccountLink.id);
      requireSupabaseData(
        "Restore testing BoldSign capability account link binding",
        restoredLink.data ?? [],
        restoredLink.error,
      );
      const deletedAccount = await db
        .from("connected_provider_accounts")
        .delete()
        .eq("id", seededConnectedAccountId);
      requireSupabaseData(
        "Delete seeded BoldSign API connected provider account",
        deletedAccount.data ?? [],
        deletedAccount.error,
      );
    }
    if (!documentCanceled) {
      console.warn(
        `[boldsign-e2e] marker=${marker}: signature request may remain pending at BoldSign because cancel did not execute.`,
      );
    }
    await cleanupFixtures();
  }
});
