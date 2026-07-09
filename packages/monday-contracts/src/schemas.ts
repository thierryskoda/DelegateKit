import { profileActionWriteToolDataSchema } from "@ai-assistants/actions-contracts/schemas";
import { stringField } from "@ai-assistants/tool-contracts";
import { z } from "zod";

const jsonSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);

const mondayColumnValuesSchema = z
  .record(z.string().trim().min(1), jsonSchema)
  .describe(
    "Monday-native column_values JSON keyed by exact provider column id from monday_board_get.",
  );

const mondaySubitemColumnValuesSchema = z
  .record(z.string().trim().min(1), jsonSchema)
  .describe(
    "Monday-native subitem column_values JSON keyed by exact generated subitem-board column id from monday_subitem_list.",
  );

const mondayItemFilterSchema = z
  .object({
    columnId: stringField("Exact Monday column id from monday_board_get for this board."),
    compareValue: z
      .array(jsonSchema)
      .min(1)
      .describe(
        'Monday ItemsQuery compare_value array for this column type, such as ["Northstar Holdings"] for text contains_text.',
      ),
    operator: stringField(
      "Optional Monday ItemsQuery operator such as any_of, contains_text, greater_than, lower_than, between, is_empty, or is_not_empty. Use operator, not compareOperator.",
    ).optional(),
    compareAttribute: stringField(
      "Optional Monday ItemsQuery compare_attribute for column types that require a specific attribute.",
    ).optional(),
  })
  .strict();

const mondayItemOrderBySchema = z
  .object({
    columnId: stringField("Exact Monday column id from monday_board_get for this board."),
    direction: z
      .enum(["asc", "desc"])
      .optional()
      .describe("Sort direction. Defaults to Monday's provider default."),
  })
  .strict();

const mondayItemIdDescription = "Numeric Monday item id from Monday.";
const mondayArtifactIdDescription =
  "Profile profile file id for a file already saved in assistant artifacts.";
const mondayExpectedSha256Schema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/i)
  .describe("Optional expected SHA-256 hash for the artifact bytes being uploaded.");

export const mondayWorkspaceListInputSchema = z.object({}).strict();

export const mondayBoardListInputSchema = z
  .object({
    nameContains: stringField(
      "Optional case-insensitive substring filter for board names.",
    ).optional(),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum boards to return."),
  })
  .strict();

export const mondayBoardGetInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
  })
  .strict();

export const mondayColumnTypeListInputSchema = z.object({}).strict();

export const mondayItemListInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
    groupId: stringField("Optional Monday group id to filter locally.").optional(),
    titleContains: stringField(
      "Optional case-insensitive substring filter against the Monday item title/name only. This does not search contact, company, email, address, file/link, or other CRM columns and cannot prove a result is the only CRM match.",
    ).optional(),
    filters: z
      .array(mondayItemFilterSchema)
      .min(1)
      .max(10)
      .optional()
      .describe(
        'Server-side Monday ItemsQuery filters. Call monday_board_get first and use exact column ids. Example: { columnId: "text_column_id", operator: "contains_text", compareValue: ["Northstar Holdings"] }.',
      ),
    filtersOperator: z
      .enum(["and", "or"])
      .optional()
      .describe("Logical operator for combining filters. Defaults to and."),
    orderBy: z
      .array(mondayItemOrderBySchema)
      .min(1)
      .max(5)
      .optional()
      .describe(
        "Server-side Monday ItemsQuery sort clauses using exact column ids from monday_board_get.",
      ),
    cursor: stringField(
      "Monday items_page cursor. Use only with boardId and limit; do not combine cursor with filters, orderBy, titleContains, or groupId because the cursor already encodes the original provider query.",
    ).optional(),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum returned items."),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.filtersOperator && !value.filters?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["filtersOperator"],
        message: "filtersOperator requires filters.",
      });
    }
    const hasQueryShape = Boolean(
      value.groupId ||
      value.titleContains?.trim() ||
      value.filters?.length ||
      value.orderBy?.length,
    );
    if (value.cursor && hasQueryShape) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cursor"],
        message: "cursor cannot be combined with filters, orderBy, titleContains, or groupId.",
      });
    }
  });

export const mondayItemGetInputSchema = z
  .object({
    itemId: stringField(mondayItemIdDescription),
  })
  .strict();

export const mondaySubitemListInputSchema = z
  .object({
    parentItemId: stringField("Numeric Monday parent item id whose subitems should be listed."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum subitems to return."),
  })
  .strict();

export const mondayItemCreateInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
    itemName: stringField("Monday item name/title."),
    groupId: stringField(
      "Optional Monday group id for the new item, from monday_board_get for the same board.",
    ).optional(),
    columnValues: mondayColumnValuesSchema.optional(),
  })
  .strict();

