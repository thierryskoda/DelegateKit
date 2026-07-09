import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { DomainError, domainCodes } from "@ai-assistants/errors";
import { markProviderExecutionStarted } from "../../product/actions/execution/provider-runtime";
import { recordProviderWriteReceipt } from "../../product/actions/execution/provider-write-receipts";
import type { ActionResult } from "../../product/actions/execution/types";
import { createNangoOAuthCredentialAccessor } from "../../integrations/provider-runtime/credentials";
import { prepareProfileArtifactDeliveryBytes } from "../../product/artifacts/artifact-service";
import { PROVIDER_BINARY_ARTIFACT_MAX_BYTES } from "../../product/artifacts/provider-binary-limits";
import type { z } from "zod";
import { requireMondayNango } from "./connection";
import {
  mondayLiveAddFileToColumn,
  mondayLiveAddFileToUpdate,
  mondayLiveArchiveItems,
  mondayLiveCreateItem,
  mondayLiveCreateSubitem,
  mondayLiveCreateUpdate,
  mondayLiveDeleteUpdate,
  mondayLiveEditUpdate,
  mondayLiveGetItem,
  mondayLiveMoveItemToGroup,
  mondayLiveRenameItem,
  mondayLiveUpdateItem,
} from "./live-graphql";
import {
  mondayItemArchivePayloadSchema,
  mondayItemCreatePayloadSchema,
  mondayItemMoveToGroupPayloadSchema,
  mondayItemUpdatePayloadSchema,
  mondayFileAddToColumnPayloadSchema,
  mondayFileAddToUpdatePayloadSchema,
  mondaySubitemArchivePayloadSchema,
  mondaySubitemCreatePayloadSchema,
  mondaySubitemUpdatePayloadSchema,
  mondayUpdateCreatePayloadSchema,
  mondayUpdateDeletePayloadSchema,
  mondayUpdateEditPayloadSchema,
} from "./action-payload-schemas";

function providerWriteStartedAt(action: TableRow<"profile_actions">): string {
  return action.provider_execution_started_at ?? new Date().toISOString();
}

async function writeReceipt(input: {
  db: SupabaseServiceClient;
  action: TableRow<"profile_actions">;
  binding: Awaited<ReturnType<typeof requireMondayNango>>;
  externalResourceId: string;
  externalResourceType?: string;
  operation: "create" | "update" | "archive" | "delete";
  startedAt: string;
  metadata: Record<string, unknown>;
}) {
  await recordProviderWriteReceipt(input.db, {
    profileId: input.action.profile_id,
    capabilityAccountLinkId: input.binding.link.id,
    connectedProviderAccountId: input.binding.account.id,
    providerKey: "monday",
    capabilitySlug: "monday",
    toolName: input.action.tool_name,
    profileActionId: input.action.id,
    externalResourceType: input.externalResourceType ?? "monday.item",
    externalResourceId: input.externalResourceId,
    operation: input.operation,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    metadata: input.metadata,
  });
}

export async function executeMondayUpdateCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayUpdateCreatePayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const providerResult = await mondayLiveCreateUpdate({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    providerItemId: payload.itemId,
    body: payload.body,
  });
  await writeReceipt({
    db,
    action,
    binding,
    externalResourceType: "monday.update",
    externalResourceId: providerResult.updateId,
    operation: "create",
    startedAt: providerWriteStartedAt(startedAction),
    metadata: {
      itemId: payload.itemId,
      providerResult,
    },
  });
  return {
    status: "executed",
    provider: "monday",
    result: {
      itemId: payload.itemId,
      updateId: providerResult.updateId,
      providerResult,
    },
  };
}

export async function executeMondayUpdateEdit(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayUpdateEditPayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const providerResult = await mondayLiveEditUpdate({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    updateId: payload.updateId,
    body: payload.body,
  });
  await writeReceipt({
    db,
    action,
    binding,
    externalResourceType: "monday.update",
    externalResourceId: providerResult.updateId,
    operation: "update",
    startedAt: providerWriteStartedAt(startedAction),
    metadata: {
      providerResult,
    },
  });
  return {
    status: "executed",
    provider: "monday",
    result: {
      updateId: providerResult.updateId,
      providerResult,
    },
  };
}

