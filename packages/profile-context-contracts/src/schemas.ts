import {
  capabilityReadinessBlockerCodeSchema,
  capabilityReadinessStatusSchema,
} from "@ai-assistants/capability-catalog";
import {
  assistantScheduledTaskRowSchema,
  assistantScheduledTaskStatusSchema,
  assistantWorkItemKindSchema,
  assistantWorkItemRowSchema,
} from "@ai-assistants/control-plane-contracts";
import { agentActionDtoSchema } from "@ai-assistants/actions-contracts/schemas";
import { profileProposalSummarySchema } from "@ai-assistants/proposals-contracts/schemas";
import { integerField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

const uuidExample = "550e8400-e29b-41d4-a716-446655440000";
export const operationalWorkItemStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "ignored",
  "failed",
  "cancelled",
]);
export type OperationalWorkItemStatus = z.infer<typeof operationalWorkItemStatusSchema>;

export const profileCapabilitiesListItemSchema = z
  .object({
    instanceId: z
      .string()
      .trim()
      .min(1)
      .describe(
        "Backend profile capability id or capability account link id for readiness/portal context. This is not a provider connectedAccountId for provider tool calls.",
      )
      .meta({ examples: [uuidExample] }),
    capabilitySlug: z.string().trim().min(1).describe("Capability slug assigned to the profile."),
    provider: z.string().trim().min(1).describe("Provider slug backing this capability."),
    label: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Optional display label for this capability instance."),
    accountHint: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .describe("Optional account hint such as an email address."),
    readinessStatus: z
      .union([capabilityReadinessStatusSchema, z.literal("unknown")])
      .describe("Readiness state for using this capability."),
    blockerCode: capabilityReadinessBlockerCodeSchema
      .nullable()
      .describe("Machine-readable blocker code when the capability is not ready."),
    blockerSummary: z
      .string()
      .nullable()
      .describe("Plain-language blocker summary when setup or auth is incomplete."),
    lastError: z
      .string()
      .nullable()
      .describe("Most recent capability error recorded by the backend."),
  })
  .strict()
  .describe("Capability readiness summary for this profile.");
export type ProfileCapabilitiesListItem = z.infer<typeof profileCapabilitiesListItemSchema>;

export const operationalWorkItemSummarySchema = z
  .object({
    id: assistantWorkItemRowSchema.shape.id.describe("Backend assistant work item id."),
    kind: assistantWorkItemKindSchema.describe("Assistant work item kind."),
    status: operationalWorkItemStatusSchema.describe("Current assistant work item status."),
    title: z.string().trim().min(1).describe("Short work item title."),
    dueAt: z.string().trim().min(1).nullable().describe("When the work item is due or available."),
    runningByAgentId: assistantWorkItemRowSchema.shape.claimed_by_agent_id.describe(
      "Assistant id currently running the work item, or null when not running.",
    ),
    runExpiresAt: assistantWorkItemRowSchema.shape.claim_expires_at.describe(
      "Backend run lease timestamp, or null when not running.",
    ),
    lastError: assistantWorkItemRowSchema.shape.last_error.describe(
      "Most recent work item failure summary, or null.",
    ),
  })
  .strict()
  .describe("Compact assistant work item summary for coordination.");
export type OperationalWorkItemSummary = z.infer<typeof operationalWorkItemSummarySchema>;

export const operationalBrowserTaskSummarySchema = z
  .object({
    id: z.string().uuid().describe("Backend browser task id."),
    status: z.string().trim().min(1).describe("Current browser task status."),
    goal: z.string().trim().min(1).describe("Browser task goal."),
    summary: z.string().trim().min(1).nullable().describe("Latest browser task summary, or null."),
    updatedAt: z.string().trim().min(1).describe("Timestamp when the browser task last changed."),
  })
  .strict()
  .describe("Compact active browser task summary for coordination.");
