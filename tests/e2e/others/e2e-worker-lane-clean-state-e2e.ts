import assert from "node:assert/strict";
import { test } from "node:test";
import { useE2eDb } from "../helpers/db/e2e-db";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { createE2eRun } from "../helpers/run/e2e-run";
import { DEFAULT_E2E_AGENT_ID } from "../helpers/run/workspace";

const MARKER_KEY = "e2e_worker_lane_clean_state_marker";

test("E2E worker lane starts with clean marker state", async (t) => {
  const run = await createE2eRun(t, {
    id: "e2e-worker-lane-clean-state",
    keepRunDir: false,
  });
  await attachE2eSupabase(run);
  const db = await useE2eDb();
  const before = await db
    .from("profile_guidance")
    .select("id")
    .eq("profile_id", DEFAULT_E2E_AGENT_ID)
    .eq("key", MARKER_KEY);
  if (before.error) throw before.error;
  assert.equal(
    before.data.length,
    0,
    "Pre-run lane reset should remove marker rows from prior runs before this test starts.",
  );
  const inserted = await db.from("profile_guidance").insert({
    profile_id: DEFAULT_E2E_AGENT_ID,
    key: MARKER_KEY,
    title: "Worker lane clean state marker",
    selector_description:
      "A deterministic marker used by the E2E worker lane clean-state smoke test.",
    body_markdown:
      "This row should never be visible at the start of the next E2E command after pre-run lane reset.",
  });
  if (inserted.error) throw inserted.error;
});
