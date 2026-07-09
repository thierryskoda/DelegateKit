import { DomainError, domainCodes } from "@ai-assistants/errors";
import { type BackendJob } from "@ai-assistants/backend-jobs";
import { isProviderHttpError, serializeProviderFailure } from "../../integrations/provider-runtime/provider-http";
import { providerForJob } from "./job-metadata";

function workerBackoffMs(attempts: number): number {
  const exponent = Math.max(attempts - 1, 0);
  return Math.min(2 ** exponent * 30_000, 15 * 60_000);
}

function jobFailureMessage(job: BackendJob, error: unknown): string {
  return serializeProviderFailure(error, { provider: providerForJob(job), operation: job.kind })
    .message;
}

function shouldRetryJobError(error: unknown): boolean {
  if (
    error instanceof DomainError &&
    (error.code === domainCodes.UNAUTHORIZED || error.code === domainCodes.FORBIDDEN)
  ) {
    return false;
  }
  // Unknown job kinds should fail fast instead of retry-looping.
  return false;
}

function jobRetryDelayMs(job: BackendJob, error: unknown): number {
  if (isProviderHttpError(error) && error.retryAfterMs != null) return error.retryAfterMs;
  return workerBackoffMs(job.attempts);
}

export function jobFailureDisposition(
  job: BackendJob,
  error: unknown,
): { terminal: boolean; errorMessage: string; runAfter: string | null } {
  const retryable = shouldRetryJobError(error);
  const terminal = !retryable || job.attempts >= job.max_attempts;
  const errorMessage = jobFailureMessage(job, error);
  return {
    terminal,
    errorMessage,
    runAfter: terminal ? null : new Date(Date.now() + jobRetryDelayMs(job, error)).toISOString(),
  };
}
