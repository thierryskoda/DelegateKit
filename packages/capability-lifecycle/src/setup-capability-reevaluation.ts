import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { TableRow } from "@ai-assistants/control-db";
import { requireCapabilityActivationPolicyForSlug } from "@ai-assistants/capability-catalog";
import { recordOutcome } from "./activation-record-outcome";
import { requireEnabledCapabilityAccountLink } from "./activation-instance";

export async function markCapabilityNotConnected(
  db: SupabaseServiceClient,
  input: { profileId: string; capabilityAccountLinkId: string; lastError?: string | null },
): Promise<TableRow<"capability_account_links"> | null> {
  const link = await requireEnabledCapabilityAccountLink(
    db,
    input.profileId,
    input.capabilityAccountLinkId,
  );
  const policy = requireCapabilityActivationPolicyForSlug(link.capability_slug);
  return recordOutcome(db, {
    link,
    policy,
    status: "not_connected",
    blockerCode: null,
    lastError: input.lastError ?? null,
  });
}
