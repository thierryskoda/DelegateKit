---
status: recorded
date: 2026-06-02
scope: monday capability, tool contracts, provider integrations
---

# Replace Monday semantic schema with raw provider tools

## What Changed

Monday is moving away from generated semantic CRM schema mappings and toward a
raw provider tool surface.

The removed model exposed tools such as `monday_schema_get`,
`monday_schema_refresh`, and `monday_record_*`. Those tools depended on inferred
record types, field keys, generated readiness state, semantic field codecs, and
LLM-assisted mapping between Monday boards/columns and business concepts.

The new model exposes live Monday provider facts directly:

- board and workspace discovery;
- board detail with provider board ids, group ids, column ids, column settings,
  status/dropdown labels, and value-shape hints;
- item list/get/create/update/archive/move operations using Monday item ids and
  raw `columnValues` keyed by exact provider column id;
- board, column, and group structure operations using provider ids.

Assistant guidance now teaches agents to inspect live boards and columns before
writing. Monday readiness is OAuth/connectivity plus live provider access, not a
stored `config.monday` semantic mapping.

This record supersedes the semantic direction in
[0010: Monday provider-owned semantic capability](0010-monday-provider-owned-semantic-capability.md).

## Why

The semantic schema system solved the wrong problem for this stage of the
product.

Monday is not a strict CRM with stable entity concepts. A client account may use
one board as a CRM, a lightweight task tracker, a deal pipeline, a contact list,
or a temporary operations board. Inferring durable `recordType` and `fieldKey`
concepts from that structure created a second schema beside Monday's real
schema. When generation lagged, failed, or guessed wrong, agents were blocked
even though Monday already had enough provider information to do the work.

The user-visible confusion was concrete: after creating a board, the assistant
waited for semantic schema regeneration before adding columns. That made a
normal provider workflow depend on a separate mapping pipeline and taught the
agent to treat delayed schema propagation as a blocker.

The raw tool model is simpler and more transparent:

- agents can list boards, inspect columns/groups, and write exact ids;
- maintainers can reason about failures directly from Monday provider facts;
- tool contracts no longer hide provider ids behind inferred business fields;
- deleting semantic generation removes LLM mapping jobs, stale readiness, schema
  hashes, duplicate-rule inference, and another source of drift.

This fits the broader provider-first direction: provider capabilities should own
their provider-specific contracts and operations instead of forcing behavior
through speculative common abstractions.

## Tradeoffs

- Raw tools are easier to debug because the assistant and maintainer see the
  actual Monday ids, labels, groups, and column value payloads.
- The assistant must now discover board/column structure before writes. This is
  acceptable because Monday's provider schema is already the source of truth and
  `monday_board_get` makes the required evidence explicit.
- Duplicate prevention moves out of backend semantic duplicate rules and into
  workflow guidance, maintainer policy, and agent behavior. This is less
  automatic but avoids enforcing guessed business rules from inferred mappings.
- Raw reads and webhooks can expose every board visible to the connected Monday
  token. A future-safe implementation needs an explicit per-profile board
  authorization boundary for reads, writes, and webhook subscriptions.
- Raw item create/update can involve provider-specific value-shape failures.
  Write planning validates board, item, group, and column ids, but complex
  column JSON remains a provider-correctness problem unless the tool has a
  concrete validator for that column type.
- If item creation cannot reliably set column values in a single Monday
  mutation, a two-step create-then-update path must record or compensate for
  partial creates. Otherwise a failed column update can leave an unintended item
  without a provider write receipt.

## Alternatives Rejected

- Improve semantic schema regeneration retries: rejected because patience would
  only mask the deeper issue. Agents should not need schema propagation to use a
  board they just created or inspected live.
- Keep both semantic and raw modes: rejected as overkill for pre-launch. Two
  modes would duplicate guidance, tests, policies, and failure states while
  keeping agents unsure which source of truth to trust.
- Keep semantic reads but raw writes: rejected because it preserves the hardest
  part of the old design: inferred record types and field keys that can drift
  from Monday's actual board/column state.
- Build a generic CRM abstraction now: rejected for the same reason as older
  provider-first decisions. A shared CRM model should be extracted only after
  multiple real providers prove stable overlap.
- Let generated guidance carry raw board and column ids: rejected because
  guidance is behavioral context, not a provider inventory or durable mapping
  store.

## Follow-On Status

Completed in the raw Monday cleanup:

- Monday webhook reconciliation uses `monday.item.created` and
  `monday.item.updated` event names, including forward database migrations for
  launched databases.
- Webhook reconcile jobs carry `capability_account_link_id` and fail fast when it
  is missing.
- Monday OAuth connect enqueues webhook reconciliation.
- Monday webhook E2E coverage exercises valid, unsupported, duplicate, missing
  item, and self-origin deliveries.
- Item create compensates failed create-then-update writes by archiving the
  partially created item.
- `monday_item_list` keeps filtered search semantics honest by doing a bounded
  local scan and returning no cursor for filtered results.

Remaining deliberate product tradeoff:

- Raw reads and webhooks currently cover every board visible to the connected
  Monday token. A stricter per-profile board authorization boundary can be added
  later if a real client account needs it. For now, this is governed by the
  connected account scope plus the existing approval policy for writes.

## More Information

Related records:

- [Schema contract ownership](0009-schema-contract-ownership.md)
- [Provider operations are proxy backed](0012-provider-operations-are-proxy-backed.md)
- [Provider-first capability surfaces](0016-provider-first-capability-surfaces.md)
- [Monday provider-owned semantic capability](0010-monday-provider-owned-semantic-capability.md)

Revisit this rationale only if a real product workflow needs semantic business
records again and can name the concrete consumer, validation rules, and lifecycle
owner. Do not reintroduce inferred schema generation just to avoid passing
Monday provider ids.
