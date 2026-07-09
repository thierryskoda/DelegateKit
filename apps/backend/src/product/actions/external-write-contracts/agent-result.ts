import type { TableRow } from "@ai-assistants/control-db";
import {
  externalWriteResult,
  externalWriteStatusFromStorage,
  type ExternalWriteFailure,
  type ExternalWriteStatus,
} from "@ai-assistants/tool-contracts";

type FailureRecovery = ExternalWriteFailure["recovery"];

type ExternalWriteResultInput<TPayload> = {
  action: TableRow<"profile_actions">;
  payload: TPayload;
  resultPayload: unknown;
  providerError: unknown;
  status: ExternalWriteStatus;
};

export type ExternalWriteResultMessageBuilder<TPayload> = (
  input: ExternalWriteResultInput<TPayload>,
) => string;

export type ExternalWriteFailureRecoveryOverride<TPayload> = (
  input: ExternalWriteResultInput<TPayload> & { failure: ExternalWriteFailure },
) => FailureRecovery | null;

const externalWriteFailureKinds = new Set<ExternalWriteFailure["kind"]>([
  "auth",
  "permission",
  "rate_limit",
  "quota",
  "timeout",
  "provider_unavailable",
  "bad_request",
  "not_found",
  "provider_contract",
  "network",
  "unknown",
]);

function stringProperty(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const property = Reflect.get(value, key);
  return typeof property === "string" && property.trim() ? property.trim() : null;
}

export function providerErrorMessage(value: unknown): string | null {
  return stringProperty(value, "message") ?? stringProperty(value, "detail");
}

function booleanProperty(value: unknown, key: string): boolean | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const property = Reflect.get(value, key);
  return typeof property === "boolean" ? property : null;
}

function numberProperty(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const property = Reflect.get(value, key);
  return typeof property === "number" && Number.isFinite(property) ? property : null;
}

function defaultRecovery(kind: ExternalWriteFailure["kind"]): FailureRecovery {
  if (kind === "auth" || kind === "permission") return "reconnect_account";
  if (kind === "rate_limit" || kind === "quota" || kind === "timeout" || kind === "network") {
    return "retry_later";
  }
  if (kind === "provider_unavailable") return "retry_later";
  if (kind === "not_found" || kind === "bad_request") return "ask_user_for_correct_value";
  return "manual_reconciliation";
}

function mapExternalWriteFailure(
  providerError: unknown,
  recovery?: FailureRecovery | null,
): ExternalWriteFailure | undefined {
  const rawKind = stringProperty(providerError, "kind");
  const kind = externalWriteFailureKinds.has(rawKind as ExternalWriteFailure["kind"])
    ? (rawKind as ExternalWriteFailure["kind"])
    : "unknown";
  const message =
    stringProperty(providerError, "message") ??
    stringProperty(providerError, "detail") ??
    "The external write failed without a provider detail.";
  const field = stringProperty(providerError, "field") ?? undefined;
  const retryable = booleanProperty(providerError, "retryable") ?? false;
  const retryAfterMs = numberProperty(providerError, "retryAfterMs") ?? undefined;
  return {
    kind,
    message,
    recovery: recovery ?? defaultRecovery(kind),
    retryable,
    ...(field === undefined ? {} : { field }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  };
}

export function externalWriteLifecycleStatus(action: TableRow<"profile_actions">) {
  return externalWriteStatusFromStorage({
    status: action.status,
    providerExecutionStatus: action.provider_execution_status,
  }).status;
}

export function buildExternalWriteAgentResult<TPayload>(input: {
  action: TableRow<"profile_actions">;
  payload: TPayload;
  resultPayload?: unknown;
  providerError?: unknown;
  message: ExternalWriteResultMessageBuilder<TPayload>;
  recovery?: ExternalWriteFailureRecoveryOverride<TPayload>;
}) {
  const status = externalWriteLifecycleStatus(input.action);
  const baseInput = {
    action: input.action,
    payload: input.payload,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    status,
  };
  const baseFailure =
    status === "failed" || status === "unknown"
      ? mapExternalWriteFailure(input.providerError)
      : undefined;
  const failure =
    baseFailure && input.recovery
      ? {
          ...baseFailure,
          recovery: input.recovery({ ...baseInput, failure: baseFailure }) ?? baseFailure.recovery,
        }
      : baseFailure;
  return {
    write: externalWriteResult({
      actionId: input.action.id,
      status,
      result: input.message(baseInput),
      ...(failure === undefined ? {} : { failure }),
    }),
  };
}

export function lifecycleResultSentence(input: {
  status: ExternalWriteStatus;
  actionId: string;
  completed: string;
  needsReview: string;
  processing: string;
  failed: string;
  unknown: string;
  blocked?: string | undefined;
  rejected?: string | undefined;
  expired?: string | undefined;
}): string {
  if (input.status === "completed") return input.completed;
  if (input.status === "needs_review") {
    return input.needsReview;
  }
  if (input.status === "processing") {
    return input.processing;
  }
  if (input.status === "failed") return input.failed;
  if (input.status === "unknown") return input.unknown;
  if (input.status === "blocked") return input.blocked ?? "The external write was blocked.";
  if (input.status === "rejected") return input.rejected ?? "The external write was rejected.";
  if (input.status === "expired") return input.expired ?? "The external write review expired.";
  const exhaustive: never = input.status;
  return exhaustive;
}

export function quote(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function textField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function stringArraySummary(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const items = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return items.length > 0 ? items.join(", ") : null;
}