export type OperationalBrowserTaskSummary = z.infer<typeof operationalBrowserTaskSummarySchema>;

export const operationalBlockedItemSchema = z
  .object({
    sourceType: z
      .enum(["proposal", "action", "browser_task", "work_item", "capability"])
      .describe("Type of blocked operational item."),
    sourceId: z.string().trim().min(1).describe("Backend id for the blocked item."),
    title: z.string().trim().min(1).describe("Short blocked item title."),
    status: z.string().trim().min(1).describe("Current blocked item status."),
    reason: z.string().trim().min(1).nullable().describe("Plain-language blocker reason."),
    updatedAt: z.string().trim().min(1).describe("Timestamp when the blocked item last changed."),
  })
  .strict()
  .describe("Blocked operational item summary.");
export type OperationalBlockedItem = z.infer<typeof operationalBlockedItemSchema>;

export const operationalTerminalEventSchema = z
  .object({
    sourceType: z
      .enum(["proposal", "action", "browser_task", "work_item"])
      .describe("Type of recently terminal item."),
    sourceId: z.string().trim().min(1).describe("Backend id for the terminal item."),
    title: z.string().trim().min(1).describe("Short terminal item title."),
    status: z.string().trim().min(1).describe("Terminal item status."),
    updatedAt: z.string().trim().min(1).describe("Timestamp when the item reached this status."),
  })
  .strict()
  .describe("Recently terminal operational event summary.");
export type OperationalTerminalEvent = z.infer<typeof operationalTerminalEventSchema>;

export const operationalScheduledTaskSummarySchema = z
  .object({
    id: assistantScheduledTaskRowSchema.shape.id.describe("Backend scheduled task id."),
    status: assistantScheduledTaskStatusSchema.describe("Current scheduled task status."),
    title: assistantScheduledTaskRowSchema.shape.title.describe("Scheduled task title."),
    nextRunAt: assistantScheduledTaskRowSchema.shape.next_run_at.describe(
      "Next scheduled run timestamp, or null.",
    ),
    lastRunAt: assistantScheduledTaskRowSchema.shape.last_run_at.describe(
      "Most recent run timestamp, or null.",
    ),
    revision: assistantScheduledTaskRowSchema.shape.revision.describe(
      "Optimistic-concurrency revision.",
    ),
  })
  .strict()
  .describe("Relevant scheduled task summary.");
export type OperationalScheduledTaskSummary = z.infer<typeof operationalScheduledTaskSummarySchema>;

export const profileOperationalContextSchema = z
  .object({
    pendingActions: z.array(agentActionDtoSchema).describe("Profile actions waiting for approval."),
    activeProposals: z
      .array(profileProposalSummarySchema)
      .describe("Deferred-review proposals waiting for review or currently blocked."),
    activeBrowserTasks: z
      .array(operationalBrowserTaskSummarySchema)
      .describe("Running, waiting, or blocked browser tasks."),
    dueWorkItems: z
      .array(operationalWorkItemSummarySchema)
      .describe("Pending work items ready for backend execution."),
    runningWorkItems: z
      .array(operationalWorkItemSummarySchema)
      .describe("Work items currently being executed by backend jobs."),
    blockedItems: z
      .array(operationalBlockedItemSchema)
      .describe("Operational items blocked by auth, stale data, ambiguity, or provider failures."),
    recentTerminalEvents: z
      .array(operationalTerminalEventSchema)
      .describe("Recently completed, rejected, expired, superseded, or failed work."),
    scheduledTasks: z
      .array(operationalScheduledTaskSummarySchema)
      .describe("Next relevant scheduled assistant tasks."),
  })
  .strict()
  .describe("Compact operational coordination state for avoiding duplicate work.");
export type ProfileOperationalContext = z.infer<typeof profileOperationalContextSchema>;

