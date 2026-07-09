import { z } from "zod";
import {
  nangoProxyRequestJson,
  nangoProxyRequestVoid,
  type NangoProxySandboxContext,
  type ProviderOperation,
} from "./nango-proxy-client";

export type MicrosoftTodoNangoKey = "ai-assistants-outlook";

export const microsoftTodoNangoProxyRecordSchema = z.record(z.string(), z.unknown());

const stringField = z.string().trim().min(1);
const jsonRecordSchema = z.record(z.string(), z.unknown());
const odataCollectionSchema = z
  .object({
    "@odata.nextLink": z.string().optional(),
    value: z.array(jsonRecordSchema).optional(),
  })
  .passthrough();

const microsoftTodoDateTimeInputSchema = z
  .object({ dateTime: stringField, timeZone: stringField })
  .strict();
const microsoftTodoBodySchema = z
  .object({ contentType: z.enum(["html"]), content: z.string() })
  .strict();
const microsoftTodoTaskPatchSchema = z
  .object({
    title: stringField.optional(),
    body: microsoftTodoBodySchema.optional(),
    importance: z.enum(["low", "normal", "high"]).optional(),
    status: z
      .enum(["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"])
      .optional(),
    startDateTime: microsoftTodoDateTimeInputSchema.optional(),
    dueDateTime: microsoftTodoDateTimeInputSchema.optional(),
    reminderDateTime: microsoftTodoDateTimeInputSchema.optional(),
    isReminderOn: z.boolean().optional(),
  })
  .strict();

export type MicrosoftTodoProxyOperation =
  | "create-task"
  | "delete-task"
  | "get-task"
  | "list-lists"
  | "list-tasks"
  | "update-task";

const listInputSchema = z
  .object({ cursor: stringField.optional(), limit: z.number().int().positive().optional() })
  .strict();
const listTasksInputSchema = listInputSchema.extend({ listId: stringField }).strict();
const taskIdInputSchema = z.object({ listId: stringField, taskId: stringField }).strict();
const createTaskInputSchema = microsoftTodoTaskPatchSchema
  .extend({ listId: stringField, title: stringField })
  .strict();
const updateTaskInputSchema = microsoftTodoTaskPatchSchema
  .extend({ listId: stringField, taskId: stringField })
  .strict();

type MicrosoftTodoOperationInputByName = {
  "create-task": z.infer<typeof createTaskInputSchema>;
  "delete-task": z.infer<typeof taskIdInputSchema>;
  "get-task": z.infer<typeof taskIdInputSchema>;
  "list-lists": z.infer<typeof listInputSchema>;
  "list-tasks": z.infer<typeof listTasksInputSchema>;
  "update-task": z.infer<typeof updateTaskInputSchema>;
};

type MicrosoftTodoOperationMap = {
  [K in MicrosoftTodoProxyOperation]: ProviderOperation<
    MicrosoftTodoOperationInputByName[K],
    unknown
  >;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function taskListPath(listId: string, suffix = ""): string {
  return `/v1.0/me/todo/lists/${encodeURIComponent(listId)}${suffix}`;
}

function taskPath(listId: string, taskId: string): string {
  return `${taskListPath(listId, "/tasks")}/${encodeURIComponent(taskId)}`;
}

function normalizeMicrosoftTodoOutput(
  operationName: MicrosoftTodoProxyOperation,
  input: MicrosoftTodoOperationInputByName[MicrosoftTodoProxyOperation],
  raw: unknown,
): unknown {
  const parsedInput = recordValue(input);
  const record = recordValue(raw);
  switch (operationName) {
    case "list-lists":
      return { lists: arrayValue(record.value), next_cursor: record["@odata.nextLink"] };
    case "list-tasks":
      return { tasks: arrayValue(record.value), next_cursor: record["@odata.nextLink"] };
    case "delete-task":
      return { success: true, listId: parsedInput.listId, taskId: parsedInput.taskId };
    default:
      return raw;
  }
}

function taskPatchBody(
  input: z.infer<typeof microsoftTodoTaskPatchSchema>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of [
    "title",
    "body",
    "importance",
    "status",
    "startDateTime",
    "dueDateTime",
    "reminderDateTime",
    "isReminderOn",
  ] as const) {
    if (input[key] !== undefined) body[key] = input[key];
  }
  return body;
}

