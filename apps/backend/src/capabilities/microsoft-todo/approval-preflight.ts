import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import {
  microsoftTodoTaskCompleteInputSchema,
  microsoftTodoTaskCreateInputSchema,
  microsoftTodoTaskDeleteInputSchema,
  microsoftTodoTaskUpdateInputSchema,
} from "@ai-assistants/microsoft-todo-contracts/schemas";
import {
  buildExternalWriteApprovalPlan,
  type ExternalWriteApprovalPlan,
} from "../../product/actions/external-write-contracts/approval-plan";
import { requireMicrosoftTodoNango } from "./connection";

export type MicrosoftTodoApprovalPack = ExternalWriteApprovalPlan;

const MICROSOFT_TODO_WRITE_TOOLS = new Set([
  "microsoft_todo_task_create",
  "microsoft_todo_task_update",
  "microsoft_todo_task_complete",
  "microsoft_todo_task_delete",
]);

export async function preflightMicrosoftTodoWrite(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<MicrosoftTodoApprovalPack | null> {
  if (!MICROSOFT_TODO_WRITE_TOOLS.has(toolName)) return null;
  switch (toolName) {
    case "microsoft_todo_task_create": {
      const p = microsoftTodoTaskCreateInputSchema.parse(params);
      await requireMicrosoftTodoNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Create Microsoft To Do task",
        `Create "${p.title}" in task list ${p.listId}.`,
        toolName,
        { listId: p.listId, title: p.title },
      );
    }
    case "microsoft_todo_task_update": {
      const p = microsoftTodoTaskUpdateInputSchema.parse(params);
      await requireMicrosoftTodoNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Update Microsoft To Do task",
        `Update task ${p.taskId} in task list ${p.listId}.`,
        toolName,
        { listId: p.listId, taskId: p.taskId },
      );
    }
    case "microsoft_todo_task_complete": {
      const p = microsoftTodoTaskCompleteInputSchema.parse(params);
      await requireMicrosoftTodoNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Complete Microsoft To Do task",
        `Complete task ${p.taskId} in task list ${p.listId}.`,
        toolName,
        { listId: p.listId, taskId: p.taskId },
      );
    }
    case "microsoft_todo_task_delete": {
      const p = microsoftTodoTaskDeleteInputSchema.parse(params);
      await requireMicrosoftTodoNango(db, profileId, p.connectedAccountId);
      return buildExternalWriteApprovalPlan(
        toolName,
        p,
        "Delete Microsoft To Do task",
        `Delete task ${p.taskId} from task list ${p.listId}.`,
        toolName,
        { listId: p.listId, taskId: p.taskId },
      );
    }
    default:
      return null;
  }
}
