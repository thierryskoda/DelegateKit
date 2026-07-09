import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { readE2eLaneState } from "../../../scripts/repo-tooling/e2e-lane-state";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { createE2eRun } from "../helpers/run/e2e-run";

const HEARTBEAT_OBSERVATION_MS = 6_500;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required E2E environment variable ${name}.`);
  return value;
}

function assertProcessAlive(pid: number): void {
  try {
    process.kill(pid, 0);
  } catch {
    assert.fail(`Expected E2E lane owner pid ${pid} to be alive.`);
  }
}

test("E2E runner leases a fixed worker lane with a live heartbeat", async (t) => {
  const run = await createE2eRun(t, {
    id: "e2e-worker-lane-leasing",
    keepRunDir: false,
  });
  const supabase = await attachE2eSupabase(run);

  const laneId = requireEnv("AI_ASSISTANTS_E2E_LANE_ID");
  const projectId = requireEnv("AI_ASSISTANTS_E2E_SUPABASE_PROJECT_ID");
  const runtimeRoot = requireEnv("AI_ASSISTANTS_E2E_PROFILE_RUNTIME_ROOT");
  const supabaseWorkdir = requireEnv("AI_ASSISTANTS_E2E_SUPABASE_WORKDIR");
  const envPath = requireEnv("AI_ASSISTANTS_E2E_PROFILE_ENV_PATH");

  assert.match(laneId, /^e2e-lane-[12]$/);
  assert.equal(projectId, `code-${laneId}`);
  assert.equal(process.env.AI_ASSISTANTS_E2E_RUNNER_PREPARED, "1");
  assert.equal(supabase.url, process.env.SUPABASE_URL);

  const firstState = readE2eLaneState();
  const firstRecord = firstState.lanes.find((record) => record.laneId === laneId);
  assert.ok(firstRecord, `Expected lane state record for ${laneId}.`);
  assert.equal(firstRecord.state, "leased");
  assert.equal(firstRecord.projectId, projectId);
  assert.equal(runtimeRoot.endsWith(`/.ai-assistants-e2e-lanes/${laneId}`), true);
  assert.equal(supabaseWorkdir, runtimeRoot);
  assert.equal(envPath, `${runtimeRoot}/.env`);
  assert.equal(firstRecord.ownerCommand?.includes("run-e2e-tests.ts"), true);
  assert.ok(firstRecord.ownerPid, "Expected leased lane to record ownerPid.");
  assertProcessAlive(firstRecord.ownerPid);
  assert.ok(firstRecord.leaseToken, "Expected leased lane to have a fencing token.");
  assert.ok(firstRecord.generation > 0, "Expected lane generation to advance on claim.");

  const firstHeartbeatMs = Date.parse(firstRecord.heartbeatAt ?? "");
  assert.ok(Number.isFinite(firstHeartbeatMs), "Expected leased lane heartbeatAt timestamp.");

  await sleep(HEARTBEAT_OBSERVATION_MS);

  const secondState = readE2eLaneState();
  const secondRecord = secondState.lanes.find((record) => record.laneId === laneId);
  assert.ok(secondRecord, `Expected lane state record for ${laneId} after heartbeat wait.`);
  assert.equal(secondRecord.state, "leased");
  assert.equal(secondRecord.leaseToken, firstRecord.leaseToken);
  assert.equal(secondRecord.generation, firstRecord.generation);

  const secondHeartbeatMs = Date.parse(secondRecord.heartbeatAt ?? "");
  assert.ok(
    secondHeartbeatMs > firstHeartbeatMs,
    `Expected heartbeat to advance while E2E child is running; first=${firstRecord.heartbeatAt} second=${secondRecord.heartbeatAt}.`,
  );
});
