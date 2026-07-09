import { DomainError, domainCodes } from "@ai-assistants/errors";
import { mondayExternalWriteOutputSchema } from "@ai-assistants/monday-contracts/schemas";
import {
  change,
  changes,
  detail,
  field,
  fields,
  preview,
  recordValue,
  section,
  textValue,
} from "../../product/actions/external-write-contracts/connect-detail";
import {
  buildExternalWriteAgentResult,
  lifecycleResultSentence,
  providerErrorMessage,
  quote,
  textField,
} from "../../product/actions/external-write-contracts/agent-result";
import { requireProfileArtifact } from "../../product/artifacts/artifact-validation";
import { PROVIDER_BINARY_ARTIFACT_MAX_BYTES } from "../../product/artifacts/provider-binary-limits";
import {
  defineExternalWriteActionContract,
  type BuildWritePlanContext,
  type ExternalWriteActionContract,
} from "../../product/actions/external-write-contracts/types";
import { requireMondayNango } from "./connection";
import { mondayLiveGetBoard, mondayLiveGetItem } from "./live-graphql";
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
import {
  executeMondayBoardCreate,
  executeMondayBoardDelete,
  executeMondayBoardRename,
  executeMondayColumnCreate,
  executeMondayColumnDelete,
  executeMondayColumnRename,
  executeMondayGroupCreate,
  executeMondayGroupDelete,
  executeMondayGroupRename,
} from "./structure-actions";
import {
  executeMondayItemArchive,
  executeMondayItemCreate,
  executeMondayFileAddToColumn,
  executeMondayFileAddToUpdate,
  executeMondayItemMoveToGroup,
  executeMondayItemUpdate,
  executeMondaySubitemArchive,
  executeMondaySubitemCreate,
  executeMondaySubitemUpdate,
  executeMondayUpdateCreate,
  executeMondayUpdateDelete,
  executeMondayUpdateEdit,
} from "./item-actions";
import { mondayProviderId } from "./graphql-proxy";

type MondayExternalWriteToolName =
  | "monday_item_create"
  | "monday_item_update"
  | "monday_item_archive"
  | "monday_item_move_to_group"
  | "monday_update_create"
  | "monday_update_edit"
  | "monday_update_delete"
  | "monday_subitem_create"
  | "monday_subitem_update"
  | "monday_subitem_archive"
  | "monday_file_add_to_column"
  | "monday_file_add_to_update"
  | "monday_board_create"
  | "monday_board_rename"
  | "monday_board_delete"
  | "monday_column_create"
  | "monday_column_rename"
  | "monday_column_delete"
  | "monday_group_create"
  | "monday_group_rename"
  | "monday_group_delete";

function packFromParams(
  params: object,
  title: string,
  summary: string,
  extra?: Record<string, unknown>,
): {
  reviewTitle: string;
  reviewSummary: string;
  reviewPayload: Record<string, unknown>;
} {
  return {
    reviewTitle: title,
    reviewSummary: summary,
    reviewPayload: {
      type: "monday_approval",
      proposedChange: params,
      evidence: summary,
      ...(extra ?? {}),
    },
  };
}

function mondayChangeRows(action: { review_payload: unknown }) {
  const review = recordValue(action.review_payload);
  const rawChanges = Array.isArray(review?.changes) ? review.changes : [];
  return changes(
    rawChanges.map((item) => {
      const row = recordValue(item);
      if (!row) return null;
      return change(
        textValue(row.label) ?? textValue(row.field) ?? textValue(row.key) ?? "Change",
        row.before,
        row.after ?? row.value,
      );
    }),
  );
}

function mondayDetail(
  kind: MondayExternalWriteToolName,
  headline: string,
  action: { review_payload: unknown },
  payload: Record<string, unknown>,
) {
  return detail(
    kind,
    headline,
    preview("View details", [
      section({
        title: "Monday",
        fields: fields([
          field("Board id", payload.boardId),
          field("Item id", payload.itemId),
          field("Parent item id", payload.parentItemId),
          field("Subitem id", payload.subitemId),
          field("Update id", payload.updateId),
          field("Group id", payload.groupId),
          field("Column id", payload.columnId),
          field("Profile file id", payload.profileFileId),
          field(
            "Name",
            payload.boardName ?? payload.itemName ?? payload.groupName ?? payload.title,
          ),
          field("New name", payload.name),
          field("Type", payload.columnType),
          field("Body", payload.body),
        ]),
        changes: mondayChangeRows(action),
      }),
    ]),
  );
}

