#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { gmailAccountsListOutputSchema } from "@ai-assistants/gmail-contracts/schemas";
import { executeGmailReadTool } from "../../../apps/backend/src/test-support/capabilities/gmail";
import { requireGmailMailboxNango } from "../../../apps/backend/src/test-support/capabilities/gmail";
import {
  completeOAuthConnectedAccountLifecycle,
  createCapabilityAccountLink,
  createProviderConnectIntent,
  deleteCapabilityAccountLink,
  requireProfileCapability,
  resolveOAuthLifecycleTarget,
} from "../../../apps/backend/src/test-support/connected-accounts";
import { createE2eRun, createMarker, enableE2eTestChannel } from "../helpers/run/e2e-run";
import { useE2eDb } from "../helpers/db/e2e-db";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { testingClientPlusEmail } from "../helpers/test-data/testing-realistic-data";

const SCENARIO_ID = "connected-accounts-roundtrip";
const PROFILE_ID = "testing";

function normalizedMarkerEmailFragment(marker: string): string {
  return marker
    .replace(/[^a-z0-9]+/gi, ".")
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase();
}

async function loadDefaultTestingGmailLinkIds(
  db: SupabaseServiceClient,
): Promise<string[]> {
  const result = await db
    .from("capability_account_links")
    .select("id")
    .eq("profile_id", PROFILE_ID)
    .eq("capability_slug", "gmail")
    .eq("provider", "gmail")
    .eq("status", "enabled")
    .eq("is_default", true);
  assert.ifError(result.error);
  return (result.data ?? []).map((row) => row.id);
}

async function restoreDefaultTestingGmailLinks(
  db: SupabaseServiceClient,
  defaultLinkIds: readonly string[],
): Promise<void> {
  const clear = await db
    .from("capability_account_links")
    .update({ is_default: false })
    .eq("profile_id", PROFILE_ID)
    .eq("capability_slug", "gmail")
    .eq("provider", "gmail")
    .eq("status", "enabled");
  assert.ifError(clear.error);

  if (defaultLinkIds.length === 0) return;
  const restore = await db
    .from("capability_account_links")
    .update({ is_default: true })
    .in("id", [...defaultLinkIds])
    .eq("profile_id", PROFILE_ID)
    .eq("capability_slug", "gmail")
    .eq("provider", "gmail")
    .eq("status", "enabled");
  assert.ifError(restore.error);
}

async function cleanupConnectedAccountsRoundtripFixtures(input: {
  db: SupabaseServiceClient;
  marker: string;
  defaultGmailLinkIds: readonly string[];
}): Promise<void> {
  const { db, marker } = input;
  const markerEmailFragment = normalizedMarkerEmailFragment(marker);
  const markerLinkRows = await db
    .from("capability_account_links")
    .select("id, connected_provider_account_id")
    .eq("profile_id", PROFILE_ID)
    .eq("provider", "gmail")
    .like("label", `%${marker}%`);
  assert.ifError(markerLinkRows.error);
  const markerLinks = markerLinkRows.data ?? [];

  const accountIdsFromLinks = markerLinks
    .map((row) => row.connected_provider_account_id?.trim())
    .filter((id): id is string => Boolean(id));

  const markerAccountRows = await db
    .from("connected_provider_accounts")
    .select("id")
    .eq("profile_id", PROFILE_ID)
    .eq("provider", "gmail")
    .or(
      [
        `account_email.ilike.%${markerEmailFragment}%`,
        `display_label.ilike.%${markerEmailFragment}%`,
        `provider_account_id.ilike.%${marker}%`,
        `nango_connection_id.ilike.%${marker}%`,
      ].join(","),
    );
  assert.ifError(markerAccountRows.error);
  const markerAccounts = markerAccountRows.data ?? [];

  const accountIds = [
    ...new Set([...accountIdsFromLinks, ...markerAccounts.map((row) => row.id)]),
  ];

  const intentFilters = [`requested_label.ilike.%${marker}%`];
  if (markerLinks.length > 0) {
    intentFilters.push(
      `capability_account_link_id.in.(${markerLinks.map((row) => row.id).join(",")})`,
    );
  }
  if (accountIds.length > 0) {
    intentFilters.push(`connected_provider_account_id.in.(${accountIds.join(",")})`);
  }

  const intentDelete = await db
    .from("provider_connect_intents")
    .delete()
    .eq("profile_id", PROFILE_ID)
    .eq("provider", "gmail")
    .or(intentFilters.join(","));
  assert.ifError(intentDelete.error);

  if (markerLinks.length > 0) {
    const linkDelete = await db
      .from("capability_account_links")
      .delete()
      .in(
        "id",
        markerLinks.map((row) => row.id),
      );
    assert.ifError(linkDelete.error);
  }

  if (accountIds.length > 0) {
    const accountDelete = await db
      .from("connected_provider_accounts")
      .delete()
      .in("id", accountIds);
    assert.ifError(accountDelete.error);
  }

  await restoreDefaultTestingGmailLinks(db, input.defaultGmailLinkIds);
}

