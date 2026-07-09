# Capabilities and document tools boundary

Date: 2026-05-13

## What Changed

The repo now separates concepts that had been collapsed under "integration" and "workflow":

- Integrations and providers are external service families such as Gmail, Google Drive, Monday, BoldSign, and Nango provider configs.
- Capabilities are profile-enabled assistant surfaces exposed to runtime profiles.
- Document tools are a backend capability for rendering templates into internal artifacts.
- Client workflows are client-specific guidance and tests that decide ordering, missing-field handling, source selection, and final side effects.

The control-plane schema follows that language with `profile_account_slots`, `provider_connections`, and `capability_readiness_state`. Package and plugin names follow the same boundary with names such as `capability-catalog`, `capability-lifecycle`, and `document-tools`.

## Why

This product is maintainer-led infrastructure for private assistants, not a self-serve workflow automation builder.

The old naming made external provider setup, assistant-visible capability enablement, backend document safety, and client-specific business sequencing look like one generic "integration workflow" category.

That category was too broad. Backend document code protects durable document state and approvals. Client skills own the business choreography.

## Tradeoffs

- The names now match the product model future code should build on.
- The refactor is intentionally breaking for old local data because the product is pre-launch.
- The same change would need a migration plan after launch.
- Shared backend document code must stay generic and safety-focused. Client-specific ordering belongs in client guidance even when multiple clients use the same document tools.

## Alternatives Rejected

- Keeping `integration-*` as the umbrella term was rejected because document tools and backend secrets are assistant capabilities, not external provider integrations.
- Keeping the old document workflow name was rejected because the backend does not own a general workflow engine.
- Preserving compatibility aliases and old routes was rejected because the product has not launched and aliases would teach future code to keep using the old model.
