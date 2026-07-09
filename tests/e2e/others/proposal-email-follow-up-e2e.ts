import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { executeE2eBackendTool } from "../../../apps/backend/src/test-support/backend-tools";
import { approveProfileProposalFromPortal } from "../../../apps/backend/src/test-support/proposals";
import { profileContextToolContracts } from "@ai-assistants/profile-context-contracts/contracts";
import { proposalsToolContracts } from "@ai-assistants/proposals-contracts/contracts";
import { toolContractByName } from "@ai-assistants/tool-contracts";
import { cleanupTestingProfileActions } from "../helpers/fixtures/testing-profile-actions-fixture";
import {
  loadGmailSendSandboxRequests,
  seedGmailSendSandboxForE2e,
} from "../helpers/fixtures/gmail-sandbox-seed";
import {
  clientReferenceForMarker,
  markerEmailLocalPart,
} from "../helpers/test-data/testing-realistic-data";
import {
  createE2eRun,
  createMarker,
  enableE2eTestChannel,
  type E2eRun,
} from "../helpers/run/e2e-run";
import { useE2eDb } from "../helpers/db/e2e-db";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { requireTestingCapabilitiesConnected } from "../helpers/readiness/testing-capability-readiness";
import { resetTestingProfileWorkState } from "../helpers/reset/testing-profile-work-state-reset";
import { enableAllTestingProviderSandboxes } from "../helpers/provider-runtime/testing-provider-runtime";
import { asRecord } from "../helpers/utils/as-record";

const SCENARIO = {
  id: "proposal-email-follow-up",
  scenario:
    "A proactive follow-up is saved as a deferred email proposal, appears in profile context, reuses the active proposal on duplicate creation, and approval converts it to one Gmail send action.",
} as const;
const PROFILE_PROPOSAL_CREATE_TOOL = "proposal_create";
const PROFILE_OVERVIEW_GET_TOOL = "profile_context_get";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function toolCallId(toolName: string): string {
  return `e2e-${toolName}-${randomUUID()}`;
}

async function executeProfileTool(input: {
  db: Awaited<ReturnType<typeof useE2eDb>>;
  agentId: string;
  toolName: string;
  params: Record<string, unknown>;
  sessionKey: string;
}) {
  const callId = toolCallId(input.toolName);
  const result = await executeE2eBackendTool(input.db, {
    agentId: input.agentId,
    toolName: input.toolName,
    toolCallId: callId,
    params: input.params,
    invocation: {
      agentId: input.agentId,
      toolCallId: callId,
      sessionKey: input.sessionKey,
      requestId: callId,
      runKind: "manual",
      runKindSource: "default",
    },
  });
  assert.ok(
    "data" in result,
    `${input.toolName} expected data result, got ${JSON.stringify(result)}`,
  );
  return result.data;
}

async function loadTestingProfileDecisionUserId(input: {
  db: Awaited<ReturnType<typeof useE2eDb>>;
  profileId: string;
}): Promise<string> {
  const result = await input.db
    .from("profiles")
    .select("user_id")
    .eq("id", input.profileId)
    .single();
  const profile = requireSupabaseData(
    "Load testing profile user for proposal approval decision",
    result.data,
    result.error,
  );
  return requireString(profile.user_id, "testing profile user_id");
}

function executedGmailSendResult(action: TableRow<"profile_actions">): string {
  assert.equal(action.status, "executed");
  assert.equal(action.provider_execution_status, "completed");
  const payload =
    action.result_payload &&
    typeof action.result_payload === "object" &&
    !Array.isArray(action.result_payload)
      ? (action.result_payload as Record<string, unknown>)
      : {};
  const result =
    payload.result && typeof payload.result === "object" && !Array.isArray(payload.result)
      ? (payload.result as Record<string, unknown>)
      : {};
  return requireString(result.id, "executed Gmail send result.id");
}

async function ensureSeeding(input: { run: E2eRun; db: SupabaseServiceClient }) {
  await resetTestingProfileWorkState(input.db, input.run.agentId);
  await requireTestingCapabilitiesConnected(input.db, [
    {
      capabilitySlug: "gmail",
      provider: "gmail",
      label: SCENARIO.id,
      requiredOAuthScopes: [GMAIL_SEND_SCOPE],
    },
  ]);

  const marker = createMarker("proposal-follow-up");
  const reference = clientReferenceForMarker(marker);
  await enableAllTestingProviderSandboxes(input.db, { capabilities: ["gmail"] });
  const { binding } = await seedGmailSendSandboxForE2e(input.db);
  const decisionUserId = await loadTestingProfileDecisionUserId({
    db: input.db,
    profileId: input.run.agentId,
  });
  const sessionKey = `agent:${input.run.agentId}:e2e:${SCENARIO.id}:${markerEmailLocalPart(marker)}`;
  const subject = `Jordan Rowan follow-up ${reference}`;
  const bodyText = [
    "Hi Michael,",
    "",
    `I reviewed the latest Jordan Rowan package for ${reference}. The next step looks clear on my side.`,
    "Could you send the updated deck when you have a chance?",
    "",
    "Best,",
    "John",
  ].join("\n");

  return {
    marker,
    reference,
    connectedAccountId: binding.account.id,
    decisionUserId,
    sessionKey,
    subject,
    bodyText,
  };
}

