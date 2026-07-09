# Client State Read Model

This module owns DB extraction and projection helpers for durable client state.

Use shared extraction for profile identity, approval policy, scheduled
tasks, work routes, guidance, channels, capabilities, and connected accounts.
Keep consumer projections separate:

- Full snapshots are debugging/export evidence and may include ids plus recent
  operational appendices.
- Snapshot summaries are human/operator readable and omit mutation-critical ids
  by default.
- Reviewer projections are mutation-safe and keep refs, ids, revisions, and
  target fields required to propose durable-state changes.
- State hygiene review is a whole-client durable-state audit. It is separate
  from daily learning review and remains review-first.

Do not make reviewers read generated snapshot summary files. Summaries can be
stale and intentionally omit fields reviewers need for mutations.
