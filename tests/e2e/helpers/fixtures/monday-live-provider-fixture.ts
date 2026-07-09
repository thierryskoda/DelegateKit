import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { E2eFixtureScope } from "./e2e-fixture-scope";
import { seedMondayLeadForE2e, type SeededMondayLeadFixture } from "./monday-fixture";
import { requireTestingProviderMode } from "../provider-runtime/testing-provider-runtime";

type MondayLeadInput = Parameters<typeof seedMondayLeadForE2e>[2];

export async function seedLiveMondayLeadForE2e(
  scope: E2eFixtureScope,
  db: SupabaseServiceClient,
  input: MondayLeadInput,
): Promise<SeededMondayLeadFixture> {
  await requireTestingProviderMode(db, "monday", "live");
  return await seedMondayLeadForE2e(scope, db, input);
}
