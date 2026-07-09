import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import type { E2eFixtureScope } from "./e2e-fixture-scope";
import {
  seedGoogleDriveEmptySearchSandboxForE2e,
  seedGoogleDriveSandboxFileFixtureForE2e,
  seedGoogleDriveSandboxFolderFixtureForE2e,
} from "./google-drive-seed";
import { requireTestingProviderMode } from "../provider-runtime/testing-provider-runtime";

type GoogleDriveFolderInput = Parameters<typeof seedGoogleDriveSandboxFolderFixtureForE2e>[1];
type GoogleDriveFileInput = Parameters<typeof seedGoogleDriveSandboxFileFixtureForE2e>[1];

async function requireGoogleDriveSandboxMode(db: SupabaseServiceClient): Promise<void> {
  await requireTestingProviderMode(db, "google-drive", "sandbox");
}

export async function seedGoogleDriveSandboxEmptySearchForE2e(
  db: SupabaseServiceClient,
): Promise<void> {
  await requireGoogleDriveSandboxMode(db);
  await seedGoogleDriveEmptySearchSandboxForE2e(db);
}

export async function seedGoogleDriveSandboxFolderForE2e(
  _scope: E2eFixtureScope,
  db: SupabaseServiceClient,
  input: GoogleDriveFolderInput,
): ReturnType<typeof seedGoogleDriveSandboxFolderFixtureForE2e> {
  await requireGoogleDriveSandboxMode(db);
  return await seedGoogleDriveSandboxFolderFixtureForE2e(db, input);
}

export async function seedGoogleDriveSandboxFileForE2e(
  _scope: E2eFixtureScope,
  db: SupabaseServiceClient,
  input: GoogleDriveFileInput,
): ReturnType<typeof seedGoogleDriveSandboxFileFixtureForE2e> {
  await requireGoogleDriveSandboxMode(db);
  return await seedGoogleDriveSandboxFileFixtureForE2e(db, input);
}
