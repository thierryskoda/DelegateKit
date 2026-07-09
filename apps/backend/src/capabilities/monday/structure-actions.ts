import type { SupabaseServiceClient, TableRow } from "@ai-assistants/control-db";
import { requireMondayNango } from "./connection";
import {
  mondayLiveCreateBoard,
  mondayLiveCreateColumn,
  mondayLiveCreateGroup,
  mondayLiveDeleteBoard,
  mondayLiveDeleteColumn,
  mondayLiveDeleteGroup,
  mondayLiveRenameBoard,
  mondayLiveRenameColumn,
  mondayLiveRenameGroup,
} from "./live-graphql";
import { markProviderExecutionStarted } from "../../product/actions/execution/provider-runtime";
import {
  providerWriteRecordValue,
  recordProviderActionWriteReceipt,
} from "../../product/actions/execution/provider-write-receipts";
import type { ActionResult } from "../../product/actions/execution/types";
import {
  mondayBoardCreatePayloadSchema,
  mondayBoardDeletePayloadSchema,
  mondayBoardRenamePayloadSchema,
  mondayColumnCreatePayloadSchema,
  mondayColumnDeletePayloadSchema,
  mondayColumnRenamePayloadSchema,
  mondayGroupCreatePayloadSchema,
  mondayGroupDeletePayloadSchema,
  mondayGroupRenamePayloadSchema,
} from "./action-payload-schemas";
import type { z } from "zod";

async function mondayStructureResult(result: Record<string, unknown>): Promise<ActionResult> {
  return {
    status: "executed",
    provider: "monday",
    result,
  };
}

async function recordMondayStructureReceipt(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  binding: Awaited<ReturnType<typeof requireMondayNango>>,
  input: {
    toolName: string;
    externalResourceType: string;
    externalResourceId: string;
    operation: string;
    startedAt: string;
    result: Record<string, unknown>;
  },
): Promise<void> {
  await recordProviderActionWriteReceipt(db, action, binding, {
    providerKey: "monday",
    capabilitySlug: "monday",
    ...input,
  });
}

export async function executeMondayBoardCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayBoardCreatePayloadSchema>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const binding = await requireMondayNango(db, action.profile_id);
  const created = await mondayLiveCreateBoard({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    boardName: payload.boardName,
    boardKind: payload.boardKind,
    ...(payload.workspaceId === undefined ? {} : { workspaceId: payload.workspaceId }),
    ...(payload.description === undefined ? {} : { description: payload.description }),
    ...(payload.empty === undefined ? {} : { empty: payload.empty }),
  });
  const result = { boardId: created.boardId, name: created.name };
  await recordMondayStructureReceipt(db, action, binding, {
    toolName: "monday_board_create",
    externalResourceType: "board",
    externalResourceId: providerWriteRecordValue(result, "boardId") ?? payload.boardName,
    operation: "create",
    startedAt,
    result,
  });
  return mondayStructureResult(result);
}

export async function executeMondayBoardRename(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayBoardRenamePayloadSchema>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const binding = await requireMondayNango(db, action.profile_id);
  await mondayLiveRenameBoard({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    ...payload,
  });
  const result = { boardId: payload.boardId, name: payload.name };
  await recordMondayStructureReceipt(db, action, binding, {
    toolName: "monday_board_rename",
    externalResourceType: "board",
    externalResourceId: payload.boardId,
    operation: "rename",
    startedAt,
    result,
  });
  return mondayStructureResult(result);
}

export async function executeMondayBoardDelete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayBoardDeletePayloadSchema>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const binding = await requireMondayNango(db, action.profile_id);
  const deleted = await mondayLiveDeleteBoard({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    ...payload,
  });
  const result = { boardId: deleted.boardId };
  await recordMondayStructureReceipt(db, action, binding, {
    toolName: "monday_board_delete",
    externalResourceType: "board",
    externalResourceId: deleted.boardId,
    operation: "delete",
    startedAt,
    result,
  });
  return mondayStructureResult(result);
}

