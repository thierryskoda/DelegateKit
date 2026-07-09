import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { BackendJob, BackendJobKind } from "@ai-assistants/backend-jobs";

type BackendJobHandlerResult = Record<string, unknown>;
export type BackendJobHandler = (input: {
  db: SupabaseServiceClient;
  job: BackendJob;
}) => Promise<BackendJobHandlerResult>;
export type BackendJobHandlerRegistry = Partial<Record<BackendJobKind, BackendJobHandler>>;

export type RunWorkerOnceInput = {
  db: SupabaseServiceClient;
  workerId: string;
  leaseSeconds?: number;
  handlers?: BackendJobHandlerRegistry;
};

export type RunWorkerJobByIdInput = RunWorkerOnceInput & {
  jobId: string;
};

export type RunWorkerOnceResult =
  | { status: "idle" }
  | { status: "succeeded"; job: BackendJob; result: BackendJobHandlerResult }
  | { status: "requeued"; job: BackendJob; error: string }
  | { status: "failed"; job: BackendJob; error: string }
  | { status: "lease_lost"; job: BackendJob; error: string };
