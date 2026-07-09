import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import {
  microsoftTodoExternalWriteOutputSchema,
  microsoftTodoTaskCompleteInputSchema,
  microsoftTodoTaskCreateInputSchema,
  microsoftTodoTaskDeleteInputSchema,
  microsoftTodoTaskUpdateInputSchema,
} from "@ai-assistants/microsoft-todo-contracts/schemas";
import type { z } from "zod";
import type { ActionResult } from "../../product/actions/execution/types";
import {
  detail,
  field,
  fields,
  preview,
  section,
  textValue,
} from "../../product/actions/external-write-contracts/connect-detail";
import {
  buildExternalWriteAgentResult,
  lifecycleResultSentence,
  providerErrorMessage,
  quote,
  textField,
} from "../../product/actions/external-write-contracts/agent-result";
import {
  defineExternalWriteActionContract,
  type ExternalWriteActionContract,
} from "../../product/actions/external-write-contracts/types";
import { preflightMicrosoftTodoWrite } from "./approval-preflight";
import {
  executeMicrosoftTodoTaskComplete,
  executeMicrosoftTodoTaskCreate,
  executeMicrosoftTodoTaskDelete,
  executeMicrosoftTodoTaskUpdate,
} from "./write-actions";

type MicrosoftTodoWriteToolName =
  | "microsoft_todo_task_create"
  | "microsoft_todo_task_update"
  | "microsoft_todo_task_complete"
  | "microsoft_todo_task_delete";

function dateTimeLabel(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const dateTime = Reflect.get(value, "dateTime");
  const timeZone = Reflect.get(value, "timeZone");
  const text = textValue(dateTime);
  if (!text) return null;
  return [text, textValue(timeZone)].filter(Boolean).join(" ");
}

function buildMicrosoftTodoConnectDetail(
  toolName: MicrosoftTodoWriteToolName,
  payload: Record<string, unknown>,
) {
  const title = textValue(payload.title);
  const taskId = textValue(payload.taskId);
  const headline =
    toolName === "microsoft_todo_task_create"
      ? title
        ? `Do you approve adding "${title}" to Microsoft To Do?`
        : "Do you approve adding this Microsoft To Do task?"
      : toolName === "microsoft_todo_task_update"
        ? "Do you approve updating this Microsoft To Do task?"
        : toolName === "microsoft_todo_task_complete"
          ? "Do you approve completing this Microsoft To Do task?"
          : "Do you approve deleting this Microsoft To Do task?";
  return detail(
    toolName,
    headline,
    preview("View task", [
      section({
        title: "Task",
        fields: fields([
          field("Title", title),
          field("Task", taskId),
          field("List", payload.listId),
          field("Importance", payload.importance),
          field("Status", payload.status),
          field("Starts", dateTimeLabel(payload.startDateTime)),
          field("Due", dateTimeLabel(payload.dueDateTime)),
          field("Reminder", dateTimeLabel(payload.reminderDateTime)),
        ]),
      }),
    ]),
  );
}

function taskLabel(payload: Record<string, unknown>): string {
  return textField(payload.title) ?? textField(payload.taskId) ?? "the task";
}

