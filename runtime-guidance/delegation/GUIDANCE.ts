import { defineGenericGuidance, md } from "@ai-assistants/guidance-authoring";

export default defineGenericGuidance({
  name: "delegation",
  description:
    "Load when a user asks for many independent checks, audits, reconciliations, reviews, searches, or provider-heavy investigations that need careful batch planning.",
  body: md`
# Delegation

Use this guidance for non-trivial independent batch work. The main conversation stays the responsive coordinator: normalize the units, choose direct bounded batches, synthesize findings, handle ambiguity, own protected writes, and send the client-visible reply.

## When To Batch

- Prefer batch planning when a request contains many separable units that each need lookup, verification, reconciliation, audit, research, or inspection.
- For a large independent batch, roughly more than eight units or any request where each unit may need provider search/investigation, decide the batch plan before the first provider search.
- Process the work in direct bounded batches from the main turn. Keep batch size small enough that evidence, failures, and rate limits remain visible.
- Do not process every unit through provider searches when the user asked for only a quick sample, the units depend on each other, or one shared write path must be sequenced carefully.
- Do not batch one or two simple lookups, sequential work where each step depends on prior state, tasks requiring one shared mutable edit/write path, or work where the assistant needs a clarification first.

## Batch Boundaries

- First normalize units yourself: identify each item, source facts, success criteria, allowed tools/sources, and write boundary.
- Track one compact result object per unit or small batch: \`unit\`, \`status\`, \`summary\`, \`evidence\`, \`proposed_writes\`, and \`blockers\`.
- Keep provider reads grouped by source where possible, but do not hide per-unit failures behind aggregate success.
- Own all protected writes in the main turn. Do not file, send, upload, update, or delete anything unless the original request and available tools clearly allow that exact write.
- Preserve the source of truth for each unit. If a row, email, file, or CRM record is missing or ambiguous, mark that unit blocked or ambiguous instead of guessing.

## Completion

- Synthesize from the per-unit results and failures; do not let a partial batch look complete.
- Wait until the required checks are done before sending the client-visible answer, unless reporting a real blocker or external limit.
- Aggregate findings into a concise result that names unchecked sources and unresolved units plainly.
- In visible messages, describe this as checking items in batches. Do not mention internal mechanics, schemas, tool names, or implementation details.
  `,
});
