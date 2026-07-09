---
status: recorded
date: 2026-06-04
scope: e2e architecture, provider integrations, test strategy
---

# Isolated E2E profile and scenario provider sandbox

## What Changed

Automated E2E tests use the `testing` fixture profile with a separate `e2e`
runtime profile and isolated local Supabase database instead of sharing the
maintainer's dev database. The E2E runner owns database preparation: one
`npm run e2e ...` command creates a fresh dynamic E2E runtime with its own
Supabase project, ports, env file, and generated profile config, then runs the
selected files.

Scenario E2Es no longer call live providers for normal provider reads and
writes. They opt connected provider accounts into typed provider sandbox mode,
seed realistic provider-shaped resources in local E2E tables, execute the real
backend/tool/runtime paths, and assert captured outbound provider requests.

Capability E2Es remain the live provider contract layer. They assert live
provider mode, exercise real provider reads/writes through Nango/provider APIs,
and own explicit cleanup of external resources.

Default webhook E2Es use realistic synthetic HTTP payloads posted to local
backend webhook routes. Normal E2E runs do not create, renew, delete, or wait
for live provider webhook subscriptions.

## Why

The old model made automated tests too noisy for local development. Scenario
tests could create activity rows, backend jobs, embedding work, webhook
subscriptions, provider mutations, and cleanup pressure in the shared dev
control-plane database. When workers or tests stopped mid-run, stale local rows
made later diagnosis harder because it was unclear which rows represented real
dev activity and which rows were leftover test state.

Fully live scenario tests also coupled product behavior coverage to provider
side effects. A scenario meant to prove "the assistant handled the client's
request correctly" could fail because Gmail, Microsoft, Monday, Drive, Calendar,
or BoldSign delivery timing, cleanup, webhook behavior, or fixture data drifted.
That made broad scenario runs expensive to maintain and encouraged table-by-table
cleanup that obscured the actual test contract.

The new split keeps the confidence that matters:

- scenario E2Es still prove real agent behavior, backend routes, jobs,
  persistence, approvals, tool contracts, artifacts, and client-visible replies;
- provider sandbox data is typed against canonical contracts/schemas instead of
  ad hoc fake JSON;
- capability E2Es still prove that real providers accept the read/write
  contracts and scopes;
- webhook coverage still exercises HTTP route auth/parsing, dedupe, persisted
  deliveries, backend jobs, and work-item routing without relying on provider
  delivery.

The isolated E2E database also makes cleanup semantics simple: DB state starts
fresh for each E2E command, while external provider cleanup remains explicit only
where live provider calls are intentionally made.

## Tradeoffs

- Broad scenario runs are less noisy, faster to reason about, and safer to run
  repeatedly because they do not mutate live provider accounts.
- Scenario failures now point more directly at product behavior, tool contracts,
  sandbox fixture shape, or runtime wiring instead of external provider drift.
- The provider sandbox must stay honest. Fixtures and captured responses need to
  reuse production schemas, provider contract packages, and realistic data so
  scenarios do not become detached from provider reality.
- Capability E2Es carry more responsibility as the live provider smoke/contract
  suite. They must remain small enough to maintain and strict enough to catch
  provider API, scope, and cleanup regressions.
- Removing the dynamic local runtime does not clean external providers.
  Capability E2Es and explicit provider cleanup/audit workflows must still clean
  resources they create.
- Synthetic webhook tests do not prove third-party delivery infrastructure is
  currently sending events. That risk is accepted for normal E2E runs and can be
  covered by deliberate live smoke checks when needed.

## Alternatives Rejected

- Keep all scenario E2Es fully live: rejected because it created too much
  external side-effect noise, cleanup pressure, provider flake, and dev DB
  pollution for the value broad scenarios provide.
- Reset the shared dev database for E2Es: rejected because dev and automated
  tests have different ownership. Tests should not destroy or reinterpret a
  maintainer's local dev state.
- Create a fresh dynamic runtime before every individual test file in normal
  suite runs: rejected because command-level runtime isolation is enough for
  normal validation and avoids paying Supabase start cost repeatedly.
  `e2e:sweep` may still isolate per file because it deliberately invokes
  `npm run e2e -- <file>` one file at a time.
- Fully mock provider tools or backend services in scenarios: rejected because
  it would stop proving the real backend, job, approval, persistence, and tool
  execution paths. The sandbox boundary belongs at provider I/O only.
- Keep live provider webhook subscriptions in normal E2Es: rejected because
  third-party delivery can happen after the local backend is down and can target
  the wrong environment if provider callbacks are misconfigured.
- Add cascade-delete behavior to solve stale test rows: rejected because the
  root problem was environment ownership and reset boundaries, not missing
  production data retention semantics.

## More Information

Operational guidance lives in the `run-tests` and `test-strategy` focused
skills. The E2E harness guard enforces that scenario files are either
provider-free or use the typed provider sandbox, and that normal scenario tests
do not import live provider helpers.

Related records:

- [Nango first no client data plane](0004-nango-first-no-client-data-plane.md)
- [Nango backend proxy transport](0006-nango-backend-proxy-transport.md)
- [Provider operations are proxy backed](0012-provider-operations-are-proxy-backed.md)
- [Provider-first capability surfaces](0016-provider-first-capability-surfaces.md)
- [Dynamic E2E runtime lanes](0020-dynamic-e2e-runtime-lanes.md)

Revisit this decision only if scenario sandbox fixtures stop being able to model
real provider behavior with canonical contracts, or if provider accounts offer a
reliable isolated test mode that removes cleanup and webhook-delivery noise
without weakening scenario determinism.