export async function executeMondayUpdateDelete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayUpdateDeletePayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const providerResult = await mondayLiveDeleteUpdate({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    updateId: payload.updateId,
  });
  await writeReceipt({
    db,
    action,
    binding,
    externalResourceType: "monday.update",
    externalResourceId: providerResult.updateId,
    operation: "delete",
    startedAt: providerWriteStartedAt(startedAction),
    metadata: {
      providerResult,
    },
  });
  return {
    status: "executed",
    provider: "monday",
    result: {
      updateId: providerResult.updateId,
      providerResult,
    },
  };
}

export async function executeMondayItemCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayItemCreatePayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const columnValues = payload.columnValues ?? {};
  const providerResult = await mondayLiveCreateItem({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    providerBoardId: payload.boardId,
    itemName: payload.itemName,
    providerFields: columnValues,
    ...(payload.groupId === undefined ? {} : { groupId: payload.groupId }),
  });
  await writeReceipt({
    db,
    action,
    binding,
    externalResourceId: providerResult.id,
    operation: "create",
    startedAt: providerWriteStartedAt(startedAction),
    metadata: {
      boardId: payload.boardId,
      groupId: payload.groupId ?? null,
      changedColumnIds: Object.keys(columnValues),
      providerResult,
    },
  });
  return {
    status: "executed",
    provider: "monday",
    result: {
      itemId: providerResult.id,
      boardId: payload.boardId,
      groupId: payload.groupId ?? null,
      changedColumnIds: Object.keys(columnValues),
      providerResult,
    },
  };
}

export async function executeMondaySubitemCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondaySubitemCreatePayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const columnValues = payload.columnValues ?? {};
  const providerResult = await mondayLiveCreateSubitem({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    parentItemId: payload.parentItemId,
    itemName: payload.itemName,
    providerFields: columnValues,
  });
  await writeReceipt({
    db,
    action,
    binding,
    externalResourceType: "monday.subitem",
    externalResourceId: providerResult.id,
    operation: "create",
    startedAt: providerWriteStartedAt(startedAction),
    metadata: {
      parentItemId: payload.parentItemId,
      changedColumnIds: Object.keys(columnValues),
      providerResult,
    },
  });
  return {
    status: "executed",
    provider: "monday",
    result: {
      parentItemId: payload.parentItemId,
      subitemId: providerResult.id,
      boardId: providerResult.boardId,
      changedColumnIds: Object.keys(columnValues),
      providerResult,
    },
  };
}

export async function executeMondayItemUpdate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayItemUpdatePayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const columnValues = payload.columnValues ?? {};
  const providerResults: Record<string, unknown> = {};
  if (Object.keys(columnValues).length > 0) {
    providerResults.columnValues = await mondayLiveUpdateItem({
      providerConfigKey: binding.nangoProviderConfigKey,
      connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
      providerBoardId: payload.boardId,
      providerItemId: payload.itemId,
      providerFields: columnValues,
    });
  }
  if (payload.itemName !== undefined) {
    providerResults.itemName = await mondayLiveRenameItem({
      providerConfigKey: binding.nangoProviderConfigKey,
      connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
      providerBoardId: payload.boardId,
      providerItemId: payload.itemId,
      itemName: payload.itemName,
    });
  }
  await writeReceipt({
    db,
    action,
    binding,
    externalResourceId: payload.itemId,
    operation: "update",
    startedAt: providerWriteStartedAt(startedAction),
    metadata: {
      boardId: payload.boardId,
      itemNameChanged: payload.itemName !== undefined,
      changedColumnIds: Object.keys(columnValues),
      providerResults,
    },
  });
  return {
    status: "executed",
    provider: "monday",
    result: {
      itemId: payload.itemId,
      boardId: payload.boardId,
      itemNameChanged: payload.itemName !== undefined,
      changedColumnIds: Object.keys(columnValues),
      providerResults,
    },
  };
}

