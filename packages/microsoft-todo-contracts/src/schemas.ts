import { profileActionWriteToolDataSchema } from "@ai-assistants/actions-contracts/schemas";
import { providerAccountsListOutputSchema, stringField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

export const microsoftTodoOptionalConnectedAccountIdSchema = z
  .string()
  .trim()
  .uuid()
  .describe(
    "Connected provider account id from microsoft_todo_accounts_list when multiple Microsoft To Do accounts match. Do not use profile_context_get capability instance ids for this field.",
  )
  .optional();

const capabilitySelectorFields = {
  connectedAccountId: microsoftTodoOptionalConnectedAccountIdSchema,
};

const maxResultsSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(50)
  .describe("Maximum provider records to return.");

const microsoftTodoListsNextPageTokenSchema = z
  .string()
  .trim()
  .min(1)
  .optional()
  .describe("Provider nextCursor from a prior microsoft_todo_lists_list result.");

const microsoftTodoTasksNextPageTokenSchema = z
  .string()
  .trim()
  .min(1)
  .optional()
  .describe("Provider nextCursor from a prior microsoft_todo_tasks_list result.");

const microsoftTodoDateTimeSchema = z
  .object({
    dateTime: z
      .string()
      .trim()
      .min(1)
      .describe("Provider date-time value, e.g. 2026-06-10T09:00:00."),
    timeZone: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .describe("Provider time zone value, e.g. Eastern Standard Time or America/Toronto."),
  })
  .strict()
  .describe("Microsoft Graph dateTimeTimeZone value.");

export const microsoftTodoImportanceSchema = z
  .enum(["low", "normal", "high"])
  .describe("Microsoft To Do task importance.");

export const microsoftTodoTaskStatusSchema = z
  .enum(["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"])
  .describe("Microsoft To Do task status.");

const microsoftTodoEditableTaskStatusSchema = microsoftTodoTaskStatusSchema
  .exclude(["completed"])
  .describe(
    "Task status for ordinary task updates; use microsoft_todo_task_complete to complete a task.",
  );

export const microsoftTodoAccountsListInputSchema = z.object({}).strict();

export const microsoftTodoListsListInputSchema = z
  .object({
    ...capabilitySelectorFields,
    nextPageToken: microsoftTodoListsNextPageTokenSchema,
    maxResults: maxResultsSchema,
  })
  .strict();

export const microsoftTodoTasksListInputSchema = z
  .object({
    ...capabilitySelectorFields,
    listId: stringField("Microsoft To Do task list id."),
    nextPageToken: microsoftTodoTasksNextPageTokenSchema,
    maxResults: maxResultsSchema,
  })
  .strict();

export const microsoftTodoTaskGetInputSchema = z
  .object({
    ...capabilitySelectorFields,
    listId: stringField("Microsoft To Do task list id."),
    taskId: stringField("Microsoft To Do task id."),
  })
  .strict();

export const microsoftTodoTaskCreateInputSchema = z
  .object({
    ...capabilitySelectorFields,
    listId: stringField("Microsoft To Do task list id."),
    title: stringField("Task title."),
    bodyText: z
      .string()
      .trim()
      .min(1)
      .max(10_000)
      .optional()
      .describe("Optional task body as plain text."),
    importance: microsoftTodoImportanceSchema.default("normal"),
    status: microsoftTodoEditableTaskStatusSchema.default("notStarted"),
    startDateTime: microsoftTodoDateTimeSchema.optional(),
    dueDateTime: microsoftTodoDateTimeSchema.optional(),
    reminderDateTime: microsoftTodoDateTimeSchema.optional(),
    isReminderOn: z
      .boolean()
      .optional()
      .describe("Whether Microsoft To Do should show a reminder for reminderDateTime."),
  })
  .strict();

export const microsoftTodoTaskUpdateInputSchema = z
  .object({
    ...capabilitySelectorFields,
    listId: stringField("Microsoft To Do task list id."),
    taskId: stringField("Microsoft To Do task id."),
    title: stringField("Task title.").optional(),
    bodyText: z
      .string()
      .trim()
      .min(1)
      .max(10_000)
      .optional()
      .describe("Replacement task body as plain text; omit to leave unchanged."),
    importance: microsoftTodoImportanceSchema.optional(),
    status: microsoftTodoEditableTaskStatusSchema.optional(),
    startDateTime: microsoftTodoDateTimeSchema.optional(),
    dueDateTime: microsoftTodoDateTimeSchema.optional(),
    reminderDateTime: microsoftTodoDateTimeSchema.optional(),
    isReminderOn: z.boolean().optional().describe("Whether the task reminder should be enabled."),
  })
  .strict()
  .superRefine((val, ctx) => {
    const hasPatchField =
      val.title !== undefined ||
      val.bodyText !== undefined ||
      val.importance !== undefined ||
      val.status !== undefined ||
      val.startDateTime !== undefined ||
      val.dueDateTime !== undefined ||
      val.reminderDateTime !== undefined ||
      val.isReminderOn !== undefined;
    if (!hasPatchField) {
      ctx.addIssue({
        code: "custom",
        path: ["title"],
        message:
          "Provide at least one of title, bodyText, importance, status, startDateTime, dueDateTime, reminderDateTime, or isReminderOn to update.",
      });
    }
  });

export const microsoftTodoTaskCompleteInputSchema = z
  .object({
    ...capabilitySelectorFields,
    listId: stringField("Microsoft To Do task list id."),
    taskId: stringField("Microsoft To Do task id."),
  })
  .strict();

export const microsoftTodoTaskDeleteInputSchema = z
  .object({
    ...capabilitySelectorFields,
    listId: stringField("Microsoft To Do task list id."),
    taskId: stringField("Microsoft To Do task id."),
  })
  .strict();

export type MicrosoftTodoTaskCreateInput = z.infer<typeof microsoftTodoTaskCreateInputSchema>;
export type MicrosoftTodoTaskUpdateInput = z.infer<typeof microsoftTodoTaskUpdateInputSchema>;
export type MicrosoftTodoTaskCompleteInput = z.infer<typeof microsoftTodoTaskCompleteInputSchema>;
export type MicrosoftTodoTaskDeleteInput = z.infer<typeof microsoftTodoTaskDeleteInputSchema>;

export const microsoftTodoAccountsListOutputSchema = providerAccountsListOutputSchema;

const microsoftTodoProviderContextSchema = {
  provider: z.literal("microsoft-todo").describe("Task provider backing this result."),
  accountEmail: z
    .string()
    .email()
    .nullable()
    .describe("Microsoft account email used for this result.")
    .meta({ examples: ["client@example.com"] }),
};

export const microsoftTodoTaskListSchema = z
  .object({
    id: z.string().trim().min(1).describe("Provider task list id."),
    displayName: z.string().trim().min(1).nullable().describe("Task list display name."),
    isOwner: z.boolean().nullable().describe("Whether the connected user owns this list."),
    isShared: z.boolean().nullable().describe("Whether the list is shared."),
    wellknownListName: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Microsoft well-known list name when supplied."),
  })
  .strict()
  .describe("Microsoft To Do task list.");

export const microsoftTodoTaskDateTimeSchema = microsoftTodoDateTimeSchema.nullable();

export const microsoftTodoTaskDetailSchema = z
  .object({
    id: z.string().trim().min(1).describe("Provider task id."),
    listId: z.string().trim().min(1).describe("Provider task list id containing the task."),
    title: z.string().trim().min(1).nullable().describe("Task title."),
    body: z.string().nullable().describe("Task body content when supplied by the provider."),
    bodyContentType: z.string().trim().min(1).nullable().describe("Provider body content type."),
    importance: microsoftTodoImportanceSchema.nullable().describe("Task importance."),
    status: microsoftTodoTaskStatusSchema.nullable().describe("Task status."),
    isReminderOn: z.boolean().nullable().describe("Whether reminders are enabled."),
    startDateTime: microsoftTodoTaskDateTimeSchema.describe("Task start date/time."),
    dueDateTime: microsoftTodoTaskDateTimeSchema.describe("Task due date/time."),
    reminderDateTime: microsoftTodoTaskDateTimeSchema.describe("Task reminder date/time."),
    completedDateTime: microsoftTodoTaskDateTimeSchema.describe("Task completed date/time."),
    createdDateTime: z.string().trim().min(1).nullable().describe("Provider-created timestamp."),
    lastModifiedDateTime: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Provider last modified timestamp."),
    categories: z.array(z.string().trim().min(1)).describe("Outlook category names."),
    hasAttachments: z.boolean().nullable().describe("Whether the task has provider attachments."),
  })
  .strict()
  .describe("Microsoft To Do task details normalized for assistant use.");

export type MicrosoftTodoTaskDetail = z.infer<typeof microsoftTodoTaskDetailSchema>;

export const microsoftTodoTaskListItemFields = {
  id: true,
  listId: true,
  title: true,
  importance: true,
  status: true,
  isReminderOn: true,
  startDateTime: true,
  dueDateTime: true,
  reminderDateTime: true,
  completedDateTime: true,
  lastModifiedDateTime: true,
  categories: true,
} as const satisfies Partial<Record<keyof MicrosoftTodoTaskDetail, true>>;

export const microsoftTodoTaskListItemSchema = microsoftTodoTaskDetailSchema
  .pick(microsoftTodoTaskListItemFields)
  .strict();

export const microsoftTodoListsListOutputSchema = z
  .object({
    ...microsoftTodoProviderContextSchema,
    lists: z.array(microsoftTodoTaskListSchema).describe("Task lists returned by Microsoft To Do."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const microsoftTodoTasksListOutputSchema = z
  .object({
    ...microsoftTodoProviderContextSchema,
    listId: z.string().trim().min(1).describe("Provider task list id searched."),
    tasks: z.array(microsoftTodoTaskListItemSchema).describe("Tasks returned by Microsoft To Do."),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pagination cursor for the next page, or null when there is no next page."),
  })
  .strict();

export const microsoftTodoTaskGetOutputSchema = z
  .object({
    ...microsoftTodoProviderContextSchema,
    listId: z.string().trim().min(1).describe("Provider task list id containing the task."),
    taskId: z.string().trim().min(1).describe("Provider task id requested."),
    task: microsoftTodoTaskDetailSchema.describe("Requested Microsoft To Do task."),
  })
  .strict();

export const microsoftTodoExternalWriteOutputSchema = profileActionWriteToolDataSchema;
