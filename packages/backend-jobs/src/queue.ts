import {
  requireJsonObject,
  requireSupabaseData,
  requireSupabaseRows,
  type Database,
  type PostgrestError,
  type SupabaseServiceClient,
  type TableInsert,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  backendJobKindSchema,
  backendJobRowSchema as backendJobDbRowSchema,
  backendJobStatusSchema,
} from "@ai-assistants/control-plane-contracts";
import {
  createDiagnosticLogger,
  emitDiagnostic,
  type DiagnosticLogger,
} from "@ai-assistants/runtime-diagnostics";
import { z } from "zod";

export { backendJobKindSchema, backendJobStatusSchema };

const objectPayloadSchema = z.record(z.string(), z.unknown());
const backendJobOriginSchema = z
  .object({
    agentId: z.string().trim().min(1).optional(),
    sessionKey: z.string().trim().min(1).optional(),
    sessionId: z.string().trim().min(1).optional(),
    toolCallId: z.string().trim().min(1).optional(),
  })
  .strict();
const enqueueBackendJobBaseSchema = z
  .object({
    profileId: z.string().trim().min(1),
    capabilityAccountLinkId: z.string().uuid().nullable().optional(),
    origin: backendJobOriginSchema.optional(),
    priority: z.number().int().min(0).optional(),
    runAfter: z.string().datetime({ offset: true }).optional(),
    maxAttempts: z.number().int().min(1).optional(),
    dedupeKey: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

const enqueueBackendJobInputSchema = enqueueBackendJobBaseSchema.extend({
  kind: backendJobKindSchema,
  payload: objectPayloadSchema,
});

export type BackendJobKind = z.infer<typeof backendJobKindSchema>;
export type BackendJobStatus = z.infer<typeof backendJobStatusSchema>;
export type BackendJobEffectiveStatus = BackendJobStatus | "stale";
export type BackendJobOrigin = z.infer<typeof backendJobOriginSchema>;

type BackendJobBaseRow = Omit<TableRow<"backend_jobs">, "kind" | "payload" | "status">;

export type BackendJobForKind<TKind extends BackendJobKind> = BackendJobBaseRow & {
  kind: TKind;
  payload: Record<string, unknown>;
  status: BackendJobStatus;
};

export type BackendJob = BackendJobForKind<BackendJobKind>;

export type BackendJobWithEffectiveStatus = BackendJob & {
  effective_status: BackendJobEffectiveStatus;
  lease_expired: boolean;
};

export type EnqueueBackendJobResult = {
  job: BackendJob;
  joinedExistingJob: boolean;
};

export class LostBackendJobLeaseError extends Error {
  readonly jobId: string;
  readonly workerId: string;
  readonly operation: string;

  constructor(input: { jobId: string; workerId: string; operation: string }) {
    super(
      `Backend job ${input.jobId} lease was lost before ${input.operation} by worker ${input.workerId}.`,
    );
    this.name = "LostBackendJobLeaseError";
    this.jobId = input.jobId;
    this.workerId = input.workerId;
    this.operation = input.operation;
  }
}

let cachedDiagnosticLogger: DiagnosticLogger | null = null;

function backendJobDiagnosticLogger(): DiagnosticLogger | null {
  if (cachedDiagnosticLogger) return cachedDiagnosticLogger;
  try {
    cachedDiagnosticLogger = createDiagnosticLogger({ service: "backend-worker" });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Diagnostic runtime root is required")) {
      return null;
    }
    throw error;
  }
  return cachedDiagnosticLogger;
}

function emitBackendJobEnqueuedDiagnostic(input: {
  parsed: z.infer<typeof enqueueBackendJobInputSchema>;
  result: EnqueueBackendJobResult;
}): void {
  const logger = backendJobDiagnosticLogger();
  if (!logger) return;
  const job = input.result.job;
  emitDiagnostic(logger, "backend_job.enqueued", {
    ok: true,
    profile_id: job.profile_id,
    job_id: job.id,
    job_kind: job.kind,
    attrs: {
      job_id: job.id,
      profile_id: job.profile_id,
      job_kind: job.kind,
      status: job.status,
      priority: job.priority,
      run_after: job.run_after,
      max_attempts: job.max_attempts,
      dedupe_key: job.dedupe_key,
      joined_existing: input.result.joinedExistingJob,
      capability_account_link_id: job.capability_account_link_id,
      agent_id: job.origin_agent_id,
      session_id: job.origin_session_id,
      has_session_key: Boolean(job.origin_session_key),
      tool_call_id: job.origin_tool_call_id,
      requested_priority: input.parsed.priority ?? 100,
      requested_run_after: input.parsed.runAfter ?? null,
    },
  });
}

type EnqueueBackendJobBaseInput = z.infer<typeof enqueueBackendJobBaseSchema>;

export type EnqueueBackendJobInput<TKind extends BackendJobKind = BackendJobKind> =
  EnqueueBackendJobBaseInput & {
    kind: TKind;
    payload: Record<string, unknown>;
  };

export function requireBackendJobPayload(
  job: BackendJob,
  kind: BackendJobKind,
): Record<string, unknown> {
  if (job.kind !== kind) {
    throw new Error(`Backend job ${job.id} is ${job.kind}; expected ${kind}.`);
  }
  return job.payload;
}

export function parseBackendJobRow(row: unknown): BackendJob {
  const parsed = backendJobDbRowSchema.parse(row);
  return {
    ...parsed,
    payload: objectPayloadSchema.parse(parsed.payload),
  };
}

export function backendJobEffectiveStatus(
  job: BackendJob,
  now: Date = new Date(),
): BackendJobEffectiveStatus {
  if (job.status !== "running") return job.status;
  if (!job.lease_expires_at) {
    throw new Error(`Backend job ${job.id} is running without lease_expires_at.`);
  }
  const expiresAt = Date.parse(job.lease_expires_at);
  if (!Number.isFinite(expiresAt)) {
    throw new Error(
      `Backend job ${job.id} has invalid lease_expires_at=${JSON.stringify(job.lease_expires_at)}.`,
    );
  }
  return expiresAt <= now.getTime() ? "stale" : "running";
}

export function backendJobWithEffectiveStatus(
  job: BackendJob,
  now: Date = new Date(),
): BackendJobWithEffectiveStatus {
  const effectiveStatus = backendJobEffectiveStatus(job, now);
  return {
    ...job,
    effective_status: effectiveStatus,
    lease_expired: effectiveStatus === "stale",
  };
}

function requireSingleBackendJobRpcRow(input: {
  label: string;
  rows: unknown[] | null;
  error: Parameters<typeof requireSupabaseRows>[2];
}): BackendJob | null {
  const rows = requireSupabaseRows(input.label, input.rows, input.error);
  if (rows.length > 1)
    throw new Error(`${input.label} returned ${rows.length} rows; expected at most one.`);
  return rows[0] ? parseBackendJobRow(rows[0]) : null;
}

function isUniqueViolation(error: PostgrestError | null): boolean {
  return error?.code === "23505";
}

async function loadExistingActiveBackendJobForDedupe(
  db: SupabaseServiceClient,
  input: { profileId: string; kind: BackendJobKind; dedupeKey: string },
): Promise<BackendJob> {
  const result = await db
    .from("backend_jobs")
    .select()
    .eq("profile_id", input.profileId)
    .eq("kind", input.kind)
    .eq("dedupe_key", input.dedupeKey)
    .in("status", ["queued", "running"])
    .single();
  return parseBackendJobRow(
    requireSupabaseData("Load existing active backend job for dedupe", result.data, result.error),
  );
}

async function enqueueBackendJobDirect(
  db: SupabaseServiceClient,
  parsed: z.infer<typeof enqueueBackendJobInputSchema>,
): Promise<EnqueueBackendJobResult> {
  const payload = objectPayloadSchema.parse(parsed.payload);
  const dedupeKey = parsed.dedupeKey?.trim() || null;
  const insert: TableInsert<"backend_jobs"> = {
    profile_id: parsed.profileId,
    kind: parsed.kind,
    status: "queued",
    payload: requireJsonObject(payload, "backendJob.payload"),
    priority: parsed.priority ?? 100,
    max_attempts: parsed.maxAttempts ?? 5,
    run_after: parsed.runAfter ?? new Date().toISOString(),
    ...(parsed.capabilityAccountLinkId
      ? { capability_account_link_id: parsed.capabilityAccountLinkId }
      : {}),
    ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
    ...(parsed.origin?.agentId ? { origin_agent_id: parsed.origin.agentId } : {}),
    ...(parsed.origin?.sessionKey ? { origin_session_key: parsed.origin.sessionKey } : {}),
    ...(parsed.origin?.sessionId ? { origin_session_id: parsed.origin.sessionId } : {}),
    ...(parsed.origin?.toolCallId ? { origin_tool_call_id: parsed.origin.toolCallId } : {}),
  };

  const result = await db.from("backend_jobs").insert(insert).select().single();
  if (dedupeKey && isUniqueViolation(result.error)) {
    const job = await loadExistingActiveBackendJobForDedupe(db, {
      profileId: parsed.profileId,
      kind: parsed.kind,
      dedupeKey,
    });
    return {
      joinedExistingJob: true,
      job,
    };
  }
  const job = parseBackendJobRow(
    requireSupabaseData("Enqueue backend job", result.data, result.error),
  );
  return {
    joinedExistingJob: false,
    job,
  };
}

export async function enqueueBackendJob(
  db: SupabaseServiceClient,
  input: EnqueueBackendJobInput,
): Promise<EnqueueBackendJobResult> {
  const parsed = enqueueBackendJobInputSchema.parse(input);
  const result = await enqueueBackendJobDirect(db, parsed);
  emitBackendJobEnqueuedDiagnostic({ parsed, result });
  return result;
}

type BackendJobsUpdate = Database["public"]["Tables"]["backend_jobs"]["Update"];

async function patchOwnedRunningBackendJob(
  db: SupabaseServiceClient,
  input: {
    jobId: string;
    workerId: string;
    operation: string;
    patch: BackendJobsUpdate;
  },
): Promise<BackendJob> {
  const nowIso = new Date().toISOString();
  const patchWithTimestamp: BackendJobsUpdate = {
    ...input.patch,
    updated_at: input.patch.updated_at ?? nowIso,
  };
  const result = await db
    .from("backend_jobs")
    .update(patchWithTimestamp)
    .eq("id", input.jobId)
    .eq("status", "running")
    .eq("leased_by", input.workerId)
    .gt("lease_expires_at", nowIso)
    .select()
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    throw new LostBackendJobLeaseError({
      jobId: input.jobId,
      workerId: input.workerId,
      operation: input.operation,
    });
  }
  return parseBackendJobRow(result.data);
}

