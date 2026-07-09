---
status: recorded
date: 2026-06-07
scope: assistant history, event ledger, read models, database schema
---

# Raw Agent Event Ledger

## What Changed

Assistant history is persisted as raw facts in `agent_runs` and `agent_events`.
Channel timelines, activity entries, learning-review evidence, reports, and
similar read objects are built dynamically in TypeScript from that raw ledger.

The older persisted read-model shape, including channel message rows,
agent-activity rows, and search-oriented activity rows, is no longer the
authoritative product state for assistant history.

Raw event persistence follows a small set of constraints:

- store useful raw facts, not every byte of incidental runtime noise;
- validate event payloads at contract boundaries with schema-backed TypeScript
  types;
- scope events by profile and source for idempotency;
- use non-reversible hashes for dedupe identifiers when source material may
  include sensitive message text;
- fail fast when required identity or source mapping is missing;
- remove replaced models with forward migrations instead of permanent
  compatibility branches.

## Why

Assistants produce operational facts across channel messages, agent
reasoning, model responses, tool calls, provider writes, work-item outcomes,
artifacts, profile actions, and profile memory changes. Those facts are needed
for debugging, client reports, learning review, recommendations, and future
product workflows.

Persisting each screen or report shape directly made current reads convenient,
but it fragmented a single assistant turn across multiple schemas. That made it
easy to forget important raw facts, store the same fact twice, or keep columns
whose only remaining purpose was a retired projection.

The raw ledger keeps assistant history complete enough for future analysis while
letting current product surfaces derive their own typed projections in backend
code.

## Tradeoffs

- Raw events become the durable source of truth for assistant history, so future
  workflows can inspect richer evidence than any one current UI needs.
- Read projections need careful TypeScript ownership and should push filters
  into database queries where practical before applying limits.
- Some projections may require bounded post-filter scans when the logic depends
  on TypeScript-only event interpretation.
- Rollouts must verify raw event coverage before dropping old read-model tables.
- Future schema proposals must name the current consumer for each persisted
  field or table; deterministic rebuildability from raw events is not enough to
  justify extra persisted state.

## Alternatives Rejected

- Persist separate derived tables for each read surface: rejected because raw
  assistant history would remain fragmented, write paths would need to remember
  every downstream table, and migrations would keep accumulating obsolete
  projection fields.
- Store untyped event blobs: rejected because noisy or inconsistent payloads
  make deterministic projections unreliable and weaken privacy review.
- Keep legacy tables during the refactor: rejected because duplicate write/read
  paths blur authority and encourage compatibility logic after the product has
  intentionally replaced the model.
