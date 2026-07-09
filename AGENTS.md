# Contributor Guidance

This repository is source code for DelegateKit, a toolkit for building maintainer-operated AI assistants.

## Boundaries

- Keep secrets, credentials, tokens, runtime logs, generated diagnostics, local state, and real client data out of the repository.
- Treat `clients/_template` as the shape for new client profiles. Do not commit real personal data, private guidance, provider connection ids, downloaded files, or generated profile snapshots.
- Runtime profile data belongs outside the source tree in local profile directories and environment files.
- Database migrations are history. Add forward migrations instead of rewriting, squashing, deleting, or repurposing applied migrations.

## Implementation

- Prefer the existing TypeScript packages, schemas, tool contracts, and capability modules over new abstractions.
- Keep tool and API contracts explicit, schema-backed, and typed. Validate external input at boundaries.
- Fail fast when required state, config, credentials, identity, or data is missing. Do not hide failures behind fake values, silent fallbacks, or unrelated defaults.
- Keep provider-specific logic inside the owning provider/capability module when possible.
- Add comments only for non-obvious ordering, security boundaries, generated/runtime coupling, or external constraints.

## Tool And UX Boundaries

- Backend tools return canonical structured results using `data` and `error`.
- Keep client-facing messages short, concrete, and free of implementation details.

## Validation

- Run the relevant local checks yourself after changing source.
- Start with `npm run check` for the fast source guard.
- Use `npm run typecheck` when types or package boundaries changed.
- Use E2E tests for behavior coverage; avoid adding package-local unit tests unless the project policy changes.

## Collaboration

The working tree may include changes from other agents or contributors. Do not revert edits you did not make unless the user explicitly asks for that operation.
