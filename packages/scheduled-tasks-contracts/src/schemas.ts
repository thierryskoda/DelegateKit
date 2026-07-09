import {
  assistantScheduledTaskRowSchema,
  assistantScheduledTaskStatusSchema,
} from "@ai-assistants/control-plane-contracts";
import { integerField, stringField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

const uuidExample = "550e8400-e29b-41d4-a716-446655440000";
const isoTimestampExample = "2026-05-21T14:30:00.000Z";

export const assistantScheduledTaskTargetSchema = z
  .object({
    kind: z
      .literal("assistant_instructions")
      .describe("Scheduled task target kind. Scheduled tasks run the saved assistant instructions."),
  })
  .strict()
  .describe("What should happen when this scheduled task fires.");
export type AssistantScheduledTaskTarget = z.infer<typeof assistantScheduledTaskTargetSchema>;

export const assistantScheduleSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        kind: z
          .literal("at")
          .describe(
            "One-time schedule kind. Use this for one-off reminders, one final reminder, or any task that should run once and then stop.",
          ),
        at: z
          .string()
          .datetime({ offset: true })
          .describe(
            "Exact date-time when the task should run. One-time scheduled tasks are deleted automatically after they fire.",
          )
          .meta({ examples: [isoTimestampExample] }),
      })
      .strict()
      .describe("One-time assistant schedule."),
    z
      .object({
        kind: z.literal("every").describe("Fixed-interval recurring schedule kind."),
        everySeconds: z
          .number()
          .int()
          .min(60)
          .max(31_536_000)
          .describe("Interval between task runs, in seconds."),
        anchorAt: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe("Optional timestamp that anchors the repeating schedule.")
          .meta({ examples: [isoTimestampExample] }),
      })
      .strict()
      .describe("Fixed-interval recurring assistant schedule."),
    z
      .object({
        kind: z
          .literal("cron")
          .describe(
            "Cron recurring schedule kind. Use only for work that should continue until the scheduled task is changed, paused, or deleted; there is no cron 'until' field.",
          ),
        expr: z.string().trim().min(1).max(200).describe("Cron expression for recurring runs."),
        timezone: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .describe("IANA timezone for evaluating the cron schedule.")
          .meta({ examples: ["America/Toronto"] }),
      })
      .strict()
      .describe("Cron-based recurring assistant schedule."),
  ])
  .describe(
    "Assistant schedule definition. Choose at for one-time/final reminders; choose every or cron only for recurring work.",
  );
export type AssistantSchedule = z.infer<typeof assistantScheduleSchema>;

export const assistantScheduledTaskSchema = z
  .object({
    id: assistantScheduledTaskRowSchema.shape.id
      .describe("Backend scheduled task id.")
      .meta({ examples: [uuidExample] }),
    status: assistantScheduledTaskStatusSchema.describe("Current status of the scheduled task."),
    title: assistantScheduledTaskRowSchema.shape.title.describe("Short scheduled task title."),
    instructions: assistantScheduledTaskRowSchema.shape.instructions.describe(
      "Instructions the assistant should follow each time this task runs.",
    ),
    target: assistantScheduledTaskTargetSchema,
    schedule: assistantScheduleSchema,
    timezone: assistantScheduledTaskRowSchema.shape.timezone
      .describe("IANA timezone used for this scheduled task.")
      .meta({ examples: ["America/Toronto"] }),
    nextRunAt: assistantScheduledTaskRowSchema.shape.next_run_at
      .describe("Next run timestamp, or null if no run is currently scheduled.")
      .meta({ examples: [isoTimestampExample] }),
    lastRunAt: assistantScheduledTaskRowSchema.shape.last_run_at
      .describe("Most recent run timestamp, or null if the task has not run.")
      .meta({ examples: [isoTimestampExample] }),
    revision: assistantScheduledTaskRowSchema.shape.revision.describe(
      "Optimistic-concurrency revision for updates.",
    ),
    createdAt: assistantScheduledTaskRowSchema.shape.created_at
      .describe("Timestamp when the scheduled task was created.")
      .meta({ examples: [isoTimestampExample] }),
    updatedAt: assistantScheduledTaskRowSchema.shape.updated_at
      .describe("Timestamp when the scheduled task was last updated.")
      .meta({ examples: [isoTimestampExample] }),
  })
  .strict()
  .describe("Scheduled assistant task for this profile.");
