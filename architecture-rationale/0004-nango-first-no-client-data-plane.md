# Nango-first integrations and removal of client data plane

Date: 2026-05-12

## What Changed

End-user OAuth is Nango-only. Missing Nango secrets or missing per-instance provider config keys are hard errors at connect-session time.

The per-profile Postgres client data plane was removed, along with `@ai-assistants/data-plane`, `client_data_planes`, `client_data_plane_providers`, `setup_models`, setup-generation jobs, legacy `oauth_sessions`, and provider sync jobs for email, Monday, and files.

BoldSign signature history moved into the control plane as `signature_events`. Document workflow configuration moved into typed `profile_account_slots.config`.

## Why

The repo had two integration data models: Nango for OAuth and provider connections, and a separate per-profile database for mirrored client data.

That split added extra databases, provisioning, sync jobs, and setup-model concepts. Nango plus typed backend tools covered the needed provider boundary more cleanly.

## Tradeoffs

- Onboarding must seed Nango provider config keys.
- Read models and profile context can no longer depend on removed client-data-plane tables.
- Invalid integration state surfaces as explicit errors instead of falling back to old paths.
- Tests and scripts that assumed the old data plane had to be deleted or rewritten.

## Alternatives Rejected

- Keeping the client data plane only for BoldSign was rejected because it kept two persistence models and the same operations burden.
- Removing all BoldSign history was deferred because `signature_events` gives assistants useful signature history without per-profile Postgres.
