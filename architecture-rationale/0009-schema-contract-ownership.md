# Schema contract ownership

Date: 2026-05-13

## What Changed

- Added `@ai-assistants/control-plane-contracts` for client-free contracts: generated control-plane DB types, control-plane JSON, row boundary schemas, backend job enums including effective status, and portal profile-action decision commands.
- Moved generated DB types and row boundary schemas out of `@ai-assistants/control-db` (Supabase client only). Row/schema drift is guarded by deriving row TypeScript types from the generated Supabase `Database` type, with Zod used only for JSON and domain-sensitive field upgrades.
- Canonical capability readiness / instance status enums live only in `capability-catalog`; provider-specific setup contracts live on owning provider contract packages, and Nango provisioning metadata lives in `@ai-assistants/nango-provisioning`.
- `profile-tool-contracts`, `connect-api-contracts`, and `backend-jobs` consume row schemas from control-plane contracts; profile assistant DTOs derive from generated row types where shapes match.
- Monday approval execution payloads alias Monday plugin input schemas; post-resolution-only shapes (archive targets) stay backend-local.
- Document JSON scalar / template field maps are exported from `document-tools` as `documentJsonScalarSchema` / `documentTemplateFieldValuesSchema`; backend document rendering imports the scalar.
- Nango provider config keys, required functions, and provisioning checks import from `@ai-assistants/nango-provisioning`; provider setup/discovery contracts such as Monday's setup model import from the owning provider contract package.
- `repo-layout` owns `runtimeProfileSchema` for runtime profile literals; onboarding and runtime services reuse it.
- Source guards reject imports of the removed `control-db` `./schemas` subpath and stray `approve` / `reject` enum literals outside control-plane contracts.

## Why

Pre-launch, each contract surface should have one owner and fail fast on drift. There is no need to preserve compatibility re-exports for deleted paths.

This keeps Supabase client packages focused on database access instead of turning them into domain schema packages. It also avoids duplicated Zod contracts across control-plane rows, capability metadata, plugin tools, and runtime profile literals.

## Tradeoffs

- Row boundary schemas intentionally validate only required object-ness, JSON payloads, and finite domain fields. The generated Supabase `Database` type remains the source of truth for full column lists.
- `@ai-assistants/nango-provisioning` depends on `capability-catalog`, not the other way around, so the catalog stays product-semantic and provider/provisioning agnostic.
- Contract ownership is stricter, so imports must move when a concept belongs to a different package.

## Alternatives Rejected

- Re-exporting `./schemas` from `control-db` for a transition period was rejected because the product is pre-launch and old paths should disappear.
- Making `control-db` the source of row and domain contracts was rejected because it would mix database access with domain contract ownership.
