import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { microsoftTodoToolContracts } from "@ai-assistants/microsoft-todo-contracts/contracts";
import {
  microsoftTodoAccountsListInputSchema,
  microsoftTodoListsListInputSchema,
  microsoftTodoListsListOutputSchema,
  microsoftTodoTaskGetInputSchema,
  microsoftTodoTaskGetOutputSchema,
  microsoftTodoTasksListInputSchema,
  microsoftTodoTasksListOutputSchema,
} from "@ai-assistants/microsoft-todo-contracts/schemas";
import {
  toolContractByName,
  toolData,
  toolDataForContract,
  type BackendToolResult,
} from "@ai-assistants/tool-contracts";
import {
  executeMicrosoftTodoNangoProxyOperation,
  microsoftTodoNangoProxyRecordSchema,
  type MicrosoftTodoNangoKey,
} from "../../integrations/nango/microsoft-todo-proxy";
import { listProviderAccountChoices } from "../../product/connected-accounts/provider-account-choices";
import { requireMicrosoftTodoNango } from "./connection";
import {
  normalizeMicrosoftTodoTask,
  normalizeMicrosoftTodoTaskList,
  normalizeMicrosoftTodoTaskListItem,
} from "./normalization";

function microsoftTodoContext(binding: { account: { account_email: string | null } }) {
  return {
    provider: "microsoft-todo" as const,
    accountEmail: binding.account.account_email,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(recordValue) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function listMicrosoftTodoAccounts(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<BackendToolResult> {
  return toolDataForContract(
    toolContractByName(microsoftTodoToolContracts, "microsoft_todo_accounts_list"),
    {
      accounts: await listProviderAccountChoices(db, {
        profileId,
        capabilitySlug: "microsoft-todo",
        provider: "microsoft-todo",
        label: "List Microsoft To Do capability instances",
      }),
    },
  );
}

export async function executeMicrosoftTodoReadTool(
  db: SupabaseServiceClient,
  profileId: string,
  toolName: string,
  params: Record<string, unknown>,
): Promise<BackendToolResult> {
  switch (toolName) {
    case "microsoft_todo_accounts_list":
      microsoftTodoAccountsListInputSchema.parse(params);
      return listMicrosoftTodoAccounts(db, profileId);
    case "microsoft_todo_lists_list": {
      const p = microsoftTodoListsListInputSchema.parse(params);
      const b = await requireMicrosoftTodoNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftTodoNangoProxyOperation(
        b.nangoProviderConfigKey as MicrosoftTodoNangoKey,
        b.nangoConnectionId,
        "list-lists",
        microsoftTodoNangoProxyRecordSchema,
        { cursor: p.nextPageToken, limit: p.maxResults },
        sandbox,
      );
      const record = recordValue(data);
      return toolData(
        microsoftTodoListsListOutputSchema.parse({
          ...microsoftTodoContext(b),
          lists: arrayValue(record.lists ?? record.value).map(normalizeMicrosoftTodoTaskList),
          nextCursor: stringValue(record.next_cursor) ?? stringValue(record["@odata.nextLink"]),
        }),
      );
    }
    case "microsoft_todo_tasks_list": {
      const p = microsoftTodoTasksListInputSchema.parse(params);
      const b = await requireMicrosoftTodoNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const data = await executeMicrosoftTodoNangoProxyOperation(
        b.nangoProviderConfigKey as MicrosoftTodoNangoKey,
        b.nangoConnectionId,
        "list-tasks",
        microsoftTodoNangoProxyRecordSchema,
        { listId: p.listId, cursor: p.nextPageToken, limit: p.maxResults },
        sandbox,
      );
      const record = recordValue(data);
      return toolData(
        microsoftTodoTasksListOutputSchema.parse({
          ...microsoftTodoContext(b),
          listId: p.listId,
          tasks: arrayValue(record.tasks ?? record.value).map((task) =>
            normalizeMicrosoftTodoTaskListItem(task, p.listId),
          ),
          nextCursor: stringValue(record.next_cursor) ?? stringValue(record["@odata.nextLink"]),
        }),
      );
    }
    case "microsoft_todo_task_get": {
      const p = microsoftTodoTaskGetInputSchema.parse(params);
      const b = await requireMicrosoftTodoNango(db, profileId, p.connectedAccountId);
      const sandbox = { db, binding: b };
      const task = await executeMicrosoftTodoNangoProxyOperation(
        b.nangoProviderConfigKey as MicrosoftTodoNangoKey,
        b.nangoConnectionId,
        "get-task",
        microsoftTodoNangoProxyRecordSchema,
        { listId: p.listId, taskId: p.taskId },
        sandbox,
      );
      return toolData(
        microsoftTodoTaskGetOutputSchema.parse({
          ...microsoftTodoContext(b),
          listId: p.listId,
          taskId: p.taskId,
          task: normalizeMicrosoftTodoTask(task, p.listId),
        }),
      );
    }
    default:
      throw new DomainError(
        domainCodes.INTERNAL,
        `Microsoft To Do read handler missing for ${toolName}.`,
      );
  }
}