async function deleteProposal(input: {
  proposal: TableRow<"profile_proposals"> | null;
  db: Awaited<ReturnType<typeof useE2eDb>>;
}): Promise<void> {
  if (!input.proposal) return;
  const deleted = await input.db.from("profile_proposals").delete().eq("id", input.proposal.id);
  requireSupabaseData("Delete proposal E2E row", deleted.data ?? [], deleted.error);
}

test(`${SCENARIO.id}: ${SCENARIO.scenario}`, async (t) => {
  const run = await createE2eRun(t, {
    id: SCENARIO.id,
    requiredEnv: ["AI_ASSISTANTS_E2E_GMAIL_TO"],
  });
  enableE2eTestChannel(run);
  await attachE2eSupabase(run);
  const db = await useE2eDb();
  const recipientEmail = process.env.AI_ASSISTANTS_E2E_GMAIL_TO?.trim();
  assert.ok(recipientEmail, "AI_ASSISTANTS_E2E_GMAIL_TO must be set for proposal email E2E");
  const { reference, connectedAccountId, decisionUserId, sessionKey, subject, bodyText } =
    await ensureSeeding({ run, db });
  let proposal: TableRow<"profile_proposals"> | null = null;
  const trackedActions: TableRow<"profile_actions">[] = [];

  try {
    const createData = toolContractByName(
      proposalsToolContracts,
      PROFILE_PROPOSAL_CREATE_TOOL,
    ).outputSchema.parse(
      await executeProfileTool({
        db,
        agentId: run.agentId,
        toolName: PROFILE_PROPOSAL_CREATE_TOOL,
        sessionKey,
        params: {
          proposalKind: "gmail.email.follow_up",
          title: `Suggested follow-up for Jordan Rowan ${reference}`,
          summary: "Proactive sweep found a concrete client follow-up ready for John to review.",
          proposalPayload: {
            email: {
              connectedAccountId,
              to: [recipientEmail],
              cc: [],
              bcc: [],
              subject,
              bodyText,
              profileFileIds: [],
              expectedProfileFileSha256ById: {},
            },
            sourceCheckedAt: new Date().toISOString(),
            sourceMondayRecords: [],
          },
          evidence: {
            rationale:
              "Daily follow-up sweep found a Jordan Rowan client email that is ready for later review.",
          },
        },
      }),
    );
    assert.equal(createData.created, true);
    assert.equal(createData.proposal.kind, "gmail.email.follow_up");
    assert.equal(createData.proposal.status, "proposed");

    const loadedProposal = await db
      .from("profile_proposals")
      .select()
      .eq("id", createData.proposal.proposalId)
      .single();
    proposal = requireSupabaseData(
      "Load created proposal",
      loadedProposal.data,
      loadedProposal.error,
    );

    const overviewData = toolContractByName(
      profileContextToolContracts,
      PROFILE_OVERVIEW_GET_TOOL,
    ).outputSchema.parse(
      await executeProfileTool({
        db,
        agentId: run.agentId,
        toolName: PROFILE_OVERVIEW_GET_TOOL,
        sessionKey,
        params: {},
      }),
    );
    assert.ok(
      overviewData.overview.operationalContext.activeProposals.some(
        (entry) => entry.proposalId === proposal?.id && entry.kind === "gmail.email.follow_up",
      ),
      "profile_context_get must include the active email follow-up proposal",
    );

    const duplicateData = toolContractByName(
      proposalsToolContracts,
      PROFILE_PROPOSAL_CREATE_TOOL,
    ).outputSchema.parse(
      await executeProfileTool({
        db,
        agentId: run.agentId,
        toolName: PROFILE_PROPOSAL_CREATE_TOOL,
        sessionKey,
        params: {
          proposalKind: "gmail.email.follow_up",
          title: `Suggested follow-up for Jordan Rowan ${reference}`,
          summary: "Proactive sweep found a concrete client follow-up ready for John to review.",
          proposalPayload: proposal.proposal_payload,
          evidence: proposal.evidence,
        },
      }),
    );
    assert.equal(duplicateData.created, false);
    assert.equal(duplicateData.proposal.proposalId, proposal.id);

    const approved = await approveProfileProposalFromPortal(db, {
      profileId: run.agentId,
      proposalId: proposal.id,
      expectedRevision: proposal.revision,
      userId: decisionUserId,
    });
    proposal = approved.proposal;
    assert.equal(approved.proposal.status, "converted");
    assert.ok(
      approved.action,
      "proposal approval should create and execute a linked profile action",
    );
    trackedActions.push(approved.action);
    assert.equal(approved.proposal.converted_profile_action_id, approved.action.id);
    const providerMessageId = executedGmailSendResult(approved.action);
    assert.ok(
      providerMessageId.startsWith("sandbox-gmail-"),
      "approved proposal should execute through Gmail sandbox",
    );
    const sandboxRequests = await loadGmailSendSandboxRequests(db, {
      createdAfterMs: run.diagnosticsStartMs,
    });
    assert.equal(sandboxRequests.length, 1);
    const sandboxResponse = asRecord(sandboxRequests[0]!.response, "Gmail sandbox send response");
    assert.equal(sandboxResponse.id, providerMessageId);

    await assert.rejects(
      () =>
        approveProfileProposalFromPortal(db, {
          profileId: run.agentId,
          proposalId: proposal!.id,
          expectedRevision: proposal!.revision,
          userId: decisionUserId,
        }),
      /not proposed/,
    );
  } finally {
    await deleteProposal({ db, proposal });
    await cleanupTestingProfileActions(db, trackedActions, { runId: run.runId });
  }
});
