import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSupabaseServiceClient,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  microsoftTodoToolContracts,
  type MicrosoftTodoToolName,
} from "@ai-assistants/microsoft-todo-contracts/contracts";
import { E2E_TEST_CHANNEL_DEFAULT_PEER_ID } from "../helpers/run/e2e-run";
import { approveAndExecuteProfileAction } from "../helpers/capability/approve-profile-action";
import { createCapabilityToolCoverage } from "../helpers/capability/capability-tool-coverage";
import { seedTestingTrustedE2eChannel } from "../helpers/fixtures/testing-trusted-channel-fixture";
import { TESTING_MICROSOFT_TODO_CAPABILITY } from "../helpers/readiness/testing-capability-readiness";
import { requireSingleTestingNangoConnection } from "../helpers/readiness/testing-provider-readiness";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import {
  buildCapabilityToolRequest,
  executeCapabilityTool,
  parseCapabilityToolOutput,
  withTrustedChannel,
} from "../helpers/run/execute-capability-backend-tool";
import { requireTestingE2eAgent } from "../helpers/run/testing-launch-support";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { asRecord } from "../helpers/utils/as-record";
import { requireTestingProvidersLive } from "../helpers/provider-runtime/testing-provider-runtime";

const CAPABILITY_ID = "microsoft-todo";
const TASK_TIME_ZONE = "Eastern Standard Time";
const TASK_DAYS_FROM_NOW = 5;

const microsoftTodoCoverage = createCapabilityToolCoverage(
  CAPABILITY_ID,
  microsoftTodoToolContracts,
);

function dateOnlyInToronto(daysFromNow: number): string {
  const anchor = new Date(Date.now() + daysFromNow * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(anchor);
  const pick = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error(`Missing ${type} while formatting Microsoft To Do E2E date.`);
    return value;
  };
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function providerResultFromExecutedAction(
  action: TableRow<"profile_actions">,
  label: string,
  expectedProvider: string,
): Record<string, unknown> {
  const payload = asRecord(action.result_payload, `${label} result_payload`);
  assert.equal(payload.provider, expectedProvider);
  return asRecord(payload.result, `${label} provider result`);
}

function providerTaskFromExecutedAction(
  action: TableRow<"profile_actions">,
  label: string,
  expectedProvider: string,
): Record<string, unknown> {
  const result = providerResultFromExecutedAction(action, label, expectedProvider);
  return asRecord(result.task, `${label} provider task`);
}

function requireProviderTaskId(task: Record<string, unknown>, label: string): string {
  const id = task.id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(
      `${label} provider task.id must be a non-empty string; got ${JSON.stringify(task)}`,
    );
  }
  return id;
}

async function typedMicrosoftTodoTool<const T extends MicrosoftTodoToolName>(
  db: SupabaseServiceClient,
  toolName: T,
  params: Record<string, unknown>,
  options?: { trusted?: boolean },
) {
  microsoftTodoCoverage.exercise(toolName);
  let request = buildCapabilityToolRequest({
    capabilityId: CAPABILITY_ID,
    toolName,
    params,
  });
  if (options?.trusted !== false) {
    request = withTrustedChannel(request, CAPABILITY_ID);
  }
  const result = await executeCapabilityTool(db, request);
  return parseCapabilityToolOutput(result, microsoftTodoToolContracts, toolName);
}

async function approveTodoWrite(input: {
  db: SupabaseServiceClient;
  write: { actionId: string };
  decisionUserId: string;
}): Promise<TableRow<"profile_actions">> {
  const actionResult = await input.db
    .from("profile_actions")
    .select()
    .eq("id", input.write.actionId)
    .single();
  const action = requireSupabaseData(
    `Load Microsoft To Do write action ${input.write.actionId}`,
    actionResult.data,
    actionResult.error,
  );
  return approveAndExecuteProfileAction({
    db: input.db,
    action,
    decisionUserId: input.decisionUserId,
  });
}

function isIgnorableTodoCleanupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found|404|already deleted|resource has been deleted/i.test(message);
}

async function deleteMicrosoftTodoTaskIfNeeded(input: {
  db: SupabaseServiceClient;
  connectedAccountId: string;
  listId: string | null;
  taskId: string | null;
  decisionUserId: string;
  deleted: boolean;
}): Promise<boolean> {
  if (input.deleted || !input.listId || !input.taskId) return input.deleted;
  try {
    const deleteWrite = await typedMicrosoftTodoTool(
      input.db,
      "microsoft_todo_task_delete",
      {
        connectedAccountId: input.connectedAccountId,
        listId: input.listId,
        taskId: input.taskId,
      },
      { trusted: true },
    );
    await approveTodoWrite({
      db: input.db,
      write: deleteWrite.write,
      decisionUserId: input.decisionUserId,
    });
    return true;
  } catch (error) {
    if (isIgnorableTodoCleanupError(error)) return true;
    throw error;
  }
}

