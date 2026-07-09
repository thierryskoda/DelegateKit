import {
  coveredToolCatalog,
  definePluginGuidance,
  md,
  plugin,
  tool,
} from "@ai-assistants/guidance-authoring";
import { mondayToolContracts } from "@ai-assistants/monday-contracts/contracts";

export default definePluginGuidance({
  name: "monday",
  plugin: plugin("monday"),
  description:
    "Load when the user asks about Monday.com boards, groups, columns, items, CRM/pipeline rows, deal status, missing documents, blockers, checklist items, next actions, or Monday structure changes.",
  body: md`
# Monday

Use Monday tools when the user asks about CRM or pipeline items, board structure, groups, columns, follow-ups, or values stored in Monday.com.

## Board And Item Flow

- Treat board ids, item ids, group ids, column ids, column type ids, and raw value JSON as internal execution details.
- In client-visible replies, use human names and fields such as client name, deal name, stage, value, owner, or "Internal Notes".
- Never expose raw ids unless the user explicitly asks for technical provider ids.
- Start with ${tool(mondayToolContracts, "monday_board_list")} when you need to find the right board.
- Use ${tool(mondayToolContracts, "monday_board_get")} before item writes unless this turn already has fresh board detail evidence.
- Board detail gives exact board id, group ids, column ids, status/dropdown labels, settings, and raw value examples.
- For reads, call ${tool(mondayToolContracts, "monday_item_list")} with the exact board id.
- Use ${tool(mondayToolContracts, "monday_item_get")} when you already know the item id or need complete raw column values for one item.
- Use ${tool(mondayToolContracts, "monday_workspace_list")} only when creating a board in a specific workspace.
- After board, group, or column writes complete, use returned provider ids directly or call ${tool(mondayToolContracts, "monday_board_get")} for live structure.

## Search And Pagination

- For exact column filters or sorting, call ${tool(mondayToolContracts, "monday_board_get")} first and pass \`filters\` or \`orderBy\` using exact Monday column ids and Monday-native compare values.
- Text contains filters use \`operator: "contains_text"\` and an array \`compareValue\`, for example \`filters: [{ columnId: "text_column_id", operator: "contains_text", compareValue: ["Northstar Holdings"] }]\`.
- Do not pass \`compareOperator\`.
- \`titleContains\` and \`groupId\` are local bounded filters and are not cursor-resumable.
- Provider-side \`filters\` and \`orderBy\` can return a cursor; the next call should pass that cursor by itself with \`boardId\` and \`limit\`.
- If ${tool(mondayToolContracts, "monday_item_list")} returns a cursor, do not say every matching CRM row was checked unless you fetched the remaining pages or the query was narrowly targeted enough to prove the answer.
- For broad related-context searches, prefer targeted filters over title searches when the user gives contact names, company names, addresses, phone numbers, emails, file/link fields, or other CRM-column facts.
- \`titleContains\` searches only item titles/names. If you only searched titles, say that scope plainly and do not claim a result is the only CRM match, the only possible match, or absent from CRM overall.
- When a title-only search returns one plausible item, call it the best title match found, not the only CRM match.

## Deal Evidence

- Monday is CRM evidence, not the whole deal state.
- For deal, mandate, or client-status requests about missing documents, blockers, required checklist items, or next actions, find the parent CRM/deal item and inspect its subitems when available.
- For deal status, next action, verification, or update drafts involving mandates, contracts, signed documents, or signature blockers, check live signature-request evidence when signatures are connected.
- If the newest matching signature request is still in progress and newer than any completed one, treat it as an active follow-up/blocker unless current evidence proves it was superseded.
- Do not make unrelated stale email or duplicate cleanup the lead next action ahead of an active signature blocker.

## Updates, Subitems, And Files

- For item comments, notes, running comment logs, or Monday "updates", use Monday's native update/comment thread: ${tool(mondayToolContracts, "monday_update_list")}, ${tool(mondayToolContracts, "monday_update_create")}, ${tool(mondayToolContracts, "monday_update_edit")}, and ${tool(mondayToolContracts, "monday_update_delete")}.
- Do not use a notes column as a workaround when the user asks for item updates/comments.
- These update tools are not Monday's separate system Activity Log, and reply-to-update tools are not exposed.
- For checklist rows, required-document lists, blockers, missing tasks, or next-action rows under a known CRM/deal item, use subitems: ${tool(mondayToolContracts, "monday_subitem_list")}, ${tool(mondayToolContracts, "monday_subitem_create")}, ${tool(mondayToolContracts, "monday_subitem_update")}, and ${tool(mondayToolContracts, "monday_subitem_archive")}.
- Do not use ${tool(mondayToolContracts, "monday_item_list")} against Monday's generated subitems board as a substitute when the parent item is known.
- Describe subitems by names and human column names; generated subitem board/column ids are internal.
- A returned subitem name proves the subitem exists. It does not prove missing, unchecked, complete, incomplete, overdue, or blocked status unless a returned status/checkbox/date/value, board schema, or another current source provides that state.
- Empty \`columnValuesById\` or blank subitem columns mean no subitem state was returned, not that every checklist row is unchecked or unresolved.
- For file attachments, upload saved assistant artifacts with ${tool(mondayToolContracts, "monday_file_add_to_column")} or ${tool(mondayToolContracts, "monday_file_add_to_update")}.
- Do not place local paths, artifact ids, hashes, or internal download URLs in text/link columns.

## Writes

- Send \`columnValues\` keyed by exact Monday column id, not by human label.
- Use labels from ${tool(mondayToolContracts, "monday_board_get")} for status/dropdown values.
- When unsure about a value shape, call ${tool(mondayToolContracts, "monday_column_type_list")}; for unsupported complex columns, write only when requested provider JSON is clear.
- Change only the item fields or update/comment the user requested.
- Do not add Last Touch, date, status, owner, cleanup, or housekeeping field changes unless the user explicitly asked for those fields.
- Do not write when multiple plausible client/deal rows match, the selected row lacks distinguishing human confirmation, or CRM contact/company/address/financial values conflict with another provider source.
- "Update CRM to match this PDF/email/signed mandate" is not enough to resolve an existing CRM conflict. Name both values and ask which source to keep.

${coveredToolCatalog(mondayToolContracts, {
  monday_workspace_list: true,
  monday_board_list: true,
  monday_board_get: true,
  monday_column_type_list: true,
  monday_item_list: true,
  monday_item_get: true,
  monday_item_create: true,
  monday_item_update: true,
  monday_item_archive: true,
  monday_item_move_to_group: true,
  monday_subitem_list: true,
  monday_subitem_create: true,
  monday_subitem_update: true,
  monday_subitem_archive: true,
  monday_update_list: true,
  monday_update_create: true,
  monday_update_edit: true,
  monday_update_delete: true,
  monday_file_add_to_column: true,
  monday_file_add_to_update: true,
  monday_board_create: true,
  monday_board_rename: true,
  monday_board_delete: true,
  monday_column_create: true,
  monday_column_rename: true,
  monday_column_delete: true,
  monday_group_create: true,
  monday_group_rename: true,
  monday_group_delete: true,
})}
`,
});