export async function leaseBackendJob(
  db: SupabaseServiceClient,
  input: { workerId: string; leaseSeconds: number },
): Promise<BackendJob | null> {
  const args = {
    worker_id: input.workerId,
    lease_seconds: input.leaseSeconds,
  };
  const result = await db.rpc("lease_backend_job", args);
  return requireSingleBackendJobRpcRow({
    label: "Lease backend job",
    rows: result.data,
    error: result.error,
  });
}

export async function renewBackendJobLease(
  db: SupabaseServiceClient,
  input: { job: BackendJob; workerId: string; leaseSeconds: number },
): Promise<BackendJob> {
  const leaseExpiresAt = new Date(Date.now() + input.leaseSeconds * 1000).toISOString();
  return patchOwnedRunningBackendJob(db, {
    jobId: input.job.id,
    workerId: input.workerId,
    operation: "lease renewal",
    patch: {
      lease_expires_at: leaseExpiresAt,
    },
  });
}

export async function completeBackendJob(
  db: SupabaseServiceClient,
  input: { job: BackendJob; workerId: string; result: Record<string, unknown> },
): Promise<BackendJob> {
  const nowIso = new Date().toISOString();
  requireJsonObject(input.result, "backendJob.resultPayload");
  return patchOwnedRunningBackendJob(db, {
    jobId: input.job.id,
    workerId: input.workerId,
    operation: "completion",
    patch: {
      status: "succeeded",
      lease_expires_at: null,
      leased_by: null,
      finished_at: nowIso,
      updated_at: nowIso,
    },
  });
}