function mondayTarget(toolName: MondayExternalWriteToolName, payload: Record<string, unknown>) {
  if (toolName.startsWith("monday_item")) {
    return textField(payload.itemName) ?? "the Monday item";
  }
  if (toolName === "monday_update_create") {
    return "the Monday item";
  }
  if (toolName === "monday_update_edit" || toolName === "monday_update_delete") {
    return "the Monday update";
  }
  if (toolName.startsWith("monday_subitem")) {
    return textField(payload.itemName) ?? "the Monday subitem";
  }
  if (toolName === "monday_file_add_to_column") {
    return "the Monday item";
  }
  if (toolName === "monday_file_add_to_update") {
    return "the Monday update";
  }
  const name =
    textField(payload.boardName) ??
    textField(payload.name) ??
    textField(payload.title) ??
    textField(payload.groupName);
  return name ? quote(name) : "the Monday resource";
}

function mondayPhrases(toolName: MondayExternalWriteToolName) {
  if (toolName === "monday_item_create")
    return { past: "created", infinitive: "create", noun: "Monday item" };
  if (toolName === "monday_item_update")
    return { past: "updated", infinitive: "update", noun: "Monday item" };
  if (toolName === "monday_item_archive")
    return { past: "archived", infinitive: "archive", noun: "Monday items" };
  if (toolName === "monday_item_move_to_group")
    return { past: "moved", infinitive: "move", noun: "Monday item" };
  if (toolName === "monday_update_create")
    return { past: "posted", infinitive: "post", noun: "Monday update" };
  if (toolName === "monday_update_edit")
    return { past: "edited", infinitive: "edit", noun: "Monday update" };
  if (toolName === "monday_update_delete")
    return { past: "deleted", infinitive: "delete", noun: "Monday update" };
  if (toolName === "monday_subitem_create")
    return { past: "created", infinitive: "create", noun: "Monday subitem" };
  if (toolName === "monday_subitem_update")
    return { past: "updated", infinitive: "update", noun: "Monday subitem" };
  if (toolName === "monday_subitem_archive")
    return { past: "archived", infinitive: "archive", noun: "Monday subitems" };
  if (toolName === "monday_file_add_to_column")
    return { past: "uploaded", infinitive: "upload", noun: "Monday file" };
  if (toolName === "monday_file_add_to_update")
    return { past: "attached", infinitive: "attach", noun: "Monday file" };
  if (toolName === "monday_board_create")
    return { past: "created", infinitive: "create", noun: "Monday board" };
  if (toolName === "monday_board_rename")
    return { past: "renamed", infinitive: "rename", noun: "Monday board" };
  if (toolName === "monday_board_delete")
    return { past: "deleted", infinitive: "delete", noun: "Monday board" };
  if (toolName === "monday_column_create")
    return { past: "created", infinitive: "create", noun: "Monday column" };
  if (toolName === "monday_column_rename")
    return { past: "renamed", infinitive: "rename", noun: "Monday column" };
  if (toolName === "monday_column_delete")
    return { past: "deleted", infinitive: "delete", noun: "Monday column" };
  if (toolName === "monday_group_create")
    return { past: "created", infinitive: "create", noun: "Monday group" };
  if (toolName === "monday_group_rename")
    return { past: "renamed", infinitive: "rename", noun: "Monday group" };
  return { past: "deleted", infinitive: "delete", noun: "Monday group" };
}

function buildMondayAgentResult(
  toolName: MondayExternalWriteToolName,
  input: Parameters<ExternalWriteActionContract["buildAgentResult"]>[0],
) {
  return buildExternalWriteAgentResult({
    action: input.action,
    payload: input.payload as Record<string, unknown>,
    resultPayload: input.resultPayload,
    providerError: input.providerError,
    message: ({ action, payload, status, providerError }) => {
      const target = mondayTarget(toolName, payload);
      const phrase = mondayPhrases(toolName);
      const completed = `${phrase.noun} ${phrase.past} ${target}.`;
      const pending = `${phrase.noun} ${phrase.infinitive} ${target} is waiting for review.`;
      const processing = `${phrase.noun} ${phrase.infinitive} ${target} is processing.`;
      const failed = `Could not ${phrase.infinitive} ${phrase.noun.toLowerCase()} ${target}.`;
      const unknown = `${phrase.noun} ${target} may or may not have been ${phrase.past}.`;
      const failure = providerErrorMessage(providerError);
      return lifecycleResultSentence({
        status,
        actionId: action.id,
        completed,
        needsReview: pending,
        processing,
        failed: failure ? `${failed} ${failure}` : failed,
        unknown: failure ? `${unknown} ${failure}` : unknown,
      });
    },
  });
}

