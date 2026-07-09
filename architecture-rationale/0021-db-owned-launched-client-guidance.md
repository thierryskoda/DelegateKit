---
status: recorded
date: 2026-06-06
scope: client guidance ownership, runtime guidance routing, profile learning review
---

# DB-Owned Launched-Client Guidance

## What Changed

Launched-client workflow guidance is now stored in the control-plane
`profile_guidance` table instead of source files under
`clients/<profile>/guidance/*.ts`.

Client seeds may still declare `initialGuidance` for missing pre-launch or test
profiles. That seed path is create-on-missing bootstrap only. Once a client
profile exists, its workflow guidance is DB-owned and can be changed through
maintainer DB edits, product flows, or approved profile learning review
recommendations.

Runtime guidance routing still selects and injects situational instructions.
Provider and module guidance remains source-authored typed guidance. Profile
workflow guidance is fetched from the DB each turn as a compact selector index,
selected by DB id, loaded as markdown only after selection, and injected by the
system rather than exposed as agent-visible `profile_guidance_get` or
`profile_guidance_list` tools.

As of June 9, 2026, profile memories are retired as a prompt/runtime concept.
Previously active memory rows were migrated into DB-owned profile guidance where
they represented reusable client preferences or behavior. Other durable facts now
belong to their explicit owners: provider/source-of-truth state, scheduled tasks,
work routes, workflow recipes, proposals, or no durable state.

## Why

Client workflow guidance changes after launch. Keeping one copy in source and
another copy in the DB creates two sources of truth: source files can become
stale while the launched assistant relies on edited live behavior, or a source
upsert can overwrite a maintainer/client improvement.

DB ownership matches the product direction. The maintainer can edit a launched
client's workflow instructions directly, and the daily profile learning review
job can propose new instructions or small improvements based on real activity.
Those changes are operational client state, not reusable provider/module
guidance.

The earlier runtime guidance routing decision remains valid for source-owned
provider and module guidance. The part that changed is client workflow
ownership: selection remains system-owned, but the launched-client rows being
selected are live DB state.

## Tradeoffs

- There is one launched-client source of truth for workflow instructions.
- Client guidance can improve through approved learning review candidates
  without source deploys.
- Source typechecking no longer validates DB guidance prose or embedded tool
  names. Runtime contracts, provider/module guidance, schema validation, guards,
  and E2Es must catch the important failures.
- Prompt routing now depends on backend DB reads for active profile guidance
  index rows and selected markdown.
- Seeds are less useful after launch by design. Maintainers must inspect or edit
  the DB/snapshots for current client workflow guidance.

## Alternatives Rejected

- Keep source client guidance and upsert it on build or seed: rejected because
  it preserves two sources of truth and risks overwriting launched-client
  improvements.
- Put all client guidance into profile memories: rejected because memories are
  factual/preferences context, while workflow guidance controls tool order,
  approvals, safety boundaries, and supported operating procedures.
- Keep profile memories for stable preferences while profile guidance owns
  workflows: rejected because the split created overlapping prompt/runtime
  destinations. Reusable preferences are guidance, not a separate hidden memory
  surface; current facts belong to source-of-truth providers or explicit task
  owners.
- Expose profile guidance as agent-visible list/get tools: rejected because
  agents should not have to remember to fetch workflow instructions before
  acting. The guidance router remains responsible for selection and injection.
- Add heavy version/history tables in v1: rejected until a current product or
  operational workflow reads that history. The table keeps active/archived
  state and revision checks for current approval flows.

## More Information

This record updates the client-guidance ownership part of
[Runtime guidance routing and focused profile modules](0019-runtime-guidance-routing-and-focused-profile-modules.md).
Provider and module guidance remain source-authored typed guidance.

Current source-of-truth paths include:

- `profile_guidance` control-plane table and generated contracts
- `apps/backend/src/product/profile-guidance/profile-guidance.ts`
- `runtime-plugins/guidance-router/src/index.ts`
- `packages/runtime-guidance/src/index.ts`
- `clients/<profile>/seed.ts` `initialGuidance` bootstrap declarations
- `apps/backend/src/product/profile-learning-review/*`

Revisit this decision if DB guidance changes need richer audit/version
workflows, if selector latency becomes material, or if maintainers need a
source-reviewed publishing flow for launched-client guidance edits.
