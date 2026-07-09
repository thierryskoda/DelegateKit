import type { SupabaseServiceClient } from "@ai-assistants/control-db";
import { createE2eFixtureScope } from "./e2e-fixture-scope";
import { seedBoldSignEmptyListSandboxForE2e } from "./boldsign-sandbox-seed";
import { seedGmailJordanRowanThreadSandboxForE2e } from "./gmail-sandbox-seed";
import {
  seedGoogleDriveSandboxFileForE2e,
  seedGoogleDriveSandboxFolderForE2e,
} from "./google-drive-sandbox-seed";
import {
  seedMondaySandboxLeadForE2e,
  seedMondaySandboxSubitemsForE2e,
} from "./monday-sandbox-seed";
import type { E2eRun } from "../run/e2e-run";
import {
  CONNECTED_TESTING_CAPABILITIES as CONNECTED,
  requireTestingCapabilitiesConnected,
} from "../readiness/testing-capability-readiness";
import { enableAllTestingProviderSandboxes } from "../provider-runtime/testing-provider-runtime";
import { resetTestingProfileWorkState } from "../reset/testing-profile-work-state-reset";
import {
  clientReferenceForMarker,
  testingJordanRowanMandatePdfContent,
} from "../test-data/testing-realistic-data";

export async function seedDealBriefSandboxForE2e(input: {
  run: E2eRun;
  db: SupabaseServiceClient;
  marker: string;
}): Promise<void> {
  await resetTestingProfileWorkState(input.db, input.run.agentId);
  await requireTestingCapabilitiesConnected(input.db, [
    CONNECTED.monday,
    CONNECTED.gmail,
    CONNECTED.googleDrive,
    CONNECTED.boldsign,
  ]);
  await enableAllTestingProviderSandboxes(input.db, {
    capabilities: ["monday", "gmail", "google-drive", "boldsign"],
  });

  const fixtures = createE2eFixtureScope({ run: input.run });
  input.run.cleanup.add(() => fixtures.cleanup());

  const mondayLead = await seedMondaySandboxLeadForE2e(fixtures, input.db, {
    itemTitle: "Jordan Rowan Growth Mandate",
  });
  await seedMondaySandboxSubitemsForE2e(fixtures, input.db, mondayLead, [
    "Required document: signed mandate",
    "Required document: final contract",
    "Required document: client intake form",
  ]);
  await seedGmailJordanRowanThreadSandboxForE2e({
    db: input.db,
    marker: input.marker,
    idSuffix: input.run.runId,
  });
  const folder = await seedGoogleDriveSandboxFolderForE2e(fixtures, input.db, {
    name: `Jordan Rowan deal files ${clientReferenceForMarker(input.marker)}`,
  });
  await seedGoogleDriveSandboxFileForE2e(fixtures, input.db, {
    name: "Jordan Rowan signed mandate final.pdf",
    mimeType: "application/pdf",
    content: testingJordanRowanMandatePdfContent("Signed mandate", "514-555-0198"),
    folderId: folder.fileId,
  });
  await seedBoldSignEmptyListSandboxForE2e(input.db);
}