async function requireLiveBoard(ctx: BuildWritePlanContext, boardId: string) {
  const binding = await requireMondayNango(ctx.db, ctx.profileId);
  const board = await mondayLiveGetBoard({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: ctx.db, binding },
    providerBoardId: boardId,
  });
  if (!board)
    throw new DomainError(domainCodes.NOT_FOUND, `Monday board ${boardId} was not found.`);
  return board;
}

async function assertBoardColumns(
  ctx: BuildWritePlanContext,
  input: {
    boardId: string;
    columnValues?: Record<string, unknown>;
    groupId?: string;
  },
) {
  const board = await requireLiveBoard(ctx, input.boardId);
  const boardId = mondayProviderId(board);
  if (boardId !== input.boardId) {
    throw new DomainError(
      domainCodes.INTERNAL,
      `Monday returned board ${boardId ?? "unknown"} for requested board ${input.boardId}.`,
    );
  }
  const columnIds = new Set(
    (board.columns ?? []).flatMap((column) => (column.id ? [column.id] : [])),
  );
  const unknownColumns = Object.keys(input.columnValues ?? {}).filter(
    (columnId) => !columnIds.has(columnId),
  );
  if (unknownColumns.length > 0) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Unknown Monday column id(s) for board ${input.boardId}: ${unknownColumns.join(", ")}. Call monday_board_get and use exact column ids.`,
    );
  }
  if (input.groupId !== undefined) {
    const groupIds = new Set(
      (board.groups ?? []).flatMap((group) => {
        const groupId = mondayProviderId(group);
        return groupId ? [groupId] : [];
      }),
    );
    if (!groupIds.has(input.groupId)) {
      throw new DomainError(
        domainCodes.BAD_REQUEST,
        `Unknown Monday group id ${input.groupId} for board ${input.boardId}. Call monday_board_get and use a group id from that board.`,
      );
    }
  }
}

async function assertItemOnBoard(ctx: BuildWritePlanContext, boardId: string, itemId: string) {
  const binding = await requireMondayNango(ctx.db, ctx.profileId);
  const item = await mondayLiveGetItem({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: ctx.db, binding },
    providerItemId: itemId,
  });
  if (!item) throw new DomainError(domainCodes.NOT_FOUND, `Monday item ${itemId} was not found.`);
  if (item.boardId !== boardId) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Monday item ${itemId} belongs to board ${item.boardId}, not board ${boardId}.`,
    );
  }
}

async function requireLiveItem(ctx: BuildWritePlanContext, itemId: string) {
  const binding = await requireMondayNango(ctx.db, ctx.profileId);
  const item = await mondayLiveGetItem({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: ctx.db, binding },
    providerItemId: itemId,
  });
  if (!item) throw new DomainError(domainCodes.NOT_FOUND, `Monday item ${itemId} was not found.`);
  return item;
}

async function assertProfileArtifact(
  ctx: BuildWritePlanContext,
  input: {
    profileFileId: string;
    expectedSha256?: string;
  },
) {
  const { artifact } = await requireProfileArtifact(ctx.db, {
    profileId: ctx.profileId,
    artifactId: input.profileFileId,
    ...(input.expectedSha256 === undefined ? {} : { expectedSha256: input.expectedSha256 }),
  });
  if (artifact.byte_size !== null && artifact.byte_size > PROVIDER_BINARY_ARTIFACT_MAX_BYTES) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Artifact ${input.profileFileId} is too large to upload through provider tools.`,
    );
  }
  return artifact;
}

async function assertFileColumn(
  ctx: BuildWritePlanContext,
  input: {
    boardId: string;
    columnId: string;
  },
) {
  const board = await requireLiveBoard(ctx, input.boardId);
  const column = (board.columns ?? []).find((candidate) => candidate.id === input.columnId);
  if (!column) {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Unknown Monday column id ${input.columnId} for board ${input.boardId}. Call monday_board_get and use an exact file column id.`,
    );
  }
  if (column.type !== "file") {
    throw new DomainError(
      domainCodes.BAD_REQUEST,
      `Monday column ${input.columnId} is type ${column.type ?? "unknown"}, not a file column.`,
    );
  }
}

