import { DomainError, domainCodes, formatUnknownError } from "@ai-assistants/errors";
import {
  getBackendApiEnv,
  getBackendWorkerEnv,
  type BackendApiEnv,
  type BackendWorkerEnv,
} from "@ai-assistants/workspace-shared/env";

function configError(message: string, cause?: unknown): DomainError {
  return new DomainError(domainCodes.SERVICE_UNAVAILABLE, message, {
    ...(cause === undefined ? {} : { cause }),
  });
}

export function backendApiEnv(): BackendApiEnv {
  try {
    return getBackendApiEnv();
  } catch (error) {
    throw configError(`Backend API environment is invalid: ${formatUnknownError(error)}`, error);
  }
}

export function backendWorkerEnv(): BackendWorkerEnv {
  try {
    return getBackendWorkerEnv();
  } catch (error) {
    throw configError(`Backend worker environment is invalid: ${formatUnknownError(error)}`, error);
  }
}

export function libreOfficeBinary(): string {
  return process.env.SOFFICE_BIN?.trim() || process.env.LIBREOFFICE_BIN?.trim() || "soffice";
}
