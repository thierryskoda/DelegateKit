#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { capabilitiesResponseSchema } from "@ai-assistants/connect-api-contracts";
import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { createCapabilityAccountLink } from "../../../apps/backend/src/test-support/connected-accounts";
import {
  capabilityOverviewForProfile,
  connectIntegrationGroupsPayload,
} from "../../../apps/backend/src/test-support/profile-capabilities";
import { useE2eDb } from "../helpers/db/e2e-db";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import { testingClientPlusEmail } from "../helpers/test-data/testing-realistic-data";

const SCENARIO_ID = "outlook-integration-grouping";
const PROFILE_ID = "testing";

const OUTLOOK_CAPABILITIES = [
  { capabilitySlug: "outlook-mail", provider: "outlook-mail", label: "Outlook Mail" },
  { capabilitySlug: "outlook-calendar", provider: "outlook-calendar", label: "Outlook Calendar" },
  { capabilitySlug: "microsoft-todo", provider: "microsoft-todo", label: "Microsoft To Do" },
] as const;

type ProfileCapabilitySnapshot = {
  slug: string;
  row: TableRow<"profile_capabilities"> | null;
};

async function loadProfileCapabilitySnapshots(
  db: SupabaseServiceClient,
): Promise<ProfileCapabilitySnapshot[]> {
  const result = await db
    .from("profile_capabilities")
    .select()
    .eq("profile_id", PROFILE_ID)
    .in(
      "capability_slug",
      OUTLOOK_CAPABILITIES.map((capability) => capability.capabilitySlug),
    );
  assert.ifError(result.error);
  const rowsBySlug = new Map((result.data ?? []).map((row) => [row.capability_slug, row]));
  return OUTLOOK_CAPABILITIES.map((capability) => ({
    slug: capability.capabilitySlug,
    row: rowsBySlug.get(capability.capabilitySlug) ?? null,
  }));
}

async function ensureOutlookProfileCapabilities(input: {
  db: SupabaseServiceClient;
  snapshots: readonly ProfileCapabilitySnapshot[];
}): Promise<void> {
  for (const snapshot of input.snapshots) {
    if (!snapshot.row) {
      const insert = await input.db.from("profile_capabilities").insert({
        profile_id: PROFILE_ID,
        capability_slug: snapshot.slug,
        status: "enabled",
        required: false,
        config: {},
      });
      assert.ifError(insert.error);
      continue;
    }
    if (snapshot.row.status === "enabled") continue;
    const update = await input.db
      .from("profile_capabilities")
      .update({ status: "enabled" })
      .eq("id", snapshot.row.id);
    assert.ifError(update.error);
  }
}

async function setEnabledOutlookProfileCapabilities(input: {
  db: SupabaseServiceClient;
  snapshots: readonly ProfileCapabilitySnapshot[];
  enabledSlugs: readonly string[];
}): Promise<void> {
  const enabledSlugs = new Set(input.enabledSlugs);
  for (const snapshot of input.snapshots) {
    const status = enabledSlugs.has(snapshot.slug) ? "enabled" : "disabled";
    if (!snapshot.row) {
      if (status === "disabled") continue;
      const insert = await input.db.from("profile_capabilities").insert({
        profile_id: PROFILE_ID,
        capability_slug: snapshot.slug,
        status,
        required: false,
        config: {},
      });
      assert.ifError(insert.error);
      continue;
    }
    if (snapshot.row.status === status) continue;
    const update = await input.db
      .from("profile_capabilities")
      .update({ status })
      .eq("id", snapshot.row.id);
    assert.ifError(update.error);
  }
}

async function restoreOutlookProfileCapabilities(input: {
  db: SupabaseServiceClient;
  snapshots: readonly ProfileCapabilitySnapshot[];
}): Promise<void> {
  for (const snapshot of input.snapshots) {
    if (!snapshot.row) {
      const deleted = await input.db
        .from("profile_capabilities")
        .delete()
        .eq("profile_id", PROFILE_ID)
        .eq("capability_slug", snapshot.slug);
      assert.ifError(deleted.error);
      continue;
    }
    const update = await input.db
      .from("profile_capabilities")
      .update({
        status: snapshot.row.status,
        required: snapshot.row.required,
        config: snapshot.row.config,
      })
      .eq("id", snapshot.row.id);
    assert.ifError(update.error);
  }
}

