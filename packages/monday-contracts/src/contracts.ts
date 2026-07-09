import {
  defineReadTool,
  defineWriteTool,
  readToolDescription,
  toolOutputProperty,
  type ToolContract,
  writeToolDescription,
} from "@ai-assistants/tool-contracts";
import {
  mondayExternalWriteOutputSchema,
  mondayBoardCreateInputSchema,
  mondayBoardDeleteInputSchema,
  mondayBoardGetInputSchema,
  mondayBoardGetOutputSchema,
  mondayBoardListInputSchema,
  mondayBoardListOutputSchema,
  mondayBoardRenameInputSchema,
  mondayColumnCreateInputSchema,
  mondayColumnDeleteInputSchema,
  mondayColumnRenameInputSchema,
  mondayColumnTypeListInputSchema,
  mondayColumnTypeListOutputSchema,
  mondayFileAddToColumnInputSchema,
  mondayFileAddToUpdateInputSchema,
  mondayGroupCreateInputSchema,
  mondayGroupDeleteInputSchema,
  mondayGroupRenameInputSchema,
  mondayItemArchiveInputSchema,
  mondayItemCreateInputSchema,
  mondayItemGetInputSchema,
  mondayItemGetOutputSchema,
  mondayItemListInputSchema,
  mondayItemListOutputSchema,
  mondayItemMoveToGroupInputSchema,
  mondayItemUpdateInputSchema,
  mondaySubitemArchiveInputSchema,
  mondaySubitemCreateInputSchema,
  mondaySubitemListInputSchema,
  mondaySubitemListOutputSchema,
  mondaySubitemUpdateInputSchema,
  mondayUpdateCreateInputSchema,
  mondayUpdateDeleteInputSchema,
  mondayUpdateEditInputSchema,
  mondayUpdateListInputSchema,
  mondayUpdateListOutputSchema,
  mondayWorkspaceListInputSchema,
  mondayWorkspaceListOutputSchema,
} from "./schemas";

export const MONDAY_PLUGIN_ID = "monday-tools";

const writeReturns = `the ${toolOutputProperty(mondayExternalWriteOutputSchema, "write")} lifecycle status and safe failure details`;
const internalProviderIdsNote =
  "Provider ids are for tool calls and internal planning only; in client-visible replies, use human board, item, group, and column names unless the user explicitly asks for raw Monday ids.";

