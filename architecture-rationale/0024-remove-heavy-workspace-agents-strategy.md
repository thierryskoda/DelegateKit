---
status: recorded
date: 2026-06-08
scope: runtime workspace context, AGENTS.md generation, guidance routing
---

# Remove Heavy Workspace AGENTS Strategy

## What Changed

The runtime workspace `AGENTS.md` generation keeps only the `minimal` strategy.
The removed `heavy` strategy rendered assigned provider guidance and full tool
descriptions directly into the always-loaded workspace prompt.

Provider and profile guidance now remain lazy: source-authored capability
guidance is selected by the guidance router for the current task, DB-owned
profile guidance is injected dynamically, and hidden tools are discovered with
`tool_search` and `tool_describe`.

## Why

The heavy strategy no longer fit the runtime context model. In a June 8, 2026
comparison, the generated e2e heavy workspace `AGENTS.md` was 153,578
characters. The runtime truncated workspace bootstrap context above its 100,000
character injection limit before the agent turn, making the strategy
unreliable as a "maximum context" baseline.

The same comparison ran the Monday lookup scenario `TS-HV-015` under both
strategies:

- `minimal`: passed in about 57.3 seconds.
- `heavy`: passed in about 56.5 seconds, but the workspace prompt was
  truncated.

The heavy run did not show better behavior. Both runs passed with judge
warnings around overclaiming CRM uniqueness from a narrow Monday search. Heavy
also still used `tool_search` despite having inline tool descriptions, so the
extra always-loaded context did not remove discovery calls for that scenario.

Keeping heavy would preserve a large, stale prompt surface that is expensive to
review, easy to exceed runtime limits with, and not proven to improve behavior.

## Tradeoffs

- Runtime turns rely more explicitly on dynamic guidance selection and tool
  discovery.
- Prompt behavior is easier to reason about because every workspace starts from
  the same compact baseline.
- Provider-specific behavior must live in typed runtime guidance and tool
  contracts instead of accumulating in base workspace prose.
- Future experiments with denser context need an explicit size budget and must
  fail before exceeding the workspace bootstrap injection limit.

## Alternatives Rejected

- Keep heavy as a diagnostic option: rejected because the generated prompt
  already exceeded the runtime injection limit, so diagnostics would be
  measuring truncated context.
- Trim heavy until it fits: rejected because that recreates a second prompt
  surface to maintain without evidence that upfront provider/tool prose improves
  current behavior over dynamic guidance.
- Keep heavy but stop inlining provider guidance: rejected because that would
  converge on minimal while preserving confusing strategy names and branches.