async function cleanupOutlookGroupingFixtures(input: {
  db: SupabaseServiceClient;
  marker: string;
  snapshots: readonly ProfileCapabilitySnapshot[];
}): Promise<void> {
  const markerLinks = await input.db
    .from("capability_account_links")
    .select("id, connected_provider_account_id")
    .eq("profile_id", PROFILE_ID)
    .like("label", `%${input.marker}%`);
  assert.ifError(markerLinks.error);

  const accountIds = [
    ...new Set(
      (markerLinks.data ?? [])
        .map((row) => row.connected_provider_account_id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if ((markerLinks.data ?? []).length > 0) {
    const linkDelete = await input.db
      .from("capability_account_links")
      .delete()
      .in(
        "id",
        (markerLinks.data ?? []).map((row) => row.id),
      );
    assert.ifError(linkDelete.error);
  }

  if (accountIds.length > 0) {
    const accountDelete = await input.db
      .from("connected_provider_accounts")
      .delete()
      .in("id", accountIds);
    assert.ifError(accountDelete.error);
  }

  await restoreOutlookProfileCapabilities({
    db: input.db,
    snapshots: input.snapshots,
  });
}

test("Connect integrations groups shared Outlook capabilities under one provider account", async (t) => {
  const marker = createMarker("outlook-integration-grouping");
  const run = await createE2eRun(t, { id: SCENARIO_ID });
  await attachE2eSupabase(run);
  const db = await useE2eDb();
  const snapshots = await loadProfileCapabilitySnapshots(db);
  run.cleanup.add(() => cleanupOutlookGroupingFixtures({ db, marker, snapshots }));
  await ensureOutlookProfileCapabilities({ db, snapshots });

  const now = new Date().toISOString();
  const accountEmail = testingClientPlusEmail(`outlook.grouping.${marker}`);
  const accountInsert = await db
    .from("connected_provider_accounts")
    .insert({
      id: randomUUID(),
      profile_id: PROFILE_ID,
      provider: "outlook",
      provider_account_id: accountEmail,
      account_email: accountEmail,
      display_label: accountEmail,
      scopes: [
        "User.Read",
        "Mail.Read",
        "Mail.ReadWrite",
        "Mail.Send",
        "Calendars.ReadWrite",
        "Tasks.ReadWrite",
      ],
      connection_status: "connected",
      credential_kind: "nango_oauth",
      nango_connection_id: `outlook-grouping-${marker}`,
      nango_provider_config_key: "ai-assistants-outlook",
      credential_status: "healthy",
      connected_at: now,
      last_error: null,
      metadata: {
        oauth: {
          schemaVersion: 1,
          source: "nango",
          providerConfigKey: "ai-assistants-outlook",
          connectionId: `outlook-grouping-${marker}`,
          fetchedAt: now,
          nangoLastFetchedAt: now,
          grantedScopes: [
            "User.Read",
            "Mail.Read",
            "Mail.ReadWrite",
            "Mail.Send",
            "Calendars.ReadWrite",
            "Tasks.ReadWrite",
          ],
          refreshCapable: true,
          credentialStatus: "healthy",
          nangoErrorTypes: [],
        },
      },
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  assert.ok(accountInsert.data, accountInsert.error?.message);
  const connectedAccount = accountInsert.data;

  for (const capability of OUTLOOK_CAPABILITIES) {
    const link = await createCapabilityAccountLink({
      db,
      profileId: PROFILE_ID,
      capabilitySlug: capability.capabilitySlug,
      provider: capability.provider,
      label: `${capability.label} ${marker}`,
    });
    const bind = await db
      .from("capability_account_links")
      .update({
        connected_provider_account_id: connectedAccount.id,
        readiness_status: "ready",
        readiness_blocker_code: null,
        readiness_last_error: null,
      })
      .eq("id", link.id);
    assert.ifError(bind.error);
  }

  const overview = await capabilityOverviewForProfile(db, PROFILE_ID);
  const payload = capabilitiesResponseSchema.parse({
    ok: true,
    profileId: PROFILE_ID,
    groups: connectIntegrationGroupsPayload(overview),
  });

  const outlookGroups = payload.groups.filter(
    (group) => group.providerConfigKey === "ai-assistants-outlook",
  );
  assert.equal(outlookGroups.length, 1, "Outlook capabilities should share one integration group.");

  const outlookGroup = outlookGroups[0];
  assert.ok(outlookGroup);
  assert.equal(outlookGroup.groupLabel, "Outlook Mail, Calendar & To Do");
  assert.equal(outlookGroup.provider, "outlook");

  const groupedAccount = outlookGroup.accounts.find(
    (account) => account.connectedAccountId === connectedAccount.id,
  );
  assert.ok(groupedAccount, "Outlook group must include the seeded connected account.");
  assert.equal(groupedAccount.connectedAccountEmail, accountEmail);
  assert.equal(groupedAccount.state, "connected");

  assert.deepEqual(
    groupedAccount.capabilities.map((capability) => ({
      slug: capability.capabilitySlug,
      label: capability.capabilityLabel,
      state: capability.state,
    })),
    [
      { slug: "outlook-mail", label: "Mail", state: "connected" },
      { slug: "outlook-calendar", label: "Calendar", state: "connected" },
      { slug: "microsoft-todo", label: "To Do", state: "connected" },
    ],
  );
});

test("Connect integrations labels Outlook groups from enabled sub-capabilities only", async (t) => {
  const marker = createMarker("outlook-partial-grouping");
  const run = await createE2eRun(t, { id: SCENARIO_ID });
  await attachE2eSupabase(run);
  const db = await useE2eDb();
  const snapshots = await loadProfileCapabilitySnapshots(db);
  run.cleanup.add(() => cleanupOutlookGroupingFixtures({ db, marker, snapshots }));
  await setEnabledOutlookProfileCapabilities({
    db,
    snapshots,
    enabledSlugs: ["microsoft-todo"],
  });

  const now = new Date().toISOString();
  const accountEmail = testingClientPlusEmail(`outlook.todo.${marker}`);
  const accountInsert = await db
    .from("connected_provider_accounts")
    .insert({
      id: randomUUID(),
      profile_id: PROFILE_ID,
      provider: "outlook",
      provider_account_id: accountEmail,
      account_email: accountEmail,
      display_label: accountEmail,
      scopes: [
        "User.Read",
        "Mail.Read",
        "Mail.ReadWrite",
        "Mail.Send",
        "Calendars.ReadWrite",
        "Tasks.ReadWrite",
      ],
      connection_status: "connected",
      credential_kind: "nango_oauth",
      nango_connection_id: `outlook-todo-${marker}`,
      nango_provider_config_key: "ai-assistants-outlook",
      credential_status: "healthy",
      connected_at: now,
      last_error: null,
      metadata: {
        oauth: {
          schemaVersion: 1,
          source: "nango",
          providerConfigKey: "ai-assistants-outlook",
          connectionId: `outlook-todo-${marker}`,
          fetchedAt: now,
          nangoLastFetchedAt: now,
          grantedScopes: [
            "User.Read",
            "Mail.Read",
            "Mail.ReadWrite",
            "Mail.Send",
            "Calendars.ReadWrite",
            "Tasks.ReadWrite",
          ],
          refreshCapable: true,
          credentialStatus: "healthy",
          nangoErrorTypes: [],
        },
      },
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();
  assert.ok(accountInsert.data, accountInsert.error?.message);
  const connectedAccount = accountInsert.data;

  const link = await createCapabilityAccountLink({
    db,
    profileId: PROFILE_ID,
    capabilitySlug: "microsoft-todo",
    provider: "microsoft-todo",
    label: `Microsoft To Do ${marker}`,
  });
  const bind = await db
    .from("capability_account_links")
    .update({
      connected_provider_account_id: connectedAccount.id,
      readiness_status: "ready",
      readiness_blocker_code: null,
      readiness_last_error: null,
    })
    .eq("id", link.id);
  assert.ifError(bind.error);

  const overview = await capabilityOverviewForProfile(db, PROFILE_ID);
  const payload = capabilitiesResponseSchema.parse({
    ok: true,
    profileId: PROFILE_ID,
    groups: connectIntegrationGroupsPayload(overview),
  });

  const outlookGroups = payload.groups.filter(
    (group) => group.providerConfigKey === "ai-assistants-outlook",
  );
  assert.equal(outlookGroups.length, 1, "To Do should still use the shared Outlook group.");

  const outlookGroup = outlookGroups[0];
  assert.ok(outlookGroup);
  assert.equal(outlookGroup.groupLabel, "Outlook To Do");
  assert.equal(outlookGroup.provider, "outlook");
  assert.equal(outlookGroup.groupLabel.includes("Mail"), false);
  assert.equal(outlookGroup.groupLabel.includes("Calendar"), false);

  const groupedAccount = outlookGroup.accounts.find(
    (account) => account.connectedAccountId === connectedAccount.id,
  );
  assert.ok(groupedAccount, "Outlook group must include the seeded To Do account.");
  assert.deepEqual(
    groupedAccount.capabilities.map((capability) => ({
      slug: capability.capabilitySlug,
      label: capability.capabilityLabel,
      state: capability.state,
    })),
    [{ slug: "microsoft-todo", label: "To Do", state: "connected" }],
  );
});
