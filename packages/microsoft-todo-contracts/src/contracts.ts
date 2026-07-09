import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  toolOutputProperty,
  type ToolContract,
  writeToolDescription,
} from "@ai-assistants/tool-contracts";
import {
  microsoftTodoAccountsListInputSchema,
  microsoftTodoAccountsListOutputSchema,
  microsoftTodoExternalWriteOutputSchema,
  microsoftTodoListsListInputSchema,
  microsoftTodoListsListOutputSchema,
  microsoftTodoTaskCompleteInputSchema,
  microsoftTodoTaskCreateInputSchema,
  microsoftTodoTaskDeleteInputSchema,
  microsoftTodoTaskGetInputSchema,
  microsoftTodoTaskGetOutputSchema,
  microsoftTodoTasksListInputSchema,
  microsoftTodoTasksListOutputSchema,
  microsoftTodoTaskUpdateInputSchema,
} from "./schemas";

export const MICROSOFT_TODO_PLUGIN_ID = "microsoft-todo-tools";

export const microsoftTodoToolContracts = [
  defineReadTool({
    name: "microsoft_todo_accounts_list",
    pluginId: MICROSOFT_TODO_PLUGIN_ID,
    label: "List Microsoft To Do Accounts",
    description: readToolDescription({
      useWhen: "the agent needs configured Microsoft To Do account choices for this profile",
      operation:
        "Lists enabled Microsoft To Do capability instances, including labels, provider, and connection health, without calling Microsoft Graph",
      returns: "Microsoft To Do account metadata for choosing connectedAccountId",
      notes: ["Use this before To Do reads or writes when multiple Microsoft accounts may exist"],
    }),
    inputSchema: microsoftTodoAccountsListInputSchema,
    outputSchema: microsoftTodoAccountsListOutputSchema,
  }),
  defineReadTool({
    name: "microsoft_todo_lists_list",
    pluginId: MICROSOFT_TODO_PLUGIN_ID,
    label: "List To Do Lists",
    description: readToolDescription({
      useWhen: "the target Microsoft To Do task list id is unknown",
      operation: "Lists task lists from the connected Microsoft To Do account",
      returns:
        "task list ids, display names, ownership, sharing, well-known list metadata, and pagination details",
      notes: [
        "Call this before task reads or writes when the target list id must be chosen",
        "Use the well-known defaultList entry for the user's main Tasks list when appropriate",
      ],
    }),
    inputSchema: microsoftTodoListsListInputSchema,
    outputSchema: microsoftTodoListsListOutputSchema,
  }),
  defineReadTool({
    name: "microsoft_todo_tasks_list",
    pluginId: MICROSOFT_TODO_PLUGIN_ID,
    label: "List To Do Tasks",
    description: readToolDescription({
      useWhen: "the user needs Microsoft To Do task discovery or task list review",
      operation: "Lists tasks in one Microsoft To Do task list",
      returns: "task summaries and pagination details",
      notes: ["Call microsoft_todo_lists_list first when listId is unknown"],
    }),
    inputSchema: microsoftTodoTasksListInputSchema,
    outputSchema: microsoftTodoTasksListOutputSchema,
  }),
  defineReadTool({
    name: "microsoft_todo_task_get",
    pluginId: MICROSOFT_TODO_PLUGIN_ID,
    label: "Get To Do Task",
    description: readToolDescription({
      useWhen: "exact Microsoft To Do task details are needed",
      operation: "Gets one task by provider list id and task id",
      returns:
        "task details including body, status, dates, reminder, categories, and provider metadata",
      notes: ["Use after microsoft_todo_tasks_list when a summary is not enough"],
    }),
    inputSchema: microsoftTodoTaskGetInputSchema,
    outputSchema: microsoftTodoTaskGetOutputSchema,
  }),
  defineWriteTool({
    name: "microsoft_todo_task_create",
    pluginId: MICROSOFT_TODO_PLUGIN_ID,
    label: "Create To Do Task",
    description: writeToolDescription({
      useWhen: "the user wants to add a Microsoft To Do task",
      operation:
        "Creates a task in a selected Microsoft To Do task list with title, optional body, importance, status, due date, start date, and reminder fields",
      returns: `the ${toolOutputProperty(microsoftTodoExternalWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      sideEffect:
        "may create a provider task or create an approval-governed Microsoft To Do action",
      safety: "the target task list and task title must be clear",
    }),
    inputSchema: microsoftTodoTaskCreateInputSchema,
    outputSchema: microsoftTodoExternalWriteOutputSchema,
    externalAction: "microsoft_todo.task.create",
  }),
  defineWriteTool({
    name: "microsoft_todo_task_update",
    pluginId: MICROSOFT_TODO_PLUGIN_ID,
    label: "Update To Do Task",
    description: writeToolDescription({
      useWhen: "the user wants to update an existing Microsoft To Do task",
      operation: "Updates one task with supplied changed fields; omitted fields are left unchanged",
      returns: `the ${toolOutputProperty(microsoftTodoExternalWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      notes: ["Use microsoft_todo_task_complete when the intended change is completing the task"],
      sideEffect:
        "may modify a provider task or create an approval-governed Microsoft To Do action",
      safety: "the exact task and at least one actual field change must be clear",
    }),
    inputSchema: microsoftTodoTaskUpdateInputSchema,
    outputSchema: microsoftTodoExternalWriteOutputSchema,
    externalAction: "microsoft_todo.task.update",
  }),
  defineWriteTool({
    name: "microsoft_todo_task_complete",
    pluginId: MICROSOFT_TODO_PLUGIN_ID,
    label: "Complete To Do Task",
    description: writeToolDescription({
      useWhen: "the user wants to mark a Microsoft To Do task complete",
      operation: "Marks one Microsoft To Do task as completed",
      returns: `the ${toolOutputProperty(microsoftTodoExternalWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      sideEffect:
        "may complete a provider task or create an approval-governed Microsoft To Do action",
      safety: "the exact task must be clear",
    }),
    inputSchema: microsoftTodoTaskCompleteInputSchema,
    outputSchema: microsoftTodoExternalWriteOutputSchema,
    externalAction: "microsoft_todo.task.complete",
  }),
  defineWriteTool({
    name: "microsoft_todo_task_delete",
    pluginId: MICROSOFT_TODO_PLUGIN_ID,
    label: "Delete To Do Task",
    description: writeToolDescription({
      useWhen: "the user wants to delete a Microsoft To Do task",
      operation: "Deletes one Microsoft To Do task from a selected task list",
      returns: `the ${toolOutputProperty(microsoftTodoExternalWriteOutputSchema, "write")} lifecycle status and safe failure details`,
      sideEffect:
        "may permanently remove a provider task or create an approval-governed Microsoft To Do action",
      safety: "the exact task must be clear because deletion is destructive",
    }),
    inputSchema: microsoftTodoTaskDeleteInputSchema,
    outputSchema: microsoftTodoExternalWriteOutputSchema,
    externalAction: "microsoft_todo.task.delete",
  }),
] as const satisfies readonly ToolContract[];

export type MicrosoftTodoToolName = (typeof microsoftTodoToolContracts)[number]["name"];
