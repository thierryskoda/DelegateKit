# 0015: Backend Capability Colocation

## Decision

Backend implementation code is organized by ownership:

- `apps/backend/src/capabilities/*` owns backend capability behavior: tool handlers, provider read/write adapters, setup jobs, webhook adapters, and lifecycle hooks.
- `apps/backend/src/product/*` owns profile/product state and workflows: actions, proposals, artifacts, connected accounts, scheduled tasks, work items, and workflow persistence.
- `apps/backend/src/integrations/*` owns generic external provider plumbing such as Nango transport, provider runtime credentials, and webhook substrate.
- `apps/backend/src/runtime/*` owns execution machinery such as tool dispatch and worker job loops.

Repo-root `capabilities/*` folders hold assistant-facing guidance and capability-local source assets. They must stay thin and must not import backend app implementation.

## Rationale

The backend scales better when capability-specific behavior is colocated with the capability that owns it. Provider setup, webhook adapters, provider-specific jobs, and tool read/write handlers change together, so keeping them together reduces coupling and makes new providers easier to add without editing generic runtime or integration plumbing.

Generic substrates should aggregate explicit capability-owned definitions through registries, not import concrete capability behavior directly. This keeps `integrations/*` provider-agnostic and `runtime/*` focused on orchestration.

## Consequences

Adding a backend capability usually means editing:

- the owning `apps/backend/src/capabilities/<capability>` folder,
- a small backend registry entry when the capability exposes tools, hooks, jobs, or webhook adapters,
- the finite job kind contract only when a new durable backend job kind is required.

It should not require adding provider-specific branches to Nango transport, provider webhook substrate, or worker loop code.
