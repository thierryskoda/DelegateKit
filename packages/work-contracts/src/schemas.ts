import {
  assistantWorkItemKindSchema,
  assistantWorkItemRowSchema,
  jsonSchema,
  profileAssistantWorkRouteRowSchema,
} from "@ai-assistants/control-plane-contracts";
import {
  integerField,
  providerAssistantWorkEventTypeSchema,
  stringField,
} from "@ai-assistants/tool-contracts";
import { z } from "zod";

const uuidExample = "550e8400-e29b-41d4-a716-446655440000";
const isoTimestampExample = "2026-05-21T14:30:00.000Z";
export const profileWorkItemStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "ignored",
  "failed",
  "cancelled",
]);
export type ProfileWorkItemStatus = z.infer<typeof profileWorkItemStatusSchema>;
const guidanceIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/);
const profileGuidanceDbIdSchema = z.string().uuid();

export const profileWorkItemSchema = z
  .object({
    id: assistantWorkItemRowSchema.shape.id
      .describe(
        "Backend assistant work item id. Pass this value as workItemId to work item mutation tools.",
      )
      .meta({ examples: [uuidExample] }),
    kind: assistantWorkItemKindSchema.describe("Kind of assistant work to process."),
    status: profileWorkItemStatusSchema.describe("Current lifecycle status of the work item."),
    title: z.string().trim().min(1).describe("Short work item title."),
    detail: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Optional plain-language detail for the work item."),
    instructions: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Optional instructions for processing the work item."),
    guidanceIds: z
      .array(guidanceIdSchema)
      .describe("Source runtime guidance ids attached to this work item."),
    profileGuidanceDbIds: z
      .array(profileGuidanceDbIdSchema)
      .describe("DB-owned profile guidance ids attached to this work item."),
    event: z
      .record(z.string(), jsonSchema)
      .describe(
        "Curated event facts the assistant should process, such as provider ids, message metadata, and attachments.",
      ),
    dueAt: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Timestamp when the work item became due, or null when not scheduled.")
      .meta({ examples: [isoTimestampExample] }),
    relatedActionId: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Related profile action id when this work item tracks an action.")
      .meta({ examples: [uuidExample] }),
    relatedScheduledTaskId: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Related scheduled task id when this work item was created by a schedule.")
      .meta({ examples: [uuidExample] }),
    lastError: assistantWorkItemRowSchema.shape.last_error.describe(
      "Most recent processing error for this work item, if any.",
    ),
  })
  .strict()
  .describe("Assistant work item product record.");
export type ProfileWorkItem = z.infer<typeof profileWorkItemSchema>;

export const profileWorkItemListItemFields = {
  id: true,
  kind: true,
  status: true,
  title: true,
  dueAt: true,
  relatedActionId: true,
  relatedScheduledTaskId: true,
  lastError: true,
} as const satisfies Partial<Record<keyof ProfileWorkItem, true>>;

export const profileWorkItemListItemSchema = profileWorkItemSchema
  .pick(profileWorkItemListItemFields)
  .strict();
export type ProfileWorkItemListItem = z.infer<typeof profileWorkItemListItemSchema>;

export const profileWorkRouteConfigSchema = z
  .object({
    instructions: z.string().trim().min(1).max(10_000),
    priority: z.number().int().min(0).optional(),
  })
  .strict()
  .describe("Assistant trigger instructions and optional priority.");
export type ProfileWorkRouteConfig = z.infer<typeof profileWorkRouteConfigSchema>;

export const profileWorkRouteConnectedAccountSchema = z
  .object({
    id: z.string().uuid().describe("Connected provider account id for this scoped trigger."),
    provider: z.string().trim().min(1).describe("Provider key for the connected account."),
    accountEmail: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Email address on the connected account when the provider exposes one."),
    displayLabel: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Maintainer-facing display label for the connected account."),
  })
  .strict()
  .describe("Connected provider account this trigger is scoped to, or null for the default route.");
export type ProfileWorkRouteConnectedAccount = z.infer<
  typeof profileWorkRouteConnectedAccountSchema
>;