test("Testing client: Microsoft To Do capability lifecycle works end-to-end.", async (t) => {
  const expectedProvider = "microsoft-todo";
  requireTestingE2eAgent();
  const run = await createE2eRun(t, { id: CAPABILITY_ID });
  await attachE2eSupabase(run);
  const db = createSupabaseServiceClient();
  await requireTestingProvidersLive(db, [CAPABILITY_ID]);
  const marker = createMarker("testing-microsoft-todo");
  const fixture = await requireSingleTestingNangoConnection(db, TESTING_MICROSOFT_TODO_CAPABILITY);
  assert.equal(fixture.capabilityAccountLink.profile_id, "testing");
  const profileResult = await db.from("profiles").select("user_id").eq("id", "testing").single();
  const testingProfile = requireSupabaseData(
    "Load testing profile user for Microsoft To Do approval decisions",
    profileResult.data,
    profileResult.error,
  );
  assert.ok(
    testingProfile.user_id,
    "testing profile must have a portal user_id for approval decisions",
  );
  const decisionUserId = testingProfile.user_id;
  const connectedAccountId = fixture.connectedAccount.id;
  const { cleanup: trustedChannelCleanup } = await seedTestingTrustedE2eChannel({
    db,
    profileId: "testing",
    peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
    marker,
    purpose: "microsoft-todo-e2e",
  });

  const initialTitle = `${marker} Laurier Capital client follow-up`;
  const updatedTitle = `${marker} Laurier Capital closing checklist review`;
  const dueDate = `${dateOnlyInToronto(TASK_DAYS_FROM_NOW)}T17:00:00`;
  const reminderDate = `${dateOnlyInToronto(TASK_DAYS_FROM_NOW)}T09:00:00`;
  let listId: string | null = null;
  let taskId: string | null = null;
  let taskDeleted = false;

  try {
    const accounts = await typedMicrosoftTodoTool(db, "microsoft_todo_accounts_list", {});
    assert.ok(
      accounts.accounts.some((account) => account.connectedAccountId === connectedAccountId),
      `microsoft_todo_accounts_list must include connected Microsoft To Do account ${connectedAccountId}`,
    );

    const lists = await typedMicrosoftTodoTool(db, "microsoft_todo_lists_list", {
      connectedAccountId,
    });
    assert.equal(lists.provider, expectedProvider);
    assert.ok(lists.lists.length > 0, "microsoft_todo_lists_list must return at least one list");
    const targetList =
      lists.lists.find((list) => list.wellknownListName === "defaultList") ??
      lists.lists.find(
        (list) => list.isOwner !== false && list.wellknownListName !== "flaggedEmails",
      ) ??
      lists.lists[0]!;
    listId = targetList.id;

    const createWrite = await typedMicrosoftTodoTool(
      db,
      "microsoft_todo_task_create",
      {
        connectedAccountId,
        listId,
        title: initialTitle,
        bodyText: "Confirm the Laurier Capital closing checklist before the client follow-up.",
        importance: "normal",
        status: "notStarted",
        dueDateTime: { dateTime: dueDate, timeZone: TASK_TIME_ZONE },
        reminderDateTime: { dateTime: reminderDate, timeZone: TASK_TIME_ZONE },
      },
      { trusted: true },
    );
    const createExecuted = await approveTodoWrite({
      db,
      write: createWrite.write,
      decisionUserId,
    });
    taskId = requireProviderTaskId(
      providerTaskFromExecutedAction(
        createExecuted,
        "microsoft_todo_task_create",
        expectedProvider,
      ),
      "microsoft_todo_task_create",
    );

    const createdTask = await typedMicrosoftTodoTool(db, "microsoft_todo_task_get", {
      connectedAccountId,
      listId,
      taskId,
    });
    assert.equal(createdTask.taskId, taskId);
    assert.equal(createdTask.task.title, initialTitle);

    const updateWrite = await typedMicrosoftTodoTool(
      db,
      "microsoft_todo_task_update",
      {
        connectedAccountId,
        listId,
        taskId,
        title: updatedTitle,
        bodyText: "Review the closing checklist and identify any client follow-up gaps.",
        importance: "high",
        status: "inProgress",
      },
      { trusted: true },
    );
    await approveTodoWrite({
      db,
      write: updateWrite.write,
      decisionUserId,
    });

    const updatedTask = await typedMicrosoftTodoTool(db, "microsoft_todo_task_get", {
      connectedAccountId,
      listId,
      taskId,
    });
    assert.equal(updatedTask.task.title, updatedTitle);
    assert.equal(updatedTask.task.importance, "high");
    assert.equal(updatedTask.task.status, "inProgress");

    const tasks = await typedMicrosoftTodoTool(db, "microsoft_todo_tasks_list", {
      connectedAccountId,
      listId,
    });
    assert.equal(tasks.provider, expectedProvider);
    assert.ok(
      tasks.tasks.some((task) => task.id === taskId),
      `microsoft_todo_tasks_list must include created task ${taskId}`,
    );

    const completeWrite = await typedMicrosoftTodoTool(
      db,
      "microsoft_todo_task_complete",
      { connectedAccountId, listId, taskId },
      { trusted: true },
    );
    await approveTodoWrite({
      db,
      write: completeWrite.write,
      decisionUserId,
    });

    const completedTask = await typedMicrosoftTodoTool(db, "microsoft_todo_task_get", {
      connectedAccountId,
      listId,
      taskId,
    });
    assert.equal(completedTask.task.status, "completed");

    const deleteWrite = await typedMicrosoftTodoTool(
      db,
      "microsoft_todo_task_delete",
      { connectedAccountId, listId, taskId },
      { trusted: true },
    );
    await approveTodoWrite({
      db,
      write: deleteWrite.write,
      decisionUserId,
    });
    taskDeleted = true;
    microsoftTodoCoverage.assertComplete();

    console.log(
      JSON.stringify(
        {
          ok: true,
          marker,
          provider: expectedProvider,
          connectedAccountId,
          listId,
          taskId,
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      taskDeleted = await deleteMicrosoftTodoTaskIfNeeded({
        db,
        connectedAccountId,
        listId,
        taskId,
        decisionUserId,
        deleted: taskDeleted,
      });
    } finally {
      await trustedChannelCleanup();
    }
  }
});