function microsoftTodoWriteDescription(
  toolName: MicrosoftTodoWriteToolName,
  payload: Record<string, unknown>,
) {
  const label = taskLabel(payload);
  const safeLabel = label === "the task" ? label : quote(label);
  if (toolName === "microsoft_todo_task_create") {
    return {
      completed: `Created ${safeLabel} in Microsoft To Do.`,
      needsReview: `Creating ${safeLabel} in Microsoft To Do is waiting for review.`,
      processing: `Creating ${safeLabel} in Microsoft To Do is processing.`,
      failed: `Could not create ${safeLabel} in Microsoft To Do.`,
      unknown: `Microsoft To Do task ${safeLabel} may or may not have been created.`,
    };
  }
  if (toolName === "microsoft_todo_task_update") {
    return {
      completed: `Updated Microsoft To Do task ${safeLabel}.`,
      needsReview: `Updating Microsoft To Do task ${safeLabel} is waiting for review.`,
      processing: `Updating Microsoft To Do task ${safeLabel} is processing.`,
      failed: `Could not update Microsoft To Do task ${safeLabel}.`,
      unknown: `Microsoft To Do task ${safeLabel} may or may not have been updated.`,
    };
  }
  if (toolName === "microsoft_todo_task_complete") {
    return {
      completed: `Completed Microsoft To Do task ${safeLabel}.`,
      needsReview: `Completing Microsoft To Do task ${safeLabel} is waiting for review.`,
      processing: `Completing Microsoft To Do task ${safeLabel} is processing.`,
      failed: `Could not complete Microsoft To Do task ${safeLabel}.`,
      unknown: `Microsoft To Do task ${safeLabel} may or may not have been completed.`,
    };
  }
  return {
    completed: `Deleted Microsoft To Do task ${safeLabel}.`,
    needsReview: `Deleting Microsoft To Do task ${safeLabel} is waiting for review.`,
    processing: `Deleting Microsoft To Do task ${safeLabel} is processing.`,
    failed: `Could not delete Microsoft To Do task ${safeLabel}.`,
    unknown: `Microsoft To Do task ${safeLabel} may or may not have been deleted.`,
  };
}

function buildMicrosoftTodoAgentResult(
  toolName: MicrosoftTodoWriteToolName,
  input: Parameters<ExternalWriteActionContract["buildAgentResult"]>[0],
) {
  return buildExternalWriteAgentResult({
    action: input.action,
    payload: input.payload as Record<string, unknown>,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    message: ({ action, payload, status, providerError }) => {
      const description = microsoftTodoWriteDescription(toolName, payload);
      const failure = providerErrorMessage(providerError);
      return lifecycleResultSentence({
        status,
        actionId: action.id,
        ...description,
        failed: failure ? `${description.failed} ${failure}` : description.failed,
        unknown: failure ? `${description.unknown} ${failure}` : description.unknown,
      });
    },
  });
}

function microsoftTodoWriteContract<S extends z.ZodTypeAny>(
  toolName: MicrosoftTodoWriteToolName,
  actionPayloadSchema: S,
  executeImpl: (
    db: SupabaseServiceClient,
    action: TableRow<"profile_actions">,
    payload: z.infer<S>,
  ) => Promise<ActionResult>,
): ExternalWriteActionContract<S> {
  return defineExternalWriteActionContract({
    toolName,
    actionPayloadSchema,
    outputSchema: microsoftTodoExternalWriteOutputSchema,
    buildWritePlan: async (ctx) => {
      const pack = await preflightMicrosoftTodoWrite(ctx.db, ctx.profileId, toolName, ctx.params);
      if (!pack) {
        throw new DomainError(
          domainCodes.INTERNAL,
          `Expected Microsoft To Do approval preflight for ${toolName}.`,
        );
      }
      return {
        actionPayload: pack.payload,
        requestHash: pack.requestHash,
        reviewTitle: pack.approvalTitle,
        reviewSummary: pack.approvalSummary,
        reviewPayload: pack.reviewPayload,
      };
    },
    buildReviewDetail: ({ payload }) =>
      buildMicrosoftTodoConnectDetail(toolName, payload as Record<string, unknown>),
    buildAgentResult: (input) => buildMicrosoftTodoAgentResult(toolName, input),
    execute: executeImpl,
  });
}

export const microsoftTodoExternalWriteActionContracts: ExternalWriteActionContract[] = [
  microsoftTodoWriteContract(
    "microsoft_todo_task_create",
    microsoftTodoTaskCreateInputSchema,
    executeMicrosoftTodoTaskCreate,
  ),
  microsoftTodoWriteContract(
    "microsoft_todo_task_update",
    microsoftTodoTaskUpdateInputSchema,
    executeMicrosoftTodoTaskUpdate,
  ),
  microsoftTodoWriteContract(
    "microsoft_todo_task_complete",
    microsoftTodoTaskCompleteInputSchema,
    executeMicrosoftTodoTaskComplete,
  ),
  microsoftTodoWriteContract(
    "microsoft_todo_task_delete",
    microsoftTodoTaskDeleteInputSchema,
    executeMicrosoftTodoTaskDelete,
  ),
];
