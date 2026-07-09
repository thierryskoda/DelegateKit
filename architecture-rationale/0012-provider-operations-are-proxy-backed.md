---
status: recorded
date: 2026-05-22
scope: provider integrations, nango transport, capability readiness
---

# Provider Operations Are Proxy Backed
## What Changed

Email, calendar, Google Drive, OneDrive, Outlook, and SharePoint provider operations now execute in backend TypeScript through the shared Nango proxy transport. Nango remains the OAuth and token-injecting proxy boundary, but the assistant runtime no longer calls remote Nango actions with `triggerAction`.

The provisioning manifest now describes only OAuth integration metadata. Startup and apply no longer check remote Nango function readiness, and the checked-in `apps/backend/nango-functions` workspace was removed.

## Why

The remote action layer split provider behavior across two runtimes: backend approval/tool code owned product state and idempotency, while Nango actions owned HTTP behavior and provider payload mapping. That made local startup depend on action deployment state and created drift between source-controlled provider behavior and what Nango had enabled remotely.

Keeping provider logic in the backend gives the product one source of truth for schemas, result payloads, diagnostics, tests, and client-specific behavior. Nango is still useful as the OAuth/proxy transport, but remote function execution is no longer the right ownership boundary for a maintainer-led product.

## Tradeoffs

- Provider behavior is easier to typecheck, test, refactor, and review with the rest of the backend.
- The backend now owns more provider-specific HTTP details that Nango catalog actions previously hid.
- Future provider integrations should add backend proxy adapters and schemas, not new remote Nango actions.

## Alternatives Rejected

- Keep remote Nango actions and only fix readiness checks: rejected because it would preserve the split runtime and continue making local startup depend on remote action state.
- Use Nango syncs/actions as the canonical provider API: rejected because the backend needs provider behavior close to approval execution, profile isolation, diagnostics, and typed tool contracts.

## More Information

Supersedes the action-backed parts of [0011 Provider Reads Are Action Backed](0011-provider-reads-are-action-backed.md). The shared transport boundary remains [0006 Nango Backend Proxy Transport](0006-nango-backend-proxy-transport.md).