export const profileOverviewSchema = z
  .object({
    profile: z
      .object({
        id: z
          .string()
          .describe("Backend profile id.")
          .meta({ examples: [uuidExample] }),
        displayName: z.string().describe("Human-readable profile display name."),
        timezone: z
          .string()
          .describe("Profile IANA timezone.")
          .meta({ examples: ["America/Toronto"] }),
        status: z.string().describe("Profile status in the control plane."),
      })
      .strict()
      .describe("Profile identity and status."),
    assistant: z
      .object({
        id: z
          .string()
          .describe("Backend assistant id.")
          .meta({ examples: [uuidExample] }),
        name: z.string().nullable().describe("Assistant display name, when configured."),
      })
      .strict()
      .describe("Assistant identity for this profile."),
    portal: z
      .object({ available: z.boolean().describe("Whether the profile portal is available.") })
      .strict()
      .describe("Portal availability for this profile."),
    capabilities: z
      .array(profileCapabilitiesListItemSchema)
      .describe("Capability readiness summaries for this profile."),
    operationalContext: profileOperationalContextSchema.describe(
      "Current coordination state for pending approvals, proposals, work, blockers, and recent terminal outcomes.",
    ),
  })
  .strict()
  .describe("Small profile overview for assistant planning.");
export type ProfileOverview = z.infer<typeof profileOverviewSchema>;

export const profileOverviewGetOutputSchema = z
  .object({ overview: profileOverviewSchema.describe("Profile overview result.") })
  .strict();

export const profileActivitySourceSchema = z
  .object({
    kind: z.string().trim().min(1).describe("Durable source kind."),
    id: z.string().trim().min(1).describe("Durable source id."),
  })
  .strict()
  .describe("Canonical source behind an activity entry.");
export type ProfileActivitySource = z.infer<typeof profileActivitySourceSchema>;

export const profileActivityEntrySchema = z
  .object({
    id: z
      .string()
      .uuid()
      .describe("Source event id.")
      .meta({ examples: [uuidExample] }),
    eventType: z.string().trim().min(1).describe("Precise namespaced activity event type."),
    title: z.string().trim().min(1).describe("Short activity title."),
    summary: z.string().trim().min(1).describe("Compact activity summary."),
    occurredAt: z
      .string()
      .datetime({ offset: true })
      .describe("Timestamp when the activity happened.")
      .meta({ examples: ["2026-05-21T14:30:00.000Z"] }),
    source: profileActivitySourceSchema,
    referenceKeys: z
      .array(z.string().trim().min(1))
      .describe("Exact keys useful for dedupe or follow-up lookup."),
  })
  .strict()
  .describe("Compact assistant-facing activity entry.");
export type ProfileActivityEntry = z.infer<typeof profileActivityEntrySchema>;

export const profileActivitySearchInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .optional()
      .describe("Plain-language activity search query."),
    eventTypes: z
      .array(z.string().trim().min(1).max(200))
      .min(1)
      .max(20)
      .optional()
      .describe("Optional precise activity event types to include."),
    sourceKinds: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(20)
      .optional()
      .describe("Optional durable source kinds to include."),
    referenceKeys: z
      .array(z.string().trim().min(1).max(500))
      .min(1)
      .max(50)
      .optional()
      .describe("Optional exact dedupe/reference keys to match."),
    since: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("Optional inclusive lower bound for activity occurrence time."),
    until: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe("Optional inclusive upper bound for activity occurrence time."),
    limit: integerField("Maximum number of activity entries to return.", 1, 50, 10),
  })
  .strict();
export type ProfileActivitySearchInput = z.infer<typeof profileActivitySearchInputSchema>;

export const profileActivitySearchOutputSchema = z
  .object({
    query: z.string().trim().min(1).nullable().describe("Activity search query, when provided."),
    activities: z
      .array(profileActivityEntrySchema)
      .describe("Matching profile activity entries ordered by relevance and recency."),
  })
  .strict();
export type ProfileActivitySearchOutput = z.infer<typeof profileActivitySearchOutputSchema>;