export const mondayItemUpdateInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
    itemId: stringField(mondayItemIdDescription),
    itemName: stringField("Optional new Monday item name/title.").optional(),
    columnValues: mondayColumnValuesSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasName = typeof value.itemName === "string" && value.itemName.trim().length > 0;
    const hasColumns =
      value.columnValues !== undefined && Object.keys(value.columnValues).length > 0;
    if (!hasName && !hasColumns) {
      ctx.addIssue({
        code: "custom",
        message: "Provide itemName or at least one columnValues entry.",
      });
    }
  });

export const mondayItemArchiveInputSchema = z
  .object({
    targets: z
      .array(z.object({ itemId: stringField(mondayItemIdDescription) }).strict())
      .min(1)
      .max(50)
      .describe("Monday items to archive."),
  })
  .strict();

export const mondayItemMoveToGroupInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
    itemId: stringField(mondayItemIdDescription),
    groupId: stringField("Destination Monday group id from monday_board_get for the same board."),
  })
  .strict();

export const mondayUpdateListInputSchema = z
  .object({
    itemId: stringField("Numeric Monday item id whose update/comment history should be read."),
    includeReplies: z
      .boolean()
      .optional()
      .describe("When true, include threaded replies under each top-level item update."),
    page: z.number().int().min(1).optional().describe("Monday updates page number, starting at 1."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum updates to return."),
  })
  .strict();

export const mondayUpdateCreateInputSchema = z
  .object({
    itemId: stringField("Numeric Monday item id to post a top-level update/comment on."),
    body: stringField(
      "Update/comment body. Monday supports simple HTML tags such as <b>, <i>, and <br>; do not use Markdown.",
    ),
  })
  .strict();

export const mondayUpdateEditInputSchema = z
  .object({
    updateId: stringField(
      "Numeric top-level Monday update/comment id from monday_update_list or monday_update_create.",
    ),
    body: stringField(
      "Full replacement update/comment body. Monday supports simple HTML tags such as <b>, <i>, and <br>; do not use Markdown.",
    ),
  })
  .strict();

export const mondayUpdateDeleteInputSchema = z
  .object({
    updateId: stringField(
      "Numeric top-level Monday update/comment id from monday_update_list or monday_update_create.",
    ),
  })
  .strict();

export const mondaySubitemCreateInputSchema = z
  .object({
    parentItemId: stringField("Numeric Monday parent item id to create the subitem under."),
    itemName: stringField("New Monday subitem title/name."),
    columnValues: mondaySubitemColumnValuesSchema.optional(),
  })
  .strict();

export const mondaySubitemUpdateInputSchema = z
  .object({
    subitemId: stringField("Numeric Monday subitem id."),
    itemName: stringField("Optional new Monday subitem title/name.").optional(),
    columnValues: mondaySubitemColumnValuesSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasName = typeof value.itemName === "string" && value.itemName.trim().length > 0;
    const hasColumns =
      value.columnValues !== undefined && Object.keys(value.columnValues).length > 0;
    if (!hasName && !hasColumns) {
      ctx.addIssue({
        code: "custom",
        message: "Provide itemName or at least one columnValues entry.",
      });
    }
  });

export const mondaySubitemArchiveInputSchema = z
  .object({
    targets: z
      .array(z.object({ subitemId: stringField("Numeric Monday subitem id.") }).strict())
      .min(1)
      .max(50)
      .describe("Monday subitems to archive."),
  })
  .strict();

export const mondayFileAddToColumnInputSchema = z
  .object({
    itemId: stringField("Numeric Monday item id that owns the file column."),
    columnId: stringField("Monday file column id from monday_board_get for the item's board."),
    profileFileId: stringField(mondayArtifactIdDescription),
    expectedSha256: mondayExpectedSha256Schema.optional(),
  })
  .strict();

export const mondayFileAddToUpdateInputSchema = z
  .object({
    updateId: stringField(
      "Numeric Monday update/comment id from monday_update_list or monday_update_create.",
    ),
    profileFileId: stringField(mondayArtifactIdDescription),
    expectedSha256: mondayExpectedSha256Schema.optional(),
  })
  .strict();

const mondayBoardKindSchema = z.enum(["public", "private", "share"]);

export const mondayBoardCreateInputSchema = z
  .object({
    boardName: stringField("New board display name."),
    boardKind: mondayBoardKindSchema.describe(
      "Monday board visibility kind: public, private, or share.",
    ),
    workspaceId: stringField(
      "Monday workspace id to create the board in; omit for the main workspace.",
    ).optional(),
    description: stringField("Optional board description.").optional(),
    empty: z
      .boolean()
      .optional()
      .describe("When true, create an empty board without default starter items."),
  })
  .strict();

export const mondayBoardRenameInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
    name: stringField("New board name."),
  })
  .strict();

