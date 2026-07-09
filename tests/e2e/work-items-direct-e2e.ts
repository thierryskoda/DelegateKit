#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { test } from "node:test";
import { agentRunExecuteBackendJobKind } from "@ai-assistants/control-plane-contracts";
import { requireSupabaseData } from "@ai-assistants/control-db";
import { runWorkerJobById } from "../../apps/backend/src/test-support/worker";
import { attachE2eSupabase } from "./helpers/processes/attach-supabase";
import { createE2eRun, createMarker } from "./helpers/run/e2e-run";
import { requireTestingE2eAgent } from "./helpers/run/testing-launch-support";
import { useE2eDb } from "./helpers/db/e2e-db";
import { seedTestingAssistantWorkItem } from "./helpers/fixtures/assistant-work-item-fixture";
import { waitForAssistantWorkItemSucceeded } from "./helpers/work-items/assistant-work-item-wait";
import { asRecord } from "./helpers/utils/as-record";

const TEST_ID = "work-items-direct";
const TESTING_PROFILE_ID = "testing";

test("seeded assistant work item runs through direct agent.run.execute backend job", async (t) => {
  const run = await createE2eRun(t, {
    id: TEST_ID,
    requiredEnv: ["DEEPSEEK_API_KEY"],
    clearDiagnosticLogs: true,
  });
  requireTestingE2eAgent();
  await attachE2eSupabase(run);
  const db = await useE2eDb();
  const marker = createMarker("direct-work-item");

  const seeded = await seedTestingAssistantWorkItem(db, {
    profileId: TESTING_PROFILE_ID,
    dedupeKey: `direct-work-item:${marker}`,
    title: `Direct work item ${marker}`,
    detail: "E2E verification that work items run through the direct backend Mastra agent job.",
    instructions: [
      "Do not call tools.",
      `Complete this work item internally with one concise sentence that includes ${marker}.`,
      "Also include the words direct work item.",
    ].join(" "),
  });

  const jobDedupeKey = `${agentRunExecuteBackendJobKind}:work_item:${seeded.workItemId}`;
  const jobResult = await db
    .from("backend_jobs")
    .select()
    .eq("profile_id", TESTING_PROFILE_ID)
    .eq("kind", agentRunExecuteBackendJobKind)
    .eq("dedupe_key", jobDedupeKey)
    .single();
  const job = requireSupabaseData(
    `Load direct work item backend job ${jobDedupeKey}`,
    jobResult.data,
    jobResult.error,
  );

  const workerResult = await runWorkerJobById({
    db,
    jobId: job.id,
    workerId: `e2e-${TEST_ID}`,
  });
  assert.equal(workerResult.status, "succeeded");
  assert.equal(workerResult.result.workItemId, seeded.workItemId);
  assert.equal(workerResult.result.status, "succeeded");
  assert.equal(typeof workerResult.result.agentRunId, "string");

  const completed = await waitForAssistantWorkItemSucceeded(db, {
    workItemId: seeded.workItemId,
    timeoutMs: 30_000,
  });
  const result = asRecord(completed.result, "completed work item result");
  assert.equal(result.agentRunId, workerResult.result.agentRunId);
  assert.match(String(result.summary), new RegExp(marker));
  assert.match(String(result.summary), /direct work item/i);
});
