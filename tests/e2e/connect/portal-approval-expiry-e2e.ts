#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { requireSupabaseData } from "@ai-assistants/control-db";
import { listPortalProfileActions } from "../../../apps/backend/src/test-support/actions";
import { cleanupTestingProfileActions } from "../helpers/fixtures/testing-profile-actions-fixture";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { useE2eDb } from "../helpers/db/e2e-db";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";

const PROFILE_ID = "testing";

test("Portal pending actions expire stale approvals before listing them.", async (t) => {
  const run = await createE2eRun(t, { id: "portal-approval-expiry" });
  await attachE2eSupabase(run);
  const db = await useE2eDb();
  const marker = createMarker("portal-approval-expiry");

  const inserted = await db
    .from("profile_actions")
    .insert(
      [
        { title: "Expired approval", expiresAt: new Date(Date.now() - 60_000).toISOString() },
        { title: "Live approval", expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() },
      ].map((action) => ({
        profile_id: PROFILE_ID,
        tool_name: "gmail_message_send",
        action_type: "gmail.message.send",
        title: `${action.title} ${marker}`,
        summary: "Portal approval expiry E2E fixture.",
        idempotency_key: `${marker}-${randomUUID()}`,
        provider_idempotency_key: `${marker}-${randomUUID()}`,
        request_hash: `${marker}-${randomUUID()}`,
        execution_payload: {},
        review_payload: {},
        risk_level: "low",
        status: "pending_approval" as const,
        provider_execution_status: "not_started" as const,
        expires_at: action.expiresAt,
      })),
    )
    .select();
  const actions = requireSupabaseData(
    "Create portal approval expiry actions",
    inserted.data,
    inserted.error,
  );
  run.cleanup.add(() => cleanupTestingProfileActions(db, actions, { runId: run.runId }));

  const listed = await listPortalProfileActions(db, PROFILE_ID, {
    statuses: ["pending_approval"],
  });

  assert.deepEqual(
    listed.filter((action) => action.title.endsWith(marker)).map((action) => action.title),
    [`Live approval ${marker}`],
  );
  const expiredAction = actions.find((action) => action.title.startsWith("Expired approval"));
  assert.ok(expiredAction);
  const expiredResult = await db
    .from("profile_actions")
    .select("status")
    .eq("id", expiredAction.id)
    .single();
  const expired = requireSupabaseData(
    "Load expired portal approval",
    expiredResult.data,
    expiredResult.error,
  );
  assert.equal(expired.status, "expired");
});
