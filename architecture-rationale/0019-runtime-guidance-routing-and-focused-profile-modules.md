---
status: recorded
date: 2026-06-05
scope: runtime guidance, generated workspace context, internal profile modules
---

# Runtime guidance routing and focused profile modules

## What Changed

Runtime assistant context now uses a compact always-loaded `AGENTS.md` operating
kernel plus generated runtime guidance registries. Situational guidance stays in
typed source files under capability and client guidance sources, is generated
into each runtime workspace, and is selected by stable guidance ids for both
direct chat and queued work items.

The old broad profile-context tool/guidance surface was split into focused
always-available internal modules: overview, time, memory, activity, saved
artifacts, work, scheduled tasks, actions, proposals, profile links, and task
flows. Each module owns its plugin, contract package, backend handlers, and
guidance. Work routes and work items store guidance ids rather than rendered
guidance so pending work resolves the current authored guidance when claimed.

Guidance dependencies use the typed `guidance(...)` reference system. When
client workflow guidance relies on provider or internal module instructions, it
references those guidance ids so the resolver expands dependencies
deterministically.

## Why

Keeping all client workflow, provider, and tool guidance in generated
`AGENTS.md` made the always-loaded prompt too large and increasingly noisy.
Generic rules that every request needs still belong in the minimal operating
kernel, but most provider/client workflow guidance is useful only for specific
tasks. Loading it all made normal turns heavier and made it harder to see which
instruction actually applied.

An earlier idea stored guidance in a database and expected agents to search for
the right guidance. In practice, agents were unreliable at proactively searching
before acting; they often used their own reasoning instead of fetching the
needed instructions. Runtime routing keeps guidance out of the always-loaded
prompt while making selection a system responsibility: hooks and work-item
enqueue paths select guidance ids, validate them against the generated profile
registry, expand typed dependencies, and inject the resolved markdown.

The profile-context split was necessary for the same reason. One overloaded
profile-context blob taught memory, work items, scheduled tasks, proposals,
actions, profile links, artifacts, time, and workflow recipes/runs together. That coupling
made runtime guidance routing less precise and made backend/tool ownership less
obvious. Focused modules let guidance injection add only the module instructions
the current turn or work item needs.

## Tradeoffs

- The prompt is smaller by default, and task-specific context is more targeted.
- Guidance remains authored in source, so renamed tools and missing references
  can be caught by TypeScript, generation, and source guards.
- Work-item guidance ids make old pending work benefit from updated guidance
  without rewriting queued rows.
- Runtime behavior now depends on a guidance registry, resolver, selector, and
  backend prompt-composition path. Those paths need explicit validation and E2E
  coverage.
- LLM-based selection is advisory, not authoritative. Deterministic event/route
  guidance and typed dependency expansion must still carry the critical context
  when classification fails or selects too little.
- Guidance authors must think in focused module dependencies. A client guidance
  file that mentions provider or module tools should reference the relevant
  guidance ids instead of assuming the assistant already has that context.

## Alternatives Rejected

- Keep adding workflow guidance to minimal `AGENTS.md`: rejected because the
  file was becoming too large and most situational instructions are irrelevant
  to most turns.
- Store guidance only in the database and rely on the agent to search: rejected
  because agents did not consistently fetch the right guidance before acting.
- Keep the broad profile-context module and guidance id: rejected because it
  made module ownership fuzzy and forced unrelated instructions to travel
  together.
- Store rendered guidance on work items: rejected because queued work should
  resolve the current authored guidance when claimed rather than freezing stale
  prose at enqueue time.
- Add heavyweight guidance versioning, conflict priority, token-budget, or debug
  tables in v1: rejected because source-generated guidance ids, deterministic
  dependency expansion, logs, typecheck, guards, and focused E2Es provide the
  useful 80/20 behavior without adding operational complexity.

## More Information

Operational guidance lives in the `plugins-and-tools` and `generated-config`
focused skills. Runtime guidance source and generated artifacts are validated by
the source guard, generated profile builds, runtime guidance routing E2E, and
tool inventory generation.

Related records:

- [Agent tool contracts are LLM facing](0013-agent-tool-contracts-are-llm-facing.md)
- [Standardized tool description builders](0014-standardized-tool-description-builders.md)
- [Backend capability colocation](0015-backend-capability-colocation.md)
- [Provider-first capability surfaces](0016-provider-first-capability-surfaces.md)

Revisit this decision if guidance selection cannot reliably identify the
needed context, if dynamic hook injection becomes a material latency or failure
source, or if source-authored guidance stops scaling to the number of profiles
and modules the product supports.
