#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  requireSupabaseData,
  type SupabaseServiceClient,
} from "@ai-assistants/control-db";
import {
  portalBrowserHandoffResponseSchema,
  telegramMiniAppSessionResponseSchema,
} from "@ai-assistants/connect-api-contracts";
import { profileMiniAppLinkOutputSchema } from "@ai-assistants/profile-links-contracts/schemas";
import { createClient } from "@supabase/supabase-js";
import { executeE2eBackendTool } from "../../../apps/backend/src/test-support/backend-tools";
import { createE2eRun } from "../helpers/run/e2e-run";
import { useE2eDb } from "../helpers/db/e2e-db";
import { startBackend } from "../helpers/processes/start-backend";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { TESTING_AGENT_ID, requireTestingE2eAgent } from "../helpers/run/testing-launch-support";

const SCENARIO_ID = "telegram-mini-app-session";
const PROFILE_ID = TESTING_AGENT_ID;
const BOT_TOKEN = "123:telegram-mini-app-e2e-token";
const BOT_USERNAME = "ai_assistants_e2e_bot";
const CONNECT_PUBLIC_URL = "http://127.0.0.1:15173";

function signedInitData(input: {
  botToken: string;
  authDate: number;
  telegramUserId: string;
  username: string;
  startParam: string;
}): string {
  const params = new URLSearchParams({
    auth_date: String(input.authDate),
    user: JSON.stringify({ id: Number(input.telegramUserId), username: input.username }),
    start_param: input.startParam,
  });
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(input.botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  params.set("hash", hash);
  return params.toString();
}

function setEnv(key: string, value: string, restore: Map<string, string | undefined>): void {
  if (!restore.has(key)) restore.set(key, process.env[key]);
  process.env[key] = value;
}

function formatOtpError(error: unknown): string {
  if (!error) return "verifyOtp failed without an error object.";
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function deleteWhere(
  label: string,
  operation: PromiseLike<{ error: unknown }>,
): Promise<void> {
  const result = await operation;
  assert.equal(result.error, null, label);
}

async function cleanupE2eRows(input: {
  db: SupabaseServiceClient;
  telegramUserId: string;
  slug: string | null;
  username: string;
  sinceIso: string;
}): Promise<void> {
  if (input.slug) {
    await deleteWhere(
      "delete E2E Mini App launch intent",
      input.db.from("profile_portal_launch_intents").delete().eq("slug", input.slug),
    );
  }
  await deleteWhere(
    "delete E2E Telegram channel",
    input.db
      .from("profile_channels")
      .delete()
      .eq("provider", "telegram")
      .eq("external_identity", input.telegramUserId),
  );
}

test("Telegram Mini App link creates a one-time portal session through the real backend.", async (t) => {
  requireTestingE2eAgent();
  const restore = new Map<string, string | undefined>();
  setEnv("TELEGRAM_BOT_TOKEN", BOT_TOKEN, restore);
  setEnv("TELEGRAM_MINI_APP_BOT_USERNAME", BOT_USERNAME, restore);
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
  const expectedConnectPublicUrl = process.env.CONNECT_PUBLIC_URL ?? CONNECT_PUBLIC_URL;
  const sinceIso = new Date(Date.now() - 1_000).toISOString();
  const marker = randomUUID();
  const telegramUserId = String(randomInt(5_000_000_000, 8_999_999_999));
  const username = `e2emini${marker.replace(/-/g, "").slice(0, 16)}`;
  let slug: string | null = null;

  run.cleanup.add(() =>
    cleanupE2eRows({
      db,
      telegramUserId,
      slug,
      username,
      sinceIso,
    }),
  );

  const channelResult = await db
    .from("profile_channels")
    .insert({
      profile_id: PROFILE_ID,
      provider: "telegram",
      external_identity: telegramUserId,
      status: "active",
      delivery_config: { scenario: SCENARIO_ID, marker },
    })
    .select()
    .single();
  requireSupabaseData("Create E2E Telegram channel", channelResult.data, channelResult.error);

  const toolCallId = `e2e-mini-app-${marker}`;
  const result = await executeE2eBackendTool(db, {
    agentId: PROFILE_ID,
    toolName: "mini_app_link_create",
    toolCallId,
    params: { section: "approvals", intent: { type: "section" } },
    invocation: {
      agentId: PROFILE_ID,
      toolCallId,
      sessionKey: `agent:${PROFILE_ID}:telegram:${telegramUserId}`,
      sessionId: `telegram-mini-app-${marker}`,
      requestId: toolCallId,
      runKind: "user",
      runKindSource: "default",
    },
    trustedChannel: {
      messageChannel: "telegram",
      requesterSenderId: telegramUserId,
      senderIsOwner: true,
      deliveryContext: { scenario: SCENARIO_ID, marker },
    },
  });
  assert.ok("data" in result, "mini_app_link_create should return link data");
  const link = profileMiniAppLinkOutputSchema.parse(result.data).link;
  const linkUrl = new URL(link.url);
  slug = linkUrl.searchParams.get("startapp");
  assert.equal(linkUrl.origin, "https://t.me");
  assert.equal(linkUrl.pathname, `/${BOT_USERNAME}`);
  assert.ok(slug, "Mini App link should carry a startapp launch slug");
  assert.equal(link.url.includes("token"), false, "Mini App launch URL must not include auth tokens");

  const initData = signedInitData({
    botToken: BOT_TOKEN,
    authDate: Math.floor(Date.now() / 1000),
    telegramUserId,
    username,
    startParam: slug,
  });
  const sessionResponse = await fetch(`${backend.baseUrl}/auth/telegram-mini-app/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  const sessionText = await sessionResponse.text();
  assert.equal(sessionResponse.status, 200, sessionText);
  const session = telegramMiniAppSessionResponseSchema.parse(JSON.parse(sessionText));
  assert.equal(session.profileId, PROFILE_ID);
  assert.equal(session.destinationPath, `/assistants/${PROFILE_ID}/approvals`);
  assert.match(
    session.portalAccessUrl,
    new RegExp(
      `^${expectedConnectPublicUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/assistants/${PROFILE_ID}/approvals#`,
    ),
  );
  assert.equal(session.portalAccessUrl.includes("auth_date"), false);
  assert.equal(session.portalAccessUrl.includes("start_param"), false);

  const portalAccessUrl = new URL(session.portalAccessUrl);
  const portalHash = new URLSearchParams(
    portalAccessUrl.hash.startsWith("#") ? portalAccessUrl.hash.slice(1) : portalAccessUrl.hash,
  );
  const tokenHash = portalHash.get("oc_token_hash");
  const authType = portalHash.get("oc_auth_type");
  assert.ok(tokenHash, "Portal access URL should include oc_token_hash.");
  assert.ok(
    authType === "magiclink" || authType === "gmail",
    "Portal access URL should include a supported oc_auth_type.",
  );
  const authClient = createClient(supabase.url, supabase.anonKey);
  const otpResult = await authClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: authType,
  });
  assert.equal(otpResult.error, null, formatOtpError(otpResult.error));
  const accessToken = otpResult.data.session?.access_token;
  assert.ok(accessToken, "Portal access sign-in should return a Supabase access token.");

  const handoffResponse = await fetch(
    `${backend.baseUrl}/profiles/${PROFILE_ID}/portal/browser-handoff`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ section: "integrations" }),
    },
  );
  const handoffText = await handoffResponse.text();
  assert.equal(handoffResponse.status, 200, handoffText);
  const handoff = portalBrowserHandoffResponseSchema.parse(JSON.parse(handoffText));
  assert.equal(handoff.section, "integrations");
  assert.match(
    handoff.url,
    new RegExp(
      `^${expectedConnectPublicUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/assistants/${PROFILE_ID}/integrations#`,
    ),
  );

  const consumedIntentResult = await db
    .from("profile_portal_launch_intents")
    .select()
    .eq("slug", slug)
    .maybeSingle();
  const consumedIntent = requireSupabaseData(
    "Load consumed E2E Mini App launch intent",
    consumedIntentResult.data,
    consumedIntentResult.error,
  );
  assert.equal(consumedIntent.status, "consumed");
  assert.ok(consumedIntent.consumed_at);

  const replayResponse = await fetch(`${backend.baseUrl}/auth/telegram-mini-app/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  const replayText = await replayResponse.text();
  assert.notEqual(replayResponse.status, 200, replayText);
  assert.match(replayText, /already been used/);

  const tamperedInitData = initData.replace(telegramUserId, "123");
  const tamperedResponse = await fetch(`${backend.baseUrl}/auth/telegram-mini-app/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData: tamperedInitData }),
  });
  const tamperedText = await tamperedResponse.text();
  assert.equal(tamperedResponse.status, 401, tamperedText);
  assert.match(tamperedText, /signature is invalid/);

  const expiredInitData = signedInitData({
    botToken: BOT_TOKEN,
    authDate: Math.floor(Date.now() / 1000) - 25 * 60 * 60,
    telegramUserId,
    username,
    startParam: "approvals",
  });
  const expiredResponse = await fetch(`${backend.baseUrl}/auth/telegram-mini-app/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initData: expiredInitData }),
  });
  const expiredText = await expiredResponse.text();
  assert.equal(expiredResponse.status, 401, expiredText);
  assert.match(expiredText, /sign-in has expired/);
});
