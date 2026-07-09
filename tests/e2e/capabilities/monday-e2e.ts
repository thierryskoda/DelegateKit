import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createSupabaseServiceClient, requireSupabaseData } from "@ai-assistants/control-db";
import { mondayToolContracts, type MondayToolName } from "@ai-assistants/monday-contracts";
import { approveAndExecuteProfileAction } from "../helpers/capability/approve-profile-action";
import { createCapabilityToolCoverage } from "../helpers/capability/capability-tool-coverage";
import {
  cleanupRenderedDocumentArtifacts,
  ensureProfileArtifactsBucket,
  seedDocumentArtifact,
} from "../helpers/fixtures/document-render-fixture";
import { createE2eFixtureScope } from "../helpers/fixtures/e2e-fixture-scope";
import { seedLiveMondayLeadForE2e } from "../helpers/fixtures/monday-live-provider-fixture";
import { createE2eRun, createMarker } from "../helpers/run/e2e-run";
import {
  buildCapabilityToolRequest,
  executeCapabilityTool,
  parseCapabilityToolOutput,
  withTrustedChannel,
} from "../helpers/run/execute-capability-backend-tool";
import { startBackend } from "../helpers/processes/start-backend";
import { attachE2eSupabase } from "../helpers/processes/attach-supabase";
import { requireTestingE2eAgent } from "../helpers/run/testing-launch-support";
import { TESTING_FIXTURE_CLIENT } from "../helpers/test-data/testing-realistic-data";
import { requireTestingProvidersLive } from "../helpers/provider-runtime/testing-provider-runtime";

const CAPABILITY_ID = "monday";
const coverage = createCapabilityToolCoverage(CAPABILITY_ID, mondayToolContracts);
const MONDAY_LIVE_READ_CONSISTENCY_TIMEOUT_MS = 30_000;
const MONDAY_LIVE_READ_CONSISTENCY_POLL_MS = 2_000;

/** Durable board/column/group mutations are not safe to create/delete inside the normal capability E2E. */
export const CAPABILITY_E2E_WAIVED_TOOLS = [
  "monday_board_create",
  "monday_board_rename",
  "monday_board_delete",
  "monday_column_create",
  "monday_column_rename",
  "monday_column_delete",
  "monday_group_create",
  "monday_group_rename",
  "monday_group_delete",
] as const satisfies readonly MondayToolName[];

async function typedMondayTool<const T extends MondayToolName>(
  db: ReturnType<typeof createSupabaseServiceClient>,
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
  if (options?.trusted) {
    request = withTrustedChannel(request, CAPABILITY_ID);
  }
  const result = await executeCapabilityTool(db, request);
  return parseCapabilityToolOutput(result, mondayToolContracts, toolName);
}

type MondayUpdateListData = Awaited<ReturnType<typeof typedMondayTool<"monday_update_list">>>;
type MondayUpdate = MondayUpdateListData["updates"][number];

async function waitForMondayUpdateContaining(input: {
  db: ReturnType<typeof createSupabaseServiceClient>;
  itemId: string;
  marker: string;
}): Promise<MondayUpdate> {
  const deadline = Date.now() + MONDAY_LIVE_READ_CONSISTENCY_TIMEOUT_MS;
  let lastUpdateCount = 0;
  while (Date.now() < deadline) {
    const updateList = await typedMondayTool(input.db, "monday_update_list", {
      itemId: input.itemId,
      includeReplies: true,
      limit: 25,
    });
    lastUpdateCount = updateList.updates.length;
    const postedUpdate = updateList.updates.find((update) =>
      (update.textBody ?? update.body ?? "").includes(input.marker),
    );
    if (postedUpdate) return postedUpdate;
    await delay(MONDAY_LIVE_READ_CONSISTENCY_POLL_MS);
  }
  assert.fail(
    `expected monday_update_create to post a readable item update containing ${input.marker}; last update count=${lastUpdateCount}`,
  );
}

