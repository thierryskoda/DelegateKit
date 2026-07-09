import type { TableRow } from "@ai-assistants/control-db";
import type {
  AgentActionDto,
  ProfileActionDecideOutput,
} from "@ai-assistants/actions-contracts/schemas";
import { profileActionDtoSchema } from "@ai-assistants/actions-contracts/schemas";
import { actionStatusResult, externalWriteStatusFromStorage } from "@ai-assistants/tool-contracts";
import { agentWriteResultForProfileAction } from "./external-write-contracts/registry";

export function agentActionDto(action: TableRow<"profile_actions">): AgentActionDto {
  const { status } = externalWriteStatusFromStorage({
    status: action.status,
    providerExecutionStatus: action.provider_execution_status,
  });
  const dto = {
    actionId: action.id,
    status,
    title: action.title,
    expiresAt: action.expires_at,
  } satisfies AgentActionDto;
  return profileActionDtoSchema.parse(dto);
}

export function profileActionWriteToolData(action: TableRow<"profile_actions">): unknown {
  return agentWriteResultForProfileAction(action);
}

function providerFailureMessage(action: TableRow<"profile_actions">): string | null {
  const providerError = action.provider_error;
  if (!providerError || typeof providerError !== "object" || Array.isArray(providerError)) {
    return null;
  }
  const message = Reflect.get(providerError, "message");
  if (typeof message === "string" && message.trim()) return message.trim();
  const detail = Reflect.get(providerError, "detail");
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  return null;
}

function actionLifecycleMessage(
  action: TableRow<"profile_actions">,
  status: ReturnType<typeof externalWriteStatusFromStorage>["status"],
): string {
  if (status === "failed") return providerFailureMessage(action) ?? `Failed: ${action.title}.`;
  if (status === "unknown")
    return providerFailureMessage(action) ?? `Status unknown: ${action.title}.`;
  if (status === "needs_review") return `Waiting for review: ${action.title}.`;
  if (status === "processing") return `Processing: ${action.title}.`;
  if (status === "completed") return `Completed: ${action.title}.`;
  if (status === "rejected") return `Rejected: ${action.title}.`;
  if (status === "expired") return `Expired: ${action.title}.`;
  if (status === "blocked") return `Blocked by write policy: ${action.title}.`;
  const exhaustive: never = status;
  return exhaustive;
}

export function profileActionLifecycleToolData(
  action: TableRow<"profile_actions">,
): ProfileActionDecideOutput["action"] {
  const { status } = externalWriteStatusFromStorage({
    status: action.status,
    providerExecutionStatus: action.provider_execution_status,
  });
  return actionStatusResult({
    actionId: action.id,
    status,
    result: actionLifecycleMessage(action, status),
  });
}
