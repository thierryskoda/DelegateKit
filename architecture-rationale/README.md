# Architecture Rationale

This folder records why significant architecture changes landed in the source
tree. It is historical context for maintainers and agents who need to understand
the intent behind a boundary, removal, refactor, or durable design choice.

Architecture rationale records are not current operating instructions. Treat
code, schemas, tests, generated context, and focused skills as the source of
truth for how the system works today.

## What Belongs Here

Add a record after implementation when a completed change would be hard to
understand from the diff alone: a major boundary shift, removal of a subsystem,
provider ownership change, runtime architecture decision, integration strategy,
or other design choice that future work is likely to question.

Skip records for routine fixes, small edits, proposals, RFCs, task plans,
implementation checklists, command notes, broad repo documentation, or live
maintainer rules.

Do not add records to this README. Put each record in its own numbered Markdown
file and add only an index entry under [Records](#records).

Each record should stay concise:

- what changed;
- why that direction was chosen;
- important tradeoffs;
- alternatives that were rejected.

## Record Shape

Use this structure as a starting point, then delete optional sections that do
not add durable context:

```markdown
---
status: recorded
date: YYYY-MM-DD
scope: "major refactor, boundary move, removal, integration strategy, etc."
---

# Short Title

## What Changed

Describe the architecture change that shipped. Keep it concrete enough that a
future reader can orient themselves without repo archaeology.

## Why

Explain the problem, constraint, or product direction that made the change worth
doing. Focus on reasoning that would be hard to recover from code alone.

## Tradeoffs

- Positive consequence.
- Negative consequence or cost.
- Follow-on constraint future maintainers should remember.

## Alternatives Rejected

- Alternative: why it was rejected.

## More Information

Related records, PRs, issues, docs, or conditions that would make this rationale
worth revisiting.
```

Use `status: recorded` for current history. If a later record supersedes it,
update the older record status to link to the newer record, for example:
`status: "superseded by [ARR-NNNN](NNNN-title.md)"`.

## Writing Guidelines

Prefer durable reasoning over snapshots of the repo tree. Short pointers to
stable entry modules or boundaries are useful; long file inventories, command
catalogs, and verification checklists are not.

Include at least one real downside, cost, or tradeoff. If there is no meaningful
tradeoff, the change probably does not need a record.

Do not paste large chunks of `AGENTS.md` into a record. Link to live maintainer
rules when needed, and keep day-to-day operating guidance in source code,
schemas, tests, generated context, focused skills, or `AGENTS.md`.

Use `// ARR-NNNN` source comments only at stable integration boundaries where the
pointer helps the next reader understand a non-obvious architectural reason.

## How To Read This Folder

Read records as dated rationale, not as evergreen guidance. Newer records may
supersede older ones, and later source code may have moved beyond both. When a
record and current implementation disagree, investigate the current code before
copying the older reasoning into new work.

## Records

- [0001: Adopt architecture rationale records](0001-adopt-architecture-rationale-records.md)
- [0002: DB truth orchestration reconciler-driven assistant dispatch](0002-db-truth-orchestration-reconciler-driven-assistant-dispatch.md)
- [0004: Nango first no client data plane](0004-nango-first-no-client-data-plane.md)
- [0005: Calendar Nango sync action layering](0005-calendar-nango-sync-action-layering.md)
- [0006: Nango backend proxy transport](0006-nango-backend-proxy-transport.md)
- [0007: Capabilities and document tools boundary](0007-capabilities-and-document-tools-boundary.md)
- [0008: Document tools provider decoupling](0008-document-tools-provider-decoupling.md)
- [0009: Schema contract ownership](0009-schema-contract-ownership.md)
- [0010: Monday provider-owned semantic capability](0010-monday-provider-owned-semantic-capability.md)
- [0011: Provider reads are action backed](0011-provider-reads-are-action-backed.md)
- [0012: Provider operations are proxy backed](0012-provider-operations-are-proxy-backed.md)
- [0013: Agent tool contracts are LLM facing](0013-agent-tool-contracts-are-llm-facing.md)
- [0014: Standardized tool description builders](0014-standardized-tool-description-builders.md)
- [0015: Backend capability colocation](0015-backend-capability-colocation.md)
- [0016: Provider-first capability surfaces](0016-provider-first-capability-surfaces.md)
- [0017: Replace Monday semantic schema with raw provider tools](0017-replace-monday-semantic-schema-with-raw-provider-tools.md)
- [0018: Isolated E2E profile and scenario provider sandbox](0018-isolated-e2e-profile-and-scenario-provider-sandbox.md)
- [0019: Runtime guidance routing and focused profile modules](0019-runtime-guidance-routing-and-focused-profile-modules.md)
- [0020: Dynamic E2E runtime lanes](0020-dynamic-e2e-runtime-lanes.md)
- [0021: DB-owned launched-client guidance](0021-db-owned-launched-client-guidance.md)
- [0022: E2E runtime pool leasing](0022-e2e-runtime-pool-leasing.md)
- [0023: Raw agent event ledger](0023-raw-agent-event-ledger.md)
- [0024: Remove heavy workspace agents strategy](0024-remove-heavy-workspace-agents-strategy.md)
- [0026: Retire profile memories](0026-retire-profile-memories.md)
- [0027: Merge artifacts, context, and scheduled workflow wake](0027-merge-artifacts-context-and-scheduled-workflow-wake.md)
