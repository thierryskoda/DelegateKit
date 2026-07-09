import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { BackendJob } from "@ai-assistants/backend-jobs";
import {
  agentRunExecuteBackendJobKind,
  agentRunExecuteJobPayloadSchema,
} from "@ai-assistants/control-plane-contracts";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";

function workItemSessionKey(input: { jobId: string; workItemId: string }): string {
  return `agent-run:${input.jobId}:work-item:${input.workItemId}`;
}

async function reconcileWorkItemAfterAgentRunReclaim(
  db: SupabaseServiceClient,
  job: BackendJob,
): Promise<string | null> {
  if (job.kind !== agentRunExecuteBackendJobKind) return null;
  const payload = agentRunExecuteJobPayloadSchema.parse(job.payload);
  if (payload.source.kind !== "work_item") return null;

  const nowIso = new Date().toISOString();
  const workItemId = payload.source.workItemId;
  const sessionKey = workItemSessionKey({ jobId: job.id, workItemId });
  const patch =
    job.status === "queued"
      ? {
          status: "pending" as const,
          last_error: job.last_error,
          claim_token: null,
          claim_expires_at: null,
          claimed_by_agent_id: null,
          claimed_by_session_key: null,
          claimed_at: null,
          available_at: job.run_after ?? nowIso,
          finished_at: null,
          updated_at: nowIso,
        }
      : {
          status: "failed" as const,
          last_error: job.last_error ?? "Backend job failed before completing the work item.",
          claim_token: null,
          claim_expires_at: null,
          claimed_by_agent_id: null,
          claimed_by_session_key: null,
          finished_at: nowIso,
          updated_at: nowIso,
        };

  const result = await db
    .from("assistant_work_items")
    .update(patch)
    .eq("profile_id", job.profile_id)
    .eq("id", workItemId)
    .eq("status", "claimed")
    .eq("claimed_by_session_key", sessionKey)
    .select("id")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data?.id ?? null;
}

export async function reconcileDomainAfterBackendJobReclaim(
  db: SupabaseServiceClient,
  reclaimed: BackendJob[],
): Promise<void> {
  if (reclaimed.length === 0) return;
  const nowIso = new Date().toISOString();
  const reconciledWorkItemIds: string[] = [];
  for (const job of reclaimed) {
    const readinessResult = await db
      .from("capability_account_links")
      .update({
        readiness_status: job.status === "queued" ? "queued" : "error",
        readiness_last_error: job.last_error,
        updated_at: nowIso,
      })
      .eq("readiness_latest_backend_job_id", job.id)
      .eq("readiness_status", "running");
    if (readinessResult.error) throw readinessResult.error;
    const workItemId = await reconcileWorkItemAfterAgentRunReclaim(db, job);
    if (workItemId) reconciledWorkItemIds.push(workItemId);
  }
  emitDiagnostic(backendDiagnosticLogger(), "worker.job.reclaim_domain_reconciled", {
    ok: true,
    attrs: {
      job_ids: reclaimed.map((j) => j.id),
      count: reclaimed.length,
      work_item_ids: reconciledWorkItemIds,
    },
  });
}