export const profileWorkRouteSchema = z
  .object({
    id: profileAssistantWorkRouteRowSchema.shape.id
      .describe("Backend work route id.")
      .meta({ examples: [uuidExample] }),
    eventType: providerAssistantWorkEventTypeSchema.describe(
      "Provider event type that triggers assistant work.",
    ),
    instructions: profileWorkRouteConfigSchema.shape.instructions.describe(
      "Instructions added to assistant work items created by this trigger.",
    ),
    priority: z
      .number()
      .int()
      .min(0)
      .nullable()
      .describe("Optional priority override for work items created by this trigger."),
    connectedProviderAccountId: z
      .string()
      .uuid()
      .nullable()
      .describe(
        "Connected provider account id this trigger is scoped to, or null when it is the profile-level default for the event type.",
      ),
    connectedAccount: profileWorkRouteConnectedAccountSchema
      .nullable()
      .describe("Connected account summary for scoped triggers, or null for default triggers."),
    createdAt: profileAssistantWorkRouteRowSchema.shape.created_at
      .describe("Timestamp when this trigger was created.")
      .meta({ examples: [isoTimestampExample] }),
    updatedAt: profileAssistantWorkRouteRowSchema.shape.updated_at
      .describe("Timestamp when this trigger was last updated.")
      .meta({ examples: [isoTimestampExample] }),
  })
  .strict()
  .describe("Profile trigger that routes provider events into assistant work.");
export type ProfileWorkRoute = z.infer<typeof profileWorkRouteSchema>;

export const profileWorkItemGetInputSchema = z
  .object({
    workItemId: stringField(
      "Assistant work item id returned by work_item_list or another structured work item result.",
    ),
  })
  .strict();
export type ProfileWorkItemGetInput = z.infer<typeof profileWorkItemGetInputSchema>;

export const profileWorkItemListInputSchema = z
  .object({
    statuses: z
      .array(profileWorkItemStatusSchema)
      .min(1)
      .max(6)
      .default(["pending", "running"])
      .describe("Assistant work item statuses to include."),
    limit: integerField("Maximum number of assistant work items to return.", 1, 50, 10),
  })
  .strict();
export type ProfileWorkItemListInput = z.infer<typeof profileWorkItemListInputSchema>;

export const profileWorkRouteCreateInputSchema = z
  .object({
    eventType: providerAssistantWorkEventTypeSchema.describe(
      "Provider event type that should create assistant work for this profile.",
    ),
    connectedProviderAccountId: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Optional connected provider account id. Pass this to create instructions for only one account; omit it to create the default route for this event type.",
      ),
    instructions: z
      .string()
      .trim()
      .min(1)
      .max(10_000)
      .describe(
        "Instructions to add to work items created by this trigger. When reusable workflow rules already exist in selected profile guidance, reference the guidance by title/key and keep route instructions focused on event-specific behavior.",
      ),
    priority: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Optional priority override for work items created by this trigger."),
  })
  .strict();
export type ProfileWorkRouteCreateInput = z.infer<typeof profileWorkRouteCreateInputSchema>;

export const profileWorkRouteUpdateInputSchema = z
  .object({
    workRouteId: stringField("Work route id returned by work_route_list or create."),
    instructions: z
      .string()
      .trim()
      .min(1)
      .max(10_000)
      .optional()
      .describe(
        "Replacement instructions for this trigger. Prefer referencing existing profile guidance by title/key instead of duplicating long reusable workflow rules.",
      ),
    priority: z
      .number()
      .int()
      .min(0)
      .nullable()
      .optional()
      .describe("Replacement priority override, or null to clear it."),
  })
  .strict()
  .refine((input) => input.instructions !== undefined || input.priority !== undefined, {
    message: "At least one of instructions or priority is required.",
  });
export type ProfileWorkRouteUpdateInput = z.infer<typeof profileWorkRouteUpdateInputSchema>;

export const profileWorkRouteDeleteInputSchema = z
  .object({ workRouteId: stringField("Work route id returned by work_route_list or create.") })
  .strict();
export type ProfileWorkRouteDeleteInput = z.infer<typeof profileWorkRouteDeleteInputSchema>;

export const profileWorkItemGetOutputSchema = z
  .object({
    workItem: profileWorkItemSchema.describe("Requested assistant work item."),
    guidanceMarkdown: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Resolved runtime guidance for the work item, or null when none applies."),
  })
  .strict();

export const profileWorkItemListOutputSchema = z
  .object({
    workItems: z.array(profileWorkItemListItemSchema).describe("Assistant work items listed."),
  })
  .strict();

export const profileWorkRouteOutputSchema = z
  .object({ workRoute: profileWorkRouteSchema.describe("Profile trigger result.") })
  .strict();

export const profileWorkRouteListOutputSchema = z
  .object({ workRoutes: z.array(profileWorkRouteSchema).describe("Profile triggers listed.") })
  .strict();