export const mondayBoardDeleteInputSchema = z
  .object({
    boardId: stringField("Monday provider board id to delete."),
  })
  .strict();

export const mondayColumnCreateInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
    title: stringField("Column title shown in Monday."),
    columnType: stringField(
      "Monday ColumnType enum value, e.g. text, status, numbers; use monday_column_type_list for common supported examples.",
    ),
    description: stringField("Optional column description.").optional(),
    afterColumnId: stringField(
      "Optional existing column id from monday_board_get to insert after.",
    ).optional(),
  })
  .strict();

export const mondayColumnRenameInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
    columnId: stringField("Monday provider column id."),
    title: stringField("New column title."),
  })
  .strict();

export const mondayColumnDeleteInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
    columnId: stringField("Monday provider column id."),
  })
  .strict();

const mondayGroupPositionRelativeSchema = z.enum(["before_at", "after_at"]);

export const mondayGroupCreateInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
    groupName: stringField("New group name."),
    relativeToGroupId: stringField(
      "Optional existing Monday group id from monday_board_get to position relative to.",
    ).optional(),
    positionRelativeMethod: mondayGroupPositionRelativeSchema
      .describe("When relativeToGroupId is set: before_at places above it; after_at below it.")
      .optional(),
    groupColor: stringField("Optional group color as hex, e.g. #ff642e.").optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasRelative = Boolean(value.relativeToGroupId?.trim());
    const hasMethod = value.positionRelativeMethod !== undefined;
    if (hasMethod && !hasRelative) {
      ctx.addIssue({
        code: "custom",
        path: ["positionRelativeMethod"],
        message: "Provide relativeToGroupId when positionRelativeMethod is set.",
      });
    }
  });

export const mondayGroupRenameInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
    groupId: stringField("Monday provider group id."),
    title: stringField("New group title."),
  })
  .strict();

export const mondayGroupDeleteInputSchema = z
  .object({
    boardId: stringField("Monday provider board id."),
    groupId: stringField("Monday provider group id to delete."),
  })
  .strict();

const mondayColumnValueHintSchema = z
  .object({
    columnType: z.string().min(1).describe("Monday provider column type."),
    valueShape: z
      .string()
      .min(1)
      .describe("Short description of the accepted raw column value shape."),
    example: jsonSchema.describe("Example value for columnValues[columnId]."),
  })
  .strict();

export const mondayWorkspaceListOutputSchema = z
  .object({
    workspaces: z
      .array(
        z
          .object({
            workspaceId: z.string().min(1).describe("Monday workspace id."),
            name: z.string().describe("Monday workspace name."),
            kind: z.string().nullable().describe("Monday workspace kind/type when provided."),
          })
          .strict(),
      )
      .describe("Live Monday workspaces visible to the connected account."),
  })
  .strict();

const mondayBoardColumnSchema = z
  .object({
    columnId: z.string().min(1).describe("Monday provider column id."),
    title: z.string().describe("Monday column title."),
    type: z.string().min(1).describe("Monday provider column type."),
    settings: jsonSchema.nullable().describe("Parsed Monday column settings JSON when available."),
    settingsRaw: z.string().nullable().describe("Raw Monday settings_str when available."),
    labels: z
      .array(z.string())
      .describe("Status/dropdown labels parsed from settings when available."),
    valueHint: mondayColumnValueHintSchema.nullable().describe("Common raw value shape hint."),
  })
  .strict();

const mondayBoardGroupSchema = z
  .object({
    groupId: z.string().min(1).describe("Monday provider group id."),
    title: z.string().describe("Monday group title."),
  })
  .strict();

export const mondayBoardListOutputSchema = z
  .object({
    boards: z
      .array(
        z
          .object({
            boardId: z.string().min(1).describe("Monday provider board id."),
            name: z.string().describe("Monday board display name."),
            columns: z
              .array(mondayBoardColumnSchema.pick({ columnId: true, title: true, type: true }))
              .describe("Compact live columns on the Monday board."),
            groups: z.array(mondayBoardGroupSchema).describe("Live groups on the Monday board."),
          })
          .strict(),
      )
      .describe("Live Monday boards visible to the connected account."),
  })
  .strict();

export const mondayBoardGetOutputSchema = z
  .object({
    board: z
      .object({
        boardId: z.string().min(1).describe("Monday provider board id."),
        name: z.string().describe("Monday board display name."),
        columns: z.array(mondayBoardColumnSchema).describe("Live columns on the Monday board."),
        groups: z.array(mondayBoardGroupSchema).describe("Live groups on the Monday board."),
      })
      .strict()
      .describe("Live Monday board detail for raw item writes."),
  })
  .strict();

