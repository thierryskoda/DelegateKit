import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
} from "@ai-assistants/guidance-authoring";
import { scheduledTasksToolContracts } from "@ai-assistants/scheduled-tasks-contracts/contracts";

export default definePluginGuidance({
  name: "scheduled_tasks",
  plugin: plugin("scheduled-tasks"),
  description:
    "Load when the user asks to create, review, update, pause, resume, delete, or preview scheduled assistant tasks.",
  body: md`
# Scheduled Tasks

Use scheduled tasks for durable one-time or recurring assistant work.

- Scheduled tasks define future work; due executions appear as work items.
- Use preview before saving when the schedule interpretation is uncertain.
- Use current revision from list/get when updating.
- Use schedule kind "at" for a one-time reminder, one final reminder, or any task that should run once and stop. One-time scheduled tasks are deleted automatically after they fire.
- Use schedule kind "cron" or "every" only for recurring work that should continue until changed, paused, or deleted.
- Do not create a recurring cron task with prose like "stop after June 29" when the intended behavior is one final reminder. Use a one-time "at" schedule instead, or create separate one-time reminders for each desired date.
- Keep scheduled task instructions focused on what should happen when the schedule fires. If reusable workflow rules already exist in profile guidance, reference that guidance by title/key instead of copying the full workflow.
- Scheduled task instructions should name the outcome to produce and any schedule-specific scope; profile guidance should say how to do the reusable workflow well.

${coveredToolCatalog(scheduledTasksToolContracts, {
  scheduled_task_list: true,
  scheduled_task_get: true,
  scheduled_task_preview: true,
  scheduled_task_create: true,
  scheduled_task_update: true,
  scheduled_task_delete: true,
  scheduled_task_pause: true,
  scheduled_task_resume: true,
})}
`,
});
