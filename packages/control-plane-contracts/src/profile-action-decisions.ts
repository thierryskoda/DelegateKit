import { z } from "zod";

/** Portal / trusted-channel command before persistence as `approved` | `rejected`. */
export const profilePortalActionDecisionCommandSchema = z.enum(["approve", "reject"]);
export type ProfilePortalActionDecisionCommand = z.infer<
  typeof profilePortalActionDecisionCommandSchema
>;

export const profileActionDecisionRequestBodySchema = z.object({}).strict();

export function mapProfilePortalDecisionCommandToPersisted(
  command: ProfilePortalActionDecisionCommand,
): "approved" | "rejected" {
  switch (command) {
    case "approve":
      return "approved";
    case "reject":
      return "rejected";
    default: {
      const _never: never = command;
      throw new Error(`Impossible profile portal action decision command: ${String(_never)}`);
    }
  }
}