export type AssistantScheduledTask = z.infer<typeof assistantScheduledTaskSchema>;

export const profileScheduledTaskCreateInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200).describe("Short label for the scheduled task."),
    instructions: z
      .string()
      .trim()
      .min(1)
      .max(10_000)
      .describe("What the assistant should do each time this task runs."),
    schedule: assistantScheduleSchema.describe(
      "Schedule definition. Use kind='at' for one-time tasks; use kind='every' or kind='cron' only for recurring tasks.",
    ),
  })
  .strict();
export type ProfileScheduledTaskCreateInput = z.infer<typeof profileScheduledTaskCreateInputSchema>;

export const profileScheduledTaskListInputSchema = z
  .object({
    status: z
      .enum(["active", "paused", "deleted", "all"])
      .default("all")
      .describe("Which scheduled tasks to list. Deleted tasks are hidden unless requested."),
    limit: integerField("Maximum number of scheduled tasks to return.", 1, 100, 25),
  })
  .strict();
export type ProfileScheduledTaskListInput = z.infer<typeof profileScheduledTaskListInputSchema>;

export const profileScheduledTaskGetInputSchema = z
  .object({ scheduledTaskId: stringField("Scheduled task id.") })
  .strict();
export type ProfileScheduledTaskGetInput = z.infer<typeof profileScheduledTaskGetInputSchema>;

const scheduledTaskRevisionMutationFields = {
  scheduledTaskId: stringField("Scheduled task id."),
  expectedRevision: integerField("Current scheduled task revision.", 1, 1_000_000, 1),
} as const;

export const profileScheduledTaskUpdateInputSchema = z
  .object({
    ...scheduledTaskRevisionMutationFields,
    title: z.string().trim().min(1).max(200).optional().describe("New scheduled task title."),
    instructions: z
      .string()
      .trim()
      .min(1)
      .max(10_000)
      .optional()
      .describe("New scheduled task instructions."),
    schedule: assistantScheduleSchema.optional(),
  })
  .strict()
  .refine((input) => input.title || input.instructions || input.schedule, {
    message: "At least one of title, instructions, or schedule is required.",
  });
export type ProfileScheduledTaskUpdateInput = z.infer<typeof profileScheduledTaskUpdateInputSchema>;

export const profileScheduledTaskDeleteInputSchema = z
  .object(scheduledTaskRevisionMutationFields)
  .strict();
export type ProfileScheduledTaskDeleteInput = z.infer<typeof profileScheduledTaskDeleteInputSchema>;

export const profileScheduledTaskPauseInputSchema = z
  .object(scheduledTaskRevisionMutationFields)
  .strict();
export type ProfileScheduledTaskPauseInput = z.infer<typeof profileScheduledTaskPauseInputSchema>;

export const profileScheduledTaskResumeInputSchema = z
  .object(scheduledTaskRevisionMutationFields)
  .strict();
export type ProfileScheduledTaskResumeInput = z.infer<typeof profileScheduledTaskResumeInputSchema>;

export const profileScheduledTaskPreviewInputSchema = z
  .object({
    schedule: assistantScheduleSchema.describe("Schedule to preview without saving."),
    count: integerField("Number of future fire times to return.", 1, 20, 5),
  })
  .strict();
export type ProfileScheduledTaskPreviewInput = z.infer<
  typeof profileScheduledTaskPreviewInputSchema
>;

export const profileScheduledTaskOutputSchema = z
  .object({ scheduledTask: assistantScheduledTaskSchema.describe("Scheduled task result.") })
  .strict();

export const profileScheduledTaskListOutputSchema = z
  .object({
    scheduledTasks: z
      .array(assistantScheduledTaskSchema)
      .describe("Scheduled assistant tasks for this profile."),
  })
  .strict();

export const profileScheduledTaskPreviewOutputSchema = z
  .object({
    nextRunAt: z
      .array(
        z
          .string()
          .datetime({ offset: true })
          .describe("Previewed future run timestamp.")
          .meta({ examples: [isoTimestampExample] }),
      )
      .describe("Previewed future run timestamps for the proposed schedule."),
  })
  .strict();
