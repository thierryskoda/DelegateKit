#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
} from "@ai-assistants/control-db";
import { profileContextToolContracts } from "@ai-assistants/profile-context-contracts/contracts";
import { runJsonJudge } from "@ai-assistants/llm-judge";
import { z } from "zod";
import { decideProfileActionFromPortal } from "../../../apps/backend/src/test-support/actions";
import {
  completeAssistantWorkItem,
  ignoreAssistantWorkItem,
} from "../../../apps/backend/src/test-support/work-items";
import { recordArtifact } from "../../../apps/backend/src/test-support/artifacts";
import { cleanupAssistantWorkItemsForRun } from "../helpers/db/e2e-resource-cleanup";
import { useE2eDb } from "../helpers/db/e2e-db";
import { seedTestingAssistantWorkItem } from "../helpers/fixtures/assistant-work-item-fixture";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import { executeTypedCapabilityTool } from "../helpers/run/execute-capability-backend-tool";
import { requireTestingE2eAgent } from "../helpers/run/testing-launch-support";

const TEST_ID = "agent-activity-context";
const PROFILE_ID = "testing";

type ActivitySource = {
  kind: string;
  id: string;
};

async function profileActivitySearch(db: SupabaseServiceClient, params: Record<string, unknown>) {
  return executeTypedCapabilityTool(db, profileContextToolContracts, {
    capabilityId: "activity",
    toolName: "profile_activity_search",
    params,
  });
}

async function loadActivityEntry(input: {
  db: SupabaseServiceClient;
  sourceKind: string;
  sourceId: string;
  eventType: string;
}) {
  const result = await input.db
    .from("agent_events")
    .select()
    .eq("profile_id", PROFILE_ID)
    .order("occurred_at", { ascending: false });
  const rows = requireSupabaseRows(
    `Load ${input.eventType} activity entry for ${input.sourceKind}:${input.sourceId}`,
    result.data,
    result.error,
  );
  const match = rows.find((row) => {
    const payload =
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {};
    const metadata =
      payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)
        ? (payload.metadata as Record<string, unknown>)
        : {};
    return (
      payload.sourceKind === input.sourceKind &&
      payload.sourceId === input.sourceId &&
      metadata.activityEventType === input.eventType
    );
  });
  assert.ok(
    match,
    `Expected ${input.eventType} for ${input.sourceKind}:${input.sourceId}; got ${rows
      .map((row) => `${row.event_type}:${row.id}`)
      .join(", ")}`,
  );
  return match;
}

function payloadObject(
  row: Awaited<ReturnType<typeof loadActivityEntry>>,
): Record<string, unknown> {
  return row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? (row.payload as Record<string, unknown>)
    : {};
}

