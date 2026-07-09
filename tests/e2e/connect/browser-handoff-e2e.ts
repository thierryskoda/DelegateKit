#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { browserHandoffResponseSchema } from "@ai-assistants/connect-api-contracts";
import { createClient } from "@supabase/supabase-js";
import { createPortalAccessLinkForPath } from "../../../apps/backend/src/test-support/profile-access";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import { useE2eDb } from "../helpers/db/e2e-db";
import { startBackend } from "../helpers/processes/start-backend";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { testingClientPlusEmail } from "../helpers/test-data/testing-realistic-data";

const SCENARIO_ID = "browser-handoff-connect";
const PROFILE_ID = "testing";
const CONNECT_PUBLIC_URL = "http://127.0.0.1:15174";

function setEnv(key: string, value: string, restore: Map<string, string | undefined>): void {
  if (!restore.has(key)) restore.set(key, process.env[key]);
  process.env[key] = value;
}

async function deleteWhere(
  label: string,
  operation: PromiseLike<{ error: unknown }>,
): Promise<void> {
  const result = await operation;
  assert.equal(result.error, null, label);
}

async function cleanupRows(input: {
  db: SupabaseServiceClient;
  marker: string;
  otherProfileId: string | null;
  otherUserId: string | null;
}): Promise<void> {
  await deleteWhere(
    "delete browser handoff rows",
    input.db.from("browser_handoffs").delete().like("browserbase_session_id", `%${input.marker}%`),
  );
  await deleteWhere(
    "delete browser browser task rows",
    input.db.from("browser_tasks").delete().like("dedupe_key", `%${input.marker}%`),
  );
  if (input.otherProfileId) {
    await deleteWhere(
      "delete alternate profile",
      input.db.from("profiles").delete().eq("id", input.otherProfileId),
    );
  }
  if (input.otherUserId) {
    const deleted = await input.db.auth.admin.deleteUser(input.otherUserId);
    assert.equal(deleted.error, null, "delete alternate auth user");
  }
}

