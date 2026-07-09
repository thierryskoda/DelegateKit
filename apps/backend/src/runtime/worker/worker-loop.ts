import { getSupabaseServiceClient, type SupabaseServiceClient } from "@ai-assistants/control-db";
import { reclaimExpiredBackendJobs } from "@ai-assistants/backend-jobs";
import { emitDiagnostic } from "@ai-assistants/runtime-diagnostics";
import {
  ASSISTANT_SCHEDULED_TASK_MATERIALIZATION_LEAD_MS,
  runAssistantScheduledTasksTick,
} from "../../product/assistant-scheduled-tasks/assistant-scheduled-tasks";
import { enqueueDueProfileLearningReviewJobs } from "../../product/profile-learning-review/job-handler";
import { terminalizeTimedOutPhoneCalls } from "../../capabilities/phone/calls/lifecycle";
import {
  backendDiagnosticLogger,
  configureBackendDiagnosticService,
} from "../../shared/diagnostics";
import { backendWorkerEnv } from "../../shared/env";
import { reconcileDomainAfterBackendJobReclaim } from "./reclaim-domain";
import { runWorkerOnce } from "./run-worker-once";
import type { BackendJobHandlerRegistry } from "./types";

const scheduledTaskTickSweepMs = 60_000;
const scheduledTaskTickDueProfileLimit = 200;
const profileLearningReviewSweepMs = 60 * 60 * 1000;

async function enqueueDueScheduledTaskTicks(
  db: SupabaseServiceClient,
  input: { now: Date },
): Promise<{ profileIds: string[] }> {
  const materializationCutoff = new Date(
    input.now.getTime() + ASSISTANT_SCHEDULED_TASK_MATERIALIZATION_LEAD_MS,
  );
  const result = await db
    .from("assistant_scheduled_tasks")
    .select("profile_id")
    .eq("status", "active")
    .lte("next_run_at", materializationCutoff.toISOString())
    .limit(scheduledTaskTickDueProfileLimit);
  if (result.error) throw result.error;
  const profileIds = [
    ...new Set((result.data ?? []).map((row) => row.profile_id).filter((id) => id.trim())),
  ];
  for (const profileId of profileIds) {
    await runAssistantScheduledTasksTick(db, {
      now: input.now,
      profileId,
    });
  }
  return { profileIds };
}

async function runWorkerMaintenanceSweep(
  db: SupabaseServiceClient,
  input: { workerId: string; reclaimBatchLimit: number },
): Promise<void> {
  configureBackendDiagnosticService("backend-worker");
  try {
    const reclaimed = await reclaimExpiredBackendJobs(db, {
      batchLimit: input.reclaimBatchLimit,
    });
    if (reclaimed.length > 0) {
      emitDiagnostic(backendDiagnosticLogger(), "worker.job.expired_leases_reclaimed", {
        ok: true,
        attrs: {
          worker_id: input.workerId,
          reclaimed: reclaimed.length,
          job_ids: reclaimed.map((job) => job.id),
        },
      });
      try {
        await reconcileDomainAfterBackendJobReclaim(db, reclaimed);
      } catch (error) {
        emitDiagnostic(backendDiagnosticLogger(), "worker.job.reclaim_domain_reconcile_failed", {
          ok: false,
          level: "error",
          err: error,
          attrs: { worker_id: input.workerId, job_ids: reclaimed.map((job) => job.id) },
        });
        console.error("backend job reclaim domain reconcile failed", error);
      }
    }
  } catch (error) {
    emitDiagnostic(backendDiagnosticLogger(), "worker.job.expired_lease_reclaim_failed", {
      ok: false,
      level: "error",
      err: error,
      attrs: { worker_id: input.workerId },
    });
    console.error("backend job expired lease reclaim failed", error);
  }
  try {
    const out = await terminalizeTimedOutPhoneCalls(db);
    if (out.terminalized > 0) {
      emitDiagnostic(backendDiagnosticLogger(), "worker.phone_call.timeout_reaper_terminalized", {
        ok: true,
        attrs: {
          worker_id: input.workerId,
          terminalized: out.terminalized,
          attempt_ids: out.attemptIds,
        },
      });
    }
  } catch (error) {
    emitDiagnostic(backendDiagnosticLogger(), "worker.phone_call.timeout_reaper_failed", {
      ok: false,
      level: "error",
      err: error,
      attrs: { worker_id: input.workerId },
    });
    console.error("phone call timeout reaper failed", error);
  }
}