export async function executeMondaySubitemUpdate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondaySubitemUpdatePayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const columnValues = payload.columnValues ?? {};
  const providerResults: Record<string, unknown> = {};
  let subitemBoardId: string | null = null;
  if (Object.keys(columnValues).length > 0) {
    const subitem = await mondayLiveGetItem({
      providerConfigKey: binding.nangoProviderConfigKey,
      connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
      providerItemId: payload.subitemId,
    });
    if (!subitem) {
      throw new DomainError(domainCodes.NOT_FOUND, `Monday subitem ${payload.subitemId} was not found.`);
    }
    subitemBoardId = subitem.boardId;
    providerResults.columnValues = await mondayLiveUpdateItem({
      providerConfigKey: binding.nangoProviderConfigKey,
      connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
      providerBoardId: subitem.boardId,
      providerItemId: payload.subitemId,
      providerFields: columnValues,
    });
  }
  if (payload.itemName !== undefined) {
    if (!subitemBoardId) {
      const subitem = await mondayLiveGetItem({
        providerConfigKey: binding.nangoProviderConfigKey,
        connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
        providerItemId: payload.subitemId,
      });
      if (!subitem) {
        throw new DomainError(domainCodes.NOT_FOUND, `Monday subitem ${payload.subitemId} was not found.`);
      }
      subitemBoardId = subitem.boardId;
    }
    providerResults.itemName = await mondayLiveRenameItem({
      providerConfigKey: binding.nangoProviderConfigKey,
      connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
      providerBoardId: subitemBoardId,
      providerItemId: payload.subitemId,
      itemName: payload.itemName,
    });
  }
  await writeReceipt({
    db,
    action,
    binding,
    externalResourceType: "monday.subitem",
    externalResourceId: payload.subitemId,
    operation: "update",
    startedAt: providerWriteStartedAt(startedAction),
    metadata: {
      itemNameChanged: payload.itemName !== undefined,
      changedColumnIds: Object.keys(columnValues),
      providerResults,
    },
  });
  return {
    status: "executed",
    provider: "monday",
    result: {
      subitemId: payload.subitemId,
      itemNameChanged: payload.itemName !== undefined,
      changedColumnIds: Object.keys(columnValues),
      providerResults,
    },
  };
}

export async function executeMondayItemArchive(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayItemArchivePayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const providerResult = await mondayLiveArchiveItems({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    targets: payload.targets.map((target) => ({ providerItemId: target.itemId })),
  });
  const failedItemIds = new Set(providerResult.failures.map((failure) => failure.providerItemId));
  await Promise.all(
    payload.targets
      .filter((target) => !failedItemIds.has(target.itemId))
      .map((target) =>
        writeReceipt({
          db,
          action,
          binding,
          externalResourceId: target.itemId,
          operation: "archive",
          startedAt: providerWriteStartedAt(startedAction),
          metadata: {
            itemId: target.itemId,
            providerResult,
          },
        }),
      ),
  );
  return {
    status: "executed",
    provider: "monday",
    result: {
      attempted: providerResult.attempted,
      failures: providerResult.failures,
    },
  };
}

export async function executeMondaySubitemArchive(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondaySubitemArchivePayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const providerResult = await mondayLiveArchiveItems({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    targets: payload.targets.map((target) => ({ providerItemId: target.subitemId })),
  });
  const failedSubitemIds = new Set(providerResult.failures.map((failure) => failure.providerItemId));
  await Promise.all(
    payload.targets
      .filter((target) => !failedSubitemIds.has(target.subitemId))
      .map((target) =>
        writeReceipt({
          db,
          action,
          binding,
          externalResourceType: "monday.subitem",
          externalResourceId: target.subitemId,
          operation: "archive",
          startedAt: providerWriteStartedAt(startedAction),
          metadata: {
            subitemId: target.subitemId,
            providerResult,
          },
        }),
      ),
  );
  return {
    status: "executed",
    provider: "monday",
    result: {
      attempted: providerResult.attempted,
      failures: providerResult.failures,
    },
  };
}

