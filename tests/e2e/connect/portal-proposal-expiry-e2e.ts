#!/usr/bin/env tsx
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { requireSupabaseData } from "@ai-assistants/control-db";
import { listPortalProfileProposals } from "../../../apps/backend/src/test-support/proposals";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { useE2eDb } from "../helpers/db/e2e-db";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";

const PROFILE_ID = "testing";

test("Portal proposal listings expire stale proposed items.", async (t) => {
  const run = await createE2eRun(t, { id: "portal-proposal-expiry" });
  await attachE2eSupabase(run);
  const db = await useE2eDb();
  const marker = createMarker("portal-proposal-expiry");

  const inserted = await db
    .from("profile_proposals")
    .insert(
      [
        { title: "Expired proposal", expiresAt: new Date(Date.now() - 60_000).toISOString() },
        { title: "Live proposal", expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() },
      ].map((proposal) => ({
        profile_id: PROFILE_ID,
        proposal_kind: "gmail.email.follow_up",
        status: "proposed" as const,
        title: `${proposal.title} ${marker}`,
        summary: "Portal proposal expiry E2E fixture.",
        equivalence_key: `${marker}-${randomUUID()}`,
        expires_at: proposal.expiresAt,
      })),
    )
    .select();
  const proposals = requireSupabaseData(
    "Create portal proposal expiry fixtures",
    inserted.data,
    inserted.error,
  );
  run.cleanup.add(async () => {
    const deleted = await db
      .from("profile_proposals")
      .delete()
      .in(
        "id",
        proposals.map((proposal) => proposal.id),
      );
    requireSupabaseData(
      "Delete portal proposal expiry fixtures",
      deleted.data ?? [],
      deleted.error,
    );
  });

  const listed = await listPortalProfileProposals(db, PROFILE_ID);
  const listedFixtures = listed.filter((proposal) => proposal.title.endsWith(marker));

  assert.deepEqual(listedFixtures.map((proposal) => [proposal.title, proposal.status]).sort(), [
    [`Expired proposal ${marker}`, "expired"],
    [`Live proposal ${marker}`, "proposed"],
  ]);
});
