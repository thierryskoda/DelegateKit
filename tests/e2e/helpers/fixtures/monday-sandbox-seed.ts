import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { E2eFixtureScope } from "./e2e-fixture-scope";
import {
  loadMondaySandboxItemForE2e,
  requireMondaySandboxColumnEvidence,
  seedMondayEmptyDiscoverySandboxForE2e,
  seedMondayItemUpdateSandboxForE2e,
  seedMondaySandboxColumnFixtureForE2e,
  seedMondaySandboxLeadFixtureForE2e,
  seedMondaySandboxSubitemsFixtureForE2e,
  seedMondayUpdateCreateSandboxForE2e,
  type SeededMondayColumnFixture,
  type SeededMondayLeadFixture,
  type SeededMondaySubitemFixture,
} from "./monday-fixture";
import { requireTestingProviderMode } from "../provider-runtime/testing-provider-runtime";

type MondayLeadInput = Parameters<typeof seedMondaySandboxLeadFixtureForE2e>[1];
type MondayColumnInput = Parameters<typeof seedMondaySandboxColumnFixtureForE2e>[2];

async function requireMondaySandboxMode(db: SupabaseServiceClient): Promise<void> {
  await requireTestingProviderMode(db, "monday", "sandbox");
}

export async function seedMondaySandboxEmptyDiscoveryForE2e(
  db: SupabaseServiceClient,
): Promise<void> {
  await requireMondaySandboxMode(db);
  await seedMondayEmptyDiscoverySandboxForE2e(db);
}

export async function seedMondaySandboxUpdateCreateForE2e(
  db: SupabaseServiceClient,
  input?: { updateId?: string },
): Promise<{ updateId: string }> {
  await requireMondaySandboxMode(db);
  return await seedMondayUpdateCreateSandboxForE2e(db, input);
}

export async function seedMondaySandboxItemUpdateForE2e(
  db: SupabaseServiceClient,
  input: { itemId: string },
): Promise<void> {
  await requireMondaySandboxMode(db);
  await seedMondayItemUpdateSandboxForE2e(db, input);
}

export async function seedMondaySandboxLeadForE2e(
  _scope: E2eFixtureScope,
  db: SupabaseServiceClient,
  input: MondayLeadInput,
): Promise<SeededMondayLeadFixture> {
  await requireMondaySandboxMode(db);
  return await seedMondaySandboxLeadFixtureForE2e(db, input);
}

export async function seedMondaySandboxSubitemsForE2e(
  _scope: E2eFixtureScope,
  db: SupabaseServiceClient,
  parent: Pick<SeededMondayLeadFixture, "itemId" | "providerConfigKey" | "connectionId">,
  itemNames: readonly string[],
): Promise<SeededMondaySubitemFixture[]> {
  await requireMondaySandboxMode(db);
  return await seedMondaySandboxSubitemsFixtureForE2e(db, parent, itemNames);
}

export async function seedMondaySandboxColumnForE2e(
  _scope: E2eFixtureScope,
  db: SupabaseServiceClient,
  parent: Pick<SeededMondayLeadFixture, "boardId" | "providerConfigKey" | "connectionId">,
  input: MondayColumnInput,
): Promise<SeededMondayColumnFixture> {
  await requireMondaySandboxMode(db);
  return await seedMondaySandboxColumnFixtureForE2e(db, parent, input);
}

export { loadMondaySandboxItemForE2e, requireMondaySandboxColumnEvidence };
export type { SeededMondayColumnFixture, SeededMondayLeadFixture, SeededMondaySubitemFixture };