async function prepareMondayFileUpload(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  input: { profileFileId: string; expectedSha256?: string },
) {
  const delivery = await prepareProfileArtifactDeliveryBytes(db, {
    profileId: action.profile_id,
    artifactId: input.profileFileId,
    ...(input.expectedSha256 === undefined ? {} : { expectedSha256: input.expectedSha256 }),
  });
  if (delivery.bytes.byteLength > PROVIDER_BINARY_ARTIFACT_MAX_BYTES) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Artifact ${input.profileFileId} is too large to upload through provider tools.`,
    );
  }
  return {
    artifact: delivery.artifact,
    file: {
      filename: delivery.filename,
      mimeType: delivery.artifact.mime_type ?? "application/octet-stream",
      bytes: delivery.bytes,
    },
  };
}

export async function executeMondayFileAddToColumn(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayFileAddToColumnPayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const authHeaders = await createNangoOAuthCredentialAccessor(db, binding.account, "monday").getAuthHeaders();
  const upload = await prepareMondayFileUpload(db, action, {
    profileFileId: payload.profileFileId,
    ...(payload.expectedSha256 === undefined ? {} : { expectedSha256: payload.expectedSha256 }),
  });
  const providerResult = await mondayLiveAddFileToColumn({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    authHeaders,
    providerItemId: payload.itemId,
    columnId: payload.columnId,
    file: upload.file,
  });
  await writeReceipt({
    db,
    action,
    binding,
    externalResourceType: "monday.asset",
    externalResourceId: providerResult.assetId,
    operation: "create",
    startedAt: providerWriteStartedAt(startedAction),
    metadata: {
      itemId: payload.itemId,
      columnId: payload.columnId,
      artifactId: upload.artifact.id,
      providerResult,
    },
  });
  return {
    status: "executed",
    provider: "monday",
    result: {
      itemId: payload.itemId,
      columnId: payload.columnId,
      artifactId: upload.artifact.id,
      assetId: providerResult.assetId,
      providerResult,
    },
  };
}

export async function executeMondayFileAddToUpdate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayFileAddToUpdatePayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const authHeaders = await createNangoOAuthCredentialAccessor(db, binding.account, "monday").getAuthHeaders();
  const upload = await prepareMondayFileUpload(db, action, {
    profileFileId: payload.profileFileId,
    ...(payload.expectedSha256 === undefined ? {} : { expectedSha256: payload.expectedSha256 }),
  });
  const providerResult = await mondayLiveAddFileToUpdate({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    authHeaders,
    updateId: payload.updateId,
    file: upload.file,
  });
  await writeReceipt({
    db,
    action,
    binding,
    externalResourceType: "monday.asset",
    externalResourceId: providerResult.assetId,
    operation: "create",
    startedAt: providerWriteStartedAt(startedAction),
    metadata: {
      updateId: payload.updateId,
      artifactId: upload.artifact.id,
      providerResult,
    },
  });
  return {
    status: "executed",
    provider: "monday",
    result: {
      updateId: payload.updateId,
      artifactId: upload.artifact.id,
      assetId: providerResult.assetId,
      providerResult,
    },
  };
}

export async function executeMondayItemMoveToGroup(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayItemMoveToGroupPayloadSchema>,
): Promise<ActionResult> {
  const binding = await requireMondayNango(db, action.profile_id);
  const startedAction = await markProviderExecutionStarted(db, action);
  const providerResult = await mondayLiveMoveItemToGroup({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    providerItemId: payload.itemId,
    groupId: payload.groupId,
  });
  await writeReceipt({
    db,
    action,
    binding,
    externalResourceId: payload.itemId,
    operation: "update",
    startedAt: providerWriteStartedAt(startedAction),
    metadata: {
      boardId: payload.boardId,
      groupId: payload.groupId,
      providerResult,
    },
  });
  return {
    status: "executed",
    provider: "monday",
    result: {
      itemId: payload.itemId,
      boardId: payload.boardId,
      groupId: payload.groupId,
      providerResult,
    },
  };
}
