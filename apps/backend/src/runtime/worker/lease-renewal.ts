import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { BackendJob } from "@ai-assistants/backend-jobs";
import { LostBackendJobLeaseError, renewBackendJobLease } from "@ai-assistants/backend-jobs";
import { backendDiagnosticLogger } from "../../shared/diagnostics";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import type { RunWorkerOnceResult } from "./types";

function renewalIntervalMs(leaseSeconds: number): number {
  return Math.max(1_000, Math.floor((leaseSeconds * 1_000) / 3));
}

export function startBackendJobLeaseRenewal(input: {
  db: SupabaseServiceClient;
  job: BackendJob;
  workerId: string;
  leaseSeconds: number;
  intervalMs?: number;
}): () => Promise<void> {
  let pendingRenewal: Promise<void> | null = null;
  const intervalMs = input.intervalMs ?? renewalIntervalMs(input.leaseSeconds);

  const renew = async (): Promise<void> => {
    try {
      await renewBackendJobLease(input.db, {
        job: input.job,
        workerId: input.workerId,
        leaseSeconds: input.leaseSeconds,
      });
      emitDiagnostic(backendDiagnosticLogger(), "worker.job.lease_renewed", {
        ok: true,
        attrs: {
          worker_id: input.workerId,
          job_id: input.job.id,
        },
      });
    } catch (error) {
      emitDiagnostic(backendDiagnosticLogger(), "worker.job.lease_renewal_failed", {
        ok: false,
        level: error instanceof LostBackendJobLeaseError ? "warn" : "error",
        err: error,
        attrs: {
          worker_id: input.workerId,
          job_id: input.job.id,
        },
      });
    }
  };

  const timer = setInterval(() => {
    if (pendingRenewal) return;
    pendingRenewal = renew().finally(() => {
      pendingRenewal = null;
    });
  }, intervalMs);

  return async () => {
    clearInterval(timer);
    await pendingRenewal;
  };
}

export function leaseLostResult(
  job: BackendJob,
  error: LostBackendJobLeaseError,
): Extract<RunWorkerOnceResult, { status: "lease_lost" }> {
  emitDiagnostic(backendDiagnosticLogger(), "worker.job.lease_lost", {
    ok: false,
    level: "warn",
    err: error,
    attrs: {
      job_id: job.id,
      worker_id: error.workerId,
      operation: error.operation,
    },
  });
  return { status: "lease_lost", job, error: error.message };
}
