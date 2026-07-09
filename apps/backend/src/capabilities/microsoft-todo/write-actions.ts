import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import type {
  MicrosoftTodoTaskCompleteInput,
  MicrosoftTodoTaskCreateInput,
  MicrosoftTodoTaskDeleteInput,
  MicrosoftTodoTaskUpdateInput,
} from "@ai-assistants/microsoft-todo-contracts/schemas";
import {
  markProviderExecutionStarted,
  providerIdempotencyKey,
} from "../../product/actions/execution/provider-runtime";
import {
  providerWriteRecordValue,
  recordProviderActionWriteReceipt,
} from "../../product/actions/execution/provider-write-receipts";
import type { ActionResult } from "../../product/actions/execution/types";
import {
  executeMicrosoftTodoNangoProxyOperation,
  microsoftTodoNangoProxyRecordSchema,
  type MicrosoftTodoNangoKey,
} from "../../integrations/nango/microsoft-todo-proxy";
import { requireMicrosoftTodoNango } from "./connection";
import { normalizeMicrosoftTodoTask } from "./normalization";

function htmlFromPlainText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll(/\r?\n/g, "<br>");
}

function taskBodyPatch(params: {
  bodyText?: string | undefined;
  reminderDateTime?: { dateTime: string; timeZone: string } | undefined;
  isReminderOn?: boolean | undefined;
}) {
  return {
    ...(params.bodyText !== undefined
      ? { body: { contentType: "html" as const, content: htmlFromPlainText(params.bodyText) } }
      : {}),
    ...(params.reminderDateTime !== undefined ? { reminderDateTime: params.reminderDateTime } : {}),
    ...(params.isReminderOn !== undefined || params.reminderDateTime !== undefined
      ? { isReminderOn: params.isReminderOn ?? true }
      : {}),
  };
}

async function recordMicrosoftTodoWriteReceipt(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  binding: Awaited<ReturnType<typeof requireMicrosoftTodoNango>>,
  input: {
    toolName: string;
    externalResourceId: string;
    operation: string;
    startedAt: string;
    result: unknown;
  },
): Promise<void> {
  await recordProviderActionWriteReceipt(db, action, binding, {
    providerKey: "microsoft-todo",
    capabilitySlug: "microsoft-todo",
    externalResourceType: "task",
    ...input,
  });
}

export async function executeMicrosoftTodoTaskCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: MicrosoftTodoTaskCreateInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftTodoNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const task = await executeMicrosoftTodoNangoProxyOperation(
    b.nangoProviderConfigKey as MicrosoftTodoNangoKey,
    b.nangoConnectionId,
    "create-task",
    microsoftTodoNangoProxyRecordSchema,
    {
      listId: params.listId,
      title: params.title,
      importance: params.importance,
      status: params.status,
      ...(params.startDateTime !== undefined ? { startDateTime: params.startDateTime } : {}),
      ...(params.dueDateTime !== undefined ? { dueDateTime: params.dueDateTime } : {}),
      ...taskBodyPatch(params),
    },
    sandbox,
  );
  await recordMicrosoftTodoWriteReceipt(db, action, b, {
    toolName: "microsoft_todo_task_create",
    externalResourceId: providerWriteRecordValue(task, "id") ?? params.title,
    operation: "create",
    startedAt,
    result: task,
  });
  return {
    status: "executed",
    provider: "microsoft-todo",
    result: {
      task: normalizeMicrosoftTodoTask(task, params.listId),
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  };
}

export async function executeMicrosoftTodoTaskUpdate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: MicrosoftTodoTaskUpdateInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftTodoNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const task = await executeMicrosoftTodoNangoProxyOperation(
    b.nangoProviderConfigKey as MicrosoftTodoNangoKey,
    b.nangoConnectionId,
    "update-task",
    microsoftTodoNangoProxyRecordSchema,
    {
      listId: params.listId,
      taskId: params.taskId,
      ...(params.title !== undefined ? { title: params.title } : {}),
      ...(params.importance !== undefined ? { importance: params.importance } : {}),
      ...(params.status !== undefined ? { status: params.status } : {}),
      ...(params.startDateTime !== undefined ? { startDateTime: params.startDateTime } : {}),
      ...(params.dueDateTime !== undefined ? { dueDateTime: params.dueDateTime } : {}),
      ...taskBodyPatch(params),
    },
    sandbox,
  );
  await recordMicrosoftTodoWriteReceipt(db, action, b, {
    toolName: "microsoft_todo_task_update",
    externalResourceId: providerWriteRecordValue(task, "id") ?? params.taskId,
    operation: "update",
    startedAt,
    result: task,
  });
  return {
    status: "executed",
    provider: "microsoft-todo",
    result: {
      task: normalizeMicrosoftTodoTask(task, params.listId),
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  };
}

export async function executeMicrosoftTodoTaskComplete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: MicrosoftTodoTaskCompleteInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftTodoNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const task = await executeMicrosoftTodoNangoProxyOperation(
    b.nangoProviderConfigKey as MicrosoftTodoNangoKey,
    b.nangoConnectionId,
    "update-task",
    microsoftTodoNangoProxyRecordSchema,
    { listId: params.listId, taskId: params.taskId, status: "completed" },
    sandbox,
  );
  await recordMicrosoftTodoWriteReceipt(db, action, b, {
    toolName: "microsoft_todo_task_complete",
    externalResourceId: providerWriteRecordValue(task, "id") ?? params.taskId,
    operation: "complete",
    startedAt,
    result: task,
  });
  return {
    status: "executed",
    provider: "microsoft-todo",
    result: {
      task: normalizeMicrosoftTodoTask(task, params.listId),
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  };
}

export async function executeMicrosoftTodoTaskDelete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  params: MicrosoftTodoTaskDeleteInput,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const executionAction = await markProviderExecutionStarted(db, action);
  const b = await requireMicrosoftTodoNango(db, action.profile_id, params.connectedAccountId);
  const sandbox = { db, binding: b };
  const result = await executeMicrosoftTodoNangoProxyOperation(
    b.nangoProviderConfigKey as MicrosoftTodoNangoKey,
    b.nangoConnectionId,
    "delete-task",
    microsoftTodoNangoProxyRecordSchema,
    { listId: params.listId, taskId: params.taskId },
    sandbox,
  );
  await recordMicrosoftTodoWriteReceipt(db, action, b, {
    toolName: "microsoft_todo_task_delete",
    externalResourceId: params.taskId,
    operation: "delete",
    startedAt,
    result,
  });
  return {
    status: "executed",
    provider: "microsoft-todo",
    result: {
      ...result,
      idempotencyKey: providerIdempotencyKey(executionAction),
    },
  };
}
