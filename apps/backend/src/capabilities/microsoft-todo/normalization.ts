import type { MicrosoftTodoTaskDetail } from "@ai-assistants/microsoft-todo-contracts/schemas";

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function dateTimeValue(value: unknown): { dateTime: string; timeZone: string } | null {
  const record = recordValue(value);
  const dateTime = stringValue(record.dateTime);
  const timeZone = stringValue(record.timeZone);
  return dateTime && timeZone ? { dateTime, timeZone } : null;
}

export function normalizeMicrosoftTodoTaskList(value: unknown) {
  const record = recordValue(value);
  return {
    id: stringValue(record.id) ?? "",
    displayName: stringValue(record.displayName),
    isOwner: booleanValue(record.isOwner),
    isShared: booleanValue(record.isShared),
    wellknownListName: stringValue(record.wellknownListName),
  };
}

export function normalizeMicrosoftTodoTask(
  value: unknown,
  listId: string,
): MicrosoftTodoTaskDetail {
  const record = recordValue(value);
  const body = recordValue(record.body);
  return {
    id: stringValue(record.id) ?? "",
    listId,
    title: stringValue(record.title),
    body: stringValue(body.content),
    bodyContentType: stringValue(body.contentType),
    importance:
      record.importance === "low" || record.importance === "normal" || record.importance === "high"
        ? record.importance
        : null,
    status:
      record.status === "notStarted" ||
      record.status === "inProgress" ||
      record.status === "completed" ||
      record.status === "waitingOnOthers" ||
      record.status === "deferred"
        ? record.status
        : null,
    isReminderOn: booleanValue(record.isReminderOn),
    startDateTime: dateTimeValue(record.startDateTime),
    dueDateTime: dateTimeValue(record.dueDateTime),
    reminderDateTime: dateTimeValue(record.reminderDateTime),
    completedDateTime: dateTimeValue(record.completedDateTime),
    createdDateTime: stringValue(record.createdDateTime),
    lastModifiedDateTime: stringValue(record.lastModifiedDateTime),
    categories: stringArrayValue(record.categories),
    hasAttachments: booleanValue(record.hasAttachments),
  };
}

export function normalizeMicrosoftTodoTaskListItem(
  value: unknown,
  listId: string,
): Pick<
  MicrosoftTodoTaskDetail,
  | "categories"
  | "completedDateTime"
  | "dueDateTime"
  | "id"
  | "importance"
  | "isReminderOn"
  | "lastModifiedDateTime"
  | "listId"
  | "reminderDateTime"
  | "startDateTime"
  | "status"
  | "title"
> {
  const task = normalizeMicrosoftTodoTask(value, listId);
  return {
    id: task.id,
    listId: task.listId,
    title: task.title,
    importance: task.importance,
    status: task.status,
    isReminderOn: task.isReminderOn,
    startDateTime: task.startDateTime,
    dueDateTime: task.dueDateTime,
    reminderDateTime: task.reminderDateTime,
    completedDateTime: task.completedDateTime,
    lastModifiedDateTime: task.lastModifiedDateTime,
    categories: task.categories,
  };
}
