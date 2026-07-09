import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  completeBackendJob,
  failOrRetryBackendJob,
  leaseBackendJob,
  LostBackendJobLeaseError,
  parseBackendJobRow,
  type BackendJob,
} from "@ai-assistants/backend-jobs";
import {
  configureBackendDiagnosticService,
  backendDiagnosticLogger,
} from "../../shared/diagnostics";
import { emitDiagnostic, withDiagnosticContext } from "@ai-assistants/runtime-diagnostics";
import { backendJobHandlers, requireHandler } from "./job-registry";
import { jobDiagnosticContext } from "./job-metadata";
import { jobFailureDisposition } from "./job-retry";
import { leaseLostResult, startBackendJobLeaseRenewal } from "./lease-renewal";
import type {
  BackendJobHandlerRegistry,
  RunWorkerJobByIdInput,
  RunWorkerOnceInput,
  RunWorkerOnceResult,
} from "./types";

async function runLeasedBackendJob(input: {
  db: SupabaseServiceClient;
  workerId: string;
  leaseSeconds: number;
  job: BackendJob;
  handlers?: BackendJobHandlerRegistry;
}): Promise<Exclude<RunWorkerOnceResult, { status: "idle" }>> {
  const { db, workerId, leaseSeconds, job } = input;
  return withDiagnosticContext(jobDiagnosticContext(job), async () => {
    const startedAt = Date.now();
    const stopLeaseRenewal = startBackendJobLeaseRenewal({
      db,
      job,
      workerId,
      leaseSeconds,
    });
    emitDiagnostic(backendDiagnosticLogger(), "worker.job.started", {
      attrs: {
        worker_id: workerId,
        attempt: job.attempts,
        max_attempts: job.max_attempts,
      },
    });
    try {
      const handler = requireHandler(input.handlers ?? backendJobHandlers, job.kind);
      const result = await handler({ db, job });
      await stopLeaseRenewal();
      const completedJob = await completeBackendJob(db, {
        job,
        workerId,
        result,
      });
      emitDiagnostic(backendDiagnosticLogger(), "worker.job.succeeded", {
        ok: true,
        duration_ms: Date.now() - startedAt,
        attrs: {
          worker_id: workerId,
          attempt: job.attempts,
        },
      });
      return { status: "succeeded", job: completedJob, result };
    } catch (error) {
      await stopLeaseRenewal();
      if (error instanceof LostBackendJobLeaseError) return leaseLostResult(job, error);

      const disposition = jobFailureDisposition(job, error);
      let updatedJob: BackendJob;
      try {
        updatedJob = await failOrRetryBackendJob(db, {
          job,
          workerId,
          terminal: disposition.terminal,
          errorMessage: disposition.errorMessage,
          runAfter: disposition.runAfter,
        });
      } catch (failureUpdateError) {
        if (failureUpdateError instanceof LostBackendJobLeaseError)
          return leaseLostResult(job, failureUpdateError);
        throw failureUpdateError;
      }
      const status = disposition.terminal ? "failed" : "requeued";
      emitDiagnostic(
        backendDiagnosticLogger(),
        status === "failed" ? "worker.job.failed" : "worker.job.requeued",
        {
          ok: false,
          level: status === "failed" ? "error" : "warn",
          duration_ms: Date.now() - startedAt,
          err: error,
          attrs: {
            worker_id: workerId,
            attempt: job.attempts,
            max_attempts: job.max_attempts,
          },
        },
      );
      if (status === "failed")
        return { status: "failed", job: updatedJob, error: disposition.errorMessage };
      return { status: "requeued", job: updatedJob, error: disposition.errorMessage };
    }
  });
}

export async function runWorkerOnce(input: RunWorkerOnceInput): Promise<RunWorkerOnceResult> {
  configureBackendDiagnosticService("backend-worker");
  const leaseSeconds = input.leaseSeconds ?? 60;
  const job = await leaseBackendJob(input.db, {
    workerId: input.workerId,
    leaseSeconds,
  });
  if (!job) return { status: "idle" };
  return runLeasedBackendJob({
    db: input.db,
    workerId: input.workerId,
    leaseSeconds,
    job,
    ...(input.handlers === undefined ? {} : { handlers: input.handlers }),
  });
}

async function leaseBackendJobById(input: {
  db: SupabaseServiceClient;
  jobId: string;
  workerId: string;
  leaseSeconds: number;
}): Promise<BackendJob | null> {
  const nowIso = new Date().toISOString();
  const existingResult = await input.db
    .from("backend_jobs")
    .select()
    .eq("id", input.jobId)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;
  if (!existingResult.data) return null;

  const existingJob = parseBackendJobRow(existingResult.data);
  if (
    existingJob.status !== "queued" ||
    existingJob.run_after > nowIso ||
    existingJob.attempts >= existingJob.max_attempts ||
    (existingJob.lease_expires_at !== null && existingJob.lease_expires_at > nowIso)
  ) {
    return null;
  }

  const leaseExpiresAt = new Date(Date.now() + input.leaseSeconds * 1000).toISOString();
  const result = await input.db
    .from("backend_jobs")
    .update({
      status: "running",
      attempts: existingJob.attempts + 1,
      leased_by: input.workerId,
      lease_expires_at: leaseExpiresAt,
      started_at: existingJob.started_at ?? nowIso,
      finished_at: null,
      updated_at: nowIso,
    })
    .eq("id", input.jobId)
    .eq("status", "queued")
    .eq("attempts", existingJob.attempts)
    .select()
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data ? parseBackendJobRow(result.data) : null;
}

export async function runWorkerJobById(input: RunWorkerJobByIdInput): Promise<RunWorkerOnceResult> {
  configureBackendDiagnosticService("backend-worker");
  const leaseSeconds = input.leaseSeconds ?? 60;
  const job = await leaseBackendJobById({
    db: input.db,
    jobId: input.jobId,
    workerId: input.workerId,
    leaseSeconds,
  });
  if (!job) return { status: "idle" };
  return runLeasedBackendJob({
    db: input.db,
    workerId: input.workerId,
    leaseSeconds,
    job,
    ...(input.handlers === undefined ? {} : { handlers: input.handlers }),
  });
}
