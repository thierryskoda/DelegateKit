import {
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { recordCapabilityReadinessState } from "./record-capability-readiness-state.js";

/**
 * Marks OAuth unusable until reconnect: persisted credential status and blocked readiness.
 * Call before throwing terminal auth errors so UI and activation checks fail fast.
 */
export async function suspendConnectedProviderAccountForReconnect(
  db: SupabaseServiceClient,
  input: {
    account: TableRow<"connected_provider_accounts">;
    message: string;
  },
): Promise<void> {
  const message = input.message.trim();
  if (!message)
    throw new Error("suspendConnectedProviderAccountForReconnect requires a non-empty message.");

  const updated = await db
    .from("connected_provider_accounts")
    .update({
      credential_status: "reconnect_required",
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.account.id)
    .select()
    .maybeSingle();
  requireSupabaseData(
    `Suspend OAuth credential for connected account ${input.account.id}`,
    updated.data,
    updated.error,
  );

  const linksResult = await db
    .from("capability_account_links")
    .select()
    .eq("connected_provider_account_id", input.account.id)
    .eq("status", "enabled");
  const links = requireSupabaseRows(
    `List enabled capability account links for connected account ${input.account.id}`,
    linksResult.data,
    linksResult.error,
  );
  for (const link of links) {
    await recordCapabilityReadinessState(db, {
      profileId: link.profile_id,
      capabilityAccountLinkId: link.id,
      status: "blocked",
      blockerCode: "reconnect_required",
      lastError: message,
      metadata: { suspendedAt: new Date().toISOString() },
    });
  }
}