function payloadStringArray(row: Awaited<ReturnType<typeof loadActivityEntry>>, key: string) {
  const value = payloadObject(row)[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function payloadString(row: Awaited<ReturnType<typeof loadActivityEntry>>, key: string): string {
  const value = payloadObject(row)[key];
  assert.equal(typeof value, "string", `Expected activity payload.${key} to be a string.`);
  return String(value);
}

const activitySummaryJudgeSchema = z
  .object({
    is_correct: z.boolean(),
    reason: z.string(),
    evidence: z.array(z.string()),
  })
  .strict();

async function expectActivitySummaryJudgePass(input: {
  rootDir: string;
  runtimeRoot: string;
  marker: string;
  source: {
    title: string;
    detail: string;
    instructions: string;
    resultSummary: string;
  };
  activity: {
    title: string;
    summary: string;
  };
}): Promise<void> {
  const criteria = [
    "The durable activity summary preserves the important meaning of the completed work item: Northstar payroll exception review and skipped contractor payment follow-up.",
    "The durable activity title and summary do not expose the raw internal diagnostic token.",
    "The activity summary is concise durable history rather than a transcript dump.",
  ] as const;
  const judged = await runJsonJudge({
    id: "agent-activity-context-summary",
    repoRoot: input.rootDir,
    promptVersion: 1,
    schemaVersion: 1,
    schema: activitySummaryJudgeSchema,
    instructions: [
      "Grade whether a durable activity entry preserves the meaning of a completed assistant work item.",
      "Use only the provided source work item, completion result, and persisted activity fields.",
      'Schema: {"is_correct":boolean,"reason":string,"evidence":string[]}',
      'Reason contract: if is_correct is true, reason MUST be exactly "". If is_correct is false, reason MUST explain the failure.',
      "",
      "Pass only if every criterion is satisfied:",
      ...criteria.map((criterion) => `- ${criterion}`),
    ].join("\n"),
    evidence: {
      marker: input.marker,
      source: input.source,
      activity: input.activity,
    },
  });

  const judgeDir = path.join(input.runtimeRoot, "judge-results");
  mkdirSync(judgeDir, { recursive: true });
  writeFileSync(
    path.join(judgeDir, "agent-activity-context-summary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        marker: input.marker,
        criteria,
        judge: {
          cacheKey: judged.cacheKey,
          cacheStatus: judged.cacheStatus,
          runRef: judged.runRef,
          codexThreadId: judged.codexThreadId,
          result: judged.result,
        },
      },
      null,
      2,
    )}\n`,
  );

  assert.equal(judged.result.is_correct, true, judged.result.reason);
  assert.equal(
    judged.result.reason,
    "",
    "activity summary judge reason must be empty when passing",
  );
}

function requireSearchResult(
  activities: Readonly<Awaited<ReturnType<typeof profileActivitySearch>>["activities"]>,
  input: { eventType: string; sourceKind: string; sourceId: string },
) {
  const match = activities.find(
    (activity) =>
      activity.eventType === input.eventType &&
      activity.source.kind === input.sourceKind &&
      activity.source.id === input.sourceId,
  );
  assert.ok(
    match,
    `Expected ${input.eventType} for ${input.sourceKind}:${input.sourceId}; got ${activities
      .map((activity) => `${activity.eventType}:${activity.source.kind}:${activity.source.id}`)
      .join(", ")}`,
  );
  return match;
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function cleanupActivityForSources(
  db: SupabaseServiceClient,
  sources: readonly ActivitySource[],
): Promise<void> {
  for (const source of sources) {
    const deletedRows = await db
      .from("agent_events")
      .delete()
      .eq("profile_id", PROFILE_ID)
      .like("source_event_key", `agent_activity:%:${source.kind}:${source.id}`);
    requireSupabaseData(
      `Delete activity rows for ${source.kind}:${source.id}`,
      deletedRows.data ?? [],
      deletedRows.error,
    );
  }
}

async function cleanupRows(input: {
  db: SupabaseServiceClient;
  sources: readonly ActivitySource[];
  workItemIds: ReadonlySet<string>;
  artifactIds: readonly string[];
  actionId: string | null;
  runId: string;
}): Promise<void> {
  await cleanupActivityForSources(input.db, input.sources);
  if (input.actionId) {
    const deletedAction = await input.db.from("profile_actions").delete().eq("id", input.actionId);
    requireSupabaseData(
      "Delete activity E2E profile action",
      deletedAction.data ?? [],
      deletedAction.error,
    );
  }
  if (input.artifactIds.length > 0) {
    const deletedArtifact = await input.db.from("artifacts").delete().in("id", input.artifactIds);
    requireSupabaseData(
      "Delete activity E2E artifacts",
      deletedArtifact.data ?? [],
      deletedArtifact.error,
    );
  }
  await cleanupAssistantWorkItemsForRun(input.db, input.workItemIds, input.runId);
}

test("profile_activity_search finds durable activity from work items, artifacts, and provider action outcomes.", async (t) => {
  requireTestingE2eAgent();
  const run = await createE2eRun(t, {
    id: TEST_ID,
    requiredEnv: ["OPENAI_API_KEY", "DEEPSEEK_API_KEY"],
  });
  await attachE2eSupabase(run);
  const db = await useE2eDb();
  const marker = createMarker(TEST_ID);
  const activitySince = new Date(run.diagnosticsStartMs - 1_000).toISOString();
  const sources: ActivitySource[] = [];
  const workItemIds = new Set<string>();
  const artifactIds: string[] = [];
  let actionId: string | null = null;

  assert.equal(
    profileContextToolContracts.some((contract) => String(contract.name) === "activity_record"),
    false,
    "v1 must not expose an agent-facing activity write tool",
  );

  try {
    const workTitle = "Laurentian receivables review";
    const seededWork = await seedTestingAssistantWorkItem(db, {
      profileId: PROFILE_ID,
      dedupeKey: `agent-activity-work-${marker}`,
      title: workTitle,
      detail: "Review the latest receivables aging movement for Laurentian payroll accounts.",
      instructions:
        "Summarize the collection risk and mention whether yesterday's review already covered the same invoices.",
    });
    workItemIds.add(seededWork.workItemId);
    sources.push({ kind: "work_item", id: seededWork.workItemId });

    const workSessionKey = `agent:${PROFILE_ID}:e2e:${TEST_ID}:${marker}`;
    const claimTime = new Date().toISOString();
    const claimedWork = await db
      .from("assistant_work_items")
      .update({
        status: "claimed",
        claimed_by_agent_id: PROFILE_ID,
        claimed_by_session_key: workSessionKey,
        claim_token: randomUUID(),
        claim_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        claimed_at: claimTime,
        updated_at: claimTime,
      })
      .eq("id", seededWork.workItemId);
    requireSupabaseData("Claim activity E2E work item", claimedWork.data ?? [], claimedWork.error);

    await completeAssistantWorkItem(db, {
      profileId: PROFILE_ID,
      workItemId: seededWork.workItemId,
      agentId: PROFILE_ID,
      sessionKey: workSessionKey,
      result: {
        summary:
          "Completed the Laurentian receivables review and found no duplicate invoice escalation from yesterday.",
        outcome: "No collection escalation was needed.",
      },
    });
    const workActivity = await loadActivityEntry({
      db,
      sourceKind: "work_item",
      sourceId: seededWork.workItemId,
      eventType: "work_item.completed",
    });
    assert.ok(
      payloadStringArray(workActivity, "referenceKeys").includes(
        `work_item:${seededWork.workItemId}`,
      ),
    );

    const ignoredWork = await seedTestingAssistantWorkItem(db, {
      profileId: PROFILE_ID,
      dedupeKey: `agent-activity-ignored-work-${marker}`,
      title: "Ignore stale Quebec supplier prompt",
      detail:
        "A stale supplier prompt that should remain in durable history without semantic recall.",
      instructions: "Ignore this stale supplier prompt.",
    });
    workItemIds.add(ignoredWork.workItemId);
    sources.push({ kind: "work_item", id: ignoredWork.workItemId });

    const ignoredSessionKey = `agent:${PROFILE_ID}:e2e:${TEST_ID}:ignored:${marker}`;
    const ignoredClaimTime = new Date().toISOString();
    const claimedIgnoredWork = await db
      .from("assistant_work_items")
      .update({
        status: "claimed",
        claimed_by_agent_id: PROFILE_ID,
        claimed_by_session_key: ignoredSessionKey,
        claim_token: randomUUID(),
        claim_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        claimed_at: ignoredClaimTime,
        updated_at: ignoredClaimTime,
      })
      .eq("id", ignoredWork.workItemId);
    requireSupabaseData(
      "Claim ignored activity E2E work item",
      claimedIgnoredWork.data ?? [],
      claimedIgnoredWork.error,
    );

    await ignoreAssistantWorkItem(db, {
      profileId: PROFILE_ID,
      workItemId: ignoredWork.workItemId,
      agentId: PROFILE_ID,
      sessionKey: ignoredSessionKey,
      result: {
        summary: "Ignored stale supplier prompt because it is no longer relevant.",
        outcome: "No action was needed.",
      },
    });
    const ignoredActivity = await loadActivityEntry({
      db,
      sourceKind: "work_item",
      sourceId: ignoredWork.workItemId,
      eventType: "work_item.ignored",
    });
    assert.ok(
      payloadStringArray(ignoredActivity, "referenceKeys").includes(
        `work_item:${ignoredWork.workItemId}`,
      ),
    );

    const semanticWorkSource = {
      title: "Northstar payroll exception review",
      detail:
        "Review the Northstar payroll exception and decide whether the skipped contractor payment still needs follow-up.",
      instructions:
        "Summarize the payroll exception outcome. Internal diagnostic token secret_token_Northstar_4921 must never appear in durable activity text.",
    };
    const semanticWork = await seedTestingAssistantWorkItem(db, {
      profileId: PROFILE_ID,
      dedupeKey: `agent-activity-semantic-work-${marker}`,
      ...semanticWorkSource,
    });
    workItemIds.add(semanticWork.workItemId);
    sources.push({ kind: "work_item", id: semanticWork.workItemId });

    const semanticSessionKey = `agent:${PROFILE_ID}:e2e:${TEST_ID}:semantic:${marker}`;
    const semanticClaimTime = new Date().toISOString();
    const claimedSemanticWork = await db
      .from("assistant_work_items")
      .update({
        status: "claimed",
        claimed_by_agent_id: PROFILE_ID,
        claimed_by_session_key: semanticSessionKey,
        claim_token: randomUUID(),
        claim_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        claimed_at: semanticClaimTime,
        updated_at: semanticClaimTime,
      })
      .eq("id", semanticWork.workItemId);
    requireSupabaseData(
      "Claim semantic activity E2E work item",
      claimedSemanticWork.data ?? [],
      claimedSemanticWork.error,
    );

    await completeAssistantWorkItem(db, {
      profileId: PROFILE_ID,
      workItemId: semanticWork.workItemId,
      agentId: PROFILE_ID,
      sessionKey: semanticSessionKey,
      result: {
        summary:
          "Completed the Northstar payroll exception review and confirmed the contractor payment still needs follow-up.",
      },
    });
    const semanticActivity = await loadActivityEntry({
      db,
      sourceKind: "work_item",
      sourceId: semanticWork.workItemId,
      eventType: "work_item.completed",
    });
    const semanticActivityTitle = payloadString(semanticActivity, "title");
    const semanticActivitySummary = payloadString(semanticActivity, "summary");
    await expectActivitySummaryJudgePass({
      rootDir: run.rootDir,
      runtimeRoot: run.runtimeRoot,
      marker,
      source: {
        ...semanticWorkSource,
        resultSummary:
          "Completed the Northstar payroll exception review and confirmed the contractor payment still needs follow-up.",
      },
      activity: {
        title: semanticActivityTitle,
        summary: semanticActivitySummary,
      },
    });
    assert.doesNotMatch(
      `${semanticActivityTitle}\n${semanticActivitySummary}`,
      /secret_token_Northstar_4921/,
      "semantic activity summary must not persist raw secret-like prompt evidence",
    );

    const artifactContent =
      "Mira Foods cash runway memo covering treasury exposure, covenant headroom, and liquidity next steps.";
    const artifact = await recordArtifact(db, {
      profileId: PROFILE_ID,
      storageKey: `e2e/${TEST_ID}/${marker}/mira-foods-cash-runway.md`,
      filename: `Mira Foods cash runway ${marker}.md`,
      artifactType: "markdown_report",
      description:
        "Treasury memo for Mira Foods covering cash runway, covenant headroom, and supplier payment timing.",
      mimeType: "text/markdown",
      byteSize: Buffer.byteLength(artifactContent),
      sha256: sha256(artifactContent),
      metadata: { marker, company: "Mira Foods" },
    });
    artifactIds.push(artifact.id);
    sources.push({ kind: "artifact", id: artifact.id });
    const artifactActivity = await loadActivityEntry({
      db,
      sourceKind: "artifact",
      sourceId: artifact.id,
      eventType: "artifact.created",
    });
    assert.ok(
      payloadStringArray(artifactActivity, "referenceKeys").includes(`artifact:${artifact.id}`),
    );

    const browserResultArtifact = await recordArtifact(db, {
      profileId: PROFILE_ID,
      storageKey: `e2e/${TEST_ID}/${marker}/browser-result.json`,
      filename: `web-browser-extract-result ${marker}.json`,
      artifactType: "public_web.browser.result_json",
      description:
        "Raw browser extraction result for a completed setup step; useful for exact audit only.",
      mimeType: "application/json",
      byteSize: Buffer.byteLength("{}"),
      sha256: sha256(`browser-result-${marker}`),
      metadata: { marker, provider: "public_web" },
    });
    artifactIds.push(browserResultArtifact.id);
    sources.push({ kind: "artifact", id: browserResultArtifact.id });
    const browserResultActivity = await loadActivityEntry({
      db,
      sourceKind: "artifact",
      sourceId: browserResultArtifact.id,
      eventType: "artifact.created",
    });
    assert.ok(
      payloadStringArray(browserResultActivity, "referenceKeys").includes(
        `artifact:${browserResultArtifact.id}`,
      ),
    );

    const profileResult = await db.from("profiles").select("user_id").eq("id", PROFILE_ID).single();
    const profile = requireSupabaseData(
      "Load testing profile user for action decision",
      profileResult.data,
      profileResult.error,
    );
    assert.ok(profile.user_id, "testing profile must have a portal user_id");

    const insertedAction = await db
      .from("profile_actions")
      .insert({
        profile_id: PROFILE_ID,
        tool_name: "gmail_message_send",
        action_type: "gmail.message.send",
        title: `Send Alta Quebec investor note ${marker}`,
        summary:
          "Send the investor update only after reviewing the latest Alta Quebec cash bridge.",
        idempotency_key: `agent-activity-action-${marker}-${randomUUID()}`,
        provider_idempotency_key: `agent-activity-provider-${marker}-${randomUUID()}`,
        request_hash: `agent-activity-request-${marker}-${randomUUID()}`,
        execution_payload: {
          connectedAccountId: "testing-gmail-primary",
          to: ["marc.lemieux@alta-quebec.example"],
          subject: `Alta Quebec cash bridge ${marker}`,
          bodyText: "The cash bridge has been reviewed and the follow-up note is ready.",
        },
        review_payload: {
          recipient: "Marc Lemieux",
          subject: `Alta Quebec cash bridge ${marker}`,
        },
        risk_level: "low",
        status: "pending_approval",
        provider_execution_status: "not_started",
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    const pendingAction = requireSupabaseData(
      "Create activity E2E profile action",
      insertedAction.data,
      insertedAction.error,
    );
    actionId = pendingAction.id;
    sources.push({ kind: "profile_action", id: pendingAction.id });

    const decision = await decideProfileActionFromPortal(db, {
      profileId: PROFILE_ID,
      actionId: pendingAction.id,
      userId: profile.user_id,
      decision: "reject",
    });
    assert.equal(decision.status, "rejected");
    const actionActivity = await loadActivityEntry({
      db,
      sourceKind: "profile_action",
      sourceId: pendingAction.id,
      eventType: "gmail.message.send.rejected",
    });
    assert.ok(
      payloadStringArray(actionActivity, "referenceKeys").includes(
        `profile_action:${pendingAction.id}`,
      ),
    );

    const exactWork = await profileActivitySearch(db, {
      query: "Laurentian receivables invoice escalation",
      limit: 5,
    });
    requireSearchResult(exactWork.activities, {
      eventType: "work_item.completed",
      sourceKind: "work_item",
      sourceId: seededWork.workItemId,
    });

    const eventFiltered = await profileActivitySearch(db, {
      eventTypes: ["gmail.message.send.rejected"],
      limit: 5,
    });
    requireSearchResult(eventFiltered.activities, {
      eventType: "gmail.message.send.rejected",
      sourceKind: "profile_action",
      sourceId: pendingAction.id,
    });

    const sourceFiltered = await profileActivitySearch(db, {
      query: "Mira Foods covenant headroom",
      sourceKinds: ["artifact"],
      limit: 5,
    });
    assert.equal(
      sourceFiltered.activities.every((activity) => activity.source.kind === "artifact"),
      true,
    );
    requireSearchResult(sourceFiltered.activities, {
      eventType: "artifact.created",
      sourceKind: "artifact",
      sourceId: artifact.id,
    });

    const referenceFiltered = await profileActivitySearch(db, {
      referenceKeys: [`profile_action:${pendingAction.id}`],
      limit: 5,
    });
    requireSearchResult(referenceFiltered.activities, {
      eventType: "gmail.message.send.rejected",
      sourceKind: "profile_action",
      sourceId: pendingAction.id,
    });

    const ignoredReferenceFiltered = await profileActivitySearch(db, {
      referenceKeys: [`work_item:${ignoredWork.workItemId}`],
      limit: 5,
    });
    requireSearchResult(ignoredReferenceFiltered.activities, {
      eventType: "work_item.ignored",
      sourceKind: "work_item",
      sourceId: ignoredWork.workItemId,
    });

    const semantic = await profileActivitySearch(db, {
      query: "supplier liquidity pressure and cash bridge",
      eventTypes: ["artifact.created"],
      sourceKinds: ["artifact"],
      since: activitySince,
      limit: 3,
    });
    assert.equal(semantic.activities[0]?.source.id, artifact.id);
    assert.equal(semantic.activities[0]?.eventType, "artifact.created");
  } finally {
    await cleanupRows({
      db,
      sources,
      workItemIds,
      artifactIds,
      actionId,
      runId: run.runId,
    });
  }
});
