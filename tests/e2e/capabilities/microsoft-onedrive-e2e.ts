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
  microsoftOnedriveToolContracts,
  type MicrosoftOnedriveToolName,
} from "@ai-assistants/microsoft-onedrive-contracts/contracts";
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

const CAPABILITY_ID = "microsoft-onedrive";
const coverage = createCapabilityToolCoverage(CAPABILITY_ID, microsoftOnedriveToolContracts);

export const CAPABILITY_E2E_WAIVED_TOOLS = [
  "microsoft_onedrive_invite_recipients",
] as const satisfies readonly MicrosoftOnedriveToolName[];

type ProviderResource = {
  id: string;
  kind: "file" | "folder";
  deleted: boolean;
};

type CreatedPermission = {
  id: string;
  itemId: string;
  deleted: boolean;
};

type SavedArtifact = {
  id: string;
  deleted: boolean;
};

type MicrosoftOnedriveCleanupState = {
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
  const id = result.id ?? result.itemId;
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
  assert.equal(payload.provider, "microsoft-onedrive");
  return asRecord(payload.result, `${label} provider result`);
}

function executedProviderId(action: TableRow<"profile_actions">, label: string): string {
  return recordIdFromProviderResult(label, providerResultFromExecutedAction(action, label));
}

async function assertProviderWriteReceipt(input: {
  db: SupabaseServiceClient;
  action: TableRow<"profile_actions">;
  toolName: MicrosoftOnedriveToolName;
  externalResourceId: string;
}) {
  const result = await input.db
    .from("provider_write_receipts")
    .select()
    .eq("profile_action_id", input.action.id)
    .eq("tool_name", input.toolName)
    .eq("external_resource_id", input.externalResourceId);
  const receipts = requireSupabaseRows(
    `Load OneDrive provider write receipts for ${input.toolName}`,
    result.data,
    result.error,
  );
  assert.equal(receipts.length, 1, `${input.toolName} should write one provider receipt`);
}

async function resolveCopiedItemId(input: {
  db: SupabaseServiceClient;
  connectedAccountId: string;
  copyExecuted: TableRow<"profile_actions">;
  targetParentId: string;
  copiedFilename: string;
}): Promise<string> {
  const result = providerResultFromExecutedAction(
    input.copyExecuted,
    "microsoft_onedrive_item_copy",
  );
  const directId = result.itemId ?? result.id;
  if (typeof directId === "string" && directId.trim()) return directId;

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const children = await typedMicrosoftOnedriveTool(input.db, "microsoft_onedrive_folder_children_list", {
      connectedAccountId: input.connectedAccountId,
      itemId: input.targetParentId,
    });
    const match = children.items.find((item) => item.name === input.copiedFilename);
    if (match?.id) return match.id;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `OneDrive copy did not expose item id and folder children never included ${input.copiedFilename}; last provider result=${JSON.stringify(result)}`,
  );
}

async function typedMicrosoftOnedriveTool<const T extends MicrosoftOnedriveToolName>(
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
  return parseCapabilityToolOutput(result, microsoftOnedriveToolContracts, toolName);
}

async function approveMicrosoftOnedriveWrite(input: {
  db: SupabaseServiceClient;
  toolName: MicrosoftOnedriveToolName;
  write: { actionId: string };
  decisionUserId: string;
}): Promise<TableRow<"profile_actions">> {
  const actionResult = await input.db
    .from("profile_actions")
    .select()
    .eq("id", input.write.actionId)
    .single();
  const action = requireSupabaseData(
    `Load OneDrive write action ${input.write.actionId}`,
    actionResult.data,
    actionResult.error,
  );
  return approveAndExecuteProfileAction({
    db: input.db,
    action,
    decisionUserId: input.decisionUserId,
  });
}

function isIgnorableCleanupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /not found|item not found|permission not found|404/i.test(message);
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
  requireSupabaseData("Delete E2E OneDrive artifact row", deleted.data ?? [], deleted.error);
  artifact.deleted = true;
}

