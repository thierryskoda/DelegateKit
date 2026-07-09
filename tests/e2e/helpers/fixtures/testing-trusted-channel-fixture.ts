import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import type { E2eRun } from "../run/e2e-run";

const trustedDefaultPeerRuns = new WeakSet<E2eRun>();

export function hasDefaultTestingTrustedE2eChannel(run: E2eRun): boolean {
  return trustedDefaultPeerRuns.has(run);
}

async function cleanupProfileActionsForE2eChannel(input: {
  db: SupabaseServiceClient;
  profileId: string;
  channelId: string;
}): Promise<void> {
  const actionsResult = await input.db
    .from("profile_actions")
    .select()
    .eq("profile_id", input.profileId)
    .eq("origin_profile_channel_id", input.channelId);
  const actions = requireSupabaseRows(
    "Load E2E trusted channel profile actions",
    actionsResult.data,
    actionsResult.error,
  );
  for (const action of actions) {
    const deletedJobs = await input.db
      .from("backend_jobs")
      .delete()
      .eq("profile_id", action.profile_id)
      .in("dedupe_key", [
        `assistant-event:action-completion:${action.id}:executed`,
        `assistant-event:action-completion:${action.id}:rejected`,
        `assistant-event:action-completion:${action.id}:failed`,
      ]);
    requireSupabaseData(
      "Delete E2E trusted channel backend jobs",
      deletedJobs.data ?? [],
      deletedJobs.error,
    );

    const deletedReceipts = await input.db
      .from("provider_write_receipts")
      .delete()
      .eq("profile_id", action.profile_id)
      .eq("profile_action_id", action.id);
    requireSupabaseData(
      "Delete E2E trusted channel provider write receipts",
      deletedReceipts.data ?? [],
      deletedReceipts.error,
    );

    const deletedAction = await input.db.from("profile_actions").delete().eq("id", action.id);
    requireSupabaseData(
      "Delete E2E trusted channel profile action",
      deletedAction.data ?? [],
      deletedAction.error,
    );
  }
}

export async function seedTestingTrustedE2eChannel(input: {
  db: SupabaseServiceClient;
  profileId: string;
  peerId: string;
  marker: string;
  purpose: string;
}): Promise<{ cleanup: () => Promise<void> }> {
  const existingResult = await input.db
    .from("profile_channels")
    .select()
    .eq("provider", "e2e-test")
    .eq("external_identity", input.peerId)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;

  const previousChannel: TableRow<"profile_channels"> | null = existingResult.data;
  if (previousChannel && previousChannel.profile_id !== input.profileId) {
    throw new Error(
      `E2E trusted channel e2e-test:${input.peerId} belongs to profile ${previousChannel.profile_id}, not ${input.profileId}.`,
    );
  }

  if (!previousChannel) {
    const inserted = await input.db
      .from("profile_channels")
      .insert({
        profile_id: input.profileId,
        provider: "e2e-test",
        external_identity: input.peerId,
        status: "active",
        delivery_config: { marker: input.marker, purpose: input.purpose },
      })
      .select()
      .single();
    const channel = requireSupabaseData(
      "Seed E2E trusted channel",
      inserted.data,
      inserted.error,
    );
    return {
      cleanup: async () => {
        await cleanupProfileActionsForE2eChannel({
          db: input.db,
          profileId: input.profileId,
          channelId: channel.id,
        });
        const deleted = await input.db.from("profile_channels").delete().eq("id", channel.id);
        requireSupabaseData("Delete E2E trusted channel", deleted.data ?? [], deleted.error);
      },
    };
  }

  const updated = await input.db
    .from("profile_channels")
    .update({
      status: "active",
      delivery_config: { marker: input.marker, purpose: input.purpose },
      updated_at: new Date().toISOString(),
    })
    .eq("id", previousChannel.id);
  requireSupabaseData("Activate E2E trusted channel", updated.data ?? [], updated.error);

  return {
    cleanup: async () => {
      const restored = await input.db
        .from("profile_channels")
        .update({
          status: previousChannel.status,
          delivery_config: previousChannel.delivery_config,
          updated_at: new Date().toISOString(),
        })
        .eq("id", previousChannel.id);
      requireSupabaseData("Restore E2E trusted channel", restored.data ?? [], restored.error);
    },
  };
}

export async function ensureTestingTrustedE2eChannel(input: {
  db: SupabaseServiceClient;
  profileId: string;
  peerId: string;
  marker: string;
  purpose: string;
}): Promise<{ cleanup: () => Promise<void> }> {
  const existingResult = await input.db
    .from("profile_channels")
    .select()
    .eq("provider", "e2e-test")
    .eq("external_identity", input.peerId)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;

  const previousChannel: TableRow<"profile_channels"> | null = existingResult.data;
  if (!previousChannel || previousChannel.status !== "active") {
    return await seedTestingTrustedE2eChannel(input);
  }

  if (previousChannel.profile_id !== input.profileId) {
    throw new Error(
      `E2E trusted channel e2e-test:${input.peerId} belongs to profile ${previousChannel.profile_id}, not ${input.profileId}.`,
    );
  }

  return { cleanup: async () => {} };
}

export async function ensureDefaultTestingTrustedE2eChannel(input: {
  db: SupabaseServiceClient;
  run: E2eRun;
}): Promise<void> {
  if (trustedDefaultPeerRuns.has(input.run)) return;
  const trustedChannel = await ensureTestingTrustedE2eChannel({
    db: input.db,
    profileId: input.run.agentId,
    peerId: input.run.peerId,
    marker: input.run.runId,
    purpose: input.run.id,
  });
  input.run.cleanup.add(() => trustedChannel.cleanup());
  trustedDefaultPeerRuns.add(input.run);
}