export const mondayColumnTypeListOutputSchema = z
  .object({
    columnTypes: z
      .array(mondayColumnValueHintSchema)
      .describe("Supported common Monday column value shapes."),
  })
  .strict();

const mondayItemSummarySchema = z
  .object({
    itemId: z.string().min(1).describe("Monday item id."),
    name: z.string().nullable().describe("Monday item title/name."),
    state: z.string().nullable().describe("Monday item state."),
    boardId: z.string().min(1).describe("Monday provider board id."),
    boardName: z.string().nullable().describe("Monday board name."),
    groupId: z.string().nullable().describe("Monday group id."),
    groupTitle: z.string().nullable().describe("Monday group title."),
    columnValuesById: z
      .record(
        z.string().min(1),
        z
          .object({
            text: z.string().nullable().describe("Monday rendered column text when available."),
            type: z.string().nullable().describe("Monday column type for this value."),
            value: jsonSchema
              .nullable()
              .describe("Parsed raw Monday column value JSON when available."),
          })
          .strict(),
      )
      .describe("Raw Monday column values keyed by column id."),
  })
  .strict();

export const mondayItemListOutputSchema = z
  .object({
    boardId: z.string().min(1).describe("Monday provider board id listed."),
    items: z.array(mondayItemSummarySchema).describe("Monday items returned."),
    nextCursor: z
      .string()
      .nullable()
      .describe(
        "Monday pagination cursor for the next unfiltered page; null for filtered local scans and end of pagination.",
      ),
  })
  .strict();

export const mondayItemGetOutputSchema = z
  .object({
    item: mondayItemSummarySchema.describe("Live Monday item detail."),
  })
  .strict();

export const mondaySubitemListOutputSchema = z
  .object({
    parentItem: mondayItemSummarySchema.describe("Live Monday parent item detail."),
    subitems: z
      .array(mondayItemSummarySchema)
      .describe("Live Monday subitems under the parent item."),
  })
  .strict();

const mondayUpdateCreatorSchema = z
  .object({
    userId: z.string().nullable().describe("Monday creator user id when available."),
    name: z.string().nullable().describe("Monday creator display name when available."),
  })
  .strict();

const mondayUpdateAssetSchema = z
  .object({
    assetId: z.string().min(1).describe("Monday asset id."),
    name: z.string().nullable().describe("Monday asset filename/name when available."),
    url: z.string().nullable().describe("Provider asset URL when returned by Monday."),
    publicUrl: z.string().nullable().describe("Provider public URL when returned by Monday."),
    fileExtension: z
      .string()
      .nullable()
      .describe("Provider file extension when returned by Monday."),
    fileSize: z
      .number()
      .nullable()
      .describe("Provider file size in bytes when returned by Monday."),
  })
  .strict();

const mondayUpdateSchema = z
  .object({
    updateId: z.string().min(1).describe("Monday update/comment id."),
    itemId: z.string().min(1).describe("Monday item id the update belongs to."),
    body: z
      .string()
      .nullable()
      .describe("Monday update body with provider formatting when available."),
    textBody: z.string().nullable().describe("Plain text update body when returned by Monday."),
    createdAt: z.string().nullable().describe("Provider creation timestamp."),
    updatedAt: z.string().nullable().describe("Provider update timestamp."),
    creator: mondayUpdateCreatorSchema.describe("Creator facts for the update."),
    assets: z
      .array(mondayUpdateAssetSchema)
      .describe("Files/assets attached to this update when returned by Monday."),
    replies: z
      .array(
        z
          .object({
            updateId: z.string().min(1).describe("Monday reply update id."),
            body: z
              .string()
              .nullable()
              .describe("Reply body with provider formatting when available."),
            textBody: z
              .string()
              .nullable()
              .describe("Plain text reply body when returned by Monday."),
            createdAt: z.string().nullable().describe("Provider reply creation timestamp."),
            updatedAt: z.string().nullable().describe("Provider reply update timestamp."),
            creator: mondayUpdateCreatorSchema.describe("Creator facts for the reply."),
            assets: z
              .array(mondayUpdateAssetSchema)
              .describe("Files/assets attached to this reply when returned by Monday."),
          })
          .strict(),
      )
      .describe("Threaded replies when includeReplies is true and Monday returns them."),
  })
  .strict();

export const mondayUpdateListOutputSchema = z
  .object({
    itemId: z.string().min(1).describe("Monday item id listed."),
    page: z.number().int().min(1).describe("Returned Monday updates page number."),
    limit: z.number().int().min(1).max(100).describe("Requested page size."),
    updates: z.array(mondayUpdateSchema).describe("Top-level Monday updates/comments returned."),
  })
  .strict();

export const mondayExternalWriteOutputSchema = profileActionWriteToolDataSchema;