test("connected accounts: connect intent roundtrip and multi-account link invariants", async (t) => {
  const marker = createMarker("connected-accounts-roundtrip");
  const run = await createE2eRun(t, { id: SCENARIO_ID });
  enableE2eTestChannel(run);
  await attachE2eSupabase(run);
  const db = await useE2eDb();
  const defaultGmailLinkIds = await loadDefaultTestingGmailLinkIds(db);
  run.cleanup.add(() =>
    cleanupConnectedAccountsRoundtripFixtures({ db, marker, defaultGmailLinkIds }),
  );

  const intent = await createProviderConnectIntent({
    db,
    profileId: PROFILE_ID,
    capabilitySlug: "gmail",
    provider: "gmail",
    requestedLabel: `Extra mailbox ${marker}`,
  });
  assert.equal(intent.status, "pending");
  assert.equal(intent.profile_id, PROFILE_ID);
  assert.equal(intent.capability_slug, "gmail");
  assert.equal(intent.provider, "gmail");
  assert.ok(Date.parse(intent.expires_at) > Date.now());

  const now = new Date().toISOString();
  const primaryConnectedAccountEmail = testingClientPlusEmail(`roundtrip.primary.${marker}`);
  const secondaryConnectedAccountEmail = testingClientPlusEmail(`roundtrip.secondary.${marker}`);
  const primaryConnectedAccountInsert = await db
    .from("connected_provider_accounts")
    .insert({
      id: randomUUID(),
      profile_id: PROFILE_ID,
      provider: "google",
      provider_account_id: primaryConnectedAccountEmail,
      account_email: primaryConnectedAccountEmail,
      display_label: primaryConnectedAccountEmail,
      scopes: [],
      connection_status: "connected",
      credential_kind: "nango_oauth",
      nango_connection_id: randomUUID(),
      nango_provider_config_key: "ai-assistants-google",
      credential_status: "healthy",
      connected_at: now,
      last_error: null,
      metadata: {},
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  assert.ok(primaryConnectedAccountInsert.data, primaryConnectedAccountInsert.error?.message);
  const primaryConnectedAccount = primaryConnectedAccountInsert.data;

  const secondaryConnectedAccountInsert = await db
    .from("connected_provider_accounts")
    .insert({
      id: randomUUID(),
      profile_id: PROFILE_ID,
      provider: "google",
      provider_account_id: secondaryConnectedAccountEmail,
      account_email: secondaryConnectedAccountEmail,
      display_label: secondaryConnectedAccountEmail,
      scopes: [],
      connection_status: "connected",
      credential_kind: "nango_oauth",
      nango_connection_id: randomUUID(),
      nango_provider_config_key: "ai-assistants-google",
      credential_status: "healthy",
      connected_at: now,
      last_error: null,
      metadata: {},
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  assert.ok(secondaryConnectedAccountInsert.data, secondaryConnectedAccountInsert.error?.message);
  const secondaryConnectedAccount = secondaryConnectedAccountInsert.data;

  const primaryLink = await createCapabilityAccountLink({
    db,
    profileId: PROFILE_ID,
    capabilitySlug: "gmail",
    provider: "gmail",
    label: `Primary Gmail ${marker}`,
  });
  const primaryBind = await db
    .from("capability_account_links")
    .update({
      connected_provider_account_id: primaryConnectedAccount.id,
      readiness_status: "ready",
      readiness_blocker_code: null,
      readiness_last_error: null,
      readiness_last_success_at: now,
      readiness_metadata: {},
    })
    .eq("id", primaryLink.id)
    .select()
    .single();
  assert.ok(primaryBind.data, primaryBind.error?.message);

  const secondaryLink = await createCapabilityAccountLink({
    db,
    profileId: PROFILE_ID,
    capabilitySlug: "gmail",
    provider: "gmail",
    label: `Secondary Gmail ${marker}`,
  });
  const secondaryBind = await db
    .from("capability_account_links")
    .update({
      connected_provider_account_id: secondaryConnectedAccount.id,
      readiness_status: "ready",
      readiness_blocker_code: null,
      readiness_last_error: null,
      readiness_last_success_at: now,
      readiness_metadata: {},
    })
    .eq("id", secondaryLink.id)
    .select()
    .single();
  assert.ok(secondaryBind.data, secondaryBind.error?.message);

  const explicitBinding = await requireGmailMailboxNango(
    db,
    PROFILE_ID,
    secondaryConnectedAccount.id,
  );
  assert.equal(explicitBinding.account.id, secondaryConnectedAccount.id);

  const gmailAccountsList = await executeGmailReadTool(db, PROFILE_ID, "gmail_accounts_list", {});
  assert.ok(
    "data" in gmailAccountsList,
    "error" in gmailAccountsList ? gmailAccountsList.error.message : undefined,
  );
  const listedAccounts = gmailAccountsListOutputSchema.parse(gmailAccountsList.data).accounts;
  const listedPrimary = listedAccounts.find(
    (account) =>
      account &&
      typeof account === "object" &&
      "connectedAccountId" in account &&
      account.connectedAccountId === primaryConnectedAccount.id,
  );
  const listedSecondary = listedAccounts.find(
    (account) =>
      account &&
      typeof account === "object" &&
      "connectedAccountId" in account &&
      account.connectedAccountId === secondaryConnectedAccount.id,
  );
  assert.deepEqual(listedPrimary, {
    connectedAccountId: primaryConnectedAccount.id,
    provider: "gmail",
    label: primaryConnectedAccountEmail,
    connected: true,
    credentialStatus: "healthy",
    accountEmail: primaryConnectedAccountEmail,
    ready: true,
  });
  assert.deepEqual(listedSecondary, {
    connectedAccountId: secondaryConnectedAccount.id,
    provider: "gmail",
    label: secondaryConnectedAccountEmail,
    connected: true,
    credentialStatus: "healthy",
    accountEmail: secondaryConnectedAccountEmail,
    ready: true,
  });

  await assert.rejects(
    () => requireGmailMailboxNango(db, PROFILE_ID, null),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === domainCodes.CONFLICT &&
      error.details !== null &&
      typeof error.details === "object" &&
      !Array.isArray(error.details) &&
      (error.details as { blockerCode?: unknown }).blockerCode === "ambiguous_account",
    "multiple connected Gmail accounts without connectedAccountId should require explicit selection",
  );

  const duplicateLink = await createCapabilityAccountLink({
    db,
    profileId: PROFILE_ID,
    capabilitySlug: "gmail",
    provider: "gmail",
    label: `Duplicate Gmail ${marker}`,
  });
  const duplicateUpdate = await db
    .from("capability_account_links")
    .update({ connected_provider_account_id: primaryConnectedAccount.id })
    .eq("id", duplicateLink.id);
  assert.ok(duplicateUpdate.error, "expected duplicate connected account assignment to fail");

  const capability = await requireProfileCapability(db, PROFILE_ID, "gmail");
  const existingDuplicate = await db
    .from("capability_account_links")
    .select("id")
    .eq("profile_capability_id", capability.id)
    .eq("connected_provider_account_id", primaryConnectedAccount.id)
    .eq("status", "enabled")
    .neq("id", primaryLink.id);
  assert.ok(existingDuplicate.error || (existingDuplicate.data?.length ?? 0) === 0);

  const addIntent = await createProviderConnectIntent({
    db,
    profileId: PROFILE_ID,
    capabilitySlug: "gmail",
    provider: "gmail",
    requestedLabel: `Gmail ${marker}`,
  });
  const addTarget = await resolveOAuthLifecycleTarget(db, {
    profileId: PROFILE_ID,
    connectIntentId: addIntent.id,
  });
  const addConnectionId = `oauth-lifecycle-${marker}-primary`;
  const addResult = await completeOAuthConnectedAccountLifecycle({
    db,
    profileId: PROFILE_ID,
    target: addTarget,
    evidence: {
      source: "nango",
      providerConfigKey: "ai-assistants-google",
      connectionId: addConnectionId,
      providerAccountId: `gmail-primary-${marker}`,
      accountEmail: null,
      displayLabel: null,
      accountProvider: "google",
      scopes: [],
      credentialStatus: "healthy",
      lastError: null,
      metadata: {},
    },
    siblingMappings: [],
  });
  assert.equal(addResult.kind, "created_link");
  assert.equal(addResult.primaryLink.label, `Gmail ${marker}`);
  assert.equal(addResult.connectedAccount.account_email, null);
  assert.notEqual(
    addResult.connectedAccount.display_label,
    addResult.connectedAccount.provider_account_id,
  );

  const idempotentTarget = await resolveOAuthLifecycleTarget(db, {
    profileId: PROFILE_ID,
    connectIntentId: addIntent.id,
  });
  const idempotentResult = await completeOAuthConnectedAccountLifecycle({
    db,
    profileId: PROFILE_ID,
    target: idempotentTarget,
    evidence: {
      source: "nango",
      providerConfigKey: "ai-assistants-google",
      connectionId: addConnectionId,
      providerAccountId: `gmail-primary-${marker}`,
      accountEmail: null,
      displayLabel: null,
      accountProvider: "google",
      scopes: [],
      credentialStatus: "healthy",
      lastError: null,
      metadata: {},
    },
    siblingMappings: [],
  });
  assert.equal(idempotentResult.kind, "idempotent_already_completed");
  assert.equal(idempotentResult.primaryLink.id, addResult.primaryLink.id);

  const duplicateIntent = await createProviderConnectIntent({
    db,
    profileId: PROFILE_ID,
    capabilitySlug: "gmail",
    provider: "gmail",
    requestedLabel: `Gmail ${marker}`,
  });
  const duplicateTarget = await resolveOAuthLifecycleTarget(db, {
    profileId: PROFILE_ID,
    connectIntentId: duplicateIntent.id,
  });
  const duplicateResult = await completeOAuthConnectedAccountLifecycle({
    db,
    profileId: PROFILE_ID,
    target: duplicateTarget,
    evidence: {
      source: "nango",
      providerConfigKey: "ai-assistants-google",
      connectionId: `oauth-lifecycle-${marker}-duplicate`,
      providerAccountId: `gmail-primary-${marker}`,
      accountEmail: null,
      displayLabel: null,
      accountProvider: "google",
      scopes: [],
      credentialStatus: "healthy",
      lastError: null,
      metadata: {},
    },
    siblingMappings: [],
  });
  assert.equal(duplicateResult.kind, "duplicate_existing_account");
  assert.equal(duplicateResult.primaryLink.id, addResult.primaryLink.id);
  const duplicateRows = await db
    .from("capability_account_links")
    .select("id")
    .eq("profile_capability_id", capability.id)
    .eq("connected_provider_account_id", addResult.connectedAccount.id)
    .eq("status", "enabled");
  assert.equal(duplicateRows.data?.length, 1, duplicateRows.error?.message);

  const reconnectSlot = await createCapabilityAccountLink({
    db,
    profileId: PROFILE_ID,
    capabilitySlug: "gmail",
    provider: "gmail",
    label: `Reconnect Gmail ${marker}`,
  });
  const reconnectTarget = await resolveOAuthLifecycleTarget(db, {
    profileId: PROFILE_ID,
    capabilityAccountLinkId: reconnectSlot.id,
  });
  const reconnectEmail = testingClientPlusEmail(`roundtrip.reconnect.${marker}`);
  const reconnectResult = await completeOAuthConnectedAccountLifecycle({
    db,
    profileId: PROFILE_ID,
    target: reconnectTarget,
    evidence: {
      source: "nango",
      providerConfigKey: "ai-assistants-google",
      connectionId: `oauth-lifecycle-${marker}-reconnect`,
      providerAccountId: reconnectEmail,
      accountEmail: reconnectEmail,
      displayLabel: reconnectEmail,
      accountProvider: "google",
      scopes: [],
      credentialStatus: "healthy",
      lastError: null,
      metadata: {},
    },
    siblingMappings: [],
  });
  assert.equal(reconnectResult.kind, "reconnected_link");
  assert.equal(reconnectResult.primaryLink.id, reconnectSlot.id);
  assert.equal(reconnectResult.connectedAccount.account_email, reconnectEmail);

  const clearDefaultUpdate = await db
    .from("capability_account_links")
    .update({ is_default: false })
    .eq("profile_capability_id", capability.id)
    .eq("status", "enabled");
  assert.ifError(clearDefaultUpdate.error);
  const defaultUpdate = await db
    .from("capability_account_links")
    .update({ is_default: true })
    .eq("id", reconnectSlot.id);
  assert.ifError(defaultUpdate.error);
  await deleteCapabilityAccountLink(db, {
    profileId: PROFILE_ID,
    capabilityAccountLinkId: reconnectSlot.id,
  });
  const capabilityAfterDelete = await requireProfileCapability(db, PROFILE_ID, "gmail");
  assert.equal(capabilityAfterDelete.id, capability.id);
  const deletedSlot = await db
    .from("capability_account_links")
    .select("status, connected_provider_account_id, is_default")
    .eq("id", reconnectSlot.id)
    .single();
  assert.equal(deletedSlot.data?.status, "disabled", deletedSlot.error?.message);
  assert.equal(deletedSlot.data?.connected_provider_account_id, null);
  assert.equal(deletedSlot.data?.is_default, false);

  await cleanupConnectedAccountsRoundtripFixtures({ db, marker, defaultGmailLinkIds });
});