export async function executeMondayColumnCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayColumnCreatePayloadSchema>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const binding = await requireMondayNango(db, action.profile_id);
  const created = await mondayLiveCreateColumn({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    boardId: payload.boardId,
    title: payload.title,
    columnType: payload.columnType,
    ...(payload.description === undefined ? {} : { description: payload.description }),
    ...(payload.afterColumnId === undefined ? {} : { afterColumnId: payload.afterColumnId }),
  });
  await recordMondayStructureReceipt(db, action, binding, {
    toolName: "monday_column_create",
    externalResourceType: "column",
    externalResourceId: providerWriteRecordValue(created, "id") ?? payload.title,
    operation: "create",
    startedAt,
    result: created,
  });
  return mondayStructureResult(created);
}

export async function executeMondayColumnRename(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayColumnRenamePayloadSchema>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const binding = await requireMondayNango(db, action.profile_id);
  const renamed = await mondayLiveRenameColumn({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    ...payload,
  });
  await recordMondayStructureReceipt(db, action, binding, {
    toolName: "monday_column_rename",
    externalResourceType: "column",
    externalResourceId: providerWriteRecordValue(renamed, "id") ?? payload.columnId,
    operation: "rename",
    startedAt,
    result: renamed,
  });
  return mondayStructureResult(renamed);
}

export async function executeMondayColumnDelete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayColumnDeletePayloadSchema>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const binding = await requireMondayNango(db, action.profile_id);
  const deleted = await mondayLiveDeleteColumn({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    ...payload,
  });
  await recordMondayStructureReceipt(db, action, binding, {
    toolName: "monday_column_delete",
    externalResourceType: "column",
    externalResourceId: providerWriteRecordValue(deleted, "id") ?? payload.columnId,
    operation: "delete",
    startedAt,
    result: deleted,
  });
  return mondayStructureResult(deleted);
}

export async function executeMondayGroupCreate(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayGroupCreatePayloadSchema>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const binding = await requireMondayNango(db, action.profile_id);
  const created = await mondayLiveCreateGroup({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    boardId: payload.boardId,
    groupName: payload.groupName,
    ...(payload.relativeToGroupId === undefined
      ? {}
      : { relativeToGroupId: payload.relativeToGroupId }),
    ...(payload.positionRelativeMethod === undefined
      ? {}
      : { positionRelativeMethod: payload.positionRelativeMethod }),
    ...(payload.groupColor === undefined ? {} : { groupColor: payload.groupColor }),
  });
  await recordMondayStructureReceipt(db, action, binding, {
    toolName: "monday_group_create",
    externalResourceType: "group",
    externalResourceId: providerWriteRecordValue(created, "id") ?? payload.groupName,
    operation: "create",
    startedAt,
    result: created,
  });
  return mondayStructureResult(created);
}

export async function executeMondayGroupRename(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayGroupRenamePayloadSchema>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const binding = await requireMondayNango(db, action.profile_id);
  const renamed = await mondayLiveRenameGroup({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    ...payload,
  });
  await recordMondayStructureReceipt(db, action, binding, {
    toolName: "monday_group_rename",
    externalResourceType: "group",
    externalResourceId: providerWriteRecordValue(renamed, "id") ?? payload.groupId,
    operation: "rename",
    startedAt,
    result: renamed,
  });
  return mondayStructureResult(renamed);
}

export async function executeMondayGroupDelete(
  db: SupabaseServiceClient,
  action: TableRow<"profile_actions">,
  payload: z.infer<typeof mondayGroupDeletePayloadSchema>,
): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  await markProviderExecutionStarted(db, action);
  const binding = await requireMondayNango(db, action.profile_id);
  const deleted = await mondayLiveDeleteGroup({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db, binding },
    ...payload,
  });
  await recordMondayStructureReceipt(db, action, binding, {
    toolName: "monday_group_delete",
    externalResourceType: "group",
    externalResourceId: providerWriteRecordValue(deleted, "id") ?? payload.groupId,
    operation: "delete",
    startedAt,
    result: deleted,
  });
  return mondayStructureResult(deleted);
}
