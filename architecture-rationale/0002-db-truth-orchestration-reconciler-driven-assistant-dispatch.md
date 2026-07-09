# DB-truth orchestration: reconciler-driven assistant dispatch

Date: 2026-05-09

## What Changed

Backend job handlers now finish their own work and persist database markers instead of chaining unrelated jobs or directly enqueueing `assistant.event.dispatch`.

Pending notifications live on domain rows, and a reconciler turns those markers into assistant dispatch jobs. User-driven orchestration happens through explicit backend tools, not hidden job chaining.

Integration readiness is also typed state, such as `blockerCode` and `blockerSummary`, instead of loose next-action strings.

## Why

Handlers had become too broad. Sync, OAuth, setup, and profile-action paths were finishing their own work while also waking assistants or starting unrelated workflows.

That coupled backend handlers to the assistant runtime, made retries more likely to duplicate notifications, and made it hard to answer "what is still pending?" from the database alone.

## Tradeoffs

- The database can answer what still needs a notification.
- Handlers are narrower and retry behavior is easier to reason about.
- Notifications may trail handler completion by one worker sweep.
- Each new notification surface needs explicit marker columns and reconciler handling.

## Alternatives Rejected

- A dedicated outbox table was rejected because the same facts already live on domain rows.
- Inline dispatch with dedupe keys was rejected because it kept assistant coupling in every handler.
- Forbidding assistant dispatch while still allowing workflow chaining was rejected because cross-domain coupling would remain.
