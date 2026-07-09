import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { microsoftTodoToolContracts } from "@ai-assistants/microsoft-todo-contracts/contracts";

export default definePluginGuidance({
  name: "microsoft_todo_tools",
  plugin: plugin("microsoft-todo"),
  description:
    "Load when the user asks about Microsoft To Do tasks, task lists, task creation, task updates, completion, or deletion.",
  body: md`
# Microsoft To Do Tools

Use Microsoft To Do tools when the user asks about their Microsoft To Do tasks or wants to add, update, complete, or delete a task.

## Work with tasks

- When multiple Microsoft To Do accounts may exist, use \`microsoft_todo_accounts_list\` and pass \`connectedAccountId\` on later calls.
- Call ${tool(microsoftTodoToolContracts, "microsoft_todo_lists_list")} when the target task list id is unknown.
- Use \`microsoft_todo_tasks_list\` to find task ids before get, update, complete, or delete.
- Microsoft To Do writes are approval-governed. Do not say a task was changed until the returned \`write.status\` is completed.

${coveredToolCatalog(microsoftTodoToolContracts, {
  microsoft_todo_accounts_list: true,
  microsoft_todo_lists_list: true,
  microsoft_todo_tasks_list: true,
  microsoft_todo_task_get: true,
  microsoft_todo_task_create: true,
  microsoft_todo_task_update: true,
  microsoft_todo_task_complete: true,
  microsoft_todo_task_delete: true,
})}
`,
});
