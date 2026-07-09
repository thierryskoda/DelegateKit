import type { BackendJob } from "@ai-assistants/backend-jobs";
import { diagnosticProviderForJobKind } from "@ai-assistants/backend-jobs";

export function providerForJob(job: BackendJob): string | null {
  return diagnosticProviderForJobKind(job.kind);
}

export function jobDiagnosticContext(job: BackendJob) {
  const payload =
    job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
      ? job.payload
      : {};
  return {
    job_id: job.id,
    job_kind: job.kind,
    profile_id: job.profile_id,
    capability_account_link_id: job.capability_account_link_id,
    provider: providerForJob(job),
    ...(typeof Reflect.get(payload, "profileActionId") === "string"
      ? { action_id: Reflect.get(payload, "profileActionId") }
      : {}),
    ...(typeof Reflect.get(payload, "syncRunId") === "string"
      ? { sync_run_id: Reflect.get(payload, "syncRunId") }
      : {}),
  };
}
