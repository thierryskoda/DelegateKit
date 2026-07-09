import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  createSupabaseServiceClient,
  requireSupabaseData,
  requireSupabaseRows,
  type SupabaseServiceClient,
  type TableRow,
} from "@ai-assistants/control-db";
import {
  googleDriveToolContracts,
  type GoogleDriveToolName,
} from "@ai-assistants/google-drive-contracts/contracts";
import { E2E_TEST_CHANNEL_DEFAULT_PEER_ID } from "../helpers/run/e2e-run";
import {
  downloadArtifactBytes,
  loadArtifact,
} from "../../../apps/backend/src/test-support/actions";
import { approveAndExecuteProfileAction } from "../helpers/capability/approve-profile-action";
import { createCapabilityToolCoverage } from "../helpers/capability/capability-tool-coverage";
import { requireSingleTestingNangoConnection } from "../helpers/readiness/testing-provider-readiness";
import {
  driveRoundtripFileBody,
  driveRoundtripFileDescription,
  driveRoundtripUpdatedDescription,
} from "../helpers/test-data/testing-realistic-data";
import { seedTestingTrustedE2eChannel } from "../helpers/fixtures/testing-trusted-channel-fixture";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import {
  buildCapabilityToolRequest,
  withTrustedChannel,
  executeCapabilityTool,
  parseCapabilityToolOutput,
} from "../helpers/run/execute-capability-backend-tool";
import { requireTestingE2eAgent } from "../helpers/run/testing-launch-support";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { asRecord } from "../helpers/utils/as-record";
import { requireTestingProvidersLive } from "../helpers/provider-runtime/testing-provider-runtime";

const CAPABILITY_ID = "google-drive";
const coverage = createCapabilityToolCoverage(CAPABILITY_ID, googleDriveToolContracts);

type ProviderResource = {
  id: string;
  kind: "file" | "folder";
  deleted: boolean;
};

type CreatedPermission = {
  id: string;
  fileId: string;
  deleted: boolean;
};

type SavedArtifact = {
  id: string;
  deleted: boolean;
};

type GoogleDriveCleanupState = {
  db: SupabaseServiceClient;
  fixture: Awaited<ReturnType<typeof requireSingleTestingNangoConnection>>;
  marker: string;
  decisionUserId: string;
  resources: ProviderResource[];
  permissions: CreatedPermission[];
  artifacts: SavedArtifact[];
};

function recordIdFromProviderResult(toolName: string, value: unknown): string {
  const result = asRecord(value, `${toolName} provider result`);
  const id = result.id;
  if (typeof id !== "string" || !id.trim()) {
    throw new Error(
      `${toolName} provider result.id must be a non-empty string; got ${JSON.stringify(result)}`,
    );
  }
  return id;
}

function providerResultFromExecutedAction(
  action: TableRow<"profile_actions">,
  label: string,
): Record<string, unknown> {
  const payload = asRecord(action.result_payload, `${label} result_payload`);
  assert.equal(payload.provider, "google-drive");
  return asRecord(payload.result, `${label} provider result`);
}

function executedProviderId(action: TableRow<"profile_actions">, label: string): string {
  return recordIdFromProviderResult(label, providerResultFromExecutedAction(action, label));
}

async function typedGoogleDriveTool<const T extends GoogleDriveToolName>(
  db: SupabaseServiceClient,
  toolName: T,
  params: Record<string, unknown>,
  options?: { trusted?: boolean },
) {
  coverage.exercise(toolName);
  let request = buildCapabilityToolRequest({
    capabilityId: CAPABILITY_ID,
    toolName,
    params,
  });
  if (options?.trusted !== false) {
    request = withTrustedChannel(request, CAPABILITY_ID);
  }
  const result = await executeCapabilityTool(db, request);
  return parseCapabilityToolOutput(result, googleDriveToolContracts, toolName);
}

async function approveGoogleDriveWrite(input: {
  db: SupabaseServiceClient;
  toolName: GoogleDriveToolName;
  write: { actionId: string };
  decisionUserId: string;
}): Promise<TableRow<"profile_actions">> {
  const actionResult = await input.db
    .from("profile_actions")
    .select()
    .eq("id", input.write.actionId)
    .single();
  const action = requireSupabaseData(
    `Load Google Drive write action ${input.write.actionId}`,
    actionResult.data,
    actionResult.error,
  );
  return approveAndExecuteProfileAction({
    db: input.db,
    action,
    decisionUserId: input.decisionUserId,
  });
}