function rawChanges(input: {
  itemName?: string;
  columnValues?: Record<string, unknown>;
  groupId?: string;
}) {
  const rows: Array<{ label: string; value: unknown }> = [];
  if (input.itemName !== undefined) rows.push({ label: "Item name", value: input.itemName });
  if (input.groupId !== undefined) rows.push({ label: "Group id", value: input.groupId });
  for (const [columnId, value] of Object.entries(input.columnValues ?? {})) {
    rows.push({ label: `Column ${columnId}`, value });
  }
  return rows;
}

function optionalColumnValues(value: Record<string, unknown> | undefined) {
  return value === undefined ? {} : { columnValues: value };
}

function optionalItemName(value: string | undefined) {
  return value === undefined ? {} : { itemName: value };
}

function normalizePhoneDigits(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  if (digits.length === 10) return `1${digits}`;
  return digits.length > 0 ? digits : null;
}

function stringFromRecordField(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fieldValue = (value as Record<string, unknown>)[key];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue.trim() : null;
}

function proposedPhoneValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return stringFromRecordField(value, "phone") ?? stringFromRecordField(value, "text");
}

function currentPhoneValue(input: {
  text: string | null;
  value: unknown;
}): string | null {
  return stringFromRecordField(input.value, "phone") ?? input.text;
}

async function assertNoUnconfirmedPhoneReplacement(
  ctx: BuildWritePlanContext,
  input: {
    itemId: string;
    columnValues?: Record<string, unknown>;
  },
) {
  const phoneUpdates = Object.entries(input.columnValues ?? {}).flatMap(([columnId, value]) => {
    const proposed = proposedPhoneValue(value);
    return proposed ? [{ columnId, proposed }] : [];
  });
  if (phoneUpdates.length === 0) return;

  const item = await requireLiveItem(ctx, input.itemId);
  const phoneColumnsById = new Map(
    item.columnValues
      .filter((column) => column.type === "phone")
      .map((column) => [column.id, column] as const),
  );

  for (const update of phoneUpdates) {
    const currentColumn = phoneColumnsById.get(update.columnId);
    if (!currentColumn) continue;
    const current = currentPhoneValue({
      text: currentColumn.text,
      value: currentColumn.value,
    });
    const currentDigits = normalizePhoneDigits(current);
    const proposedDigits = normalizePhoneDigits(update.proposed);
    if (!currentDigits || !proposedDigits || currentDigits === proposedDigits) continue;
    throw new DomainError(
      domainCodes.CONFLICT,
      [
        `Monday item ${input.itemId} already has phone ${current ?? "unknown"} in column ${update.columnId}, while the proposed update is ${update.proposed}.`,
        "Before replacing an existing CRM phone with a different provider value, name the mismatch and ask which phone should be kept.",
      ].join(" "),
      {
        details: {
          itemId: input.itemId,
          columnId: update.columnId,
          currentPhone: current,
          proposedPhone: update.proposed,
        },
      },
    );
  }
}

