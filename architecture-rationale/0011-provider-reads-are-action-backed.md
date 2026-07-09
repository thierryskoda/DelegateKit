---
status: superseded by 0012-provider-operations-are-proxy-backed
date: 2026-05-19
scope: provider tools
---

# Provider Reads Are Action Backed
## What Changed

Nango sync-backed read paths were removed from provider-facing tools. Email, calendar, Google Drive, and Microsoft Files read envelopes now expose only the provider, account email, and provider payload. Nango provisioning and readiness checks now require actions only.

Microsoft Files tools that existed only to read Nango record data or configure record selection were removed. Email thread/mailbox read tools were also removed because there was no provider action-backed equivalent in the current manifest.

## Why

The product is pre-launch and assistant correctness matters more than keeping an optimization layer. The sync-backed tools made agents reason about freshness and sometimes returned older provider state first, which was especially bad for user questions such as "last email." Keeping cache/freshness modes in tool contracts also made the assistant surface harder to understand and easier to misuse.

## Tradeoffs

- Provider reads are simpler and map directly to provider action/proxy behavior.
- Some broad browsing surfaces are temporarily gone where no provider action equivalent exists.
- Future broad-search/indexing work should be introduced as a deliberate product feature with separate naming and evidence semantics, not by reintroducing hidden provider read fallbacks.

## Alternatives Rejected

- Keep sync tools with a freshness flag: rejected because it preserved the stale-data failure mode and kept internal storage concerns in agent-visible contracts.
- Trigger syncs before reads: rejected because it adds latency and operational complexity while still not guaranteeing that the first answer reflects the provider's newest state.

## More Information

This supersedes the calendar sync layering direction recorded in `0005-calendar-nango-sync-action-layering.md` for current provider reads.