async function assertProviderWriteReceipt(input: {
  db: SupabaseServiceClient;
  action: TableRow<"profile_actions">;
  toolName: GoogleDriveToolName;
  externalResourceId: string;
}) {
  const result = await input.db
    .from("provider_write_receipts")
    .select()
    .eq("profile_action_id", input.action.id)
    .eq("tool_name", input.toolName)
    .eq("external_resource_id", input.externalResourceId);
  const receipts = requireSupabaseRows(
    `Load provider write receipts for ${input.toolName}`,
    result.data,
    result.error,
  );
  assert.equal(receipts.length, 1, `${input.toolName} should write one provider receipt`);

  const eventResult = await input.db
    .from("agent_events")
    .select()
    .eq("event_type", "provider.write.result")
    .contains("payload", { sourceId: receipts[0]!.id });
  const events = requireSupabaseRows(
    `Load provider write result event for ${input.toolName}`,
    eventResult.data,
    eventResult.error,
  );
  assert.equal(events.length, 1, `${input.toolName} should write one provider.write.result event`);
}

function isIgnorableCleanupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found|file not found|permission not found|404/i.test(message);
}

function isCleanupTrashFallbackError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /status code 424|delete-file failed|Nango Google Drive action "delete-file" failed/i.test(
    message,
  );
}

async function cleanupArtifact(db: SupabaseServiceClient, artifact: SavedArtifact): Promise<void> {
  if (artifact.deleted) return;
  const loaded = await db.from("artifacts").select().eq("id", artifact.id).maybeSingle();
  if (loaded.error) throw loaded.error;
  const row = loaded.data;
  if (!row) {
    artifact.deleted = true;
    return;
  }
  const removed = await db.storage.from(row.storage_bucket).remove([row.storage_key]);
  if (removed.error) throw removed.error;
  const deleted = await db.from("artifacts").delete().eq("id", row.id);
  requireSupabaseData("Delete E2E Google Drive artifact row", deleted.data ?? [], deleted.error);
  artifact.deleted = true;
}

async function cleanupCreatedDriveResources(state: GoogleDriveCleanupState): Promise<void> {
  const connectedAccountId = state.fixture.connectedAccount.id;

  for (const permission of [...state.permissions].reverse()) {
    if (permission.deleted) continue;
    try {
      const write = await typedGoogleDriveTool(state.db, "google_drive_permission_delete", {
        connectedAccountId,
        fileId: permission.fileId,
        permissionId: permission.id,
      });
      await approveGoogleDriveWrite({
        db: state.db,
        toolName: "google_drive_permission_delete",
        write: write.write,
        decisionUserId: state.decisionUserId,
      });
      permission.deleted = true;
    } catch (error) {
      if (!isIgnorableCleanupError(error)) throw error;
      permission.deleted = true;
    }
  }

  for (const artifact of [...state.artifacts].reverse()) {
    await cleanupArtifact(state.db, artifact);
  }

  for (const resource of [...state.resources].reverse()) {
    try {
      const write = await typedGoogleDriveTool(state.db, "google_drive_file_delete", {
        connectedAccountId,
        fileId: resource.id,
      });
      await approveGoogleDriveWrite({
        db: state.db,
        toolName: "google_drive_file_delete",
        write: write.write,
        decisionUserId: state.decisionUserId,
      });
      resource.deleted = true;
    } catch (error) {
      if (isIgnorableCleanupError(error)) {
        resource.deleted = true;
        continue;
      }
      if (!isCleanupTrashFallbackError(error)) throw error;
      try {
        const write = await typedGoogleDriveTool(state.db, "google_drive_file_trash", {
          connectedAccountId,
          fileId: resource.id,
        });
        await approveGoogleDriveWrite({
          db: state.db,
          toolName: "google_drive_file_trash",
          write: write.write,
          decisionUserId: state.decisionUserId,
        });
      } catch (trashError) {
        if (!isIgnorableCleanupError(trashError)) throw trashError;
      } finally {
        resource.deleted = true;
      }
    }
  }
}