export const mondayExternalWriteActionContracts: ExternalWriteActionContract[] = [
  defineExternalWriteActionContract({
    toolName: "monday_item_create",
    actionPayloadSchema: mondayItemCreatePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_item_create", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayItemCreatePayloadSchema.parse(ctx.params);
      await assertBoardColumns(ctx, {
        boardId: actionPayload.boardId,
        ...optionalColumnValues(actionPayload.columnValues),
        ...(actionPayload.groupId === undefined ? {} : { groupId: actionPayload.groupId }),
      });
      const meta = packFromParams(
        actionPayload,
        "Create Monday item",
        `Create item "${actionPayload.itemName}" on board ${actionPayload.boardId}.`,
        {
          changes: rawChanges({
            itemName: actionPayload.itemName,
            ...optionalColumnValues(actionPayload.columnValues),
            ...(actionPayload.groupId === undefined ? {} : { groupId: actionPayload.groupId }),
          }),
        },
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_item_create",
        "Do you approve creating this Monday item?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayItemCreate(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_item_update",
    actionPayloadSchema: mondayItemUpdatePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_item_update", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayItemUpdatePayloadSchema.parse(ctx.params);
      await assertItemOnBoard(ctx, actionPayload.boardId, actionPayload.itemId);
      await assertBoardColumns(ctx, {
        boardId: actionPayload.boardId,
        ...optionalColumnValues(actionPayload.columnValues),
      });
      await assertNoUnconfirmedPhoneReplacement(ctx, {
        itemId: actionPayload.itemId,
        ...optionalColumnValues(actionPayload.columnValues),
      });
      const meta = packFromParams(
        actionPayload,
        "Update Monday item",
        `Update item ${actionPayload.itemId} on board ${actionPayload.boardId}.`,
        {
          changes: rawChanges({
            ...optionalItemName(actionPayload.itemName),
            ...optionalColumnValues(actionPayload.columnValues),
          }),
        },
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_item_update",
        "Do you approve updating this Monday item?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayItemUpdate(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_item_archive",
    actionPayloadSchema: mondayItemArchivePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_item_archive", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayItemArchivePayloadSchema.parse(ctx.params);
      for (const target of actionPayload.targets) {
        await assertItemOnBoard(ctx, await boardIdForItem(ctx, target.itemId), target.itemId);
      }
      const meta = packFromParams(
        actionPayload,
        "Archive Monday items",
        `Archive ${actionPayload.targets.length} Monday item(s).`,
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_item_archive",
        "Do you approve archiving these Monday items?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayItemArchive(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_item_move_to_group",
    actionPayloadSchema: mondayItemMoveToGroupPayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_item_move_to_group", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayItemMoveToGroupPayloadSchema.parse(ctx.params);
      await assertItemOnBoard(ctx, actionPayload.boardId, actionPayload.itemId);
      await assertBoardColumns(ctx, {
        boardId: actionPayload.boardId,
        groupId: actionPayload.groupId,
      });
      const meta = packFromParams(
        actionPayload,
        "Move Monday item",
        `Move item ${actionPayload.itemId} to group ${actionPayload.groupId}.`,
        { changes: rawChanges({ groupId: actionPayload.groupId }) },
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_item_move_to_group",
        "Do you approve moving this Monday item?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayItemMoveToGroup(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_update_create",
    actionPayloadSchema: mondayUpdateCreatePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_update_create", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayUpdateCreatePayloadSchema.parse(ctx.params);
      await boardIdForItem(ctx, actionPayload.itemId);
      const meta = packFromParams(
        actionPayload,
        "Post Monday update",
        `Post an update/comment on Monday item ${actionPayload.itemId}.`,
        { changes: [{ label: "Update body", value: actionPayload.body }] },
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_update_create",
        "Do you approve posting this Monday item update?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayUpdateCreate(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_update_edit",
    actionPayloadSchema: mondayUpdateEditPayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_update_edit", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayUpdateEditPayloadSchema.parse(ctx.params);
      const meta = packFromParams(
        actionPayload,
        "Edit Monday update",
        `Edit Monday update/comment ${actionPayload.updateId}.`,
        { changes: [{ label: "Replacement body", value: actionPayload.body }] },
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_update_edit",
        "Do you approve editing this Monday item update?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayUpdateEdit(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_update_delete",
    actionPayloadSchema: mondayUpdateDeletePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_update_delete", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayUpdateDeletePayloadSchema.parse(ctx.params);
      const meta = packFromParams(
        actionPayload,
        "Delete Monday update",
        `Delete Monday update/comment ${actionPayload.updateId}.`,
        { changes: [{ label: "Update deleted", value: actionPayload.updateId }] },
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_update_delete",
        "Do you approve deleting this Monday item update?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayUpdateDelete(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_subitem_create",
    actionPayloadSchema: mondaySubitemCreatePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_subitem_create", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondaySubitemCreatePayloadSchema.parse(ctx.params);
      await boardIdForItem(ctx, actionPayload.parentItemId);
      const meta = packFromParams(
        actionPayload,
        "Create Monday subitem",
        `Create subitem "${actionPayload.itemName}" under item ${actionPayload.parentItemId}.`,
        {
          changes: rawChanges({
            itemName: actionPayload.itemName,
            ...optionalColumnValues(actionPayload.columnValues),
          }),
        },
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_subitem_create",
        "Do you approve creating this Monday subitem?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondaySubitemCreate(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_subitem_update",
    actionPayloadSchema: mondaySubitemUpdatePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_subitem_update", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondaySubitemUpdatePayloadSchema.parse(ctx.params);
      const subitem = await requireLiveItem(ctx, actionPayload.subitemId);
      await assertBoardColumns(ctx, {
        boardId: subitem.boardId,
        ...optionalColumnValues(actionPayload.columnValues),
      });
      const meta = packFromParams(
        actionPayload,
        "Update Monday subitem",
        `Update subitem ${actionPayload.subitemId}.`,
        {
          changes: rawChanges({
            ...optionalItemName(actionPayload.itemName),
            ...optionalColumnValues(actionPayload.columnValues),
          }),
        },
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_subitem_update",
        "Do you approve updating this Monday subitem?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondaySubitemUpdate(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_subitem_archive",
    actionPayloadSchema: mondaySubitemArchivePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_subitem_archive", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondaySubitemArchivePayloadSchema.parse(ctx.params);
      for (const target of actionPayload.targets) {
        await requireLiveItem(ctx, target.subitemId);
      }
      const meta = packFromParams(
        actionPayload,
        "Archive Monday subitems",
        `Archive ${actionPayload.targets.length} Monday subitem(s).`,
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_subitem_archive",
        "Do you approve archiving these Monday subitems?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondaySubitemArchive(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_file_add_to_column",
    actionPayloadSchema: mondayFileAddToColumnPayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_file_add_to_column", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayFileAddToColumnPayloadSchema.parse(ctx.params);
      const item = await requireLiveItem(ctx, actionPayload.itemId);
      await assertFileColumn(ctx, { boardId: item.boardId, columnId: actionPayload.columnId });
      const artifact = await assertProfileArtifact(ctx, {
        profileFileId: actionPayload.profileFileId,
        ...(actionPayload.expectedSha256 === undefined
          ? {}
          : { expectedSha256: actionPayload.expectedSha256 }),
      });
      const meta = packFromParams(
        actionPayload,
        "Upload Monday file",
        `Upload ${artifact.filename ?? "artifact"} to file column ${actionPayload.columnId} on item ${actionPayload.itemId}.`,
        {
          changes: [
            { label: "File attachment", value: artifact.filename ?? actionPayload.profileFileId },
          ],
        },
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_file_add_to_column",
        "Do you approve uploading this file to Monday?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayFileAddToColumn(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_file_add_to_update",
    actionPayloadSchema: mondayFileAddToUpdatePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_file_add_to_update", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayFileAddToUpdatePayloadSchema.parse(ctx.params);
      const artifact = await assertProfileArtifact(ctx, {
        profileFileId: actionPayload.profileFileId,
        ...(actionPayload.expectedSha256 === undefined
          ? {}
          : { expectedSha256: actionPayload.expectedSha256 }),
      });
      const meta = packFromParams(
        actionPayload,
        "Attach file to Monday update",
        `Attach ${artifact.filename ?? "artifact"} to Monday update ${actionPayload.updateId}.`,
        {
          changes: [
            { label: "File attachment", value: artifact.filename ?? actionPayload.profileFileId },
          ],
        },
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_file_add_to_update",
        "Do you approve attaching this file to the Monday update?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayFileAddToUpdate(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_board_create",
    actionPayloadSchema: mondayBoardCreatePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_board_create", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayBoardCreatePayloadSchema.parse(ctx.params);
      const meta = packFromParams(
        actionPayload,
        "Create Monday board",
        `Create board "${actionPayload.boardName}".`,
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_board_create",
        `Do you approve creating the "${payload.boardName}" Monday board?`,
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayBoardCreate(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_board_rename",
    actionPayloadSchema: mondayBoardRenamePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_board_rename", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayBoardRenamePayloadSchema.parse(ctx.params);
      const meta = packFromParams(
        actionPayload,
        "Rename Monday board",
        `Rename board ${actionPayload.boardId}.`,
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_board_rename",
        "Do you approve renaming this Monday board?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayBoardRename(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_board_delete",
    actionPayloadSchema: mondayBoardDeletePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_board_delete", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayBoardDeletePayloadSchema.parse(ctx.params);
      const meta = packFromParams(
        actionPayload,
        "Delete Monday board",
        `Delete board ${actionPayload.boardId}.`,
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_board_delete",
        "Do you approve deleting this Monday board?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayBoardDelete(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_column_create",
    actionPayloadSchema: mondayColumnCreatePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_column_create", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayColumnCreatePayloadSchema.parse(ctx.params);
      await requireLiveBoard(ctx, actionPayload.boardId);
      const meta = packFromParams(
        actionPayload,
        "Create Monday column",
        `Create column on board ${actionPayload.boardId}.`,
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_column_create",
        "Do you approve creating this Monday column?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayColumnCreate(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_column_rename",
    actionPayloadSchema: mondayColumnRenamePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_column_rename", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayColumnRenamePayloadSchema.parse(ctx.params);
      await assertBoardColumns(ctx, {
        boardId: actionPayload.boardId,
        columnValues: { [actionPayload.columnId]: null },
      });
      const meta = packFromParams(
        actionPayload,
        "Rename Monday column",
        `Rename column ${actionPayload.columnId}.`,
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_column_rename",
        "Do you approve renaming this Monday column?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayColumnRename(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_column_delete",
    actionPayloadSchema: mondayColumnDeletePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_column_delete", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayColumnDeletePayloadSchema.parse(ctx.params);
      await assertBoardColumns(ctx, {
        boardId: actionPayload.boardId,
        columnValues: { [actionPayload.columnId]: null },
      });
      const meta = packFromParams(
        actionPayload,
        "Delete Monday column",
        `Delete column ${actionPayload.columnId}.`,
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_column_delete",
        "Do you approve deleting this Monday column?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayColumnDelete(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_group_create",
    actionPayloadSchema: mondayGroupCreatePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_group_create", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayGroupCreatePayloadSchema.parse(ctx.params);
      await requireLiveBoard(ctx, actionPayload.boardId);
      const meta = packFromParams(
        actionPayload,
        "Create Monday group",
        `Create group "${actionPayload.groupName}" on board ${actionPayload.boardId}.`,
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_group_create",
        `Do you approve creating the "${payload.groupName}" Monday group?`,
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayGroupCreate(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_group_rename",
    actionPayloadSchema: mondayGroupRenamePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_group_rename", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayGroupRenamePayloadSchema.parse(ctx.params);
      await assertBoardColumns(ctx, {
        boardId: actionPayload.boardId,
        groupId: actionPayload.groupId,
      });
      const meta = packFromParams(
        actionPayload,
        "Rename Monday group",
        `Rename group ${actionPayload.groupId}.`,
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_group_rename",
        "Do you approve renaming this Monday group?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayGroupRename(db, action, payload),
  }),
  defineExternalWriteActionContract({
    toolName: "monday_group_delete",
    actionPayloadSchema: mondayGroupDeletePayloadSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    buildAgentResult: (input) => buildMondayAgentResult("monday_group_delete", input),
    buildWritePlan: async (ctx) => {
      const actionPayload = mondayGroupDeletePayloadSchema.parse(ctx.params);
      await assertBoardColumns(ctx, {
        boardId: actionPayload.boardId,
        groupId: actionPayload.groupId,
      });
      const meta = packFromParams(
        actionPayload,
        "Delete Monday group",
        `Delete group ${actionPayload.groupId}.`,
      );
      return { actionPayload, requestHash: null, ...meta };
    },
    buildReviewDetail: ({ action, payload }) =>
      mondayDetail(
        "monday_group_delete",
        "Do you approve deleting this Monday group?",
        action,
        payload,
      ),
    execute: (db, action, payload) => executeMondayGroupDelete(db, action, payload),
  }),
];

async function boardIdForItem(ctx: BuildWritePlanContext, itemId: string): Promise<string> {
  const binding = await requireMondayNango(ctx.db, ctx.profileId);
  const item = await mondayLiveGetItem({
    providerConfigKey: binding.nangoProviderConfigKey,
    connectionId: binding.nangoConnectionId,
    sandbox: { db: ctx.db, binding },
    providerItemId: itemId,
  });
  if (!item) throw new DomainError(domainCodes.NOT_FOUND, `Monday item ${itemId} was not found.`);
  return item.boardId;
}
