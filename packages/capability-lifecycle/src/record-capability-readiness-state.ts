import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import type {
  CapabilityReadinessBlockerCode,
  CapabilityReadinessStatus,
} from "@ai-assistants/capability-catalog";

export async function recordCapabilityReadinessState(
  controlDb: SupabaseServiceClient,
  input: {
    profileId: string;
    capabilityAccountLinkId: string | null;
    status: CapabilityReadinessStatus;
    blockerCode?: CapabilityReadinessBlockerCode | null;
    latestBackendJobId?: string | null;
    lastSuccessAt?: string | null;
    lastError?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<TableRow<"capability_account_links"> | null> {
  if (!input.capabilityAccountLinkId) return null;
  const result = await controlDb
    .from("capability_account_links")
    .update({
      readiness_status: input.status,
      readiness_blocker_code: input.blockerCode ?? null,
      readiness_latest_backend_job_id: input.latestBackendJobId ?? null,
      readiness_last_success_at: input.lastSuccessAt ?? null,
      readiness_last_error: input.lastError ?? null,
      readiness_metadata: requireJsonObject(input.metadata ?? {}, "capabilityReadiness.metadata"),
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", input.profileId)
    .eq("id", input.capabilityAccountLinkId)
    .select()
    .single();
  return requireSupabaseData("Record capability readiness state", result.data, result.error);
}