test("Testing client: Google Drive capability lifecycle works end-to-end.", async (t) => {
  requireTestingE2eAgent();
  const run = await createE2eRun(t, { id: CAPABILITY_ID });
  await attachE2eSupabase(run);
  const db = createSupabaseServiceClient();
  await requireTestingProvidersLive(db, [CAPABILITY_ID]);
  const marker = createMarker("testing-google-drive");
  const fixture = await requireSingleTestingNangoConnection(db, {
    capabilitySlug: "google-drive",
    provider: "google-drive",
    label: "Google Drive",
  });
  assert.equal(fixture.capabilityAccountLink.profile_id, "testing");
  const profileResult = await db.from("profiles").select("user_id").eq("id", "testing").single();
  const testingProfile = requireSupabaseData(
    "Load testing profile user for approval decisions",
    profileResult.data,
    profileResult.error,
  );
  assert.ok(
    testingProfile.user_id,
    "testing profile must have a portal user_id for approval decisions",
  );
  const decisionUserId = testingProfile.user_id;
  const connectedAccountId = fixture.connectedAccount.id;
  const { cleanup: trustedChannelCleanup } = await seedTestingTrustedE2eChannel({
    db,
    profileId: "testing",
    peerId: E2E_TEST_CHANNEL_DEFAULT_PEER_ID,
    marker,
    purpose: "google-drive-e2e",
  });

  const expectedContent = driveRoundtripFileBody(marker);
  const expectedBytes = Buffer.from(expectedContent, "utf8");
  const expectedSha256 = createHash("sha256").update(expectedBytes).digest("hex");
  const uploadedFilename = `${marker}-source.txt`;
  const updatedFilename = `${marker}-source-renamed.txt`;
  const copiedFilename = `${marker}-copy.txt`;
  const resources: ProviderResource[] = [];
  const permissions: CreatedPermission[] = [];
  const artifacts: SavedArtifact[] = [];
  const cleanupState: GoogleDriveCleanupState = {
    db,
    fixture,
    marker,
    decisionUserId,
    resources,
    permissions,
    artifacts,
  };

  try {
    // --- folder create (root) ---
    const rootFolderName = `${marker}-root`;
    const rootFolderWrite = await typedGoogleDriveTool(
      db,
      "google_drive_folder_create",
      { connectedAccountId, name: rootFolderName },
      { trusted: true },
    );
    const rootFolderExecuted = await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_folder_create",
      write: rootFolderWrite.write,
      decisionUserId,
    });
    const rootFolder = {
      id: executedProviderId(rootFolderExecuted, "google_drive_folder_create"),
      kind: "folder" as const,
      deleted: false,
    };
    resources.push(rootFolder);
    let metadata = (
      await typedGoogleDriveTool(db, "google_drive_file_get", {
        connectedAccountId,
        fileId: rootFolder.id,
      })
    ).file;
    assert.equal(metadata.name, rootFolderName);

    // --- folder create (child) ---
    const childFolderName = `${marker}-child`;
    const childFolderWrite = await typedGoogleDriveTool(
      db,
      "google_drive_folder_create",
      { connectedAccountId, name: childFolderName, parentId: rootFolder.id },
      { trusted: true },
    );
    const childFolderExecuted = await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_folder_create",
      write: childFolderWrite.write,
      decisionUserId,
    });
    const childFolder = {
      id: executedProviderId(childFolderExecuted, "google_drive_folder_create"),
      kind: "folder" as const,
      deleted: false,
    };
    resources.push(childFolder);
    metadata = (
      await typedGoogleDriveTool(db, "google_drive_file_get", {
        connectedAccountId,
        fileId: childFolder.id,
      })
    ).file;
    assert.equal(metadata.name, childFolderName);

    // --- file upload ---
    const uploadWrite = await typedGoogleDriveTool(
      db,
      "google_drive_file_upload",
      {
        connectedAccountId,
        name: uploadedFilename,
        source: {
          kind: "direct_content",
          content: expectedContent,
          mimeType: "text/plain",
        },
        folderId: rootFolder.id,
        description: driveRoundtripFileDescription(marker),
      },
      { trusted: true },
    );
    const uploadExecuted = await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_file_upload",
      write: uploadWrite.write,
      decisionUserId,
    });
    const uploaded = {
      id: executedProviderId(uploadExecuted, "google_drive_file_upload"),
      kind: "file" as const,
      deleted: false,
    };
    await assertProviderWriteReceipt({
      db,
      action: uploadExecuted,
      toolName: "google_drive_file_upload",
      externalResourceId: uploaded.id,
    });
    resources.push(uploaded);
    metadata = (
      await typedGoogleDriveTool(db, "google_drive_file_get", {
        connectedAccountId,
        fileId: uploaded.id,
      })
    ).file;
    assert.equal(metadata.name, uploadedFilename);
    assert.equal(metadata.mimeType, "text/plain");

    // --- live reads ---
    const accountsList = await typedGoogleDriveTool(db, "google_drive_accounts_list", {});
    assert.equal(accountsList.accounts.length > 0, true);

    const children = await typedGoogleDriveTool(db, "google_drive_folder_list", {
      connectedAccountId,
      folderId: rootFolder.id,
      limit: 20,
    });
    assert.ok(
      children.files.some((record) => record.id === uploaded.id),
      `folder children must include uploaded file ${uploaded.id}`,
    );

    const search = await typedGoogleDriveTool(db, "google_drive_search", {
      connectedAccountId,
      driveQuery: `name = '${uploadedFilename.replace(/'/g, "\\'")}'`,
      pageSize: 10,
    });
    assert.ok(
      search.files.some((record) => record.id === uploaded.id),
      `file search must include uploaded file ${uploaded.id}`,
    );

    const sharedDrives = await typedGoogleDriveTool(db, "google_drive_shared_drives_list", {
      connectedAccountId,
      limit: 10,
    });
    assert.equal(sharedDrives.provider, "google-drive");
    assert.ok(Array.isArray(sharedDrives.drives));

    // --- save to artifact ---
    const saveData = await typedGoogleDriveTool(db, "google_drive_file_save", {
      connectedAccountId,
      fileId: uploaded.id,
      filename: uploadedFilename,
      mode: "media",
    });
    artifacts.push({ id: saveData.profileFileId, deleted: false });
    assert.equal(saveData.filename, uploadedFilename);
    assert.equal(saveData.mimeType, "text/plain");
    assert.equal(saveData.byteSize, expectedBytes.byteLength);
    assert.equal(saveData.sha256, expectedSha256);
    const artifact = await loadArtifact(db, "testing", saveData.profileFileId);
    assert.equal(artifact.byte_size, expectedBytes.byteLength);
    assert.equal(artifact.sha256, expectedSha256);
    const downloaded = await downloadArtifactBytes(db, artifact);
    assert.deepEqual(Buffer.from(downloaded), expectedBytes);

    const artifactUploadFilename = `drive-artifact-upload-${marker}.txt`;
    const artifactUploadWrite = await typedGoogleDriveTool(
      db,
      "google_drive_file_upload",
      {
        connectedAccountId,
        name: artifactUploadFilename,
        source: {
          kind: "profile_file",
          profileFileId: saveData.profileFileId,
          expectedSha256: saveData.sha256,
        },
        folderId: rootFolder.id,
        description: `Artifact-backed upload for ${marker}`,
      },
      { trusted: true },
    );
    const artifactUploadExecuted = await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_file_upload",
      write: artifactUploadWrite.write,
      decisionUserId,
    });
    const artifactUploaded = {
      id: executedProviderId(artifactUploadExecuted, "google_drive_file_upload"),
      kind: "file" as const,
      deleted: false,
    };
    resources.push(artifactUploaded);
    metadata = (
      await typedGoogleDriveTool(db, "google_drive_file_get", {
        connectedAccountId,
        fileId: artifactUploaded.id,
      })
    ).file;
    assert.equal(metadata.name, artifactUploadFilename);
    assert.equal(metadata.mimeType, "text/plain");

    // --- rename + update description ---
    const renameWrite = await typedGoogleDriveTool(
      db,
      "google_drive_file_rename",
      { connectedAccountId, fileId: uploaded.id, name: updatedFilename },
      { trusted: true },
    );
    const renameExecuted = await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_file_rename",
      write: renameWrite.write,
      decisionUserId,
    });
    await assertProviderWriteReceipt({
      db,
      action: renameExecuted,
      toolName: "google_drive_file_rename",
      externalResourceId: uploaded.id,
    });
    const descriptionWrite = await typedGoogleDriveTool(
      db,
      "google_drive_file_update_description",
      {
        connectedAccountId,
        fileId: uploaded.id,
        description: driveRoundtripUpdatedDescription(marker),
      },
      { trusted: true },
    );
    await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_file_update_description",
      write: descriptionWrite.write,
      decisionUserId,
    });
    metadata = (
      await typedGoogleDriveTool(db, "google_drive_file_get", {
        connectedAccountId,
        fileId: uploaded.id,
      })
    ).file;
    assert.equal(metadata.name, updatedFilename);
    assert.equal(metadata.description, driveRoundtripUpdatedDescription(marker));

    // --- copy ---
    const copyWrite = await typedGoogleDriveTool(
      db,
      "google_drive_file_copy",
      {
        connectedAccountId,
        fileId: uploaded.id,
        name: copiedFilename,
        destinationFolderId: childFolder.id,
      },
      { trusted: true },
    );
    const copyExecuted = await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_file_copy",
      write: copyWrite.write,
      decisionUserId,
    });
    const copied = {
      id: executedProviderId(copyExecuted, "google_drive_file_copy"),
      kind: "file" as const,
      deleted: false,
    };
    resources.push(copied);
    metadata = (
      await typedGoogleDriveTool(db, "google_drive_file_get", {
        connectedAccountId,
        fileId: copied.id,
      })
    ).file;
    assert.equal(metadata.name, copiedFilename);

    // --- move ---
    const moveWrite = await typedGoogleDriveTool(
      db,
      "google_drive_file_move",
      {
        connectedAccountId,
        fileId: copied.id,
        fromFolderId: childFolder.id,
        toFolderId: rootFolder.id,
      },
      { trusted: true },
    );
    await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_file_move",
      write: moveWrite.write,
      decisionUserId,
    });
    metadata = (
      await typedGoogleDriveTool(db, "google_drive_file_get", {
        connectedAccountId,
        fileId: copied.id,
      })
    ).file;
    assert.ok(Array.isArray(metadata.parents));
    assert.ok(metadata.parents.includes(rootFolder.id));

    // --- permissions list ---
    const permissionsList = await typedGoogleDriveTool(db, "google_drive_permissions_list", {
      connectedAccountId,
      fileId: copied.id,
      pageSize: 20,
    });
    assert.ok(permissionsList.permissions.length > 0);

    // --- share (anyone permission) ---
    const shareWrite = await typedGoogleDriveTool(
      db,
      "google_drive_file_share",
      {
        connectedAccountId,
        fileId: copied.id,
        type: "anyone",
        role: "reader",
        allowFileDiscovery: false,
        sendNotificationEmail: false,
      },
      { trusted: true },
    );
    const shareExecuted = await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_file_share",
      write: shareWrite.write,
      decisionUserId,
    });
    const permission = {
      id: executedProviderId(shareExecuted, "google_drive_file_share"),
      fileId: copied.id,
      deleted: false,
    };
    permissions.push(permission);

    const permissionGet = await typedGoogleDriveTool(db, "google_drive_permission_get", {
      connectedAccountId,
      fileId: copied.id,
      permissionId: permission.id,
    });
    assert.equal(permissionGet.permission.id, permission.id);
    assert.equal(permissionGet.permission.type, "anyone");

    const permissionUpdateWrite = await typedGoogleDriveTool(
      db,
      "google_drive_permission_update",
      {
        connectedAccountId,
        fileId: copied.id,
        permissionId: permission.id,
        role: "commenter",
      },
      { trusted: true },
    );
    await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_permission_update",
      write: permissionUpdateWrite.write,
      decisionUserId,
    });
    const permissionGetUpdated = await typedGoogleDriveTool(
      db,
      "google_drive_permission_get",
      {
        connectedAccountId,
        fileId: copied.id,
        permissionId: permission.id,
      },
    );
    assert.equal(permissionGetUpdated.permission.role, "commenter");

    const permissionDeleteWrite = await typedGoogleDriveTool(
      db,
      "google_drive_permission_delete",
      {
        connectedAccountId,
        fileId: copied.id,
        permissionId: permission.id,
      },
      { trusted: true },
    );
    await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_permission_delete",
      write: permissionDeleteWrite.write,
      decisionUserId,
    });
    permission.deleted = true;

    // --- trash and restore ---
    const trashWrite = await typedGoogleDriveTool(
      db,
      "google_drive_file_trash",
      { connectedAccountId, fileId: copied.id },
      { trusted: true },
    );
    await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_file_trash",
      write: trashWrite.write,
      decisionUserId,
    });
    metadata = (
      await typedGoogleDriveTool(db, "google_drive_file_get", {
        connectedAccountId,
        fileId: copied.id,
      })
    ).file;
    assert.equal(metadata.trashed, true);

    const restoreWrite = await typedGoogleDriveTool(
      db,
      "google_drive_file_restore",
      { connectedAccountId, fileId: copied.id },
      { trusted: true },
    );
    await approveGoogleDriveWrite({
      db,
      toolName: "google_drive_file_restore",
      write: restoreWrite.write,
      decisionUserId,
    });
    metadata = (
      await typedGoogleDriveTool(db, "google_drive_file_get", {
        connectedAccountId,
        fileId: copied.id,
      })
    ).file;
    assert.equal(metadata.trashed, false);

    await cleanupCreatedDriveResources(cleanupState);
    coverage.assertComplete();

    console.log(
      JSON.stringify(
        {
          ok: true,
          marker,
          connectedAccountId,
          connectionId: connectedAccountId,
          contractTools: googleDriveToolContracts.map((contract) => contract.name),
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      await cleanupCreatedDriveResources(cleanupState);
    } finally {
      await trustedChannelCleanup();
    }
  }
});
