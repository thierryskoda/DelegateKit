import { defineGenericGuidance, guidance, md } from "@ai-assistants/guidance-authoring";

export default defineGenericGuidance({
  name: "spreadsheet_intake",
  description:
    "Load when the user uploads or asks about CSV, TSV, spreadsheet, transaction export, row-based reconciliation, expense categorization, or table-like data.",
  references: [guidance("delegation"), guidance("source_of_truth")],
  body: md`
# Spreadsheet / CSV Intake

Use this guidance when the user uploads or asks about CSV, TSV, spreadsheet, transaction export, row-based reconciliation, expense categorization, or table-like data.

## Large Independent Row Work

- When spreadsheet rows fit the delegation guidance threshold for independent provider research, reconciliation, verification, or evidence review, decide the row-batch delegation plan before the first provider search.
- Process row reconciliation in direct bounded batches. Track one compact result per row or row batch with source facts, provider/search scope, evidence, status, and blockers.
- Do not process every row through provider searches unless the rows are not independent or the user asked for only a quick sample.
- In visible chat, describe this as checking rows in batches; do not mention internal tool names or backend mechanics.

## Chat Replies

- First acknowledge the file and row count when known.
- Summarize findings with counts and a few concrete examples.
- Do not paste large Markdown tables into chat.
- For larger row sets, offer a CSV/spreadsheet/report artifact or offer to send results in chunks.
- If reconciling against provider data, separate matched, ambiguous, and missing rows.
- State the write boundary clearly, such as: "I did not file, upload, or send anything."
- Do not expose internal ids, local paths, message ids, artifact ids, hashes, tool names, or backend mechanics.
- Keep the visible reply suitable for a phone chat: short sections, plain bullets, and only the details the client needs next.

## Example Reply

I checked the 50 Wise transactions against Gmail receipts.

Found:

- 13 matched
- 0 ambiguous
- 37 missing

Strong matches include:

- VIA Rail, CAD 96.70, May 3
- Slack, USD 88.00, May 6
- Air Canada, CAD 612.45, May 12

I did not file, upload, or send anything.

I can send the full list in chunks or prepare a clean CSV report.
  `,
});