export const mondayToolContracts = [
  defineReadTool({
    name: "monday_workspace_list",
    pluginId: MONDAY_PLUGIN_ID,
    label: "List Monday Workspaces",
    description: readToolDescription({
      useWhen:
        "the agent needs Monday workspace ids before creating a board in a specific workspace",
      operation: "Lists live Monday workspaces visible to the connected account",
      returns: "workspace ids, names, and provider kind values",
      notes: [
        "Only needed when the user names or implies a specific workspace for board creation.",
      ],
    }),
    inputSchema: mondayWorkspaceListInputSchema,
    outputSchema: mondayWorkspaceListOutputSchema,
  }),
  defineReadTool({
    name: "monday_board_list",
    pluginId: MONDAY_PLUGIN_ID,
    label: "List Monday Boards",
    description: readToolDescription({
      useWhen: "the agent needs live Monday board ids, board names, column ids, or group ids",
      operation: "Lists live Monday boards visible to the connected account with compact structure",
      returns: "board ids, board names, group ids/titles, and column ids/titles/types",
      notes: [
        "Use board ids and column ids exactly as returned by Monday.",
        "This is compact discovery; call monday_board_get for full labels, settings, and value hints before item writes.",
        internalProviderIdsNote,
      ],
    }),
    inputSchema: mondayBoardListInputSchema,
    outputSchema: mondayBoardListOutputSchema,
  }),
  defineReadTool({
    name: "monday_board_get",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Get Monday Board",
    description: readToolDescription({
      useWhen:
        "the agent needs exact columns, groups, labels, settings, and value hints before reading or writing items on a board",
      operation: "Fetches live detail for one Monday board by provider board id",
      returns:
        "board identity, groups, columns, parsed status/dropdown labels, column settings, and raw columnValues hints",
      notes: [
        "Use this before monday_item_create or monday_item_update unless fresh board detail is already available.",
        "For status/dropdown columns, choose labels from the returned labels when possible.",
        "Use group ids from this result for item creation, item moves, and group structure changes.",
        "Board detail explains column meaning; it does not make blank values blockers. A blank column becomes a blocker only when the board schema/status, checklist, template, user request, or another current source marks that field required.",
        internalProviderIdsNote,
      ],
    }),
    inputSchema: mondayBoardGetInputSchema,
    outputSchema: mondayBoardGetOutputSchema,
  }),
  defineReadTool({
    name: "monday_column_type_list",
    pluginId: MONDAY_PLUGIN_ID,
    label: "List Monday Column Types",
    description: readToolDescription({
      useWhen: "the agent needs examples for raw Monday column_values payloads",
      operation: "Returns common supported Monday column types and example columnValues shapes",
      returns: "column type names, value shape notes, and JSON examples",
      notes: [
        "Complex or uncommon Monday column types may still be writable when the user or agent supplies provider-correct JSON.",
        "Always key columnValues by exact column id from monday_board_get.",
        "Use monday_board_get as the source of actual board labels and settings; this tool only provides generic examples.",
      ],
    }),
    inputSchema: mondayColumnTypeListInputSchema,
    outputSchema: mondayColumnTypeListOutputSchema,
  }),
  defineReadTool({
    name: "monday_item_list",
    pluginId: MONDAY_PLUGIN_ID,
    label: "List Monday Items",
    description: readToolDescription({
      useWhen: "the user needs items from a known Monday board",
      operation:
        "Lists live Monday items from one board, optionally using Monday server-side column filters and sorting",
      returns:
        "item ids, names, board/group facts, raw column values keyed by column id, and a pagination cursor for provider-paginated result sets",
      notes: [
        "Pass boardId from monday_board_list or monday_board_get.",
        "Call monday_board_get before filters or orderBy so column ids, column types, and labels are fresh.",
        "Use filters with exact Monday column ids and Monday ItemsQuery compare values; do not use human labels as column ids or semantic field keys.",
        'For text contains filters, pass operator="contains_text" and compareValue as an array, for example filters: [{ columnId: "text_column_id", operator: "contains_text", compareValue: ["Northstar Holdings"] }]. Do not pass compareOperator.',
        "Use orderBy with exact Monday column ids. The cursor returned from a filtered/sorted provider query can be passed back by itself with boardId and limit.",
        "When groupId or titleContains is used, the backend performs a bounded local scan and returns nextCursor null because provider cursors cannot safely resume local filters.",
        "titleContains only searches item names. Results from titleContains alone prove title matches only; they do not prove a record is the only CRM match, the only possible match, the only item in CRM, or absent from CRM overall.",
        "For contact, company, address, phone, email, file/link, or other column facts, use monday_board_get to find exact column ids and then use filters; if you only searched titles, state that limitation.",
        "For a named client, contact, company, lead, or deal lookup, an unfiltered page of board items is not evidence that the record is absent. Use monday_board_get, then filter the relevant name/contact/company/email columns before saying Monday has no matching CRM row.",
        "For named deal status, next-action, verification, or co-broker/client update drafts where signatures may matter, Monday CRM is not complete current-state evidence by itself; also check live signature requests before drafting or recommending.",
        "When an item has a subtasks/subitems column and the user asks about required documents, checklist items, blockers, or next actions for that item, call monday_subitem_list for the parent item. Do not search Monday's generated subitems board with monday_item_list as a substitute for the parent item's subitem list.",
        "Blank or missing column values mean not recorded in the returned CRM row; they are not unresolved blockers unless the board schema, a file/link column, subitem checklist, status, or the user explicitly defines them as required. Do not put blank CRM fields under an unresolved-blockers heading; if useful, mention them separately as CRM cleanup or not-recorded fields.",
        "Use monday_item_get when an exact item id is known or when one selected item needs fresh detail before writing. If multiple plausible rows match a client or deal, do not pick the first row for a write; ask for the distinguishing row or use more evidence.",
        internalProviderIdsNote,
      ],
    }),
    inputSchema: mondayItemListInputSchema,
    outputSchema: mondayItemListOutputSchema,
  }),
  defineReadTool({
    name: "monday_item_get",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Get Monday Item",
    description: readToolDescription({
      useWhen: "the user needs one Monday item by item id",
      operation: "Fetches one live Monday item by numeric item id",
      returns: "item id/name, board/group facts, and raw column values keyed by column id",
      notes: [
        "Input is itemId only; do not pass boardId to this tool.",
        "Use this to verify the item board/group before update, archive, or move actions when the current context is stale.",
        internalProviderIdsNote,
      ],
    }),
    inputSchema: mondayItemGetInputSchema,
    outputSchema: mondayItemGetOutputSchema,
  }),
  defineReadTool({
    name: "monday_subitem_list",
    pluginId: MONDAY_PLUGIN_ID,
    label: "List Monday Subitems",
    description: readToolDescription({
      useWhen: "the user needs checklist-style subitems under a known Monday item",
      operation: "Lists live Monday subitems for one parent item",
      returns:
        "parent item facts and subitem ids, names, board/group facts, and raw column values keyed by column id",
      notes: [
        "Pass parentItemId from monday_item_list or monday_item_get.",
        "Use this for required-document checklists, blockers, missing tasks, and next-action rows under a parent CRM/deal item.",
        "Subitems live on Monday's generated subitems board; use returned subitem ids for subitem update/archive calls.",
        "Do not use monday_item_list against the generated subitems board to replace this call when the parent item is known.",
        internalProviderIdsNote,
      ],
    }),
    inputSchema: mondaySubitemListInputSchema,
    outputSchema: mondaySubitemListOutputSchema,
  }),
  defineReadTool({
    name: "monday_update_list",
    pluginId: MONDAY_PLUGIN_ID,
    label: "List Monday Item Updates",
    description: readToolDescription({
      useWhen:
        "the user needs comments, updates, notes, or running comment history posted on a known Monday item",
      operation:
        "Lists top-level Monday updates/comments from one item's native update thread, with optional threaded replies",
      returns:
        "update ids, formatted and plain text bodies, timestamps, creator names, and replies when requested",
      notes: [
        "Pass itemId from monday_item_list or monday_item_get.",
        "Use this for Monday's native item update/comment thread, not for column values or Monday's separate system Activity Log.",
        internalProviderIdsNote,
      ],
    }),
    inputSchema: mondayUpdateListInputSchema,
    outputSchema: mondayUpdateListOutputSchema,
  }),
  defineWriteTool({
    name: "monday_subitem_create",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Create Monday Subitem",
    description: writeToolDescription({
      useWhen: "the user wants to add a checklist-style subitem under a Monday item",
      operation:
        "Creates a Monday subitem under a parent item, optionally with raw Monday columnValues",
      returns: writeReturns,
      doNotUse: "the parent item id is uncertain; call monday_item_list/get first",
      sideEffect: "may create a Monday subitem or create an approval-governed Monday action",
      safety:
        "parentItemId must be exact; when columnValues are provided, keys must be Monday subitem board column ids from monday_subitem_list. If no subitem-board column ids are known yet, omit columnValues and update after discovery.",
    }),
    inputSchema: mondaySubitemCreateInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.subitem.create",
  }),
  defineWriteTool({
    name: "monday_subitem_update",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Update Monday Subitem",
    description: writeToolDescription({
      useWhen: "the user wants to rename a Monday subitem or update its subitem column values",
      operation: "Updates a Monday subitem name and/or raw Monday columnValues by subitem id",
      returns: writeReturns,
      doNotUse:
        "the exact subitem id or subitem column ids are uncertain; call monday_subitem_list first",
      sideEffect: "may update a Monday subitem or create an approval-governed Monday action",
      safety:
        "requires at least one change and validates column ids against the subitem's live board when columnValues are supplied",
    }),
    inputSchema: mondaySubitemUpdateInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.subitem.update",
  }),
  defineWriteTool({
    name: "monday_subitem_archive",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Archive Monday Subitems",
    description: writeToolDescription({
      useWhen: "the user wants to archive one or more Monday subitems",
      operation: "Archives Monday subitems by numeric subitem id",
      returns: writeReturns,
      doNotUse: "the exact subitem ids are uncertain; call monday_subitem_list first",
      sideEffect: "may archive Monday subitems or create an approval-governed Monday action",
      safety:
        "the exact subitem ids must be confirmed because archived subitems leave the active parent item view",
    }),
    inputSchema: mondaySubitemArchiveInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.subitem.archive",
  }),
  defineWriteTool({
    name: "monday_item_create",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Create Monday Item",
    description: writeToolDescription({
      useWhen: "the user wants to create a new item on a Monday board",
      operation:
        "Creates a Monday item using provider board/group/column ids and raw Monday columnValues",
      returns: writeReturns,
      doNotUse: "board id, item name, or raw column ids are uncertain; call monday_board_get first",
      sideEffect: "may create a Monday item or create an approval-governed Monday action",
      safety:
        "boardId/groupId must come from live board detail; columnValues keys must be exact column ids from monday_board_get",
    }),
    inputSchema: mondayItemCreateInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.item.create",
  }),
  defineWriteTool({
    name: "monday_item_update",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Update Monday Item",
    description: writeToolDescription({
      useWhen: "the user wants to update an existing Monday item",
      operation:
        "Updates item name and/or raw Monday columnValues by provider board id and item id",
      returns: writeReturns,
      doNotUse:
        "item id, board id, raw column ids, or exact target row are uncertain; multiple plausible rows matched; the update adds fields the user did not ask to change; or the current CRM value conflicts with another provider source and the user has not explicitly resolved the mismatch after you named both values",
      sideEffect: "may update a Monday item or create an approval-governed Monday action",
      safety:
        "requires at least one requested change, verifies the item belongs to the board, requires exact column ids from monday_board_get, and requires a single unambiguous target row and source-of-truth value. Do not use this tool to test whether a conflicting CRM overwrite will be allowed. If you already know the CRM has one contact, company, address, phone, email, or financial value and another provider has a different value, do not call monday_item_update; first name both values and ask which one to keep. Do not add Last Touch, date, owner, status, cleanup, or housekeeping field changes unless the user explicitly requested those fields. A request like 'update CRM to match this PDF/email/signed mandate' is not conflict resolution when CRM already has a different contact, company, address, phone, email, or financial value.",
    }),
    inputSchema: mondayItemUpdateInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.item.update",
  }),
  defineWriteTool({
    name: "monday_item_archive",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Archive Monday Items",
    description: writeToolDescription({
      useWhen: "the user wants to archive one or more Monday items",
      operation: "Archives Monday items by numeric item id",
      returns: writeReturns,
      doNotUse: "the exact item ids are uncertain; call monday_item_list or monday_item_get first",
      sideEffect: "may archive Monday items or create an approval-governed Monday action",
      safety:
        "the exact item ids must be confirmed because archived items leave the active board view",
    }),
    inputSchema: mondayItemArchiveInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.item.archive",
  }),
  defineWriteTool({
    name: "monday_item_move_to_group",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Move Monday Item To Group",
    description: writeToolDescription({
      useWhen: "the user wants to move a Monday item to another group on the same board",
      operation: "Moves a Monday item by item id to a provider group id on a board",
      returns: writeReturns,
      doNotUse:
        "board id, item id, or destination group id is uncertain; call monday_board_get and monday_item_get/list first",
      sideEffect: "may move a Monday item or create an approval-governed Monday action",
      safety:
        "verifies the item belongs to the board and destination group id must come from that same board",
    }),
    inputSchema: mondayItemMoveToGroupInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.item.move_to_group",
  }),
  defineWriteTool({
    name: "monday_update_create",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Create Monday Item Update",
    description: writeToolDescription({
      useWhen:
        "the user wants to post a comment, note, running-log entry, or update on an existing Monday item",
      operation:
        "Posts a top-level Monday update/comment on an item using Monday's native item updates surface",
      returns: writeReturns,
      doNotUse: "the exact item id is uncertain; call monday_item_list or monday_item_get first",
      notes: [
        "Use this for running item comment logs instead of writing into a notes column when the user asks for Monday updates/comments.",
        "This posts to Monday's native item update/comment thread, not Monday's separate system Activity Log.",
        "The body may use simple Monday-supported HTML such as <b>, <i>, and <br>; do not use Markdown.",
      ],
      sideEffect:
        "may create a visible Monday item update/comment or create an approval-governed Monday action",
      safety: "the exact target item and comment body must be clear",
    }),
    inputSchema: mondayUpdateCreateInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.update.create",
  }),
  defineWriteTool({
    name: "monday_update_edit",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Edit Monday Item Update",
    description: writeToolDescription({
      useWhen: "the user wants to revise a previously posted top-level Monday item update/comment",
      operation: "Replaces the body of one top-level Monday update/comment by update id",
      returns: writeReturns,
      doNotUse:
        "the exact update id is uncertain; call monday_update_list first or use the id returned by monday_update_create",
      notes: [
        "This edits Monday's native item update/comment thread, not Monday's separate system Activity Log.",
        "This is for top-level item updates only; reply-to-update tools are not exposed.",
        "The body may use simple Monday-supported HTML such as <b>, <i>, and <br>; do not use Markdown.",
        internalProviderIdsNote,
      ],
      sideEffect:
        "may replace a visible Monday item update/comment body or create an approval-governed Monday action",
      safety: "the exact target update/comment and replacement body must be clear",
    }),
    inputSchema: mondayUpdateEditInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.update.edit",
  }),
  defineWriteTool({
    name: "monday_update_delete",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Delete Monday Item Update",
    description: writeToolDescription({
      useWhen: "the user wants to delete a previously posted top-level Monday item update/comment",
      operation: "Deletes one top-level Monday update/comment by update id",
      returns: writeReturns,
      doNotUse: "the exact update id is uncertain; call monday_update_list first",
      notes: [
        "This deletes from Monday's native item update/comment thread, not Monday's separate system Activity Log.",
        "This is for top-level item updates only; reply-to-update tools are not exposed.",
        internalProviderIdsNote,
      ],
      sideEffect:
        "may permanently remove a visible Monday item update/comment or create an approval-governed Monday action",
      safety:
        "the exact target update/comment must be confirmed because deletion removes the visible comment",
    }),
    inputSchema: mondayUpdateDeleteInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.update.delete",
  }),
  defineWriteTool({
    name: "monday_file_add_to_column",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Add Monday File To Column",
    description: writeToolDescription({
      useWhen:
        "the user wants to attach a saved assistant artifact to a Monday file column on an item",
      operation:
        "Uploads one profile artifact to a Monday file column using Monday's native file column attachment API",
      returns: writeReturns,
      doNotUse:
        "the item id, file column id, or artifact id is uncertain; call monday_item_get, monday_board_get, and artifact tools first",
      sideEffect:
        "may upload a file to a Monday item file column or create an approval-governed Monday action",
      safety:
        "verifies the item exists, the column belongs to the item's board and is a file column, and the artifact belongs to the profile before upload",
    }),
    inputSchema: mondayFileAddToColumnInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.file.add_to_column",
  }),
  defineWriteTool({
    name: "monday_file_add_to_update",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Add Monday File To Update",
    description: writeToolDescription({
      useWhen:
        "the user wants to attach a saved assistant artifact to an existing Monday item update/comment",
      operation:
        "Uploads one profile artifact to a Monday update/comment using Monday's native update attachment API",
      returns: writeReturns,
      doNotUse:
        "the update id or artifact id is uncertain; call monday_update_list/create and artifact tools first",
      sideEffect:
        "may upload a file attachment to a Monday update/comment or create an approval-governed Monday action",
      safety:
        "verifies the artifact belongs to the profile before upload; updateId must come from Monday update tools or a fresh provider result",
    }),
    inputSchema: mondayFileAddToUpdateInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.file.add_to_update",
  }),
  defineWriteTool({
    name: "monday_board_create",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Create Monday Board",
    description: writeToolDescription({
      useWhen: "the user wants to create a new Monday board",
      operation:
        "Creates a new Monday board in the connected account with optional workspace placement",
      returns: writeReturns,
      notes: [
        "Use monday_workspace_list when a specific workspace is requested.",
        "When completed, use the returned boardId directly for follow-up board, group, or column work.",
        "Creating a board does not require any schema refresh; follow-up structure tools can use returned provider ids directly.",
      ],
      sideEffect: "may create a Monday board or create an approval-governed Monday action",
      safety: "board name, kind, workspace intent, and empty-board intent must be clear",
    }),
    inputSchema: mondayBoardCreateInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.board.create",
  }),
  defineWriteTool({
    name: "monday_board_rename",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Rename Monday Board",
    description: writeToolDescription({
      useWhen: "the user wants to rename an existing Monday board",
      operation: "Renames an existing Monday board by provider board id",
      returns: writeReturns,
      doNotUse: "the board id is uncertain; call monday_board_list first",
      sideEffect: "may rename a Monday board or create an approval-governed Monday action",
      safety: "the exact board id and new board name must be clear",
    }),
    inputSchema: mondayBoardRenameInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.board.rename",
  }),
  defineWriteTool({
    name: "monday_board_delete",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Delete Monday Board",
    description: writeToolDescription({
      useWhen: "the user wants to permanently delete a Monday board",
      operation: "Permanently deletes a Monday board by provider board id",
      returns: writeReturns,
      doNotUse:
        "the exact board is not confirmed; call monday_board_list or monday_board_get first",
      sideEffect:
        "may permanently delete a Monday board or create an approval-governed Monday action",
      safety: "the exact board must be confirmed because this is destructive at the provider",
    }),
    inputSchema: mondayBoardDeleteInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.board.delete",
  }),
  defineWriteTool({
    name: "monday_column_create",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Create Monday Column",
    description: writeToolDescription({
      useWhen: "the user wants to add a column to a Monday board",
      operation: "Creates a Monday board column with a provider ColumnType",
      returns: writeReturns,
      doNotUse:
        "board id or Monday ColumnType is uncertain; call monday_board_get and monday_column_type_list first",
      sideEffect: "may create a Monday column or create an approval-governed Monday action",
      safety: "board id, column title, and columnType must be clear",
    }),
    inputSchema: mondayColumnCreateInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.column.create",
  }),
  defineWriteTool({
    name: "monday_column_rename",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Rename Monday Column",
    description: writeToolDescription({
      useWhen: "the user wants to rename an existing Monday column",
      operation: "Changes the title of an existing column on a Monday board",
      returns: writeReturns,
      doNotUse: "board id, column id, or new title is uncertain; call monday_board_get first",
      sideEffect: "may rename a Monday column or create an approval-governed Monday action",
      safety: "the exact board id, column id, and new title must be clear",
    }),
    inputSchema: mondayColumnRenameInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.column.rename",
  }),
  defineWriteTool({
    name: "monday_column_delete",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Delete Monday Column",
    description: writeToolDescription({
      useWhen: "the user wants to remove a column from a Monday board",
      operation: "Deletes a Monday column by board id and column id",
      returns: writeReturns,
      doNotUse: "board id or column id is uncertain; call monday_board_get first",
      sideEffect: "may delete a Monday column or create an approval-governed Monday action",
      safety:
        "the exact board and column must be confirmed because this can remove stored field data",
    }),
    inputSchema: mondayColumnDeleteInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.column.delete",
  }),
  defineWriteTool({
    name: "monday_group_create",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Create Monday Group",
    description: writeToolDescription({
      useWhen: "the user wants to create an empty group on a Monday board",
      operation: "Creates a Monday board group with optional relative placement",
      returns: writeReturns,
      doNotUse: "board id is uncertain; call monday_board_get first",
      notes: ["Optional placement requires both relativeToGroupId and positionRelativeMethod."],
      sideEffect: "may create a Monday group or create an approval-governed Monday action",
      safety: "the board id, group name, and optional placement must be clear",
    }),
    inputSchema: mondayGroupCreateInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.group.create",
  }),
  defineWriteTool({
    name: "monday_group_rename",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Rename Monday Group",
    description: writeToolDescription({
      useWhen: "the user wants to rename a Monday board group",
      operation: "Renames a Monday board group by board id and provider group id",
      returns: writeReturns,
      doNotUse: "board id, group id, or new title is uncertain; call monday_board_get first",
      sideEffect: "may rename a Monday group or create an approval-governed Monday action",
      safety: "the exact board id, group id, and new group title must be clear",
    }),
    inputSchema: mondayGroupRenameInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.group.rename",
  }),
  defineWriteTool({
    name: "monday_group_delete",
    pluginId: MONDAY_PLUGIN_ID,
    label: "Delete Monday Group",
    description: writeToolDescription({
      useWhen: "the user wants to delete a Monday group",
      operation:
        "Deletes a Monday group and all items in that group using Monday provider behavior",
      returns: writeReturns,
      doNotUse: "board id or group id is uncertain; call monday_board_get first",
      sideEffect:
        "may delete a Monday group and its items or create an approval-governed Monday action",
      safety:
        "the exact board and group must be confirmed because this is a high-impact destructive write",
    }),
    inputSchema: mondayGroupDeleteInputSchema,
    outputSchema: mondayExternalWriteOutputSchema,
    externalAction: "monday.group.delete",
  }),
] as const satisfies readonly ToolContract[];

export type MondayToolName = (typeof mondayToolContracts)[number]["name"];
