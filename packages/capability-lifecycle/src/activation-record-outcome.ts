import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import type {
  CapabilityActivationPolicy,
  CapabilityReadinessBlockerCode,
  CapabilityReadinessStatus,
} from "@ai-assistants/capability-catalog";
import { recordCapabilityReadinessState } from "./record-capability-readiness-state.js";

export async function recordOutcome(
  db: SupabaseServiceClient,
  input: {
    link: TableRow<"capability_account_links">;
    policy: CapabilityActivationPolicy;
    status: CapabilityReadinessStatus;
    blockerCode?: CapabilityReadinessBlockerCode | null;
    latestBackendJobId?: string | null;
    lastSuccessAt?: string | null;
    lastError?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<TableRow<"capability_account_links"> | null> {
  return recordCapabilityReadinessState(db, {
    profileId: input.link.profile_id,
    capabilityAccountLinkId: input.link.id,
    status: input.status,
    blockerCode: input.blockerCode ?? null,
    latestBackendJobId: input.latestBackendJobId ?? null,
    lastSuccessAt: input.lastSuccessAt ?? null,
    lastError: input.lastError ?? null,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });
}
