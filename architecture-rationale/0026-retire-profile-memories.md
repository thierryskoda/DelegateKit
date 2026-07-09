---
status: recorded
date: 2026-06-09
scope: runtime prompt state removal, profile guidance ownership, production schema cleanup
---

# Retire Profile Memories

## What Changed

Profile memories were removed as a prompt, runtime, tool, and database concept.
Reusable client preferences and behavior that had been stored as active memory
rows were migrated into DB-owned `profile_guidance` first, then the
`profile_memories` table was dropped by a forward production migration.

The runtime no longer injects memory context, exposes memory tools, or accepts
profile-learning-review candidates that create, update, or forget profile
memories. Profile learning now routes durable observations to explicit owners:
profile guidance, scheduled tasks, work routes, workflow recipes, provider or
source-of-truth state, proposals, or no durable state.

Historical architecture records and migrations may still mention profile
memories when describing older designs. Current source, generated tool
inventory, runtime guidance, and production schema should not retain a live
profile-memory path.

## Why

Profile memories and profile guidance had become two ways to persist the same
class of reusable client instruction. That split made it unclear whether a
client preference, assistant behavior, or recurring operating rule belonged in a
hidden memory row or in launched-client guidance.

The newer guidance-router model makes profile guidance the right home for this
state. It can present compact selector metadata to scout-style context
selection, load only relevant markdown for a specific turn, and keep maintainer
workflow instructions in one DB-owned surface.

Removing memories also matches the product rule against stale desired-state
rows. A hidden catch-all memory table made durable state harder to audit and
easy to keep after the product no longer had a concrete workflow that consumed
it.

## Tradeoffs

- There is now one durable owner for reusable client behavior: profile guidance.
- Prompt/runtime context is simpler because the assistant no longer receives a
  second hidden preference channel.
- Future "remember this" product work must propose or edit the right durable
  owner instead of appending to a generic memory store.
- The deletion required a destructive production migration. It was applied only
  after dev/prod memory rows had been migrated or marked forgotten and
  production inspection showed zero active memory rows.
- Historical evidence for forgotten profile memories was intentionally removed
  with the table; current operational workflows did not read memory tombstones.

## Alternatives Rejected

- Keep profile memories for preferences while guidance owns workflows: rejected
  because the boundary stayed subjective and agents would still have two
  overlapping prompt state channels.
- Convert profile memories into a compatibility alias for profile guidance:
  rejected because it would preserve stale terminology and hidden runtime
  behavior without a current product need.
- Keep the `profile_memories` table as a tombstone/history table: rejected
  because no current audit, retry, or user-facing workflow consumes that
  history, and retaining it would violate the rule against stale desired-state
  rows.
- Add agent-visible profile-guidance mutation tools in the same change:
  rejected because retiring memories is a boundary cleanup; guidance editing
  should be designed as its own product workflow with approval semantics.

## More Information

This record follows the launched-client guidance ownership decision in
[DB-Owned Launched-Client Guidance](0021-db-owned-launched-client-guidance.md)
and the runtime routing decision in
[Runtime guidance routing and focused profile modules](0019-runtime-guidance-routing-and-focused-profile-modules.md).

Relevant implementation anchors:

- `supabase/migrations/20260609170500_retire_profile_memories.sql`
- `apps/backend/src/product/profile-learning-review/*`
- `runtime-plugins/guidance-router/src/index.ts`
