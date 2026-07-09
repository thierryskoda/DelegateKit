import type { SupabaseServiceClient } from "@ai-assistants/control-db";

import { capabilityOverviewForProfile } from "../product/profile-capabilities/profile-capability-overview";
import { capabilityListFromOverview } from "../product/profiles/context-builder";

export async function profileContextCapabilitySlugsForAudit(
  db: SupabaseServiceClient,
  profileId: string,
): Promise<string[]> {
  const overview = await capabilityOverviewForProfile(db, profileId);
  return capabilityListFromOverview(overview).map((capability) => capability.capabilitySlug);
}
