import {
  writePolicyRulesSchema,
  type ExternalActionType,
  type WritePolicyMode,
  type WritePolicyRules,
} from "@ai-assistants/tool-contracts";
import {
  requireJsonObject,
  requireSupabaseData,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import { formatUnknownError } from "@ai-assistants/errors";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import type { ResolvedTrustedChannelOrigin } from "../actions/channel-resolution";

type WritePolicyActionPatch = Partial<Record<ExternalActionType, WritePolicyMode>>;

export type WritePolicyPatchRequest = {
  defaultMode?: WritePolicyMode | undefined;
  actions: WritePolicyActionPatch;
};

export type WritePolicyPatchActor = {
  assistantId: string;
  toolCallId: string;
  trustedChannelOrigin?: ResolvedTrustedChannelOrigin | null;
};

function parseWritePolicyRules(value: unknown, label: string): WritePolicyRules {
  const parsed = writePolicyRulesSchema.safeParse(value);
  if (!parsed.success) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `${label} is invalid: ${formatUnknownError(parsed.error)}`,
    );
  }
  return parsed.data;
}

async function requireDefaultWritePolicy(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<TableRow<"approval_policies">> {
  const result = await db
    .from("approval_policies")
    .select()
    .eq("profile_id", profileId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data)
    throw new DomainError(
      domainCodes.CONFLICT,
      `Default write policy is missing for profile ${profileId}.`,
    );
  const parsed = writePolicyRulesSchema.safeParse(result.data.rules);
  if (!parsed.success) {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Default write policy for profile ${profileId} is invalid: ${formatUnknownError(parsed.error)}`,
    );
  }
  return result.data;
}

function formatWritePolicy(policy: TableRow<"approval_policies">) {
  return {
    id: policy.id,
    rules: parseWritePolicyRules(policy.rules, `approvalPolicies.${policy.profile_id}.rules`),
    updatedAt: policy.updated_at,
  };
}

export async function getWritePolicyForProfile(db: SupabaseServiceClient, profileId: string) {
  return formatWritePolicy(await requireDefaultWritePolicy(db, profileId));
}

export async function patchWritePolicyForProfile(
  db: SupabaseServiceClient,
  profileId: string,
  input: WritePolicyPatchRequest,
  _actor: WritePolicyPatchActor,
) {
  const actionEntries = Object.entries(input.actions);
  if (input.defaultMode === undefined && !actionEntries.length) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      "Write policy update requires at least one policy change.",
    );
  }
  const current = await requireDefaultWritePolicy(db, profileId);
  const currentRules = parseWritePolicyRules(
    current.rules,
    `approvalPolicies.${profileId}.rules`,
  );
  const nextRules = writePolicyRulesSchema.parse({
    defaultMode: input.defaultMode ?? currentRules.defaultMode,
    actions: {
      ...currentRules.actions,
      ...input.actions,
    },
  });
  const now = new Date().toISOString();
  const result = await db
    .from("approval_policies")
    .update({
      rules: requireJsonObject(nextRules, `approvalPolicies.${profileId}.rules`),
      updated_at: now,
    })
    .eq("id", current.id)
    .select()
    .single();
  const policy = requireSupabaseData("Update write policy", result.data, result.error);
  return formatWritePolicy(policy);
}