test("Monday capability tools: raw board discovery and item lifecycle writes.", async (t) => {
  requireTestingE2eAgent();
  const run = await createE2eRun(t, { id: CAPABILITY_ID });
  const supabase = await attachE2eSupabase(run);
  const db = createSupabaseServiceClient();
  await requireTestingProvidersLive(db, [CAPABILITY_ID]);
  const fixtures = createE2eFixtureScope({ run });
  const seededArtifacts: Array<{ id: string; storage_bucket: string; storage_key: string }> = [];
  let fixturesCleaned = false;
  const cleanupFixtures = async () => {
    if (fixturesCleaned) return;
    fixturesCleaned = true;
    await fixtures.cleanup();
  };
  run.cleanup.add(cleanupFixtures);

  const marker = createMarker("testing-monday");
  const seeded = await seedLiveMondayLeadForE2e(fixtures, db, {
    itemTitle: `Jordan Rowan ${marker}`,
  });
  const secondMarker = createMarker("testing-monday-page");
  const secondSeeded = await seedLiveMondayLeadForE2e(fixtures, db, {
    itemTitle: `Jordan Rowan ${secondMarker}`,
  });

  try {
    await startBackend(run, { supabase });
    const profileResult = await db.from("profiles").select("user_id").eq("id", "testing").single();
    const testingProfile = requireSupabaseData(
      "Load testing profile user for Monday approval decisions",
      profileResult.data,
      profileResult.error,
    );
    assert.ok(testingProfile.user_id, "testing profile must have a portal user_id");
    const approveWriteAction = async (actionId: string, label: string) => {
      const actionRow = await db.from("profile_actions").select().eq("id", actionId).single();
      const action = requireSupabaseData(label, actionRow.data, actionRow.error);
      await approveAndExecuteProfileAction({
        db,
        action,
        decisionUserId: testingProfile.user_id,
      });
      return action;
    };

    const workspaceData = await typedMondayTool(db, "monday_workspace_list", {});
    assert.ok(Array.isArray(workspaceData.workspaces), "workspace list should return an array");

    const boardListData = await typedMondayTool(db, "monday_board_list", { limit: 50 });
    assert.ok(
      boardListData.boards.some((board) => board.boardId === seeded.boardId),
      `monday_board_list must include seeded board ${seeded.boardId}`,
    );

    const boardData = await typedMondayTool(db, "monday_board_get", { boardId: seeded.boardId });
    assert.equal(boardData.board.boardId, seeded.boardId);
    assert.ok(
      boardData.board.columns.some((column) => column.columnId === seeded.columnIds.company),
      "monday_board_get must expose the seeded company column id",
    );
    assert.ok(
      boardData.board.groups.length > 1,
      "testing Monday board needs at least two groups for monday_item_move_to_group coverage",
    );

    const typeData = await typedMondayTool(db, "monday_column_type_list", {});
    assert.ok(
      typeData.columnTypes.some((columnType) => columnType.columnType === "status"),
      "column type hints should include status",
    );

    const listData = await typedMondayTool(db, "monday_item_list", {
      boardId: seeded.boardId,
      titleContains: marker,
      limit: 10,
    });
    assert.ok(
      listData.items.some((item) => item.itemId === seeded.itemId),
      `expected list to include seeded item ${seeded.itemId}`,
    );
    assert.equal(
      listData.nextCursor,
      null,
      "locally filtered Monday item lists should not return an unsafe provider cursor",
    );

    const serverFilteredData = await typedMondayTool(db, "monday_item_list", {
      boardId: seeded.boardId,
      filters: [
        {
          columnId: seeded.columnIds.company,
          compareValue: [TESTING_FIXTURE_CLIENT.company.name],
          operator: "any_of",
        },
      ],
      orderBy: [{ columnId: seeded.columnIds.dealValue, direction: "desc" }],
      limit: 10,
    });
    assert.ok(
      serverFilteredData.items.some((item) => item.itemId === seeded.itemId),
      "server-side Monday item filters should include the seeded item",
    );

    const invalidFilterResult = await executeCapabilityTool(
      db,
      withTrustedChannel(
        buildCapabilityToolRequest({
          capabilityId: CAPABILITY_ID,
          toolName: "monday_item_list",
          params: {
            boardId: seeded.boardId,
            filters: [{ columnId: "not_a_real_column", compareValue: ["x"], operator: "any_of" }],
          },
        }),
        CAPABILITY_ID,
      ),
    );
    assert.ok("error" in invalidFilterResult);
    assert.match(invalidFilterResult.error.message, /Unknown Monday filter column id/);

    const firstPageData = await typedMondayTool(db, "monday_item_list", {
      boardId: seeded.boardId,
      limit: 1,
    });
    assert.equal(firstPageData.items.length, 1);
    assert.ok(firstPageData.nextCursor, "limit:1 item list should return nextCursor");
    const secondPageData = await typedMondayTool(db, "monday_item_list", {
      boardId: seeded.boardId,
      cursor: firstPageData.nextCursor,
      limit: 1,
    });
    assert.equal(secondPageData.items.length, 1);
    assert.notEqual(secondPageData.items[0]?.itemId, firstPageData.items[0]?.itemId);

    const itemData = await typedMondayTool(db, "monday_item_get", { itemId: seeded.itemId });
    assert.equal(itemData.item.itemId, seeded.itemId);
    assert.equal(itemData.item.boardId, seeded.boardId);
    assert.ok(itemData.item.columnValuesById[seeded.columnIds.company]);

    const updateListBefore = await typedMondayTool(db, "monday_update_list", {
      itemId: seeded.itemId,
      includeReplies: true,
      limit: 10,
    });
    assert.equal(updateListBefore.itemId, seeded.itemId);
    assert.equal(updateListBefore.page, 1);
    assert.equal(updateListBefore.limit, 10);

    const updateBody = `Jun 2 - Spoke with Jordan Rowan about the renovation scope ${marker}.`;
    const updateCreateData = await typedMondayTool(
      db,
      "monday_update_create",
      {
        itemId: seeded.itemId,
        body: updateBody,
      },
      { trusted: true },
    );
    const updateCreateActionRow = await db
      .from("profile_actions")
      .select()
      .eq("id", updateCreateData.write.actionId)
      .single();
    const updateCreateAction = requireSupabaseData(
      `Load Monday update/comment write action ${updateCreateData.write.actionId}`,
      updateCreateActionRow.data,
      updateCreateActionRow.error,
    );
    await approveAndExecuteProfileAction({
      db,
      action: updateCreateAction,
      decisionUserId: testingProfile.user_id,
    });

    const updateListAfter = await typedMondayTool(db, "monday_update_list", {
      itemId: seeded.itemId,
      includeReplies: true,
      limit: 25,
    });
    const postedUpdate =
      updateListAfter.updates.find((update) =>
        (update.textBody ?? update.body ?? "").includes(marker),
      ) ??
      (await waitForMondayUpdateContaining({
        db,
        itemId: seeded.itemId,
        marker,
      }));
    const updateReceiptRow = await db
      .from("provider_write_receipts")
      .select()
      .eq("profile_action_id", updateCreateAction.id)
      .eq("external_resource_type", "monday.update")
      .eq("external_resource_id", postedUpdate.updateId)
      .eq("operation", "create")
      .single();
    requireSupabaseData(
      `Load Monday update/comment write receipt for ${postedUpdate.updateId}`,
      updateReceiptRow.data,
      updateReceiptRow.error,
    );

    const subitemsBefore = await typedMondayTool(db, "monday_subitem_list", {
      parentItemId: seeded.itemId,
      limit: 25,
    });
    assert.equal(subitemsBefore.parentItem.itemId, seeded.itemId);

    const subitemTitle = `Renovation scope review ${marker}`;
    const subitemCreateData = await typedMondayTool(
      db,
      "monday_subitem_create",
      {
        parentItemId: seeded.itemId,
        itemName: subitemTitle,
      },
      { trusted: true },
    );
    await approveWriteAction(
      subitemCreateData.write.actionId,
      `Load Monday subitem create action ${subitemCreateData.write.actionId}`,
    );

    const subitemsAfterCreate = await typedMondayTool(db, "monday_subitem_list", {
      parentItemId: seeded.itemId,
      limit: 50,
    });
    const createdSubitem = subitemsAfterCreate.subitems.find(
      (subitem) => subitem.name === subitemTitle,
    );
    assert.ok(createdSubitem, "expected monday_subitem_create to produce a readable subitem");

    const subitemUpdatedTitle = `Renovation scope reviewed ${marker}`;
    const subitemUpdateData = await typedMondayTool(
      db,
      "monday_subitem_update",
      {
        subitemId: createdSubitem.itemId,
        itemName: subitemUpdatedTitle,
      },
      { trusted: true },
    );
    await approveWriteAction(
      subitemUpdateData.write.actionId,
      `Load Monday subitem update action ${subitemUpdateData.write.actionId}`,
    );

    const subitemArchiveData = await typedMondayTool(
      db,
      "monday_subitem_archive",
      { targets: [{ subitemId: createdSubitem.itemId }] },
      { trusted: true },
    );
    await approveWriteAction(
      subitemArchiveData.write.actionId,
      `Load Monday subitem archive action ${subitemArchiveData.write.actionId}`,
    );

    await ensureProfileArtifactsBucket(db);
    const uploadArtifact = await seedDocumentArtifact(db, {
      profileId: "testing",
      marker,
      filename: `monday-note-${marker}.txt`,
      artifactType: "monday.e2e.attachment",
      mimeType: "text/plain",
      bytes: new TextEncoder().encode(`Jordan Rowan Monday attachment ${marker}`),
    });
    seededArtifacts.push(uploadArtifact);

    const updateFileData = await typedMondayTool(
      db,
      "monday_file_add_to_update",
      {
        updateId: postedUpdate.updateId,
        artifactId: uploadArtifact.id,
        expectedSha256: uploadArtifact.sha256,
      },
      { trusted: true },
    );
    const updateFileAction = await approveWriteAction(
      updateFileData.write.actionId,
      `Load Monday update file action ${updateFileData.write.actionId}`,
    );
    const updateFileReceiptRow = await db
      .from("provider_write_receipts")
      .select()
      .eq("profile_action_id", updateFileAction.id)
      .eq("external_resource_type", "monday.asset")
      .eq("operation", "create")
      .single();
    requireSupabaseData(
      `Load Monday update file write receipt for ${postedUpdate.updateId}`,
      updateFileReceiptRow.data,
      updateFileReceiptRow.error,
    );

    const editedUpdateBody = `Jun 2 - Edited Jordan Rowan renovation note ${marker}.`;
    const updateEditData = await typedMondayTool(
      db,
      "monday_update_edit",
      {
        updateId: postedUpdate.updateId,
        body: editedUpdateBody,
      },
      { trusted: true },
    );
    const updateEditAction = await approveWriteAction(
      updateEditData.write.actionId,
      `Load Monday update edit action ${updateEditData.write.actionId}`,
    );
    const updateListAfterEdit = await typedMondayTool(db, "monday_update_list", {
      itemId: seeded.itemId,
      includeReplies: true,
      limit: 25,
    });
    const editedUpdate = updateListAfterEdit.updates.find(
      (update) => update.updateId === postedUpdate.updateId,
    );
    assert.ok(editedUpdate, "expected edited Monday update to remain readable");
    assert.match(
      editedUpdate.textBody ?? editedUpdate.body ?? "",
      /Edited Jordan Rowan renovation note/,
    );
    const updateEditReceiptRow = await db
      .from("provider_write_receipts")
      .select()
      .eq("profile_action_id", updateEditAction.id)
      .eq("external_resource_type", "monday.update")
      .eq("external_resource_id", postedUpdate.updateId)
      .eq("operation", "update")
      .single();
    requireSupabaseData(
      `Load Monday update edit write receipt for ${postedUpdate.updateId}`,
      updateEditReceiptRow.data,
      updateEditReceiptRow.error,
    );

    const updateDeleteData = await typedMondayTool(
      db,
      "monday_update_delete",
      { updateId: postedUpdate.updateId },
      { trusted: true },
    );
    const updateDeleteAction = await approveWriteAction(
      updateDeleteData.write.actionId,
      `Load Monday update delete action ${updateDeleteData.write.actionId}`,
    );
    const updateListAfterDelete = await typedMondayTool(db, "monday_update_list", {
      itemId: seeded.itemId,
      includeReplies: true,
      limit: 25,
    });
    assert.equal(
      updateListAfterDelete.updates.some((update) => update.updateId === postedUpdate.updateId),
      false,
      "expected deleted Monday update to disappear from the item update list",
    );
    const updateDeleteReceiptRow = await db
      .from("provider_write_receipts")
      .select()
      .eq("profile_action_id", updateDeleteAction.id)
      .eq("external_resource_type", "monday.update")
      .eq("external_resource_id", postedUpdate.updateId)
      .eq("operation", "delete")
      .single();
    requireSupabaseData(
      `Load Monday update delete write receipt for ${postedUpdate.updateId}`,
      updateDeleteReceiptRow.data,
      updateDeleteReceiptRow.error,
    );

    const fileColumn = boardData.board.columns.find((column) => column.type === "file");
    if (fileColumn) {
      const columnFileData = await typedMondayTool(
        db,
        "monday_file_add_to_column",
        {
          itemId: seeded.itemId,
          columnId: fileColumn.columnId,
          artifactId: uploadArtifact.id,
          expectedSha256: uploadArtifact.sha256,
        },
        { trusted: true },
      );
      await approveWriteAction(
        columnFileData.write.actionId,
        `Load Monday file column action ${columnFileData.write.actionId}`,
      );
    } else {
      coverage.exercise("monday_file_add_to_column");
      const invalidFileColumnResult = await executeCapabilityTool(
        db,
        withTrustedChannel(
          buildCapabilityToolRequest({
            capabilityId: CAPABILITY_ID,
            toolName: "monday_file_add_to_column",
            params: {
              itemId: seeded.itemId,
              columnId: seeded.columnIds.company,
              artifactId: uploadArtifact.id,
              expectedSha256: uploadArtifact.sha256,
            },
          }),
          CAPABILITY_ID,
        ),
      );
      assert.ok("error" in invalidFileColumnResult);
      assert.match(invalidFileColumnResult.error.message, /not a file column/);
    }

    const invalidColumnResult = await executeCapabilityTool(
      db,
      withTrustedChannel(
        buildCapabilityToolRequest({
          capabilityId: CAPABILITY_ID,
          toolName: "monday_item_update",
          params: {
            boardId: seeded.boardId,
            itemId: seeded.itemId,
            columnValues: { not_a_real_column: "x" },
          },
        }),
        CAPABILITY_ID,
      ),
    );
    assert.ok("error" in invalidColumnResult);
    assert.match(invalidColumnResult.error.message, /Unknown Monday column id/);

    const createTitle = `Jordan Rowan capability ${marker}`;
    const createData = await typedMondayTool(
      db,
      "monday_item_create",
      {
        boardId: seeded.boardId,
        itemName: createTitle,
        columnValues: seeded.columnValues,
      },
      { trusted: true },
    );
    const createActionRow = await db
      .from("profile_actions")
      .select()
      .eq("id", createData.write.actionId)
      .single();
    const createAction = requireSupabaseData(
      `Load Monday create write action ${createData.write.actionId}`,
      createActionRow.data,
      createActionRow.error,
    );
    await approveAndExecuteProfileAction({
      db,
      action: createAction,
      decisionUserId: testingProfile.user_id,
    });

    const createdList = await typedMondayTool(db, "monday_item_list", {
      boardId: seeded.boardId,
      titleContains: marker,
      limit: 20,
    });
    const createdItem = createdList.items.find((item) => item.name === createTitle);
    assert.ok(createdItem, "expected monday_item_create to produce a searchable item");

    const updatedCompany = `${TESTING_FIXTURE_CLIENT.company.name} ${marker}`;
    const updateData = await typedMondayTool(
      db,
      "monday_item_update",
      {
        boardId: seeded.boardId,
        itemId: seeded.itemId,
        columnValues: { [seeded.columnIds.company]: updatedCompany },
      },
      { trusted: true },
    );
    const updateActionRow = await db
      .from("profile_actions")
      .select()
      .eq("id", updateData.write.actionId)
      .single();
    const updateAction = requireSupabaseData(
      `Load Monday update write action ${updateData.write.actionId}`,
      updateActionRow.data,
      updateActionRow.error,
    );
    await approveAndExecuteProfileAction({
      db,
      action: updateAction,
      decisionUserId: testingProfile.user_id,
    });

    const destinationGroup =
      boardData.board.groups.find((group) => group.groupId !== itemData.item.groupId) ??
      boardData.board.groups[0];
    assert.ok(destinationGroup, "testing Monday board must have a destination group");
    const moveData = await typedMondayTool(
      db,
      "monday_item_move_to_group",
      {
        boardId: seeded.boardId,
        itemId: secondSeeded.itemId,
        groupId: destinationGroup.groupId,
      },
      { trusted: true },
    );
    const moveActionRow = await db
      .from("profile_actions")
      .select()
      .eq("id", moveData.write.actionId)
      .single();
    const moveAction = requireSupabaseData(
      `Load Monday move write action ${moveData.write.actionId}`,
      moveActionRow.data,
      moveActionRow.error,
    );
    await approveAndExecuteProfileAction({
      db,
      action: moveAction,
      decisionUserId: testingProfile.user_id,
    });

    const archiveData = await typedMondayTool(
      db,
      "monday_item_archive",
      { targets: [{ itemId: createdItem.itemId }] },
      { trusted: true },
    );
    const archiveActionRow = await db
      .from("profile_actions")
      .select()
      .eq("id", archiveData.write.actionId)
      .single();
    const archiveAction = requireSupabaseData(
      `Load Monday archive write action ${archiveData.write.actionId}`,
      archiveActionRow.data,
      archiveActionRow.error,
    );
    await approveAndExecuteProfileAction({
      db,
      action: archiveAction,
      decisionUserId: testingProfile.user_id,
    });
    const archiveReceiptRow = await db
      .from("provider_write_receipts")
      .select()
      .eq("profile_action_id", archiveAction.id)
      .eq("external_resource_id", createdItem.itemId)
      .eq("operation", "archive")
      .single();
    requireSupabaseData(
      `Load Monday archive write receipt for ${createdItem.itemId}`,
      archiveReceiptRow.data,
      archiveReceiptRow.error,
    );

    coverage.assertComplete({ waived: CAPABILITY_E2E_WAIVED_TOOLS });

    console.log(
      JSON.stringify(
        {
          ok: true,
          capabilityId: CAPABILITY_ID,
          marker,
          boardId: seeded.boardId,
          seededItemId: seeded.itemId,
          secondItemId: secondSeeded.itemId,
          createdItemId: createdItem.itemId,
          movedGroupId: destinationGroup.groupId,
          contractTools: mondayToolContracts.map((contract) => contract.name),
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupRenderedDocumentArtifacts(db, seededArtifacts);
    await cleanupFixtures();
  }
});
