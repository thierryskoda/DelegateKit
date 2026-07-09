import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  type ToolContract,
  writeToolDescription,
} from "@ai-assistants/tool-contracts";
import {
  profileScheduledTaskCreateInputSchema,
  profileScheduledTaskDeleteInputSchema,
  profileScheduledTaskGetInputSchema,
  profileScheduledTaskListInputSchema,
  profileScheduledTaskListOutputSchema,
  profileScheduledTaskOutputSchema,
  profileScheduledTaskPauseInputSchema,
  profileScheduledTaskPreviewInputSchema,
  profileScheduledTaskPreviewOutputSchema,
  profileScheduledTaskResumeInputSchema,
  profileScheduledTaskUpdateInputSchema,
} from "./schemas";

export const SCHEDULED_TASKS_PLUGIN_ID = "scheduled-tasks-tools";

export const scheduledTasksToolContracts = [
  defineReadTool({
    name: "scheduled_task_list",
    pluginId: SCHEDULED_TASKS_PLUGIN_ID,
    label: "List Scheduled Tasks",
    description: readToolDescription({
      useWhen: "the user asks about this profile's scheduled assistant tasks",
      operation: "Lists scheduled assistant tasks for this profile",
      returns: "scheduled task records with schedule, status, target, and revision",
    }),
    inputSchema: profileScheduledTaskListInputSchema,
    outputSchema: profileScheduledTaskListOutputSchema,
  }),
  defineReadTool({
    name: "scheduled_task_get",
    pluginId: SCHEDULED_TASKS_PLUGIN_ID,
    label: "Get Scheduled Task",
    description: readToolDescription({
      useWhen: "one scheduled assistant task needs inspection by id",
      operation: "Fetches one scheduled assistant task",
      returns: "scheduled task detail, schedule, status, and revision",
    }),
    inputSchema: profileScheduledTaskGetInputSchema,
    outputSchema: profileScheduledTaskOutputSchema,
  }),
  defineReadTool({
    name: "scheduled_task_preview",
    pluginId: SCHEDULED_TASKS_PLUGIN_ID,
    label: "Preview Scheduled Task",
    description: readToolDescription({
      useWhen: "the user wants to preview a scheduled task schedule before saving it",
      operation: "Previews next fire times for a schedule",
      returns: "candidate next fire times",
      notes: [
        "This does not save a scheduled task.",
        "Preview kind='at' for one-time reminders and kind='cron' or kind='every' for recurring work.",
      ],
    }),
    inputSchema: profileScheduledTaskPreviewInputSchema,
    outputSchema: profileScheduledTaskPreviewOutputSchema,
  }),
  defineWriteTool({
    name: "scheduled_task_create",
    pluginId: SCHEDULED_TASKS_PLUGIN_ID,
    label: "Create Scheduled Task",
    description: writeToolDescription({
      useWhen: "the user wants a durable scheduled assistant task",
      operation: "Creates a scheduled task with a schedule and assistant instructions",
      returns: "the created scheduled task",
      notes: [
        "Use schedule kind='at' for one-time reminders, one final reminder, or tasks that should run once and stop.",
        "Use kind='cron' or kind='every' only for recurring work that should continue until changed, paused, or deleted; cron has no until/end-date field.",
        "If reusable guidance already exists, reference that guidance by title/key in the instructions instead of copying the whole body.",
      ],
      sideEffect: "creates durable scheduled assistant work",
      safety: "the title, schedule, and instructions must be clear",
    }),
    inputSchema: profileScheduledTaskCreateInputSchema,
    outputSchema: profileScheduledTaskOutputSchema,
    trustedChannelRequired: false,
  }),
  defineWriteTool({
    name: "scheduled_task_update",
    pluginId: SCHEDULED_TASKS_PLUGIN_ID,
    label: "Update Scheduled Task",
    description: writeToolDescription({
      useWhen: "the user wants to change an existing scheduled assistant task",
      operation: "Updates title, instructions, or schedule; at least one must be provided",
      returns: "the updated scheduled task",
      notes: [
        "When converting a temporary recurring reminder into a final reminder, update the schedule to kind='at' instead of relying on prose like 'delete after this date'.",
        "Use recurring schedules only for work that should continue until another explicit update, pause, or delete.",
        "If existing profile guidance owns reusable behavior, keep scheduled task instructions short and reference that guidance by title/key.",
      ],
      sideEffect: "mutates durable scheduled assistant work",
      safety: "expectedRevision must come from get or list output",
    }),
    inputSchema: profileScheduledTaskUpdateInputSchema,
    outputSchema: profileScheduledTaskOutputSchema,
    trustedChannelRequired: false,
  }),
  defineWriteTool({
    name: "scheduled_task_delete",
    pluginId: SCHEDULED_TASKS_PLUGIN_ID,
    label: "Delete Scheduled Task",
    description: writeToolDescription({
      useWhen: "the user wants a scheduled assistant task to stop permanently",
      operation: "Soft-deletes a scheduled assistant task",
      returns: "the deleted scheduled task",
      sideEffect: "marks durable scheduled assistant work as deleted",
      safety: "expectedRevision must come from get or list output",
    }),
    inputSchema: profileScheduledTaskDeleteInputSchema,
    outputSchema: profileScheduledTaskOutputSchema,
    trustedChannelRequired: false,
  }),
  defineWriteTool({
    name: "scheduled_task_pause",
    pluginId: SCHEDULED_TASKS_PLUGIN_ID,
    label: "Pause Scheduled Task",
    description: writeToolDescription({
      useWhen: "the user wants a scheduled assistant task paused without deleting it",
      operation: "Pauses a scheduled assistant task",
      returns: "the paused scheduled task",
      sideEffect: "prevents runs while preserving the task",
      safety: "expectedRevision must come from get or list output",
    }),
    inputSchema: profileScheduledTaskPauseInputSchema,
    outputSchema: profileScheduledTaskOutputSchema,
    trustedChannelRequired: false,
  }),
  defineWriteTool({
    name: "scheduled_task_resume",
    pluginId: SCHEDULED_TASKS_PLUGIN_ID,
    label: "Resume Scheduled Task",
    description: writeToolDescription({
      useWhen: "the user wants a paused scheduled assistant task to run again",
      operation: "Resumes a paused scheduled task",
      returns: "the resumed scheduled task",
      sideEffect: "reactivates durable scheduled assistant work",
      safety: "expectedRevision must come from get or list output",
    }),
    inputSchema: profileScheduledTaskResumeInputSchema,
    outputSchema: profileScheduledTaskOutputSchema,
    trustedChannelRequired: false,
  }),
] as const satisfies readonly ToolContract[];

export type ScheduledTasksToolName = (typeof scheduledTasksToolContracts)[number]["name"];
