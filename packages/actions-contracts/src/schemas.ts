import { profileActionRowSchema } from "@ai-assistants/control-plane-contracts";
import {
  actionStatusOutputSchema,
  externalWriteOutputSchema,
  externalWriteStatusSchema,
  externalActionTypeSchema,
  integerField,
  stringField,
  writePolicyModeSchema,
  writePolicyRulesSchema,
} from "@ai-assistants/tool-contracts";
import { profilePortalActionDecisionCommandSchema } from "@ai-assistants/control-plane-contracts";
import { z } from "zod";

const uuidExample = "550e8400-e29b-41d4-a716-446655440000";
const isoTimestampExample = "2026-05-21T14:30:00.000Z";

export const agentActionDtoSchema = z
  .object({
    actionId: profileActionRowSchema.shape.id
      .describe("Backend profile action id for this approval-backed provider write.")
      .meta({ examples: [uuidExample] }),
    status: externalWriteStatusSchema.describe("Current assistant-facing provider write status."),
    title: profileActionRowSchema.shape.title.describe(
      "Short human-readable title for the approval request.",
    ),
    expiresAt: profileActionRowSchema.shape.expires_at
      .describe("Expiration timestamp for this pending action, or null when it does not expire.")
      .meta({ examples: [isoTimestampExample] }),
  })
  .strict()
  .describe("Lean assistant-facing profile action or approval summary.");
export type AgentActionDto = z.infer<typeof agentActionDtoSchema>;

export const profileActionDtoSchema = agentActionDtoSchema;
export type ProfileActionDto = AgentActionDto;

export const profileWritePolicySchema = z
  .object({
    id: z.string().trim().min(1).describe("Backend write policy id."),
    rules: writePolicyRulesSchema.describe("Write policy rules currently in effect."),
    updatedAt: z
      .string()
      .trim()
      .min(1)
      .describe("Timestamp when the write policy was last updated.")
      .meta({ examples: [isoTimestampExample] }),
  })
  .strict()
  .describe("Profile write policy.");
export type ProfileWritePolicy = z.infer<typeof profileWritePolicySchema>;

export const profileActionWriteToolDataSchema = externalWriteOutputSchema();
export type ProfileActionWriteToolData = z.infer<typeof profileActionWriteToolDataSchema>;

export const profileActionDecideInputSchema = z
  .object({
    actionId: stringField(
      "Backend profile provider action id from a write result that returned needs_review, action_list, or action_get.",
    ),
    decision: profilePortalActionDecisionCommandSchema.describe(
      "Whether the user approved or rejected the pending action.",
    ),
  })
  .strict();
export type ProfileActionDecideInput = z.infer<typeof profileActionDecideInputSchema>;

export const profileActionListInputSchema = z
  .object({
    scope: z
      .enum(["pending", "active", "recent"])
      .default("pending")
      .describe(
        "Which profile provider actions to list: pending awaits a user decision, active is a broader in-flight/problem set that includes pending approvals, and recent returns the most recently updated actions regardless of status. Use this field name only; do not pass status or filter.",
      ),
    limit: integerField("Maximum number of actions to return.", 1, 50, 10),
  })
  .strict();
export type ProfileActionListInput = z.infer<typeof profileActionListInputSchema>;

export const profileActionGetInputSchema = z
  .object({
    actionId: stringField("Backend profile provider action id."),
  })
  .strict();
export type ProfileActionGetInput = z.infer<typeof profileActionGetInputSchema>;

export const profileWritePolicyUpdateInputSchema = z
  .object({
    defaultMode: writePolicyModeSchema
      .describe(
        "Fallback write policy mode for policy-controlled actions without an explicit override.",
      )
      .optional(),
    actions: z
      .partialRecord(externalActionTypeSchema, writePolicyModeSchema)
      .default({})
      .describe(
        "Required patch map keyed by canonical external action id; use {} for a defaultMode-only change.",
      ),
  })
  .strict()
  .refine((input) => input.defaultMode !== undefined || Object.keys(input.actions).length > 0, {
    message: "At least one write policy change must be provided.",
  });
export type ProfileWritePolicyUpdateInput = z.infer<typeof profileWritePolicyUpdateInputSchema>;

export const profileActionDecideOutputSchema = actionStatusOutputSchema;
export type ProfileActionDecideOutput = z.infer<typeof profileActionDecideOutputSchema>;

export const profileActionListOutputSchema = z
  .object({
    actions: z.array(profileActionDtoSchema).describe("Profile provider actions matching the request."),
  })
  .strict();

export const profileActionGetOutputSchema = z
  .object({ action: profileActionDtoSchema.describe("Requested profile provider action.") })
  .strict();

export const profileWritePolicyGetOutputSchema = z
  .object({ writePolicy: profileWritePolicySchema.describe("Current write policy.") })
  .strict();

export const profileWritePolicyUpdateOutputSchema = z
  .object({ writePolicy: profileWritePolicySchema.describe("Updated write policy.") })
  .strict();
