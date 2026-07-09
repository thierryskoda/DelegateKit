# Calendar integration: Nango sync + action layering

Date: 2026-05-12

Superseded: provider reads became action/proxy-backed in
`0011-provider-reads-are-action-backed.md`, then provider operations became
backend proxy-backed in `0012-provider-operations-are-proxy-backed.md`. This
record is historical context for the removed calendar sync/action layering.

## What Changed

Calendar reads and writes now go through typed Nango syncs and prebuilt actions instead of ad hoc provider proxy calls.

The calendar provisioning manifest declares required Nango actions and syncs. Backend calendar code uses typed wrapper functions as the only `triggerAction` and `triggerSync` sites.

List-style reads can use the Nango sync cache. Live reads use Nango actions and keep provider pagination separate from sync cursors. Writes call Nango actions and then trigger the relevant sync so cached reads converge.

## Why

Calendar tools are semantic: list events, check free/busy, create events, update events, and cancel events. But maintainers still need the right Nango functions enabled for each provider.

Without a clear layering rule, backend code tends to proxy provider APIs everywhere. That hides missing Nango dashboard actions, mixes sync cursors with provider page tokens, and makes failures harder for agents to explain.

This pattern gives Nango-backed integrations a durable contract: declare the functions, wrap them in one backend boundary, make freshness explicit, and use proxy only for named gaps.

## Tradeoffs

- Some reads now default to cache where older code hit the network first.
- Agents must request live freshness when they need authoritative provider data.
- Every Nango action or sync used by code must be declared and referenced.
- Outlook still needs narrow proxy support for gaps such as some free/busy paths, and those limitations must be surfaced in tool results.

## Alternatives Rejected

- A single proxy layer for all calendar calls was rejected because it hides missing Nango functions and encourages unbounded provider coupling.
- Backend-guessed freshness was rejected because agents and logs need to explain whether data came from cache or live provider reads.
- Reusing Nango sync cursors as provider page tokens was rejected because it breaks pagination semantics.
