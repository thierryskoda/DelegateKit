import {
  assistantScheduledTaskSchema,
  profileScheduledTaskCreateInputSchema,
  profileScheduledTaskDeleteInputSchema,
  profileScheduledTaskGetInputSchema,
  profileScheduledTaskListInputSchema,
  profileScheduledTaskPauseInputSchema,
  profileScheduledTaskPreviewInputSchema,
  profileScheduledTaskResumeInputSchema,
  profileScheduledTaskUpdateInputSchema,
} from "@ai-assistants/scheduled-tasks-contracts/schemas";
import { scheduledTasksToolContracts } from "@ai-assistants/scheduled-tasks-contracts/contracts";
import { DomainError } from "@ai-assistants/errors";
import type { BackendImmediateToolHandlers } from "../registry/backend-capability-module";
import { backendToolData, backendToolDomainError } from "../../shared/tool-result";
import type { AssistantScheduledTask } from "../../product/assistant-scheduled-tasks/assistant-scheduled-tasks";
import {
  createAssistantScheduledTask,
  deleteAssistantScheduledTask,
  listAssistantScheduledTasks,
  pauseAssistantScheduledTask,
  previewScheduledTaskRuns,
  requireAssistantScheduledTask,
  resumeAssistantScheduledTask,
  updateAssistantScheduledTask,
} from "../../product/assistant-scheduled-tasks/assistant-scheduled-tasks";

function scheduledTaskDto(scheduledTask: AssistantScheduledTask) {
  return assistantScheduledTaskSchema.parse({
    id: scheduledTask.id,
    status: scheduledTask.status,
    title: scheduledTask.title,
    instructions: scheduledTask.instructions,
    target: scheduledTask.target,
    schedule: scheduledTask.schedule,
    timezone: scheduledTask.timezone,
    nextRunAt: scheduledTask.next_run_at,
    lastRunAt: scheduledTask.last_run_at,
    revision: scheduledTask.revision,
    createdAt: scheduledTask.created_at,
    updatedAt: scheduledTask.updated_at,
  });
}

export const scheduledTaskHandlers = {
  async scheduled_task_create(ctx) {
    const parsed = profileScheduledTaskCreateInputSchema.parse(ctx.params);
    try {
      const scheduledTask = await createAssistantScheduledTask(ctx.db, {
        profileId: ctx.profile.id,
        title: parsed.title,
        instructions: parsed.instructions,
        schedule: parsed.schedule,
        origin: {
          agentId: ctx.assistant.assistant_id,
          sessionKey: ctx.input.invocation.sessionKey,
          toolCallId: ctx.input.toolCallId,
          ...(ctx.input.invocation.sessionId === undefined ? {} : { sessionId: ctx.input.invocation.sessionId }),
        },
      });
      return backendToolData(scheduledTasksToolContracts, "scheduled_task_create", { scheduledTask: scheduledTaskDto(scheduledTask) });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
  async scheduled_task_list(ctx) {
    const parsed = profileScheduledTaskListInputSchema.parse(ctx.params);
    const scheduledTasks = await listAssistantScheduledTasks(ctx.db, { profileId: ctx.profile.id, status: parsed.status, limit: parsed.limit });
    return backendToolData(scheduledTasksToolContracts, "scheduled_task_list", { scheduledTasks: scheduledTasks.map(scheduledTaskDto) });
  },
  async scheduled_task_get(ctx) {
    const parsed = profileScheduledTaskGetInputSchema.parse(ctx.params);
    try {
      const scheduledTask = await requireAssistantScheduledTask(ctx.db, { profileId: ctx.profile.id, scheduledTaskId: parsed.scheduledTaskId });
      return backendToolData(scheduledTasksToolContracts, "scheduled_task_get", { scheduledTask: scheduledTaskDto(scheduledTask) });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
  async scheduled_task_update(ctx) {
    const parsed = profileScheduledTaskUpdateInputSchema.parse(ctx.params);
    try {
      const scheduledTask = await updateAssistantScheduledTask(ctx.db, {
        profileId: ctx.profile.id,
        scheduledTaskId: parsed.scheduledTaskId,
        expectedRevision: parsed.expectedRevision,
        ...(parsed.title === undefined ? {} : { title: parsed.title }),
        ...(parsed.instructions === undefined ? {} : { instructions: parsed.instructions }),
        ...(parsed.schedule === undefined ? {} : { schedule: parsed.schedule }),
      });
      return backendToolData(scheduledTasksToolContracts, "scheduled_task_update", { scheduledTask: scheduledTaskDto(scheduledTask) });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
  async scheduled_task_delete(ctx) {
    const parsed = profileScheduledTaskDeleteInputSchema.parse(ctx.params);
    try {
      const scheduledTask = await deleteAssistantScheduledTask(ctx.db, {
        profileId: ctx.profile.id,
        scheduledTaskId: parsed.scheduledTaskId,
        expectedRevision: parsed.expectedRevision,
      });
      return backendToolData(scheduledTasksToolContracts, "scheduled_task_delete", { scheduledTask: scheduledTaskDto(scheduledTask) });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
  async scheduled_task_pause(ctx) {
    const parsed = profileScheduledTaskPauseInputSchema.parse(ctx.params);
    try {
      const scheduledTask = await pauseAssistantScheduledTask(ctx.db, {
        profileId: ctx.profile.id,
        scheduledTaskId: parsed.scheduledTaskId,
        expectedRevision: parsed.expectedRevision,
      });
      return backendToolData(scheduledTasksToolContracts, "scheduled_task_pause", { scheduledTask: scheduledTaskDto(scheduledTask) });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
  async scheduled_task_resume(ctx) {
    const parsed = profileScheduledTaskResumeInputSchema.parse(ctx.params);
    try {
      const scheduledTask = await resumeAssistantScheduledTask(ctx.db, {
        profileId: ctx.profile.id,
        scheduledTaskId: parsed.scheduledTaskId,
        expectedRevision: parsed.expectedRevision,
      });
      return backendToolData(scheduledTasksToolContracts, "scheduled_task_resume", { scheduledTask: scheduledTaskDto(scheduledTask) });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
  scheduled_task_preview(ctx) {
    const parsed = profileScheduledTaskPreviewInputSchema.parse(ctx.params);
    try {
      return backendToolData(scheduledTasksToolContracts, "scheduled_task_preview", { nextRunAt: previewScheduledTaskRuns(parsed.schedule, parsed.count) });
    } catch (error) {
      if (error instanceof DomainError) return backendToolDomainError(error);
      throw error;
    }
  },
} satisfies BackendImmediateToolHandlers<typeof scheduledTasksToolContracts>;
