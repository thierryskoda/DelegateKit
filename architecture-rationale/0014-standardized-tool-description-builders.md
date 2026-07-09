---
status: recorded
date: 2026-05-25
scope: agent tool contracts, tool descriptions, generated inventories
---

# Standardized Tool Description Builders
## What Changed

All real agent-visible tool contracts now use canonical description builders
instead of raw string descriptions:

- read tools use `readToolDescription(...)`;
- write tools use `writeToolDescription(...)`;
- fixture-only or intentionally nonstandard examples use `toolDescription(...)`;
- `ToolContract.description` requires the branded `StandardToolDescription`
  type, so new raw string descriptions fail typecheck.

The migration covers backend provider tools, focused profile module tools,
workflow tools, document and signature tools, runtime-local artifact tools, and builtin
tools represented in the inventory. Generated tool inventories were refreshed
from the canonical contracts rather than patched by hand.

## Why

Tool descriptions are not developer-only comments. They are model-facing
instructions that teach the assistant when a tool applies, what operation it
performs, what result to expect, and what must be true before a side effect is
safe.

The previous freeform descriptions created several long-term problems:

- read and write tools mixed purpose, output, warnings, and workflow advice in
  inconsistent order;
- side effects and safety preconditions were easy to omit from write tools;
- descriptions could mention schema fields that had been renamed or removed;
- generated inventories reflected stylistic drift across provider packages;
- future tools could silently reintroduce raw strings after the migration.

The standard builders make the important distinctions explicit. Read tools stay
lightweight because they should not over-warn the model about nonexistent side
effects. Write tools carry the extra burden of naming the external or local
side effect and the safety condition required before execution.

Branding `StandardToolDescription` turns the convention into a contract. The
compiler now protects the architecture decision instead of relying on review
memory.

## Tradeoffs

- Contract definitions are more verbose, especially for small tools.
- Some descriptions had to be rewritten in more mechanical language so the
  shared semantic guard could validate them consistently.
- The migration touched many packages even though no tool behavior changed,
  which created broad type-test and inventory fallout.
- The stricter type makes quick test fixtures slightly more cumbersome, but the
  cost is contained by allowing minimal `toolDescription(...)` fixture prose.
- Description helpers do not make every sentence semantically perfect. They
  provide a stable shape and type boundary; package owners still need to write
  accurate tool-specific content.

## Alternatives Rejected

- Keep raw strings and rely on review discipline: rejected because descriptions
  are a cross-cutting model contract and raw strings already drifted across
  packages.
- Use one generic builder for all tools: rejected because write tools need
  explicit side-effect and safety fields while read tools should remain concise.
- Fix only provider write tools: rejected because generated inventories and
  model selection behavior depend on the full visible tool catalog, including
  runtime-local and builtin tools.
- Keep `description: string` for compatibility: rejected because the product is
  pre-launch and the goal was to prevent the old pattern from returning.
- Move usage guidance into markdown instead of contract descriptions: rejected
  because the canonical contract should remain the source of truth for generated
  guidance and inventories.

## Follow-On Constraints

New agent-visible tools should start from the canonical builders rather than
adding raw prose and cleaning it up later. When a description names important
input or output fields, use `toolInputProperty(...)` or
`toolOutputProperty(...)` so schema drift is caught near the contract.

If a future tool does not fit the read/write split, treat that as a design
question about the tool surface first. `toolDescription(...)` should remain a
fixture escape hatch or a deliberately documented exception, not a normal path
for production tools.

## More Information

This record narrows the description-builder rationale that complements
[0013 Agent Tool Contracts Are LLM Facing](0013-agent-tool-contracts-are-llm-facing.md).
Current source of truth lives in the tool contract package and each capability
contract package, not in this historical record.
