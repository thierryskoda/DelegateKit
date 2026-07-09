import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";

export async function requireEnabledCapabilityAccountLink(
  db: SupabaseServiceClient,
  profileId: string,
  capabilityAccountLinkId: string,
): Promise<TableRow<"capability_account_links">> {
  const result = await db
    .from("capability_account_links")
    .select()
    .eq("profile_id", profileId)
    .eq("id", capabilityAccountLinkId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data)
    throw new DomainError(
      domainCodes.NOT_FOUND,
      `Capability account link ${capabilityAccountLinkId} was not found for profile ${profileId}.`,
    );
  if (result.data.status !== "enabled") {
    throw new DomainError(
      domainCodes.CONFLICT,
      `Capability account link ${capabilityAccountLinkId} is ${result.data.status}; expected enabled.`,
    );
  }
  return result.data;
}