export async function failOrRetryBackendJob(
  db: SupabaseServiceClient,
  input: {
    job: BackendJob;
    workerId: string;
    terminal: boolean;
    errorMessage: string;
    runAfter?: string | null;
  },
): Promise<BackendJob> {
  if (!input.terminal && input.job.attempts >= input.job.max_attempts) {
    throw new Error(
      `Backend job ${input.job.id} cannot be retried because attempts has reached max_attempts.`,
    );
  }
  const nowIso = new Date().toISOString();
  const patch = input.terminal
    ? {
        status: "failed" as const,
        last_error: input.errorMessage,
        lease_expires_at: null,
        leased_by: null,
        finished_at: nowIso,
        updated_at: nowIso,
      }
    : {
        status: "queued" as const,
        last_error: input.errorMessage,
        lease_expires_at: null,
        leased_by: null,
        run_after: input.runAfter ?? nowIso,
        finished_at: null,
        updated_at: nowIso,
      };
  return patchOwnedRunningBackendJob(db, {
    jobId: input.job.id,
    workerId: input.workerId,
    operation: input.terminal ? "failure" : "retry",
    patch,
  });
}

export async function reclaimExpiredBackendJobs(
  db: SupabaseServiceClient,
  input: { batchLimit?: number } = {},
): Promise<BackendJob[]> {
  const result = await db.rpc("reclaim_expired_backend_jobs", {
    batch_limit: input.batchLimit ?? 50,
  });
  return requireSupabaseRows("Reclaim expired backend jobs", result.data, result.error).map((row) =>
    parseBackendJobRow(row),
  );
}

/** Label for worker diagnostics / serialization context (not necessarily integration `provider`). */
export function diagnosticProviderForJobKind(kind: BackendJobKind): string | null {
  switch (kind) {
    case "agent.run.execute":
      return "agent-runner";
    case "profile.learning_review.run":
      return "profile-learning-review";
    case "capability.setup.monday":
      return "monday";
    case "provider.webhook.process":
    case "provider.webhook.subscription.reconcile":
    case "provider.sync.process":
      return "provider-webhook";
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unhandled BackendJobKind for diagnostic provider: ${String(exhaustive)}`);
    }
  }
}