const microsoftTodoOperations: MicrosoftTodoOperationMap = {
  "list-lists": {
    inputSchema: listInputSchema,
    responseSchema: odataCollectionSchema,
    toProxyRequest(input) {
      if (input.cursor) return { method: "get", endpoint: input.cursor };
      return {
        method: "get",
        endpoint: "/v1.0/me/todo/lists",
        params: { $top: typeof input.limit === "number" ? Math.min(input.limit, 100) : 50 },
      };
    },
    normalize: (raw, input) => normalizeMicrosoftTodoOutput("list-lists", input, raw),
  },
  "list-tasks": {
    inputSchema: listTasksInputSchema,
    responseSchema: odataCollectionSchema,
    toProxyRequest(input) {
      if (input.cursor) return { method: "get", endpoint: input.cursor };
      return {
        method: "get",
        endpoint: taskListPath(input.listId, "/tasks"),
        params: { $top: typeof input.limit === "number" ? Math.min(input.limit, 100) : 50 },
      };
    },
    normalize: (raw, input) => normalizeMicrosoftTodoOutput("list-tasks", input, raw),
  },
  "get-task": {
    inputSchema: taskIdInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({ method: "get", endpoint: taskPath(input.listId, input.taskId) }),
    normalize: (raw, input) => normalizeMicrosoftTodoOutput("get-task", input, raw),
  },
  "create-task": {
    inputSchema: createTaskInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest(input) {
      const { listId: _listId, ...patch } = input;
      return {
        method: "post",
        endpoint: taskListPath(input.listId, "/tasks"),
        data: taskPatchBody(patch),
        bodySchema: microsoftTodoTaskPatchSchema.extend({ title: stringField }).strict(),
      };
    },
    normalize: (raw, input) => normalizeMicrosoftTodoOutput("create-task", input, raw),
  },
  "update-task": {
    inputSchema: updateTaskInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest(input) {
      const { listId: _listId, taskId: _taskId, ...patch } = input;
      return {
        method: "patch",
        endpoint: taskPath(input.listId, input.taskId),
        data: taskPatchBody(patch),
        bodySchema: microsoftTodoTaskPatchSchema,
      };
    },
    normalize: (raw, input) => normalizeMicrosoftTodoOutput("update-task", input, raw),
  },
  "delete-task": {
    inputSchema: taskIdInputSchema,
    responseSchema: z.unknown(),
    toProxyRequest: (input) => ({
      method: "delete",
      endpoint: taskPath(input.listId, input.taskId),
      voidResponse: true,
    }),
    normalize: (raw, input) => normalizeMicrosoftTodoOutput("delete-task", input, raw),
  },
};

export async function executeMicrosoftTodoNangoProxyOperation<
  T,
  TOperation extends MicrosoftTodoProxyOperation,
>(
  providerConfigKey: MicrosoftTodoNangoKey,
  connectionId: string,
  operationName: TOperation,
  responseSchema: z.ZodType<T>,
  input: MicrosoftTodoOperationInputByName[TOperation],
  sandbox?: NangoProxySandboxContext,
): Promise<T> {
  const operation = microsoftTodoOperations[operationName];
  const parsedInput = operation.inputSchema.parse(input);
  const request = operation.toProxyRequest(parsedInput as never);
  if (request.voidResponse) {
    await nangoProxyRequestVoid({
      operation: `nango.microsoft_todo.proxy.${operationName}`,
      publicSummary: `Nango Microsoft To Do proxy operation "${operationName}" failed`,
      providerConfigKey,
      connectionId,
      method: request.method,
      endpoint: request.endpoint,
      ...(request.data === undefined ? {} : { data: request.data }),
      ...(request.bodySchema === undefined ? {} : { bodySchema: request.bodySchema }),
      retries: 3,
      ...(sandbox === undefined ? {} : { sandbox }),
    });
    return responseSchema.parse(operation.normalize(undefined, parsedInput as never));
  }
  const raw = await nangoProxyRequestJson({
    operation: `nango.microsoft_todo.proxy.${operationName}`,
    publicSummary: `Nango Microsoft To Do proxy operation "${operationName}" failed`,
    providerConfigKey,
    connectionId,
    method: request.method,
    endpoint: request.endpoint,
    ...(request.params === undefined ? {} : { params: request.params }),
    ...(request.data === undefined ? {} : { data: request.data }),
    ...(request.bodySchema === undefined ? {} : { bodySchema: request.bodySchema }),
    responseSchema: operation.responseSchema,
    retries: 3,
    ...(sandbox === undefined ? {} : { sandbox }),
  });
  return responseSchema.parse(operation.normalize(raw, parsedInput as never));
}