async function profileRow(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<TableRow<"profiles">> {
  const result = await db.from("profiles").select().eq("id", profileId).single();
  return requireSupabaseData("Load profile", result.data, result.error);
}

async function portalAccessToken(input: {
  db: SupabaseServiceClient;
  supabaseUrl: string;
  anonKey: string;
  profile: TableRow<"profiles">;
  handoffId: string;
}): Promise<string> {
  const link = await createPortalAccessLinkForPath(input.db, input.profile, {
    portalPath: `/assistants/${input.profile.id}/browser-handoff/${input.handoffId}`,
    section: "integrations",
  });
  const url = new URL(link.url);
  const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const tokenHash = hash.get("oc_token_hash");
  const authType = hash.get("oc_auth_type");
  assert.ok(tokenHash, "Portal access URL should include oc_token_hash.");
  assert.ok(authType === "magiclink" || authType === "gmail");
  const authClient = createClient(input.supabaseUrl, input.anonKey);
  const otp = await authClient.auth.verifyOtp({ token_hash: tokenHash, type: authType });
  assert.equal(otp.error, null, otp.error?.message);
  const accessToken = otp.data.session?.access_token;
  assert.ok(accessToken, "Portal access should return an access token.");
  return accessToken;
}

async function seedBrowserHandoff(input: {
  db: SupabaseServiceClient;
  marker: string;
  profileId: string;
  status: "waiting" | "completed" | "cancelled" | "expired";
  expiresAt?: string;
}): Promise<{ browserTask: TableRow<"browser_tasks">; handoff: TableRow<"browser_handoffs"> }> {
  const browserTaskId = randomUUID();
  const handoffId = randomUUID();
  const browserTaskResult = await input.db
    .from("browser_tasks")
    .insert({
      id: browserTaskId,
      profile_id: input.profileId,
      mode: "auth_context_setup",
      status: "waiting",
      dedupe_key: `browser-handoff-connect:${input.marker}:${handoffId}`,
      goal: `Browser handoff portal flow ${input.marker}`,
      summary: "Browser handoff seeded for Connect portal validation.",
      state: {
        provider: "browserbase-stagehand",
        mode: "auth_context_setup",
        objective: `Secure website sign-in ${input.marker}`,
        startUrl: "https://example.com",
        currentUrl: "https://example.com",
        authContextId: null,
        artifacts: [],
      },
      wait: {
        reason: "login_required",
        handoffId,
      },
    })
    .select()
    .single();
  const browserTask = requireSupabaseData(
    "Seed browser handoff browser task",
    browserTaskResult.data,
    browserTaskResult.error,
  );
  const handoffResult = await input.db
    .from("browser_handoffs")
    .insert({
      id: handoffId,
      profile_id: input.profileId,
      browser_task_id: browserTask.id,
      browser_auth_context_id: null,
      browserbase_session_id: `session_${input.marker}_${handoffId}`,
      reason: "login_required",
      status: input.status,
      client_url: `${CONNECT_PUBLIC_URL}/assistants/${input.profileId}/browser-handoff/${handoffId}`,
      expires_at: input.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
      completed_at: input.status === "completed" ? new Date().toISOString() : null,
      cancelled_at: input.status === "cancelled" ? new Date().toISOString() : null,
    })
    .select()
    .single();
  const handoff = requireSupabaseData(
    "Seed browser handoff",
    handoffResult.data,
    handoffResult.error,
  );
  return { browserTask, handoff };
}

async function parseOkHandoffResponse(response: Response) {
  const text = await response.text();
  assert.equal(response.status, 200, text);
  return browserHandoffResponseSchema.parse(JSON.parse(text));
}

test("Connect browser handoff routes are profile-scoped and hide live view after close or expiry.", async (t) => {
  const restore = new Map<string, string | undefined>();
  setEnv("CONNECT_PUBLIC_URL", CONNECT_PUBLIC_URL, restore);
  t.after(() => {
    for (const [key, value] of restore) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const run = await createE2eRun(t, { id: SCENARIO_ID });
  const supabase = await attachE2eSupabase(run);
  const db = await useE2eDb();
  const backend = await startBackend(run, { supabase });
  const marker = createMarker(SCENARIO_ID);
  let otherProfileId: string | null = null;
  let otherUserId: string | null = null;
  run.cleanup.add(() => cleanupRows({ db, marker, otherProfileId, otherUserId }));

  const completed = await seedBrowserHandoff({
    db,
    marker,
    profileId: PROFILE_ID,
    status: "completed",
  });
  const waitingToComplete = await seedBrowserHandoff({
    db,
    marker,
    profileId: PROFILE_ID,
    status: "waiting",
  });
  const waitingToCancel = await seedBrowserHandoff({
    db,
    marker,
    profileId: PROFILE_ID,
    status: "waiting",
  });
  const expired = await seedBrowserHandoff({
    db,
    marker,
    profileId: PROFILE_ID,
    status: "waiting",
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  });

  const profile = await profileRow(db, PROFILE_ID);
  const accessToken = await portalAccessToken({
    db,
    supabaseUrl: supabase.url,
    anonKey: supabase.anonKey,
    profile,
    handoffId: completed.handoff.id,
  });

  const completedResponse = await fetch(
    `${backend.baseUrl}/profiles/${PROFILE_ID}/browser-handoffs/${completed.handoff.id}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  const completedBody = await parseOkHandoffResponse(completedResponse);
  assert.equal(completedBody.handoff.status, "completed");
  assert.equal(completedBody.handoff.liveViewUrl, null);

  const expiredResponse = await fetch(
    `${backend.baseUrl}/profiles/${PROFILE_ID}/browser-handoffs/${expired.handoff.id}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  const expiredBody = await parseOkHandoffResponse(expiredResponse);
  assert.equal(expiredBody.handoff.status, "expired");
  assert.equal(expiredBody.handoff.liveViewUrl, null);

  const completeResponse = await fetch(
    `${backend.baseUrl}/profiles/${PROFILE_ID}/browser-handoffs/${waitingToComplete.handoff.id}/complete`,
    { method: "POST", headers: { authorization: `Bearer ${accessToken}` } },
  );
  const completeBody = await parseOkHandoffResponse(completeResponse);
  assert.equal(completeBody.handoff.status, "completed");
  assert.equal(completeBody.handoff.liveViewUrl, null);

  const cancelResponse = await fetch(
    `${backend.baseUrl}/profiles/${PROFILE_ID}/browser-handoffs/${waitingToCancel.handoff.id}/cancel`,
    { method: "POST", headers: { authorization: `Bearer ${accessToken}` } },
  );
  const cancelBody = await parseOkHandoffResponse(cancelResponse);
  assert.equal(cancelBody.handoff.status, "cancelled");
  assert.equal(cancelBody.handoff.liveViewUrl, null);

  const cancelledTaskResult = await db
    .from("browser_tasks")
    .select()
    .eq("id", waitingToCancel.browserTask.id)
    .single();
  const cancelledTask = requireSupabaseData(
    "Load cancelled browser handoff task",
    cancelledTaskResult.data,
    cancelledTaskResult.error,
  );
  assert.equal(cancelledTask.status, "cancelled");

  const otherEmail = testingClientPlusEmail(`browser.handoff.${marker}`);
  const otherUser = await db.auth.admin.createUser({
    email: otherEmail,
    email_confirm: true,
  });
  assert.equal(otherUser.error, null, otherUser.error?.message);
  assert.ok(otherUser.data.user);
  otherUserId = otherUser.data.user.id;
  otherProfileId = `handoff-${marker.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`
    .slice(0, 60)
    .replace(/-+$/g, "");
  const otherProfileResult = await db
    .from("profiles")
    .insert({
      id: otherProfileId,
      user_id: otherUserId,
      display_name: "Browser Handoff Guest",
      status: "active",
      timezone: "America/Toronto",
      metadata: {},
      preferences: {},
    })
    .select()
    .single();
  requireSupabaseData(
    "Seed alternate browser handoff profile",
    otherProfileResult.data,
    otherProfileResult.error,
  );
  const otherHandoff = await seedBrowserHandoff({
    db,
    marker,
    profileId: otherProfileId,
    status: "completed",
  });
  const forbiddenResponse = await fetch(
    `${backend.baseUrl}/profiles/${otherProfileId}/browser-handoffs/${otherHandoff.handoff.id}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  assert.equal(forbiddenResponse.status, 403, await forbiddenResponse.text());
});