export async function startWorkerLoop(
  input: {
    db?: SupabaseServiceClient;
    workerId?: string;
    pollIntervalMs?: number;
    leaseSeconds?: number;
    reclaimSweepMs?: number;
    reclaimBatchLimit?: number;
    handlers?: BackendJobHandlerRegistry;
  } = {},
): Promise<never> {
  configureBackendDiagnosticService("backend-worker");
  const env = backendWorkerEnv();
  const db = input.db ?? getSupabaseServiceClient();
  const workerId = input.workerId ?? env.workerId ?? `worker-${process.pid}`;
  const pollIntervalMs = input.pollIntervalMs ?? env.workerPollMs;
  const leaseSeconds = input.leaseSeconds ?? env.workerLeaseSeconds;
  const reclaimSweepMs = input.reclaimSweepMs ?? env.workerReclaimSweepMs;
  const reclaimBatchLimit = input.reclaimBatchLimit ?? env.workerReclaimBatchLimit;
  let nextReclaimSweepAt = 0;
  let nextScheduledTaskTickSweepAt = 0;
  let nextProfileLearningReviewSweepAt = 0;

  console.log(`AI assistants backend worker started (${workerId})`);
  emitDiagnostic(backendDiagnosticLogger(), "worker.started", {
    attrs: {
      worker_id: workerId,
      poll_interval_ms: pollIntervalMs,
      lease_seconds: leaseSeconds,
      reclaim_sweep_ms: reclaimSweepMs,
      reclaim_batch_limit: reclaimBatchLimit,
    },
  });
  while (true) {
    try {
      const now = Date.now();
      if (now >= nextReclaimSweepAt) {
        nextReclaimSweepAt = now + reclaimSweepMs;
        await runWorkerMaintenanceSweep(db, { workerId, reclaimBatchLimit });
      }
      if (now >= nextScheduledTaskTickSweepAt) {
        nextScheduledTaskTickSweepAt = now + scheduledTaskTickSweepMs;
        try {
          const out = await enqueueDueScheduledTaskTicks(db, { now: new Date(now) });
          if (out.profileIds.length > 0) {
            emitDiagnostic(backendDiagnosticLogger(), "assistant_scheduled_tasks.tick.enqueued", {
              ok: true,
              attrs: {
                worker_id: workerId,
                profiles: out.profileIds.length,
                profile_ids: out.profileIds,
              },
            });
          }
        } catch (error) {
          emitDiagnostic(
            backendDiagnosticLogger(),
            "assistant_scheduled_tasks.tick.enqueue_failed",
            {
              ok: false,
              level: "error",
              err: error,
              attrs: { worker_id: workerId },
            },
          );
          console.error("assistant scheduled task tick enqueue failed", error);
        }
      }
      if (now >= nextProfileLearningReviewSweepAt) {
        nextProfileLearningReviewSweepAt = now + profileLearningReviewSweepMs;
        try {
          const out = await enqueueDueProfileLearningReviewJobs(db, {
            now: new Date(now),
            priority: 140,
          });
          if (out.profileDates.length > 0) {
            emitDiagnostic(backendDiagnosticLogger(), "profile_learning_review.jobs_enqueued", {
              ok: true,
              attrs: {
                worker_id: workerId,
                profiles: out.profileDates.length,
                profile_dates: out.profileDates,
              },
            });
          }
        } catch (error) {
          emitDiagnostic(backendDiagnosticLogger(), "profile_learning_review.enqueue_failed", {
            ok: false,
            level: "error",
            err: error,
            attrs: { worker_id: workerId },
          });
          console.error("profile learning review enqueue failed", error);
        }
      }
      await runWorkerOnce({
        db,
        workerId,
        leaseSeconds,
        ...(input.handlers === undefined ? {} : { handlers: input.handlers }),
      });
    } catch (error) {
      emitDiagnostic(backendDiagnosticLogger(), "worker.loop.failed", {
        ok: false,
        level: "error",
        err: error,
        attrs: { worker_id: workerId },
      });
      console.error("worker iteration failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