async function cleanupCreatedMicrosoftOnedriveResources(
  state: MicrosoftOnedriveCleanupState,
): Promise<void> {
  const connectedAccountId = state.fixture.connectedAccount.id;

  for (const permission of [...state.permissions].reverse()) {
    if (permission.deleted) continue;
    try {
      const write = await typedMicrosoftOnedriveTool(state.db, "microsoft_onedrive_permission_delete", {
        connectedAccountId,
        itemId: permission.itemId,
        permissionId: permission.id,
      });
      await approveMicrosoftOnedriveWrite({
        db: state.db,
        toolName: "microsoft_onedrive_permission_delete",
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
      const write = await typedMicrosoftOnedriveTool(state.db, "microsoft_onedrive_item_delete", {
        connectedAccountId,
        itemId: resource.id,
      });
      await approveMicrosoftOnedriveWrite({
        db: state.db,
        toolName: "microsoft_onedrive_item_delete",
        write: write.write,
        decisionUserId: state.decisionUserId,
      });
      resource.deleted = true;
    } catch (error) {
      if (!isIgnorableCleanupError(error)) throw error;
      resource.deleted = true;
    }
  }
}

test("Testing client: Microsoft OneDrive capability lifecycle works end-to-end.", async (t) => {
  requireTestingE2eAgent();
  const run = await createE2eRun(t, { id: CAPABILITY_ID });
  await attachE2eSupabase(run);
  const db = createSupabaseServiceClient();
  await requireTestingProvidersLive(db, [CAPABILITY_ID]);
  const marker = createMarker("testing-microsoft-onedrive");
  const fixture = await requireSingleTestingNangoConnection(db, {
    capabilitySlug: "microsoft-onedrive",
    provider: "microsoft-onedrive",
    label: "Microsoft OneDrive",
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
    purpose: "microsoft-onedrive-e2e",
  });

  const expectedContent = driveRoundtripFileBody(marker);
  const expectedBytes = Buffer.from(expectedContent, "utf8");
  const expectedContentBase64 = expectedBytes.toString("base64");
  const expectedSha256 = createHash("sha256").update(expectedBytes).digest("hex");
  const uploadedFilename = `${marker}-source.txt`;
  const updatedFilename = `${marker}-source-renamed.txt`;
  const copiedFilename = `${marker}-copy.txt`;
  const resources: ProviderResource[] = [];
  const permissions: CreatedPermission[] = [];
  const artifacts: SavedArtifact[] = [];
  const cleanupState: MicrosoftOnedriveCleanupState = {
    db,
    fixture,
    marker,
    decisionUserId,
    resources,
    permissions,
    artifacts,
  };

  try {
    const accounts = await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_accounts_list", {});
    assert.ok(
      accounts.accounts.some((account) => account.connectedAccountId === connectedAccountId),
      `OneDrive accounts must include connected account ${connectedAccountId}`,
    );

    const drives = await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_drives_list", {
      connectedAccountId,
    });
    assert.equal(drives.provider, "microsoft-onedrive");
    assert.ok(drives.drives.length > 0);

    const defaultDrive = await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_drive_get", {
      connectedAccountId,
    });
    assert.equal(defaultDrive.provider, "microsoft-onedrive");
    assert.equal(defaultDrive.item.type, "drive");

    // --- folder create (root) ---
    const rootFolderName = `${marker}-root`;
    const rootFolderWrite = await typedMicrosoftOnedriveTool(
      db,
      "microsoft_onedrive_folder_create",
      { connectedAccountId, parentItemId: "root", name: rootFolderName },
      { trusted: true },
    );
    const rootFolderExecuted = await approveMicrosoftOnedriveWrite({
      db,
      toolName: "microsoft_onedrive_folder_create",
      write: rootFolderWrite.write,
      decisionUserId,
    });
    const rootFolder = {
      id: executedProviderId(rootFolderExecuted, "microsoft_onedrive_folder_create"),
      kind: "folder" as const,
      deleted: false,
    };
    await assertProviderWriteReceipt({
      db,
      action: rootFolderExecuted,
      toolName: "microsoft_onedrive_folder_create",
      externalResourceId: rootFolder.id,
    });
    resources.push(rootFolder);
    let metadata = (
      await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_item_get", {
        connectedAccountId,
        itemId: rootFolder.id,
      })
    ).item;
    assert.equal(metadata.name, rootFolderName);

    // --- folder create (child) ---
    const childFolderName = `${marker}-child`;
    const childFolderWrite = await typedMicrosoftOnedriveTool(
      db,
      "microsoft_onedrive_folder_create",
      { connectedAccountId, parentItemId: rootFolder.id, name: childFolderName },
      { trusted: true },
    );
    const childFolderExecuted = await approveMicrosoftOnedriveWrite({
      db,
      toolName: "microsoft_onedrive_folder_create",
      write: childFolderWrite.write,
      decisionUserId,
    });
    const childFolder = {
      id: executedProviderId(childFolderExecuted, "microsoft_onedrive_folder_create"),
      kind: "folder" as const,
      deleted: false,
    };
    resources.push(childFolder);
    metadata = (
      await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_item_get", {
        connectedAccountId,
        itemId: childFolder.id,
      })
    ).item;
    assert.equal(metadata.name, childFolderName);

    // --- small file upload ---
    const uploadWrite = await typedMicrosoftOnedriveTool(
      db,
      "microsoft_onedrive_small_file_upload",
      {
        connectedAccountId,
        parentItemId: rootFolder.id,
        fileName: uploadedFilename,
        source: {
          kind: "direct_content",
          content: expectedContentBase64,
          isBase64: true,
        },
        contentType: "text/plain",
      },
      { trusted: true },
    );
    const uploadExecuted = await approveMicrosoftOnedriveWrite({
      db,
      toolName: "microsoft_onedrive_small_file_upload",
      write: uploadWrite.write,
      decisionUserId,
    });
    const uploaded = {
      id: executedProviderId(uploadExecuted, "microsoft_onedrive_small_file_upload"),
      kind: "file" as const,
      deleted: false,
    };
    await assertProviderWriteReceipt({
      db,
      action: uploadExecuted,
      toolName: "microsoft_onedrive_small_file_upload",
      externalResourceId: uploaded.id,
    });
    resources.push(uploaded);
    metadata = (
      await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_item_get", {
        connectedAccountId,
        itemId: uploaded.id,
      })
    ).item;
    assert.equal(metadata.name, uploadedFilename);
    assert.equal(metadata.mimeType, "text/plain");

    const initialDescriptionWrite = await typedMicrosoftOnedriveTool(
      db,
      "microsoft_onedrive_item_update",
      {
        connectedAccountId,
        itemId: uploaded.id,
        description: driveRoundtripFileDescription(marker),
      },
      { trusted: true },
    );
    const initialDescriptionExecuted = await approveMicrosoftOnedriveWrite({
      db,
      toolName: "microsoft_onedrive_item_update",
      write: initialDescriptionWrite.write,
      decisionUserId,
    });
    await assertProviderWriteReceipt({
      db,
      action: initialDescriptionExecuted,
      toolName: "microsoft_onedrive_item_update",
      externalResourceId: uploaded.id,
    });
    metadata = (
      await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_item_get", {
        connectedAccountId,
        itemId: uploaded.id,
      })
    ).item;
    assert.equal(metadata.description, driveRoundtripFileDescription(marker));

    // --- live reads ---
    const children = await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_folder_children_list", {
      connectedAccountId,
      itemId: rootFolder.id,
    });
    assert.ok(
      children.items.some((record) => record.id === uploaded.id),
      `folder children must include uploaded file ${uploaded.id}`,
    );

    const recent = await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_recent_items_list", {
      connectedAccountId,
    });
    assert.equal(recent.provider, "microsoft-onedrive");
    assert.ok(Array.isArray(recent.items));

    const search = await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_files_search", {
      connectedAccountId,
      query: uploadedFilename,
    });
    assert.equal(search.provider, "microsoft-onedrive");
    assert.ok(Array.isArray(search.items));

    const sharedItems = await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_shared_items_list", {
      connectedAccountId,
    });
    assert.equal(sharedItems.provider, "microsoft-onedrive");
    assert.ok(Array.isArray(sharedItems.items));

    const versions = await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_versions_list", {
      connectedAccountId,
      itemId: uploaded.id,
    });
    assert.ok(versions.items.length > 0, "uploaded file must expose at least one version");

    const permissionsList = await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_permissions_list", {
      connectedAccountId,
      itemId: uploaded.id,
    });
    assert.ok(permissionsList.permissions.length > 0);
    const ownerPermission = permissionsList.permissions[0];
    assert.ok(ownerPermission?.id, "owner permission must have an id");

    const permissionGet = await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_permission_get", {
      connectedAccountId,
      itemId: uploaded.id,
      permissionId: ownerPermission.id,
    });
    assert.equal(permissionGet.permission.id, ownerPermission.id);

    // --- save to artifact ---
    const saveData = await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_file_save", {
      connectedAccountId,
      itemId: uploaded.id,
      filename: uploadedFilename,
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

    const artifactUploadFilename = `onedrive-artifact-upload-${marker}.txt`;
    const artifactUploadWrite = await typedMicrosoftOnedriveTool(
      db,
      "microsoft_onedrive_small_file_upload",
      {
        connectedAccountId,
        parentItemId: rootFolder.id,
        fileName: artifactUploadFilename,
        source: {
          kind: "profile_file",
          profileFileId: saveData.profileFileId,
          expectedSha256: saveData.sha256,
        },
        contentType: "text/plain",
      },
      { trusted: true },
    );
    const artifactUploadExecuted = await approveMicrosoftOnedriveWrite({
      db,
      toolName: "microsoft_onedrive_small_file_upload",
      write: artifactUploadWrite.write,
      decisionUserId,
    });
    const artifactUploaded = {
      id: executedProviderId(artifactUploadExecuted, "microsoft_onedrive_small_file_upload"),
      kind: "file" as const,
      deleted: false,
    };
    resources.push(artifactUploaded);
    metadata = (
      await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_item_get", {
        connectedAccountId,
        itemId: artifactUploaded.id,
      })
    ).item;
    assert.equal(metadata.name, artifactUploadFilename);
    assert.equal(metadata.mimeType, "text/plain");

    // --- update description ---
    const descriptionWrite = await typedMicrosoftOnedriveTool(
      db,
      "microsoft_onedrive_item_update",
      {
        connectedAccountId,
        itemId: uploaded.id,
        description: driveRoundtripUpdatedDescription(marker),
      },
      { trusted: true },
    );
    await approveMicrosoftOnedriveWrite({
      db,
      toolName: "microsoft_onedrive_item_update",
      write: descriptionWrite.write,
      decisionUserId,
    });
    metadata = (
      await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_item_get", {
        connectedAccountId,
        itemId: uploaded.id,
      })
    ).item;
    assert.equal(metadata.description, driveRoundtripUpdatedDescription(marker));

    // --- move (rename) ---
    const moveWrite = await typedMicrosoftOnedriveTool(
      db,
      "microsoft_onedrive_item_move",
      { connectedAccountId, itemId: uploaded.id, name: updatedFilename },
      { trusted: true },
    );
    await approveMicrosoftOnedriveWrite({
      db,
      toolName: "microsoft_onedrive_item_move",
      write: moveWrite.write,
      decisionUserId,
    });
    metadata = (
      await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_item_get", {
        connectedAccountId,
        itemId: uploaded.id,
      })
    ).item;
    assert.equal(metadata.name, updatedFilename);

    // --- copy ---
    const copyWrite = await typedMicrosoftOnedriveTool(
      db,
      "microsoft_onedrive_item_copy",
      {
        connectedAccountId,
        itemId: uploaded.id,
        targetParentId: childFolder.id,
        newName: copiedFilename,
      },
      { trusted: true },
    );
    const copyExecuted = await approveMicrosoftOnedriveWrite({
      db,
      toolName: "microsoft_onedrive_item_copy",
      write: copyWrite.write,
      decisionUserId,
    });
    const copied = {
      id: await resolveCopiedItemId({
        db,
        connectedAccountId,
        copyExecuted,
        targetParentId: childFolder.id,
        copiedFilename,
      }),
      kind: "file" as const,
      deleted: false,
    };
    resources.push(copied);
    metadata = (
      await typedMicrosoftOnedriveTool(db, "microsoft_onedrive_item_get", {
        connectedAccountId,
        itemId: copied.id,
      })
    ).item;
    assert.equal(metadata.name, copiedFilename);

    // --- sharing link create ---
    const sharingLinkWrite = await typedMicrosoftOnedriveTool(
      db,
      "microsoft_onedrive_sharing_link_create",
      {
        connectedAccountId,
        itemId: copied.id,
        type: "view",
        scope: "organization",
      },
      { trusted: true },
    );
    const sharingLinkExecuted = await approveMicrosoftOnedriveWrite({
      db,
      toolName: "microsoft_onedrive_sharing_link_create",
      write: sharingLinkWrite.write,
      decisionUserId,
    });
    const sharingLinkPermission = {
      id: executedProviderId(
        sharingLinkExecuted,
        "microsoft_onedrive_sharing_link_create",
      ),
      itemId: copied.id,
      deleted: false,
    };
    permissions.push(sharingLinkPermission);

    const permissionDeleteWrite = await typedMicrosoftOnedriveTool(
      db,
      "microsoft_onedrive_permission_delete",
      {
        connectedAccountId,
        itemId: copied.id,
        permissionId: sharingLinkPermission.id,
      },
      { trusted: true },
    );
    await approveMicrosoftOnedriveWrite({
      db,
      toolName: "microsoft_onedrive_permission_delete",
      write: permissionDeleteWrite.write,
      decisionUserId,
    });
    sharingLinkPermission.deleted = true;

    await cleanupCreatedMicrosoftOnedriveResources(cleanupState);
    coverage.assertComplete({ waived: CAPABILITY_E2E_WAIVED_TOOLS });

    console.log(
      JSON.stringify(
        {
          ok: true,
          marker,
          connectedAccountId,
          connectionId: connectedAccountId,
          contractTools: microsoftOnedriveToolContracts.map((contract) => contract.name),
          waivedTools: CAPABILITY_E2E_WAIVED_TOOLS,
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      await cleanupCreatedMicrosoftOnedriveResources(cleanupState);
    } finally {
      await trustedChannelCleanup();
    }
  }
});
