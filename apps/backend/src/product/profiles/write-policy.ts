import {
  writePolicyRulesSchema,
  type WritePolicyMode,
  type ExternalActionType,
  type WritePolicyRules,
} from "@ai-assistants/tool-contracts";
import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { formatUnknownError } from "@ai-assistants/errors";
import { DomainError, domainCodes } from "@ai-assistants/errors";

export async function loadDefaultWritePolicyRules(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<WritePolicyRules> {
  const result = await db
    .from("approval_policies")
    .select()
    .eq("profile_id", profileId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data)
    throw new DomainError(
      domainCodes.CONFLICT,
      `Write policy is missing for profile ${profileId}.`,
    );
  const parsed = writePolicyRulesSchema.safeParse(result.data.rules);
  if (!parsed.success) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Write policy for profile ${profileId} is invalid: ${formatUnknownError(parsed.error)}`,
    );
  }
  return parsed.data;
}

export function writePolicyModeFromRules(
  rules: WritePolicyRules,
  actionType: ExternalActionType,
): WritePolicyMode {
  return rules.actions[actionType] ?? rules.defaultMode;
}
